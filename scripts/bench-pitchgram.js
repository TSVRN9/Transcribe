#!/usr/bin/env node
// Performance + accuracy benchmarks for the pitch-detection paths in
// src/routes/pitchgram.ts: the legacy hand-rolled FFT/harmonic-salience path
// (computePitchgram + extractLines) vs the neural path (computeBasicPitch),
// plus note segmentation (outputToNotesPoly) and voice grouping
// (groupIntoVoices).
//
// Pure Node, no browser and no test framework — run with:
//   node scripts/bench-pitchgram.js [--long]
//
// "Accuracy" means agreement with a synthetic ground-truth note sequence, not
// agreement with real recorded/labeled audio (no such corpus exists in this
// repo). The synthesized tone has a harmonic stack and an attack/decay
// envelope, not a bare sine: a sine has no harmonics for the salience path to
// sum, and is off-distribution for a model trained on real instruments — a
// bare sine would make both paths look artificially bad in different ways.
//
// --long extends the duration sweep out to 180s to directly reproduce the
// ~7.4s/~250ms melodiaTrick timing claim documented in pitchgram.ts; the
// default sweep stays short so a normal run finishes in ~1-2 minutes.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';

const {
	computePitchgram,
	extractLines,
	computeBasicPitch,
	groupIntoVoices,
	medianFilter,
	OCTAVE_START,
	BINS_PER_OCTAVE,
	BAND_OCTAVES,
	LINE_THRESHOLD,
	MAX_VOICES
} = await import('../src/routes/pitchgram.ts');

// esm/toMidi.js fails to import under plain Node (named-export interop with
// the CJS @tonejs/midi dependency it pulls in); the cjs build doesn't.
const require = createRequire(import.meta.url);
const { outputToNotesPoly } = require('@spotify/basic-pitch/cjs/toMidi.js');

const SR = 22050; // matches basic-pitch's native rate, so both paths see the same clip
const BINS_PER_SEMITONE = BINS_PER_OCTAVE / 12;
const RENDER_BASE_MIDI = 12 * OCTAVE_START + 12; // MIDI of bin 0 (mirrors pitchgram.ts's own constant)
const LONG = process.argv.includes('--long');

function binToMidi(bin) {
	return RENDER_BASE_MIDI + Math.floor(bin / BINS_PER_SEMITONE);
}

// Harmonic-rich tone (fundamental + 5 overtones, default 1/h amplitude) with a
// short attack/release envelope — stands in for a real instrument note.
// harmonicWeights overrides the default falloff, e.g. to make an overtone
// louder than the fundamental (see the harmonic-decoy test below).
const DEFAULT_HARMONIC_WEIGHTS = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6];
function renderNote(
	samples,
	{ midi, startSec, durSec, amp = 0.25, harmonicWeights = DEFAULT_HARMONIC_WEIGHTS }
) {
	const freq = 440 * Math.pow(2, (midi - 69) / 12);
	const startI = Math.round(startSec * SR);
	const durI = Math.round(durSec * SR);
	const rampI = Math.min(Math.round(0.02 * SR), Math.floor(durI / 4));
	const weightSum = harmonicWeights.reduce((s, w) => s + w, 0);
	for (let i = 0; i < durI; i++) {
		const idx = startI + i;
		if (idx < 0 || idx >= samples.length) continue;
		let env = 1;
		if (i < rampI) env = i / rampI;
		else if (i > durI - rampI) env = (durI - i) / rampI;
		let v = 0;
		for (let h = 0; h < harmonicWeights.length; h++) {
			v += Math.sin((2 * Math.PI * freq * (h + 1) * idx) / SR) * harmonicWeights[h];
		}
		samples[idx] += amp * env * (v / weightSum);
	}
}

