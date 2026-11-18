#!/usr/bin/env node
// Runs pitch methods over the annotated tracks prepared by scripts/eval-pitch.py and writes
// estimates for it to score. Reproduction steps: docs/pitch-methods-eval.md.
//
//   node scripts/eval-pitch.js OUT_DIR PHASE [--models DIR] [--pitchgram FILE] [--tfjs-root DIR]
//
// PHASE: classical | bp | bpnotes | bplines | bpmf0 | norm | fft | klapuri | crepe | spice | beatkey | all

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';

const [OUT, PHASE = 'all'] = process.argv.slice(2);
if (!OUT) {
	console.error(
		'usage: node scripts/eval-pitch.js OUT_DIR PHASE [--models DIR] [--pitchgram FILE]'
	);
	process.exit(1);
}
const flag = (name) => {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const MODELS = flag('--models');
const ONLY = process.env.ONLY?.split(','); // optional track-id subset
const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')).filter(
	(t) => !ONLY || ONLY.includes(t.id)
);
mkdirSync(join(OUT, 'cache'), { recursive: true });

const repo = new URL('..', import.meta.url).pathname;
// --tfjs-root: a node_modules root with @spotify/basic-pitch + @tensorflow/tfjs-backend-wasm (3.21),
// ~10x faster than the default tfjs-cpu backend under Node
const TFJS_ROOT = flag('--tfjs-root');
const bpRequire = createRequire(
	TFJS_ROOT
		? join(resolve(TFJS_ROOT), 'package.json')
		: createRequire(import.meta.url).resolve('@spotify/basic-pitch/package.json')
);
const BACKEND = TFJS_ROOT ? 'tfjs-wasm' : 'tfjs-cpu';
async function tfReady() {
	const tf = bpRequire('@tensorflow/tfjs');
	if (TFJS_ROOT) {
		bpRequire('@tensorflow/tfjs-backend-wasm');
		await tf.setBackend('wasm');
		// wasm 3.21's Fill kernel throws on an undefined dtype, which tf.signal.frame's padding passes
		const fill = tf.getKernel('Fill', 'wasm');
		tf.unregisterKernel('Fill', 'wasm');
		tf.registerKernel({
			...fill,
			kernelFunc: (a) =>
				fill.kernelFunc({ ...a, attrs: { ...a.attrs, dtype: a.attrs.dtype ?? 'float32' } })
		});
	}
	await tf.ready();
	return tf;
}
const f0 = await import(join(repo, 'src/routes/pitch/f0.ts'));
const lines = await import(join(repo, 'src/routes/pitch/lines.ts'));
const exp = await import(join(repo, 'scripts/pitch-experiments.ts'));

// ---------- io ----------

