// Pitchgram math. No Svelte, no DOM.

import type { RawNoteEvent, WorkerRequest, WorkerResponse } from './segment.worker';
import { noteLine, type LinePoint as NoteLinePoint } from './pitch/lines';

export const OCTAVE_START = 2; // C2
export const OCTAVE_COUNT = 5; // through B6
// 3 bins/semitone, basic-pitch's contour resolution, so its output slices in without resampling
export const BINS_PER_OCTAVE = 36;
export const TOP_WINDOW = 2048; // FFT size for the highest octave block

// shortcut: fixed column budget regardless of length, raise it if long files look coarse at max zoom
const TARGET_FRAMES = 2400;
const DB_FLOOR = -60; // dB below the clip's peak

function midiToFreq(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function hannWindow(size: number): Float32Array {
	const w = new Float32Array(size);
	for (let i = 0; i < size; i++) {
		w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
	}
	return w;
}

// In-place radix-2 FFT. real.length must be a power of 2.
function fft(real: Float32Array, imag: Float32Array) {
	const n = real.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[real[i], real[j]] = [real[j], real[i]];
			[imag[i], imag[j]] = [imag[j], imag[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		const half = len / 2;
		for (let i = 0; i < n; i += len) {
			let curWr = 1;
			let curWi = 0;
			for (let k = 0; k < half; k++) {
				const ur = real[i + k];
				const ui = imag[i + k];
				const vr = real[i + k + half] * curWr - imag[i + k + half] * curWi;
				const vi = real[i + k + half] * curWi + imag[i + k + half] * curWr;
				real[i + k] = ur + vr;
				imag[i + k] = ui + vi;
				real[i + k + half] = ur - vr;
				imag[i + k + half] = ui - vi;
				const nwr = curWr * wr - curWi * wi;
				const nwi = curWr * wi + curWi * wr;
				curWr = nwr;
				curWi = nwi;
			}
		}
	}
}

// Doubles per octave down so relative frequency resolution stays constant (CQT-like).
function windowSizeForOctave(octaveIndex: number): number {
	return TOP_WINDOW * Math.pow(2, OCTAVE_COUNT - 1 - octaveIndex);
}

export interface PitchgramResult {
	frames: Float32Array[]; // frames[time][bin], bin 0 = C2, 0..1
	totalBins: number;
}

// setTimeout, not rAF: rAF stalls in a background tab.
function yieldToUI(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// dB relative to the clip's peak, not per frame, so quiet passages stay quiet.
export async function computePitchgram(
	samples: Float32Array,
	sampleRate: number
): Promise<PitchgramResult> {
	const totalSamples = samples.length;
	const totalBins = OCTAVE_COUNT * BINS_PER_OCTAVE;
	const frameCount = Math.max(1, Math.min(TARGET_FRAMES, totalSamples));

	const centers = new Float32Array(frameCount);
	for (let f = 0; f < frameCount; f++) {
		centers[f] = ((f + 0.5) * totalSamples) / frameCount;
	}

	const octaveWindows = Array.from({ length: OCTAVE_COUNT }, (_, o) => {
		const size = windowSizeForOctave(o);
		const loMidi = 12 * (OCTAVE_START + o) + 12; // MIDI: C0 = 12
		const hiMidi = loMidi + 12;
		// low-octave windows smear far past one column anyway, so skip columns and replicate
		const stride = Math.max(1, 2 ** (OCTAVE_COUNT - 2 - o));
		return {
			size,
			window: hannWindow(size),
			loFreq: midiToFreq(loMidi),
			hiFreq: midiToFreq(hiMidi),
			stride
		};
	});
	const rawFrames: Float32Array[] = Array.from(
		{ length: frameCount },
		() => new Float32Array(totalBins)
	);
	let globalMax = 1e-12;

	for (const { size, window, loFreq, hiFreq, stride } of octaveWindows) {
		const real = new Float32Array(size);
		const imag = new Float32Array(size);
		const binLo = Math.max(1, Math.floor((loFreq * size) / sampleRate) - 1);
		const binHi = Math.min(size / 2 - 1, Math.ceil((hiFreq * size) / sampleRate) + 1);

		let iterations = 0;
		for (let f = 0; f < frameCount; f += stride) {
			const start = Math.round(centers[f] - size / 2);
			imag.fill(0);
			for (let i = 0; i < size; i++) {
				const s = start + i;
				real[i] = s >= 0 && s < totalSamples ? samples[s] * window[i] : 0;
			}
			fft(real, imag);

			const blockEnd = Math.min(frameCount, f + stride);
			for (let bin = binLo; bin <= binHi; bin++) {
				const freq = (bin * sampleRate) / size;
				const midi = 69 + 12 * Math.log2(freq / 440);
				const targetBin = Math.round(((midi - 12 * (OCTAVE_START + 1)) * BINS_PER_OCTAVE) / 12);
				if (targetBin < 0 || targetBin >= totalBins) continue;
				const mag = Math.hypot(real[bin], imag[bin]);
				for (let g = f; g < blockEnd; g++) rawFrames[g][targetBin] += mag;
				if (mag > globalMax) globalMax = mag;
			}

			iterations++;
			if (iterations % 100 === 0) await yieldToUI();
		}
	}

	const globalMaxDb = 20 * Math.log10(globalMax);
	const frames = rawFrames.map((raw) => {
		const out = new Float32Array(totalBins);
		for (let i = 0; i < totalBins; i++) {
			const db = 20 * Math.log10(raw[i] + 1e-12) - globalMaxDb; // <= 0
			out[i] = Math.max(0, (db - DB_FLOOR) / -DB_FLOOR);
		}
		return out;
	});

	return { frames, totalBins };
}

export interface LinePoint {
	bin: number;
	score: number; // raw per-frame confidence, never smoothed
}
export interface PitchLines {
	melody: (LinePoint | null)[];
	inner: (LinePoint | null)[];
	bass: (LinePoint | null)[];
}

// bands overlap on purpose: a melody dipping into the inner range is still melody
export const BAND_OCTAVES: Record<keyof PitchLines, [lo: number, hi: number]> = {
	bass: [0, 2],
	inner: [1, 3],
	melody: [2, OCTAVE_COUNT]
};

export const LINE_THRESHOLD = 0.15; // below this reads as silence
const MEDIAN_WINDOW = 5; // frames

// Klapuri-style harmonic summation: harmonics often outshine the fundamental, so a raw argmax picks them
const HARMONIC_COUNT = 5;
const HARMONIC_DECAY = 0.8;
const HARMONICS = Array.from({ length: HARMONIC_COUNT - 1 }, (_, i) => {
	const h = i + 2;
	return {
		offsetBins: Math.round(Math.log2(h) * BINS_PER_OCTAVE),
		weight: HARMONIC_DECAY ** (h - 1)
	};
});
const SALIENCE_WEIGHT_SUM = 1 + HARMONICS.reduce((sum, { weight }) => sum + weight, 0);

function harmonicSalience(frame: Float32Array, totalBins: number): Float32Array {
	const out = new Float32Array(totalBins);
	for (let bin = 0; bin < totalBins; bin++) {
		let s = frame[bin];
		for (const { offsetBins, weight } of HARMONICS) {
			const hBin = bin + offsetBins;
			if (hBin < totalBins) s += frame[hBin] * weight;
		}
		out[bin] = s / SALIENCE_WEIGHT_SUM;
	}
	return out;
}

function bandPeak(salience: Float32Array, loBin: number, hiBin: number): LinePoint | null {
	let best: LinePoint | null = null;
	let bestScore = LINE_THRESHOLD;
	for (let bin = loBin; bin < hiBin; bin++) {
		if (salience[bin] > bestScore) {
			bestScore = salience[bin];
			best = { bin, score: salience[bin] };
		}
	}
	return best;
}

export function medianFilter(values: (number | null)[]): (number | null)[] {
	const half = Math.floor(MEDIAN_WINDOW / 2);
	return values.map((_, i) => {
		const nearby: number[] = [];
		for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
			const v = values[j];
			if (v !== null) nearby.push(v);
		}
		if (nearby.length === 0) return null;
		nearby.sort((a, b) => a - b);
		return nearby[Math.floor(nearby.length / 2)];
	});
}

// filters the bin only; smoothing the score would invent confidence for empty frames
function medianFilterPoints(points: (LinePoint | null)[]): (LinePoint | null)[] {
	const bins = medianFilter(points.map((p) => (p ? p.bin : null)));
	return bins.map((bin, i) => (bin === null ? null : { bin, score: points[i]?.score ?? 0 }));
}

export function extractLines(frames: Float32Array[], totalBins: number): PitchLines {
	const salienceFrames = frames.map((f) => harmonicSalience(f, totalBins));
	const result = {} as PitchLines;
	for (const key of Object.keys(BAND_OCTAVES) as (keyof PitchLines)[]) {
		const [loOct, hiOct] = BAND_OCTAVES[key];
		const loBin = loOct * BINS_PER_OCTAVE;
		const hiBin = Math.min(totalBins, hiOct * BINS_PER_OCTAVE);
		const raw = salienceFrames.map((f) => bandPeak(f, loBin, hiBin));
		result[key] = medianFilterPoints(raw);
	}
	return result;
}

export function mixToMono(buffer: AudioBuffer): Float32Array {
	if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
	const out = new Float32Array(buffer.length);
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels;
	}
	return out;
}

const CONTOUR_BINS_PER_SEMITONE = 3;
const CONTOUR_BASE_MIDI = 21; // A0
const RENDER_BASE_MIDI = 12 * OCTAVE_START + 12; // C2

// basic-pitch's windows don't divide evenly into frames, so time drifts per window; this
// copies its unexported modelFrameToTime (toMidi.ts) so the heatmap lines up with playback
const NATIVE_SAMPLE_RATE = 22050;
const NATIVE_FFT_HOP = 256;
const NATIVE_FPS = Math.floor(NATIVE_SAMPLE_RATE / NATIVE_FFT_HOP); // 86
const NATIVE_WINDOW_SECONDS = 2;
const NATIVE_FRAMES_PER_WINDOW = NATIVE_FPS * NATIVE_WINDOW_SECONDS; // 172
const NATIVE_SAMPLES_PER_WINDOW = NATIVE_SAMPLE_RATE * NATIVE_WINDOW_SECONDS - NATIVE_FFT_HOP;
const NATIVE_WINDOW_OFFSET =
	(NATIVE_FFT_HOP / NATIVE_SAMPLE_RATE) *
		(NATIVE_FRAMES_PER_WINDOW - NATIVE_SAMPLES_PER_WINDOW / NATIVE_FFT_HOP) +
	0.0018; // from basic-pitch's toMidi.ts

export function nativeFrameToTime(frame: number): number {
	return (
		(frame * NATIVE_FFT_HOP) / NATIVE_SAMPLE_RATE -
		NATIVE_WINDOW_OFFSET * Math.floor(frame / NATIVE_FRAMES_PER_WINDOW)
	);
}

if (import.meta.env?.DEV) {
	console.assert(nativeFrameToTime(0) === 0, 'nativeFrameToTime(0) should be exactly 0');
	const threeMinuteFrame = NATIVE_FPS * 180;
	const drift = 180 - nativeFrameToTime(threeMinuteFrame);
	console.assert(
		drift > 1.0 && drift < 1.4,
		`nativeFrameToTime drift at 3min should be ~1.2s, got ${drift}`
	);
}

// shortcut: number[][] (what outputToNotesPoly takes) costs ~4x Float32Array memory, switch if long clips run out
export interface RawModelOutput {
	frames: number[][];
	onsets: number[][];
}

export interface BasicPitchResult {
	result: PitchgramResult;
	lines: PitchLines;
	raw: RawModelOutput;
}

// dynamic import keeps tf.js out of the prerender pass; a failed load is cleared so it can retry
let basicPitchPromise: Promise<import('@spotify/basic-pitch').BasicPitch> | undefined;
function getBasicPitch(modelUrl: string) {
	if (!basicPitchPromise) {
		basicPitchPromise = import('@spotify/basic-pitch')
			.then(({ BasicPitch }) => new BasicPitch(modelUrl))
			.catch((err) => {
				basicPitchPromise = undefined;
				throw err;
			});
	}
	return basicPitchPromise;
}

// Buckets by real time (nativeFrameToTime), not row index. Partial results pass the
// eventual total row count so the preview keeps its final width with an empty tail.
function maxPoolRows(
	rows: number[][],
	targetCount: number,
	durationSeconds: number,
	totalRowsEstimate = rows.length
): number[][] {
	if (rows.length === 0) return rows;
	const width = rows[0].length;
	const count = Math.min(targetCount, totalRowsEstimate);
	const out: number[][] = new Array(count);
	let frame = 0;
	for (let c = 0; c < count; c++) {
		const bucketEnd = ((c + 1) / count) * durationSeconds;
		const pooled = new Array(width).fill(0);
		let any = false;
		while (frame < rows.length && (c === count - 1 || nativeFrameToTime(frame) < bucketEnd)) {
			const row = rows[frame];
			for (let b = 0; b < width; b++) if (row[b] > pooled[b]) pooled[b] = row[b];
			any = true;
			frame++;
		}
		out[c] = any ? pooled : new Array(width).fill(0);
	}
	return out;
}

function shapePitchResult(
	frameRows: number[][],
	contourRows: number[][],
	effectiveDuration: number
): { result: PitchgramResult; lines: PitchLines } {
	const estimatedTotalRows = Math.round(effectiveDuration * NATIVE_FPS);
	const pooledContours = maxPoolRows(
		contourRows,
		TARGET_FRAMES,
		effectiveDuration,
		estimatedTotalRows
	);

	const totalBins = OCTAVE_COUNT * BINS_PER_OCTAVE;
	const contourLo = (RENDER_BASE_MIDI - CONTOUR_BASE_MIDI) * CONTOUR_BINS_PER_SEMITONE;
	const slices = pooledContours.map((row) => row.slice(contourLo, contourLo + totalBins));

	// contours rarely approach 1, so rescale to the clip's own peak
	let globalMax = 1e-6;
	for (const row of slices) for (const v of row) if (v > globalMax) globalMax = v;
	const frames = slices.map((row) => Float32Array.from(row, (v) => v / globalMax));

	return {
		result: { frames, totalBins },
		lines: extractLinesFromModel(frameRows, contourRows, frames.length, effectiveDuration)
	};
}

// skyline melody / lowest-note bass beat per-band argmax on every annotated set (docs/pitch-methods-eval.md)
function extractLinesFromModel(
	frameRows: number[][],
	contourRows: number[][],
	columns: number,
	durationSeconds: number
): PitchLines {
	const toBin = (midi: number) => (midi - RENDER_BASE_MIDI) * CONTOUR_BINS_PER_SEMITONE + 1;
	const pool = (native: (NoteLinePoint | null)[]) => {
		const out: (LinePoint | null)[] = new Array(columns).fill(null);
		native.forEach((p, f) => {
			if (!p) return;
			const c = Math.min(
				columns - 1,
				Math.floor((nativeFrameToTime(f) / durationSeconds) * columns)
			);
			const cur = out[c];
			if (!cur || p.score > cur.score) out[c] = { bin: toBin(p.midi), score: p.score };
		});
		return out;
	};
	return {
		melody: pool(noteLine(frameRows, contourRows, 'top')),
		inner: pool(
			noteLine(frameRows, contourRows, 'max', { threshold: LINE_THRESHOLD, loMidi: 48, hiMidi: 72 })
		),
		bass: pool(noteLine(frameRows, contourRows, 'bottom'))
	};
}

// shortcut: fixed cadence on the main thread, throttle by wall-clock if this shows up in profiles
const PROGRESS_EVERY_N_WINDOWS = 3;

// samples: 22050Hz mono. evaluateModel calls back once per ~1.6s window, so rows accumulate.
export async function computeBasicPitch(
	samples: Float32Array,
	modelUrl: string,
	// the <audio> element's duration, which can differ from the decoded length (MP3 padding)
	durationSeconds?: number,
	onProgress?: (partial: { result: PitchgramResult; lines: PitchLines }) => void
): Promise<BasicPitchResult> {
	const model = await getBasicPitch(modelUrl);

	const frameRows: number[][] = [];
	const contourRows: number[][] = [];
	const onsetRows: number[][] = [];
	const effectiveDuration = durationSeconds || samples.length / NATIVE_SAMPLE_RATE;
	let windowCount = 0;
	await model.evaluateModel(
		samples,
		(frames, onsets, contours) => {
			frameRows.push(...frames);
			contourRows.push(...contours);
			onsetRows.push(...onsets);
			if (onProgress && ++windowCount % PROGRESS_EVERY_N_WINDOWS === 0) {
				onProgress(shapePitchResult(frameRows, contourRows, effectiveDuration));
			}
		},
		() => {}
	);
	if (frameRows.length === 0)
		return {
			result: { frames: [], totalBins: 0 },
			lines: { melody: [], inner: [], bass: [] },
			raw: { frames: [], onsets: [] }
		};

	const { result, lines } = shapePitchResult(frameRows, contourRows, effectiveDuration);

	return {
		result,
		lines,
		// unpooled, so Notes can re-segment without re-running the model
		raw: { frames: frameRows, onsets: onsetRows }
	};
}

export interface NoteSegmentSettings {
	onsetThresh: number;
	frameThresh: number;
	minNoteLen: number; // in native (~86fps) frames
	inferOnsets: boolean;
	melodiaTrick: boolean; // ~7.4s vs ~250ms on a 3-minute clip, for ~19% more notes
}
export const DEFAULT_NOTE_SETTINGS: NoteSegmentSettings = {
	onsetThresh: 0.6, // best of 80 settings on all five annotated sets
	frameThresh: 0.3,
	minNoteLen: 5,
	inferOnsets: true,
	melodiaTrick: false
};

export interface RenderedNote {
	bin: number;
	startFrame: number; // native frame index; convert with nativeFrameToTime
	durationFrames: number;
	amplitude: number; // 0..1
}

// created lazily so prerender never touches Worker
let segmentWorker: Worker | undefined;
let segmentRequestSeq = 0;
const segmentPending = new Map<
	number,
	{ resolve: (notes: RawNoteEvent[]) => void; reject: (err: Error) => void }
>();
let lastRawSent: RawModelOutput | undefined;

function failAllPending(message: string) {
	for (const { reject } of segmentPending.values()) reject(new Error(message));
	segmentPending.clear();
}

function getSegmentWorker(): Worker {
	if (!segmentWorker) {
		const worker = new Worker(new URL('./segment.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const pending = segmentPending.get(e.data.id);
			if (!pending) return;
			segmentPending.delete(e.data.id);
			if (e.data.type === 'error') pending.reject(new Error(e.data.message));
			else pending.resolve(e.data.notes);
		};
		// the worker itself failed to load: reject everything and rebuild next time
		worker.onerror = (e: ErrorEvent) => {
			failAllPending(e.message || 'segment worker failed');
			segmentWorker = undefined;
			lastRawSent = undefined;
		};
		segmentWorker = worker;
	}
	return segmentWorker;
}

// the worker caches raw, so a settings-only change doesn't resend megabytes
async function getSegmentedNotes(
	raw: RawModelOutput,
	settings: NoteSegmentSettings
): Promise<RawNoteEvent[]> {
	if (raw.frames.length === 0) return [];
	const worker = getSegmentWorker();
	if (lastRawSent !== raw) {
		worker.postMessage({ type: 'setRaw', raw } satisfies WorkerRequest);
		lastRawSent = raw;
	}
	const id = ++segmentRequestSeq;
	return new Promise<RawNoteEvent[]>((resolve, reject) => {
		segmentPending.set(id, { resolve, reject });
		worker.postMessage({ type: 'segment', id, settings } satisfies WorkerRequest);
	});
}

function toRenderedNotes(notes: RawNoteEvent[]): RenderedNote[] {
	const totalBins = OCTAVE_COUNT * BINS_PER_OCTAVE;
	return notes
		.map((note) => ({
			bin: (note.pitchMidi - RENDER_BASE_MIDI) * CONTOUR_BINS_PER_SEMITONE + 1,
			startFrame: note.startFrame,
			durationFrames: note.durationFrames,
			amplitude: note.amplitude
		}))
		.filter((n) => n.bin >= 0 && n.bin < totalBins);
}

export async function segmentNotes(
	raw: RawModelOutput,
	settings: NoteSegmentSettings
): Promise<RenderedNote[]> {
	return toRenderedNotes(await getSegmentedNotes(raw, settings));
}

// Greedy voice separation (VISA-like): cost = pitch distance + gap, strict monophony per voice.
// shortcut: greedy matching, switch to Hungarian/Viterbi if voices swap on dense chords
export const MAX_VOICES = 4;
const VOICE_MAX_JUMP_SEMITONES = 12;
const VOICE_NEW_COST = 6; // in semitones
const VOICE_GAP_CAP_FRAMES = 90; // ~1s
const VOICE_GAP_COST_PER_FRAME = VOICE_NEW_COST / VOICE_GAP_CAP_FRAMES;
const VOICE_CLUSTER_TOLERANCE_FRAMES = 1; // onsets this close count as one chord

interface VoiceState {
	lastPitch: number;
	freeAtFrame: number;
	notes: RawNoteEvent[];
}

function clusterByOnset(notes: RawNoteEvent[]): RawNoteEvent[][] {
	const sorted = [...notes].sort((a, b) => a.startFrame - b.startFrame);
	const clusters: RawNoteEvent[][] = [];
	for (const note of sorted) {
		const cluster = clusters[clusters.length - 1];
		if (cluster && note.startFrame - cluster[0].startFrame <= VOICE_CLUSTER_TOLERANCE_FRAMES) {
			cluster.push(note);
		} else {
			clusters.push([note]);
		}
	}
	return clusters;
}

export function groupIntoVoices(notes: RawNoteEvent[], maxVoices = MAX_VOICES): RawNoteEvent[][] {
	const voices: VoiceState[] = [];
	for (const cluster of clusterByOnset(notes)) {
		type Pair = { note: RawNoteEvent; voiceIdx: number | 'new'; cost: number };
		const pairs: Pair[] = [];
		for (const note of cluster) {
			for (let i = 0; i < voices.length; i++) {
				const v = voices[i];
				if (v.freeAtFrame > note.startFrame) continue; // voice still sounding
				const pitchDiff = Math.abs(v.lastPitch - note.pitchMidi);
				if (pitchDiff > VOICE_MAX_JUMP_SEMITONES) continue;
				const gapFrames = Math.min(note.startFrame - v.freeAtFrame, VOICE_GAP_CAP_FRAMES);
				pairs.push({ note, voiceIdx: i, cost: pitchDiff + gapFrames * VOICE_GAP_COST_PER_FRAME });
			}
			if (voices.length < maxVoices) pairs.push({ note, voiceIdx: 'new', cost: VOICE_NEW_COST });
		}
		pairs.sort((a, b) => a.cost - b.cost);

		const claimedNotes = new Set<RawNoteEvent>();
		const claimedVoices = new Set<number>();
		for (const pair of pairs) {
			if (claimedNotes.has(pair.note)) continue;
			let voiceIdx: number;
			if (pair.voiceIdx === 'new') {
				if (voices.length >= maxVoices) continue;
				voiceIdx = voices.length;
				voices.push({ lastPitch: pair.note.pitchMidi, freeAtFrame: -Infinity, notes: [] });
			} else {
				if (claimedVoices.has(pair.voiceIdx)) continue;
				voiceIdx = pair.voiceIdx;
			}
			claimedNotes.add(pair.note);
			claimedVoices.add(voiceIdx);
			const v = voices[voiceIdx];
			v.notes.push(pair.note);
			v.lastPitch = pair.note.pitchMidi;
			v.freeAtFrame = pair.note.startFrame + pair.note.durationFrames;
		}
	}

	// highest mean pitch first, so colors stay stable top to bottom
	return voices
		.filter((v) => v.notes.length > 0)
		.sort((a, b) => {
			const meanPitch = (v: VoiceState) =>
				v.notes.reduce((s, n) => s + n.pitchMidi, 0) / v.notes.length;
			return meanPitch(b) - meanPitch(a);
		})
		.map((v) => v.notes);
}

export async function segmentVoices(
	raw: RawModelOutput,
	settings: NoteSegmentSettings,
	maxVoices = MAX_VOICES
): Promise<RenderedNote[][]> {
	const notes = await getSegmentedNotes(raw, settings);
	return groupIntoVoices(notes, maxVoices).map(toRenderedNotes);
}

if (import.meta.env?.DEV) {
	const testNotes: RawNoteEvent[] = [
		{ pitchMidi: 60, startFrame: 0, durationFrames: 10, amplitude: 1 },
		{ pitchMidi: 72, startFrame: 0, durationFrames: 10, amplitude: 1 },
		{ pitchMidi: 62, startFrame: 20, durationFrames: 10, amplitude: 1 },
		{ pitchMidi: 70, startFrame: 20, durationFrames: 10, amplitude: 1 }
	];
	const testVoices = groupIntoVoices(testNotes, 4);
	console.assert(testVoices.length === 2, `expected 2 voices, got ${testVoices.length}`);
	for (const voice of testVoices) {
		for (let i = 1; i < voice.length; i++) {
			const prevEnd = voice[i - 1].startFrame + voice[i - 1].durationFrames;
			console.assert(voice[i].startFrame >= prevEnd, 'groupIntoVoices produced overlapping notes');
		}
	}
}