// Deterministic (seeded) white noise, mixed in at a target SNR measured
// against the clip's overall RMS — for the noise-robustness sweep. mulberry32
// instead of Math.random so a failing run is reproducible.
function mulberry32(seed) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function addNoise(samples, snrDb, seed = 1) {
	const rng = mulberry32(seed);
	let sumSq = 0;
	for (const s of samples) sumSq += s * s;
	const signalRms = Math.sqrt(sumSq / samples.length);
	const noiseRms = signalRms / Math.pow(10, snrDb / 20);
	const noiseAmp = noiseRms * Math.sqrt(3); // RMS of uniform[-a,a] is a/sqrt(3)
	const out = new Float32Array(samples.length);
	for (let i = 0; i < samples.length; i++) out[i] = samples[i] + (rng() * 2 - 1) * noiseAmp;
	return out;
}

function synthesize(notes, durationSec) {
	const samples = new Float32Array(Math.round(durationSec * SR));
	for (const n of notes) renderNote(samples, n);
	return samples;
}

// Repeats a 4-note ascending phrase (Cmaj7-ish) to fill an arbitrary duration,
// for the performance sweep — needs to be "real" enough to cost the harmonic
// salience path something, unlike silence.
function tiledMelody(durationSec) {
	const phrase = [60, 64, 67, 71];
	const noteDur = 0.4;
	const notes = [];
	for (let t = 0; t < durationSec; t += noteDur) {
		notes.push({
			midi: phrase[Math.floor(t / noteDur) % phrase.length],
			startSec: t,
			durSec: noteDur * 0.9
		});
	}
	return synthesize(notes, durationSec);
}

function bandsContaining(midi) {
	const octIndex = Math.floor((midi - RENDER_BASE_MIDI) / 12);
	return Object.entries(BAND_OCTAVES)
		.filter(([, [lo, hi]]) => octIndex >= lo && octIndex < hi)
		.map(([key]) => key);
}

// Maps a ground-truth query time to that pipeline's own frame index — both
// pipelines bucket their fixed-size output evenly across real clip duration
// (see computePitchgram's `centers` and maxPoolRows' bucketEnd), so this
// formula is the same for both.
function timeToFrame(t, durationSec, frameCount) {
	return Math.min(frameCount - 1, Math.max(0, Math.floor((t / durationSec) * frameCount)));
}

function gradeLines(lines, notes, durationSec) {
	let correct = 0,
		octaveError = 0,
		otherWrong = 0,
		checked = 0;
	for (const note of notes) {
		const midTime = note.startSec + note.durSec / 2;
		for (const band of bandsContaining(note.midi)) {
			const frame = timeToFrame(midTime, durationSec, lines[band].length);
			const point = lines[band][frame];
			checked++;
			if (!point) {
				otherWrong++;
				continue;
			}
			const detected = binToMidi(point.bin);
			const diff = detected - note.midi;
			if (diff === 0) correct++;
			else if (Math.abs(diff) % 12 === 0 && diff !== 0) octaveError++;
			else otherWrong++;
		}
	}
	return {
		checked,
		correctRate: correct / checked,
		octaveErrorRate: octaveError / checked,
		otherWrongRate: otherWrong / checked
	};
}

// Naive baseline for the harmonic-decoy test: per-band raw-magnitude argmax,
// with no harmonic-summation salience — what extractLines would degrade to if
// harmonicSalience were removed. Mirrors extractLines' band-loop/median-filter
// structure exactly so the only variable being measured is salience vs raw.
function naiveLines(frames, totalBins) {
	const result = {};
	for (const key of Object.keys(BAND_OCTAVES)) {
		const [loOct, hiOct] = BAND_OCTAVES[key];
		const loBin = loOct * BINS_PER_OCTAVE;
		const hiBin = Math.min(totalBins, hiOct * BINS_PER_OCTAVE);
		const raw = frames.map((frame) => {
			let best = null;
			let bestScore = LINE_THRESHOLD;
			for (let bin = loBin; bin < hiBin; bin++) {
				if (frame[bin] > bestScore) {
					bestScore = frame[bin];
					best = { bin, score: frame[bin] };
				}
			}
			return best;
		});
		const bins = medianFilter(raw.map((p) => (p ? p.bin : null)));
		result[key] = bins.map((bin, i) => (bin === null ? null : { bin, score: raw[i]?.score ?? 0 }));
	}
	return result;
}