function decode(t, sr) {
	const cache = join(OUT, 'cache', `${t.id}.${sr}.f32`);
	if (!existsSync(cache)) {
		const args = ['-v', 'error', '-i', t.audio, '-ac', '1', '-ar', String(sr)];
		if (t.crop) args.push('-t', String(t.crop));
		const buf = execFileSync('ffmpeg', [...args, '-f', 'f32le', '-'], {
			maxBuffer: 1 << 30
		});
		writeFileSync(cache, buf);
	}
	const b = readFileSync(cache);
	return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

const timings = {};
function emit(method, id, kind, rows, ext = 'csv') {
	const dir = join(OUT, 'est', method);
	mkdirSync(dir, { recursive: true });
	const text =
		ext === 'txt'
			? `${rows}\n`
			: rows
					.map((r) => r.map((v) => (Number.isFinite(v) ? +v.toFixed(5) : 0)).join(','))
					.join('\n') + '\n';
	writeFileSync(join(dir, `${id}.${kind}.${ext}`), text);
}
function timed(method, audioSec, fn) {
	const t0 = performance.now();
	const r = fn();
	const ms = performance.now() - t0;
	const t = (timings[method] ??= { ms: 0, sec: 0 });
	t.ms += ms;
	t.sec += audioSec;
	return r;
}
async function timedAsync(method, audioSec, fn) {
	const t0 = performance.now();
	const r = await fn();
	const t = (timings[method] ??= { ms: 0, sec: 0 });
	t.ms += performance.now() - t0;
	t.sec += audioSec;
	return r;
}
function flushTimings(note = 'Node ' + process.version) {
	if (ONLY) return; // a subset run would overwrite the full-run speed
	for (const [m, t] of Object.entries(timings)) {
		mkdirSync(join(OUT, 'est', m), { recursive: true });
		writeFileSync(
			join(OUT, 'est', m, 'timing.json'),
			JSON.stringify({ msPerAudioSec: t.ms / t.sec, audioSec: t.sec, note })
		);
	}
	for (const k of Object.keys(timings)) delete timings[k];
}
function readRows(path) {
	return readFileSync(path, 'utf8')
		.trim()
		.split('\n')
		.map((l) => l.split(/[,\t]/).map(Number));
}

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
const f0Rows = (frames) =>
	frames.map((fr) => [fr.timeSec, Number.isNaN(fr.midi) ? 0 : midiToHz(fr.midi), fr.confidence]);
const isMono = (t) => t.kinds.includes('f0');
const isPoly = (t) => t.kinds.includes('mf0');
const lineKind = (t) => (isMono(t) ? 'f0' : 'melody');

// ---------- classical f0 ----------

function phaseClassical() {
	for (const t of manifest) {
		const x = decode(t, 22050);
		const sec = x.length / 22050;
		for (const name of (process.env.METHODS ?? 'yin,pyin,mpm,hps').split(',')) {
			const frames = timed(name, sec, () => (f0[name] ?? exp[name])(x, 22050));
			emit(name, t.id, lineKind(t), f0Rows(frames));
		}
	}
	flushTimings();
}

// ---------- basic-pitch raw cache ----------

const NFPS = 22050 / 256;
const WINDOW_FRAMES = Math.floor(NFPS) * 2;
const WINDOW_OFFSET = (256 / 22050) * (WINDOW_FRAMES - (22050 * 2 - 256) / 256) + 0.0018;
const frameTime = (f) => (f * 256) / 22050 - WINDOW_OFFSET * Math.floor(f / WINDOW_FRAMES);

function serveDir(dir) {
	const server = http.createServer((req, res) => {
		const p = join(dir, req.url.split('?')[0]);
		if (!existsSync(p)) return void ((res.statusCode = 404), res.end());
		createReadStream(p).pipe(res);
	});
	return new Promise((r) => server.listen(0, () => r({ server, port: server.address().port })));
}

async function phaseBp() {
	await tfReady();
	const { BasicPitch } = bpRequire('@spotify/basic-pitch');
	const { server, port } = await serveDir(join(repo, 'static/basic-pitch-model'));
	const model = new BasicPitch(`http://localhost:${port}/model.json`);
	await model.evaluateModel(
		new Float32Array(22050),
		() => {},
		() => {}
	); // load + warm up, untimed
	for (const t of manifest) {
		const cache = join(OUT, 'cache', `${t.id}.bp.json`);
		if (existsSync(cache)) {
			cached++;
			continue;
		}
		const x = decode(t, 22050);
		const raw = { frames: [], onsets: [], contours: [] };
		await timedAsync('basic-pitch', x.length / 22050, () =>
			model.evaluateModel(
				x,
				(f, o, c) => {
					raw.frames.push(...f);
					raw.onsets.push(...o);
					raw.contours.push(...c);
				},
				() => {}
			)
		);
		const round = (rows) => rows.map((r) => r.map((v) => +v.toFixed(4)));
		writeFileSync(
			cache,
			JSON.stringify({
				frames: round(raw.frames),
				onsets: round(raw.onsets),
				contours: round(raw.contours)
			})
		);
		console.log('bp', t.id, raw.frames.length);
	}
	server.close();
	if (cached === 0) flushTimings(`${BACKEND} backend under Node`); // else the timing covers only new tracks
}

const bpCache = (t) => JSON.parse(readFileSync(join(OUT, 'cache', `${t.id}.bp.json`), 'utf8'));

// ---------- basic-pitch note segmentation sweep ----------

const NOTE_GRID = {
	onset: [0.3, 0.4, 0.5, 0.6, 0.7],
	frame: [0.2, 0.3, 0.4, 0.5],
	minLen: [5, 11],
	infer: [true, false]
};

function noteName(c) {
	return `bpn_o${c.onset}_f${c.frame}_l${c.minLen}_i${+c.infer}_m${+c.melodia}`;
}

function segment(raw, c) {
	const { outputToNotesPoly, noteFramesToTime } = bpRequire('@spotify/basic-pitch/cjs/toMidi.js');
	const ev = outputToNotesPoly(
		raw.frames.map((r) => r.slice()),
		raw.onsets.map((r) => r.slice()),
		c.onset,
		c.frame,
		c.minLen,
		c.infer,
		null,
		null,
		c.melodia
	);
	// noteFramesToTime applies the same per-window drift correction as nativeFrameToTime
	return noteFramesToTime(ev).map((n) => [
		n.startTimeSeconds,
		n.startTimeSeconds + n.durationSeconds,
		midiToHz(n.pitchMidi)
	]);
}

function phaseBpNotes() {
	const configs = [];
	const extra = process.env.NOTE_CONFIGS ? JSON.parse(process.env.NOTE_CONFIGS) : null;
	if (extra) configs.push(...extra);
	else
		for (const onset of NOTE_GRID.onset)
			for (const frame of NOTE_GRID.frame)
				for (const minLen of NOTE_GRID.minLen)
					for (const infer of NOTE_GRID.infer)
						configs.push({ onset, frame, minLen, infer, melodia: false });
	for (const t of manifest.filter((t) => t.kinds.includes('notes'))) {
		const raw = bpCache(t);
		const sec = raw.frames.length / NFPS;
		for (const c of configs)
			emit(
				noteName(c),
				t.id,
				'notes',
				timed(noteName(c), sec, () => segment(raw, c))
			);
	}
	flushTimings();
}

// ---------- basic-pitch line extraction variants ----------

const RENDER_BASE = 36; // C2, bottom of the shipped render window
const BANDS = { melody: [60, 96], bass: [36, 60], full: [36, 96] }; // MIDI, as shipped BAND_OCTAVES

function medianFilter(values, win = 5) {
	const h = win >> 1;
	return values.map((_, i) => {
		const near = [];
		for (let j = Math.max(0, i - h); j <= Math.min(values.length - 1, i + h); j++)
			if (values[j] !== null) near.push(values[j]);
		if (!near.length) return null;
		near.sort((a, b) => a - b);
		return near[near.length >> 1];
	});
}

// shipped @5999115: per-band argmax over frames above 0.15, median-filtered pitch, raw score
function shippedLine(frames, [lo, hi]) {
	const picks = frames.map((row) => {
		let best = null;
		let score = 0.15;
		for (let m = lo; m < hi; m++)
			if (row[m - 21] > score) {
				score = row[m - 21];
				best = m;
			}
		return best === null ? null : { midi: best, score };
	});
	const med = medianFilter(picks.map((p) => (p ? p.midi : null)));
	return med.map((m, i) => (m === null ? null : { midi: m, score: picks[i]?.score ?? 0 }));
}

function viterbiLineMidi(grid, [lo, hi], opts, binsPerSemi = 1) {
	const base = binsPerSemi === 3 ? lines.CONTOUR_BIN0_MIDI : 21;
	const path = exp.viterbiLine(grid, {
		...opts,
		lo: Math.round((lo - base) * binsPerSemi),
		hi: Math.round((hi - base) * binsPerSemi),
		jumpCost: opts.jumpCost / binsPerSemi
	});
	return Array.from(path, (b, t) =>
		b < 0 ? null : { midi: base + b / binsPerSemi, score: grid[t][b] }
	);
}

function lineRows(line, contours, refine) {
	return line.map((p, f) => {
		if (!p) return [frameTime(f), 0, 0];
		const midi = refine ? lines.refineMidi(contours[f], p.midi) : p.midi;
		return [frameTime(f), midiToHz(midi), p.score];
	});
}

const VITERBI = { threshold: 0.3, jumpCost: 0.5, switchCost: 2 };

function phaseBpLines() {
	const vit = process.env.VITERBI ? JSON.parse(process.env.VITERBI) : VITERBI;
	const tag = process.env.VITERBI ? '_' + Object.values(vit).join('_') : '';
	for (const t of manifest) {
		const raw = bpCache(t);
		const sec = raw.frames.length / NFPS;
		const kinds = isMono(t)
			? { f0: BANDS.full, f0mel: BANDS.melody }
			: { melody: BANDS.melody, bass: BANDS.bass };
		for (const [kind, band] of Object.entries(kinds)) {
			const k = kind === 'f0mel' ? 'f0' : kind;
			const suffix = kind === 'f0mel' ? '-melband' : '';
			if (!tag) {
				const shipped = timed('bp-shipped' + suffix, sec, () => shippedLine(raw.frames, band));
				emit('bp-shipped' + suffix, t.id, k, lineRows(shipped, raw.contours, false));
				emit('bp-shipped-refined' + suffix, t.id, k, lineRows(shipped, raw.contours, true));
			}
			const v = timed('bp-viterbi' + tag + suffix, sec, () =>
				viterbiLineMidi(raw.frames, band, vit)
			);
			emit('bp-viterbi' + tag + suffix, t.id, k, lineRows(v, raw.contours, false));
			emit('bp-viterbi-refined' + tag + suffix, t.id, k, lineRows(v, raw.contours, true));
			if (!tag && kind !== 'f0mel') {
				const full = shippedLine(raw.frames, BANDS.full);
				emit('bp-argmax-fullrange-refined', t.id, k, lineRows(full, raw.contours, true));
				const picks = isMono(t) ? ['max', 'top'] : [kind === 'melody' ? 'top' : 'bottom'];
				for (const pick of picks) {
					for (const th of pick === 'max' ? [0.15, 0.3, 0.5] : [0.3, 0.5]) {
						const name = `bp-noteline-${pick === 'max' ? 'max' : 'skyline'}${th}`;
						const line = timed(name, sec, () =>
							lines.noteLine(raw.frames, raw.contours, pick, { threshold: th })
						);
						emit(
							name,
							t.id,
							k,
							line.map((p, f) => [frameTime(f), p ? midiToHz(p.midi) : 0, p ? p.score : 0])
						);
					}
				}
			}
			if (!tag) {
				const vc = timed('bp-viterbi-contours' + suffix, sec, () =>
					viterbiLineMidi(raw.contours, band, vit, 3)
				);
				emit('bp-viterbi-contours' + suffix, t.id, k, lineRows(vc, raw.contours, true));
			}
		}
	}
	flushTimings();
}

// ---------- basic-pitch multipitch ----------

function mf0FromNotes(notes, dur) {
	const n = Math.ceil(dur / 0.01);
	const frames = Array.from({ length: n }, () => []);
	for (const [on, off, hz] of notes)
		for (let i = Math.ceil(on / 0.01); i < Math.min(n, Math.ceil(off / 0.01)); i++)
			frames[i].push(hz);
	return frames.map((fr, i) => [i * 0.01, ...fr]);
}

function phaseBpMf0() {
	for (const t of manifest.filter(isPoly)) {
		const raw = bpCache(t);
		const dur = raw.frames.length / NFPS;
		for (const th of [0.3, 0.4, 0.5]) {
			const rows = raw.frames.map((row, f) => {
				const out = [frameTime(f)];
				row.forEach((v, i) => v >= th && out.push(midiToHz(21 + i)));
				return out;
			});
			emit(`bp-mf0-frames${th}`, t.id, 'mf0', rows);
		}
		const notes = segment(raw, { onset: 0.5, frame: 0.3, minLen: 5, infer: true, melodia: false });
		emit('bp-mf0-notes-default', t.id, 'mf0', mf0FromNotes(notes, dur));
	}
}

// ---------- heatmap normalisation: per-track best threshold spread ----------

function refRoll(t, nFrames) {
	// semitone activity at each native frame time, from the 10ms reference mf0 grid
	const rows = readRows(join(OUT, 'refs', `${t.id}.mf0.csv`));
	return Array.from({ length: nFrames }, (_, f) => {
		const i = Math.min(rows.length - 1, Math.round(frameTime(f) / 0.01));
		const on = new Uint8Array(60);
		for (const hz of rows[i].slice(1)) {
			const m = Math.round(69 + 12 * Math.log2(hz / 440)) - RENDER_BASE;
			if (m >= 0 && m < 60) on[m] = 1;
		}
		return on;
	});
}

function percentile(values, p) {
	const s = Float32Array.from(values).sort();
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function phaseNorm() {
	const thresholds = Array.from({ length: 19 }, (_, i) => +(0.05 * (i + 1)).toFixed(2));
	const schemes = {
		max: (all) => all.reduce((a, b) => (b > a ? b : a), 0),
		p99: (all) => percentile(all, 0.99),
		p995: (all) => percentile(all, 0.995),
		raw: () => 1
	};
	const result = {};
	for (const t of manifest.filter(isPoly)) {
		const raw = bpCache(t);
		const ref = refRoll(t, raw.contours.length);
		// semitone-pooled render window C2..B6, as the heatmap shows it
		const roll = raw.contours.map((row) =>
			Array.from({ length: 60 }, (_, s) => {
				const c = (s + RENDER_BASE - 21) * 3;
				return Math.max(row[c - 1] ?? 0, row[c], row[c + 1]);
			})
		);
		const all = roll.flat();
		for (const [name, ref0] of Object.entries(schemes)) {
			const div = ref0(all);
			const f1s = thresholds.map((th) => {
				let tp = 0,
					fp = 0,
					fn = 0;
				roll.forEach((r, f) =>
					r.forEach((v, s) => {
						const on = Math.min(1, v / div) >= th;
						if (on && ref[f][s]) tp++;
						else if (on) fp++;
						else if (ref[f][s]) fn++;
					})
				);
				return (2 * tp) / (2 * tp + fp + fn || 1);
			});
			(result[name] ??= {})[t.id] = { set: t.set, divisor: div, f1s };
		}
	}
	const summary = {};
	for (const [name, per] of Object.entries(result)) {
		const tracks = Object.values(per);
		const bestTh = tracks.map((r) => thresholds[r.f1s.indexOf(Math.max(...r.f1s))]);
		const meanF1 = thresholds.map(
			(_, i) => tracks.reduce((s, r) => s + r.f1s[i], 0) / tracks.length
		);
		const gi = meanF1.indexOf(Math.max(...meanF1));
		const mean = bestTh.reduce((a, b) => a + b, 0) / bestTh.length;
		summary[name] = {
			bestThMean: +mean.toFixed(3),
			bestThStd: +Math.sqrt(
				bestTh.reduce((s, x) => s + (x - mean) ** 2, 0) / bestTh.length
			).toFixed(3),
			globalTh: thresholds[gi],
			meanF1AtGlobalTh: +meanF1[gi].toFixed(3),
			meanOracleF1: +(tracks.reduce((s, r) => s + Math.max(...r.f1s), 0) / tracks.length).toFixed(
				3
			),
			f1At0_2: +meanF1[thresholds.indexOf(0.2)].toFixed(3),
			divisorRange: [
				+Math.min(...tracks.map((r) => r.divisor)).toFixed(3),
				+Math.max(...tracks.map((r) => r.divisor)).toFixed(3)
			]
		};
	}
	writeFileSync(join(OUT, 'norm.json'), JSON.stringify({ summary, result }));
	console.table(summary);
}

// ---------- FFT path (HEAD snapshot of pitchgram.ts) ----------

async function phaseFft() {
	const pg = await import(resolve(flag('--pitchgram') ?? join(repo, 'src/routes/pitchgram.ts')));
	for (const t of manifest) {
		const x = decode(t, 22050);
		const dur = x.length / 22050;
		const { frames, totalBins } = await timedAsync('fft-shipped', dur, () =>
			pg.computePitchgram(x, 22050)
		);
		const l = timed('fft-shipped', dur, () => pg.extractLines(frames, totalBins));
		const n = frames.length;
		const time = (c) => ((c + 0.5) / n) * dur;
		const binHz = (b) => midiToHz(RENDER_BASE + b / 3);
		const rows = (line) =>
			line.map((p, c) => (p ? [time(c), binHz(p.bin), p.score] : [time(c), 0, 0]));
		if (isMono(t)) emit('fft-shipped', t.id, 'f0', rows(l.melody));
		else {
			emit('fft-shipped', t.id, 'melody', rows(l.melody));
			emit('fft-shipped', t.id, 'bass', rows(l.bass));
			const mf0 = l.melody.map((_, c) => {
				const set = new Set(
					['melody', 'inner', 'bass'].map((k) => l[k][c]?.bin).filter((b) => b !== undefined)
				);
				return [time(c), ...[...set].map(binHz)];
			});
			emit('fft-shipped', t.id, 'mf0', mf0);
		}
	}
	flushTimings();
}

async function phaseKlapuri() {
	const k = exp;
	for (const t of manifest.filter(isPoly)) {
		const x = decode(t, 22050);
		const dur = x.length / 22050;
		const frames = timed('klapuri', dur, () => k.klapuriMultiF0(x, 22050));
		emit(
			'klapuri',
			t.id,
			'mf0',
			frames.map((fr) => [fr.timeSec, ...fr.midis.map(midiToHz)])
		);
		emit(
			'klapuri',
			t.id,
			'melody',
			frames.map((fr) => [fr.timeSec, fr.midis.length ? midiToHz(Math.max(...fr.midis)) : 0, 1])
		);
		emit(
			'klapuri',
			t.id,
			'bass',
			frames.map((fr) => [fr.timeSec, fr.midis.length ? midiToHz(Math.min(...fr.midis)) : 0, 1])
		);
	}
	flushTimings();
}

// ---------- neural mono f0 on tf.js (CREPE tiny, SPICE) ----------

async function phaseCrepe() {
	const crepe = await import(join(repo, 'src/routes/pitch/crepe.ts'));
	const tf = await tfReady();
	const { server, port } = await serveDir(join(MODELS, 'crepe'));
	const model = await tf.loadLayersModel(`http://localhost:${port}/model.json`);
	server.close();
	const hop = Number(process.env.CREPE_HOP ?? 160); // samples at 16k (10ms)
	const name = hop === 160 ? 'crepe-tiny' : `crepe-tiny-hop${hop}`;
	for (const t of manifest.filter(isMono)) {
		const x = decode(t, crepe.CREPE_SAMPLE_RATE);
		const n = Math.floor(x.length / hop) + 1;
		const frames = [];
		await timedAsync(name, x.length / crepe.CREPE_SAMPLE_RATE, async () => {
			for (let start = 0; start < n; start += 512) {
				const count = Math.min(512, n - start);
				const input = tf.tensor2d(crepe.crepeBatch(x, hop, start, count), [
					count,
					crepe.CREPE_FRAME
				]);
				const out = model.predict(input);
				frames.push(...crepe.crepeDecode(await out.data(), hop, start));
				input.dispose();
				out.dispose();
			}
		});
		emit(name, t.id, 'f0', f0Rows(frames));
	}
	flushTimings(`${BACKEND} backend under Node; model 1.96MB`);
}

async function phaseSpice() {
	const tf = await tfReady();
	const { server, port } = await serveDir(join(MODELS, 'spice'));
	const model = await tf.loadGraphModel(`http://localhost:${port}/model.json`);
	server.close();
	for (const t of manifest.filter(isMono)) {
		const x = decode(t, 16000);
		const rows = await timedAsync('spice', x.length / 16000, async () => {
			const input = tf.tensor1d(x);
			const named = await model.executeAsync({ input_audio_samples: input }, [
				'pitch',
				'uncertainty'
			]);
			const [pitch, unc] = await Promise.all(named.map((o) => o.data()));
			named.forEach((o) => o.dispose());
			input.dispose();
			// TF Hub SPICE colab mapping; 32ms hop at 16kHz
			return Array.from(pitch, (p, i) => [
				(i * 512) / 16000,
				10 * 2 ** ((p * 63.07 + 25.58) / 12),
				1 - unc[i]
			]);
		});
		emit('spice', t.id, 'f0', rows);
	}
	flushTimings(`${BACKEND} backend under Node; model 8.76MB`);
}

// ---------- beat / tempo / key from basic-pitch outputs ----------

async function phaseBeatKey() {
	const rk = await import(join(repo, 'src/routes/pitch/rhythmKey.ts'));
	for (const t of manifest.filter((t) => t.kinds.includes('beats') || t.kinds.includes('key'))) {
		const raw = bpCache(t);
		const sec = raw.frames.length / NFPS;
		const novelty = Float32Array.from(raw.onsets, (row) => Math.max(...row));
		const { bpm, beatFrames } = timed('beats', sec, () => rk.estimateBeats(novelty, NFPS));
		emit(
			'beats',
			t.id,
			'beats',
			beatFrames.map((f) => [frameTime(f)])
		);
		emit('beats', t.id, 'tempo', bpm.toFixed(2), 'txt');
		const key = timed('key', sec, () => rk.estimateKey(raw.frames));
		emit('key', t.id, 'key', key, 'txt');
	}
	flushTimings();
}

const phases = {
	classical: phaseClassical,
	bp: phaseBp,
	bpnotes: phaseBpNotes,
	bplines: phaseBpLines,
	bpmf0: phaseBpMf0,
	norm: phaseNorm,
	fft: phaseFft,
	klapuri: phaseKlapuri,
	crepe: phaseCrepe,
	spice: phaseSpice,
	beatkey: phaseBeatKey
};
for (const [name, fn] of Object.entries(phases)) {
	if (PHASE === name || (PHASE === 'all' && !['crepe', 'spice'].includes(name))) {
		console.log('== phase', name);
		await fn();
	}
}