function falsePositiveRate(lines) {
	let total = 0,
		nonNull = 0;
	for (const band of Object.keys(lines)) {
		for (const p of lines[band]) {
			total++;
			if (p) nonNull++;
		}
	}
	return nonNull / total;
}

// --- isolated-note accuracy: one note per band's exclusive octave range ---
const ISOLATED_NOTES = [
	{ midi: 40, startSec: 0.3, durSec: 1.4 }, // bass-exclusive octave (C2..B2)
	{ midi: 60, startSec: 2.0, durSec: 1.4 }, // inner/melody overlap octave
	{ midi: 90, startSec: 3.7, durSec: 1.4 } // melody-exclusive octave
];
const ISOLATED_DURATION = 5.5;

async function benchLegacyIsolated() {
	const samples = synthesize(ISOLATED_NOTES, ISOLATED_DURATION);
	const { frames, totalBins } = await computePitchgram(samples, SR);
	const lines = extractLines(frames, totalBins);
	return gradeLines(lines, ISOLATED_NOTES, ISOLATED_DURATION);
}

async function benchBasicPitchIsolated(model) {
	const samples = synthesize(ISOLATED_NOTES, ISOLATED_DURATION);
	const { lines } = await computeBasicPitch(samples, model);
	return gradeLines(lines, ISOLATED_NOTES, ISOLATED_DURATION);
}

// --- silence false-positive check ---
async function benchLegacySilence() {
	const samples = new Float32Array(Math.round(SR * 2));
	const { frames, totalBins } = await computePitchgram(samples, SR);
	return falsePositiveRate(extractLines(frames, totalBins));
}

async function benchBasicPitchSilence(model) {
	const samples = new Float32Array(Math.round(SR * 2));
	const { lines } = await computeBasicPitch(samples, model);
	return falsePositiveRate(lines);
}

// --- performance sweep ---
const DURATIONS = LONG ? [5, 30, 180] : [5, 15, 60];

async function benchLegacyPerf(durationSec) {
	const samples = tiledMelody(durationSec);
	const t0 = performance.now();
	const { frames, totalBins } = await computePitchgram(samples, SR);
	const t1 = performance.now();
	extractLines(frames, totalBins);
	const t2 = performance.now();
	return { pitchgramMs: t1 - t0, extractLinesMs: t2 - t1 };
}

async function benchBasicPitchPerf(durationSec, model) {
	const samples = tiledMelody(durationSec);
	const t0 = performance.now();
	const result = await computeBasicPitch(samples, model);
	const t1 = performance.now();
	return { inferenceMs: t1 - t0, raw: result.raw };
}

// --- segmentation: reproduce the melodiaTrick timing/note-count claim ---
function benchSegmentation(raw) {
	const base = {
		onsetThresh: 0.5,
		frameThresh: 0.3,
		minNoteLen: 5,
		inferOnsets: true,
		maxFreq: null,
		minFreq: null
	};
	const t0 = performance.now();
	const withoutTrick = outputToNotesPoly(
		raw.frames.map((r) => r.slice()),
		raw.onsets.map((r) => r.slice()),
		base.onsetThresh,
		base.frameThresh,
		base.minNoteLen,
		base.inferOnsets,
		null,
		null,
		false
	);
	const t1 = performance.now();
	const withTrick = outputToNotesPoly(
		raw.frames.map((r) => r.slice()),
		raw.onsets.map((r) => r.slice()),
		base.onsetThresh,
		base.frameThresh,
		base.minNoteLen,
		base.inferOnsets,
		null,
		null,
		true
	);
	const t2 = performance.now();
	return {
		withoutTrickMs: t1 - t0,
		withTrickMs: t2 - t1,
		noteCountWithout: withoutTrick.length,
		noteCountWith: withTrick.length,
		noteCountIncreasePct: ((withTrick.length - withoutTrick.length) / withoutTrick.length) * 100
	};
}

// --- groupIntoVoices accuracy: two interleaved monophonic lines a fifth apart ---
function benchVoices() {
	// mirrors the dev self-check already in pitchgram.ts, extended to more onsets
	// so a greedy mis-assignment would show up as a monophony violation or a
	// 3rd/4th voice appearing where only 2 exist.
	const notes = [];
	for (let i = 0; i < 8; i++) {
		const t = i * 20;
		notes.push({ pitchMidi: 60, startFrame: t, durationFrames: 10, amplitude: 1 });
		notes.push({ pitchMidi: 67, startFrame: t, durationFrames: 10, amplitude: 1 });
	}
	const t0 = performance.now();
	const voices = groupIntoVoices(notes, 4);
	const t1 = performance.now();
	let monophonyViolations = 0;
	for (const voice of voices) {
		for (let i = 1; i < voice.length; i++) {
			if (voice[i].startFrame < voice[i - 1].startFrame + voice[i - 1].durationFrames) {
				monophonyViolations++;
			}
		}
	}
	return { ms: t1 - t0, voiceCount: voices.length, expectedVoiceCount: 2, monophonyViolations };
}

// ============================== advanced ==============================
// Each test below targets one specific documented design decision or known
// sharp edge, rather than "does it work on a nice clip":
//   - harmonic decoy: does harmonic-summation salience actually beat naive
//     per-bin argmax, the thing it exists to fix (see harmonicSalience's
//     doc comment)?
//   - chromatic run / detuning: pitch resolution, not just note-correctness.
//   - in-band collision: bandPeak can only ever surface one pitch per band
//     per frame — quantify what that silently drops, don't just assume it.
//   - low-octave stress: the octave-dependent FFT window is a documented
//     time/frequency tradeoff (see the file header) — does it actually bite
//     on fast low notes?
//   - noise robustness: every prior test used clean synthetic tone.
//   - groupIntoVoices stress: capacity overflow and the gap-cost cap.

function freqToMidi(freq) {
	return 69 + 12 * Math.log2(freq / 440);
}
function midiToBinFloat(midi) {
	return (midi - RENDER_BASE_MIDI) * BINS_PER_SEMITONE;
}
function centsError(detectedBin, expectedBinFloat) {
	return (detectedBin - expectedBinFloat) * (100 / BINS_PER_SEMITONE);
}

// --- harmonic decoy: 2nd harmonic louder than the fundamental ---
// If salience isn't pulling its weight, naive argmax and the "smart" path
// should both wrongly lock onto the 2nd harmonic (one octave above the real
// note) about equally often.
const DECOY_NOTE = {
	midi: 76,
	startSec: 0.4,
	durSec: 1.6,
	harmonicWeights: [0.4, 1.0, 0.3, 0.2, 0.1, 0.05]
};
const DECOY_DURATION = 2.4;

async function benchHarmonicDecoy(model) {
	const samples = synthesize([DECOY_NOTE], DECOY_DURATION);
	const { frames, totalBins } = await computePitchgram(samples, SR);
	const naive = gradeLines(naiveLines(frames, totalBins), [DECOY_NOTE], DECOY_DURATION);
	const salience = gradeLines(extractLines(frames, totalBins), [DECOY_NOTE], DECOY_DURATION);
	const { lines: bpLines } = await computeBasicPitch(samples, model);
	const basicPitch = gradeLines(bpLines, [DECOY_NOTE], DECOY_DURATION);
	return { naiveArgmax: naive, legacySalience: salience, basicPitch };
}

// --- chromatic run: 6 adjacent semitones, melody-exclusive octave ---
function chromaticRunNotes() {
	const notes = [];
	for (let i = 0; i < 6; i++) notes.push({ midi: 84 + i, startSec: 0.3 + i * 0.3, durSec: 0.27 });
	return notes;
}
const CHROMATIC_DURATION = 2.5;

async function benchChromatic(model) {
	const samples = synthesize(chromaticRunNotes(), CHROMATIC_DURATION);
	const { frames, totalBins } = await computePitchgram(samples, SR);
	const legacy = gradeLines(
		extractLines(frames, totalBins),
		chromaticRunNotes(),
		CHROMATIC_DURATION
	);
	const { lines } = await computeBasicPitch(samples, model);
	const basicPitch = gradeLines(lines, chromaticRunNotes(), CHROMATIC_DURATION);
	return { legacy, basicPitch };
}

// --- detuning: +37 cents off standard tuning, mid-semitone ---
const DETUNE_MIDI = 72;
const DETUNE_CENTS = 37;
const DETUNE_DURATION = 2.4;

async function benchDetuning(model) {
	const freq = 440 * Math.pow(2, (DETUNE_MIDI - 69) / 12) * Math.pow(2, DETUNE_CENTS / 1200);
	const expectedBin = midiToBinFloat(freqToMidi(freq));
	const note = { midi: DETUNE_MIDI, startSec: 0.4, durSec: 1.6 };
	// renderNote derives frequency from `midi` alone, so build the detuned
	// waveform directly rather than smuggling cents through the note shape.
	const samples = new Float32Array(Math.round(DETUNE_DURATION * SR));
	const startI = Math.round(note.startSec * SR);
	const durI = Math.round(note.durSec * SR);
	const rampI = Math.round(0.02 * SR);
	for (let i = 0; i < durI; i++) {
		const idx = startI + i;
		if (idx >= samples.length) break;
		let env = 1;
		if (i < rampI) env = i / rampI;
		else if (i > durI - rampI) env = (durI - i) / rampI;
		let v = 0;
		for (let h = 1; h <= 6; h++) v += Math.sin((2 * Math.PI * freq * h * idx) / SR) / h;
		samples[idx] += 0.25 * env * (v / 2.45);
	}
	const { frames, totalBins } = await computePitchgram(samples, SR);
	const legacyFrame = timeToFrame(note.startSec + note.durSec / 2, DETUNE_DURATION, frames.length);
	const legacyPoint = extractLines(frames, totalBins).melody[legacyFrame];
	const legacyCents = legacyPoint ? centsError(legacyPoint.bin, expectedBin) : null;

	const { lines } = await computeBasicPitch(samples, model);
	const bpFrame = timeToFrame(
		note.startSec + note.durSec / 2,
		DETUNE_DURATION,
		lines.melody.length
	);
	const bpPoint = lines.melody[bpFrame];
	const bpCents = bpPoint ? centsError(bpPoint.bin, expectedBin) : null;

	return { legacyCentsError: legacyCents, basicPitchCentsError: bpCents };
}

// --- in-band collision: 3 simultaneous notes competing for one band's single pick ---
const COLLISION_NOTES = [
	{ midi: 84, startSec: 0.4, durSec: 1.6, amp: 0.12 },
	{ midi: 88, startSec: 0.4, durSec: 1.6, amp: 0.12 },
	{ midi: 91, startSec: 0.4, durSec: 1.6, amp: 0.25 } // clearly loudest
];
const COLLISION_DURATION = 2.4;

async function benchCollision(model) {
	const samples = synthesize(COLLISION_NOTES, COLLISION_DURATION);
	const midTime = 0.4 + 1.6 / 2;
	const { frames, totalBins } = await computePitchgram(samples, SR);
	const legacyFrame = timeToFrame(midTime, COLLISION_DURATION, frames.length);
	const legacyPoint = extractLines(frames, totalBins).melody[legacyFrame];
	const { lines } = await computeBasicPitch(samples, model);
	const bpFrame = timeToFrame(midTime, COLLISION_DURATION, lines.melody.length);
	const bpPoint = lines.melody[bpFrame];
	return {
		loudestMidi: 91,
		legacyPicked: legacyPoint ? binToMidi(legacyPoint.bin) : null,
		basicPitchPicked: bpPoint ? binToMidi(bpPoint.bin) : null,
		otherNotesAlwaysDropped: true // structural: one LinePoint per band per frame, not a per-run measurement
	};
}

// --- low-octave stress: fast notes where the FFT window vastly outlasts the note ---
function lowOctaveStressNotes() {
	const pitches = [36, 38, 40, 42, 44, 46];
	return pitches.map((midi, i) => ({ midi, startSec: 0.5 + i * 0.2, durSec: 0.18 }));
}
const LOW_OCTAVE_DURATION = 2.5;

async function benchLowOctaveStress(model) {
	const notes = lowOctaveStressNotes();
	const samples = synthesize(notes, LOW_OCTAVE_DURATION);
	const { frames, totalBins } = await computePitchgram(samples, SR);
	const legacy = gradeLines(extractLines(frames, totalBins), notes, LOW_OCTAVE_DURATION);
	const { lines } = await computeBasicPitch(samples, model);
	const basicPitch = gradeLines(lines, notes, LOW_OCTAVE_DURATION);
	return { legacy, basicPitch };
}

// --- noise robustness sweep ---
const NOISE_SNR_LEVELS = [Infinity, 20, 10, 0];

async function benchNoiseSweep(model) {
	const rows = {};
	for (const snr of NOISE_SNR_LEVELS) {
		const clean = synthesize(ISOLATED_NOTES, ISOLATED_DURATION);
		const samples = Number.isFinite(snr) ? addNoise(clean, snr) : clean;
		const { frames, totalBins } = await computePitchgram(samples, SR);
		const legacy = gradeLines(extractLines(frames, totalBins), ISOLATED_NOTES, ISOLATED_DURATION);
		const { lines } = await computeBasicPitch(samples, model);
		const basicPitch = gradeLines(lines, ISOLATED_NOTES, ISOLATED_DURATION);
		rows[Number.isFinite(snr) ? `${snr}dB` : 'clean'] = {
			legacyCorrectRate: pct(legacy.correctRate),
			basicPitchCorrectRate: pct(basicPitch.correctRate)
		};
	}
	return rows;
}

// --- groupIntoVoices stress ---
function benchVoiceCapacity() {
	// 6 simultaneous onsets, only MAX_VOICES(=4) slots — the rest must be
	// dropped, not crammed into an existing voice (which would violate
	// monophony).
	const notes = [50, 55, 60, 65, 70, 75].map((pitchMidi) => ({
		pitchMidi,
		startFrame: 0,
		durationFrames: 20,
		amplitude: 1
	}));
	const voices = groupIntoVoices(notes, MAX_VOICES);
	const assigned = voices.reduce((s, v) => s + v.length, 0);
	return {
		voiceCount: voices.length,
		expectedVoiceCount: MAX_VOICES,
		notesIn: notes.length,
		notesAssigned: assigned
	};
}

function benchVoiceGapCap() {
	// two same-pitch notes separated by more than VOICE_GAP_CAP_FRAMES with no
	// competing voice to steal the continuation — cost is capped, so this
	// should still merge into one voice rather than opening a redundant second.
	const gapFrames = 90 + 50; // beyond VOICE_GAP_CAP_FRAMES (90)
	const notes = [
		{ pitchMidi: 65, startFrame: 0, durationFrames: 10, amplitude: 1 },
		{ pitchMidi: 65, startFrame: 10 + gapFrames, durationFrames: 10, amplitude: 1 }
	];
	const voices = groupIntoVoices(notes, MAX_VOICES);
	return {
		voiceCount: voices.length,
		expectedVoiceCount: 1,
		reconnected: voices.length === 1 && voices[0].length === 2
	};
}

// --- extractLines cost vs polyphony: should be ~flat (O(bins)), not O(active notes) ---
async function benchExtractLinesFlatness() {
	const sparseSamples = synthesize([{ midi: 60, startSec: 0.2, durSec: 4.6 }], 5);
	const denseSamples = synthesize(
		[
			{ midi: 40, startSec: 0.2, durSec: 4.6 },
			{ midi: 58, startSec: 0.2, durSec: 4.6 },
			{ midi: 75, startSec: 0.2, durSec: 4.6 }
		],
		5
	);
	const sparse = await computePitchgram(sparseSamples, SR);
	const dense = await computePitchgram(denseSamples, SR);
	const t0 = performance.now();
	extractLines(sparse.frames, sparse.totalBins);
	const t1 = performance.now();
	extractLines(dense.frames, dense.totalBins);
	const t2 = performance.now();
	return { sparseMs: t1 - t0, denseMs: t2 - t1 };
}

// --- local static server so computeBasicPitch's fetch() reaches the model files ---
function serveModel() {
	const root = new URL('../static/basic-pitch-model', import.meta.url).pathname;
	const server = http.createServer(async (req, res) => {
		const path = root + req.url.split('?')[0];
		try {
			await stat(path);
			createReadStream(path).pipe(res);
		} catch {
			res.statusCode = 404;
			res.end();
		}
	});
	return new Promise((resolve) => {
		server.listen(0, () =>
			resolve({ server, url: `http://localhost:${server.address().port}/model.json` })
		);
	});
}

function pct(x) {
	return `${(x * 100).toFixed(0)}%`;
}

async function main() {
	console.log(`\n=== Isolated-note accuracy (±50 cents = same semitone) ===`);
	const legacyIso = await benchLegacyIsolated();
	console.table({
		legacy: {
			...legacyIso,
			correctRate: pct(legacyIso.correctRate),
			octaveErrorRate: pct(legacyIso.octaveErrorRate),
			otherWrongRate: pct(legacyIso.otherWrongRate)
		}
	});

	console.log(`\n=== Silence false-positive rate ===`);
	console.log('legacy:', pct(await benchLegacySilence()));

	console.log(`\n=== Legacy performance sweep (computePitchgram + extractLines) ===`);
	console.log('note: wall-clock includes periodic setTimeout(0) UI yields inside computePitchgram');
	const legacyPerf = {};
	for (const d of DURATIONS) legacyPerf[`${d}s`] = await benchLegacyPerf(d);
	console.table(legacyPerf);

	console.log(`\n=== Neural path (computeBasicPitch) ===`);
	const { server, url } = await serveModel();
	let bpPerf;
	try {
		console.log(`\n--- isolated-note accuracy ---`);
		const bpIso = await benchBasicPitchIsolated(url);
		console.table({
			basicPitch: {
				...bpIso,
				correctRate: pct(bpIso.correctRate),
				octaveErrorRate: pct(bpIso.octaveErrorRate),
				otherWrongRate: pct(bpIso.otherWrongRate)
			}
		});

		console.log(`\n--- silence false-positive rate ---`);
		console.log('basicPitch:', pct(await benchBasicPitchSilence(url)));

		bpPerf = {};
		let longestRaw;
		for (const d of DURATIONS) {
			const { inferenceMs, raw } = await benchBasicPitchPerf(d, url);
			bpPerf[d] = inferenceMs;
			longestRaw = raw; // keep the biggest clip's raw frames for the segmentation bench below
		}

		console.log(
			`\n--- performance sweep, x-realtime (durationSec / wallSec — >1 means faster than playback) ---`
		);
		const combined = {};
		for (const d of DURATIONS) {
			combined[`${d}s`] = {
				legacyMs: legacyPerf[`${d}s`].pitchgramMs.toFixed(0),
				legacyXRealtime: (d / (legacyPerf[`${d}s`].pitchgramMs / 1000)).toFixed(1),
				basicPitchMs: bpPerf[d].toFixed(0),
				basicPitchXRealtime: (d / (bpPerf[d] / 1000)).toFixed(1)
			};
		}
		console.table(combined);

		// legacy cost is ~flat (TARGET_FRAMES caps it); basic-pitch scales ~linearly
		// with clip length — fit the neural path's two extreme points and solve for
		// where its cost overtakes legacy's (roughly constant) cost.
		const [d0, d1] = [DURATIONS[0], DURATIONS[DURATIONS.length - 1]];
		const slope = (bpPerf[d1] - bpPerf[d0]) / (d1 - d0);
		const intercept = bpPerf[d0] - slope * d0;
		const legacyFlatMs = legacyPerf[`${d1}s`].pitchgramMs;
		const crossoverSec = (legacyFlatMs - intercept) / slope;
		console.log(
			`legacy stays ~flat at ~${(legacyFlatMs / 1000).toFixed(1)}s; neural path modeled as ${slope.toFixed(0)}ms/s + ${intercept.toFixed(0)}ms fixed overhead — crosses over legacy's cost at ~${crossoverSec.toFixed(1)}s of audio (neural's fixed overhead alone is already close to legacy's flat cost)`
		);

		console.log(
			`\n=== Segmentation: melodiaTrick on vs off (${DURATIONS[DURATIONS.length - 1]}s clip, documented claim: ~7.4s vs ~250ms @ 3min, ~19% more notes) ===`
		);
		console.table(benchSegmentation(longestRaw));

		console.log(`\n\n########## ADVANCED ##########`);

		console.log(
			`\n=== Harmonic decoy: 2nd harmonic louder than the fundamental (MIDI ${DECOY_NOTE.midi}) ===`
		);
		console.log(
			'does harmonic-summation salience actually beat naive per-bin argmax at avoiding the octave-up decoy?'
		);
		const decoy = await benchHarmonicDecoy(url);
		console.table({
			naiveArgmax: {
				correctRate: pct(decoy.naiveArgmax.correctRate),
				octaveErrorRate: pct(decoy.naiveArgmax.octaveErrorRate)
			},
			legacySalience: {
				correctRate: pct(decoy.legacySalience.correctRate),
				octaveErrorRate: pct(decoy.legacySalience.octaveErrorRate)
			},
			basicPitch: {
				correctRate: pct(decoy.basicPitch.correctRate),
				octaveErrorRate: pct(decoy.basicPitch.octaveErrorRate)
			}
		});

		console.log(`\n=== Chromatic run: 6 adjacent semitones, 300ms each ===`);
		const chromatic = await benchChromatic(url);
		console.table({
			legacy: {
				correctRate: pct(chromatic.legacy.correctRate),
				otherWrongRate: pct(chromatic.legacy.otherWrongRate)
			},
			basicPitch: {
				correctRate: pct(chromatic.basicPitch.correctRate),
				otherWrongRate: pct(chromatic.basicPitch.otherWrongRate)
			}
		});

		console.log(
			`\n=== Detuning: MIDI ${DETUNE_MIDI} + ${DETUNE_CENTS} cents (bin resolution is ~33 cents) ===`
		);
		console.table(await benchDetuning(url));

		console.log(`\n=== In-band collision: 3 simultaneous notes (MIDI 84/88/91), loudest = 91 ===`);
		console.log(
			'known limitation: bandPeak surfaces one pitch per band per frame — the other two are structurally dropped'
		);
		console.table(await benchCollision(url));

		console.log(
			`\n=== Low-octave stress: 6 notes @ ~180ms in the bass-exclusive octave (window there is ~1.5s) ===`
		);
		const lowOctave = await benchLowOctaveStress(url);
		console.table({
			legacy: {
				correctRate: pct(lowOctave.legacy.correctRate),
				otherWrongRate: pct(lowOctave.legacy.otherWrongRate)
			},
			basicPitch: {
				correctRate: pct(lowOctave.basicPitch.correctRate),
				otherWrongRate: pct(lowOctave.basicPitch.otherWrongRate)
			}
		});

		console.log(`\n=== Noise robustness sweep (isolated-note accuracy vs added white noise) ===`);
		console.table(await benchNoiseSweep(url));
	} finally {
		server.close();
	}

	console.log(
		`\n=== extractLines cost vs polyphony (sparse: 1 note, dense: 3-note chord, both 5s) ===`
	);
	console.table(await benchExtractLinesFlatness());

	console.log(`\n=== groupIntoVoices: 2 interleaved fifths-apart lines, 8 onsets ===`);
	console.table(benchVoices());

	console.log(`\n=== groupIntoVoices: capacity overflow (6 onsets, MAX_VOICES=${MAX_VOICES}) ===`);
	console.table(benchVoiceCapacity());

	console.log(`\n=== groupIntoVoices: gap beyond VOICE_GAP_CAP_FRAMES, no competing voice ===`);
	console.table(benchVoiceGapCap());
}

main();
