// Pure pitchgram math — no Svelte, no DOM, so it can be unit-checked standalone.
//
// Unlike a folded 12-row chromagram, this keeps octave separate (rows span C2..B6)
// and resolves finer than a semitone, so detuned or buried inner voices are visible
// as off-grid or dim-but-present energy rather than snapping to the nearest note.
//
// Frequency resolution needs to scale with how low the pitch is (a semitone at C2 is
// ~4Hz wide, at C6 it's ~65Hz wide), so each octave gets its own FFT window: the
// bottom octave's window is 16x longer than the top octave's. This trades time
// resolution for frequency resolution at low pitches, same as a real CQT — expected,
// not a bug.

import type { RawNoteEvent, WorkerRequest, WorkerResponse } from './segment.worker';

export const OCTAVE_START = 2; // lowest analyzed octave is C2
export const OCTAVE_COUNT = 5; // through B6
// 36 = 3 bins/semitone, matching basic-pitch's native contour resolution exactly (see
// computeBasicPitch below) so its output slices straight into this grid with no
// interpolation. The legacy computePitchgram/extractLines FFT path below still works at
// this resolution too, just coarser than its original 10-cents-per-bin.
export const BINS_PER_OCTAVE = 36;
export const TOP_WINDOW = 2048; // FFT size for the highest octave block

// ponytail: fixed column budget regardless of file length. Bottom-octave FFTs (32k
// samples) dominate cost at ~O(frames), so this is sized for ~4s of compute on a
// typical clip, not resolution-per-second. Raise it (and accept slower analysis)
// if the piano roll still looks coarse at max zoom on real files.
const TARGET_FRAMES = 2400;
const DB_FLOOR = -60; // dB below the clip's global peak; below this reads as background

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

// In-place iterative radix-2 Cooley-Tukey FFT. real.length must be a power of 2.
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

// Window length per octave block, indexed 0 (lowest, C2) .. OCTAVE_COUNT-1 (highest, C6).
// Doubles going down an octave so relative frequency resolution stays roughly constant.
function windowSizeForOctave(octaveIndex: number): number {
	return TOP_WINDOW * Math.pow(2, OCTAVE_COUNT - 1 - octaveIndex);
}

export interface PitchgramResult {
	frames: Float32Array[]; // frames[time][bin], bin 0 = C2, values normalized 0..1
	totalBins: number;
}

// setTimeout, not requestAnimationFrame: rAF stalls in a backgrounded/unfocused tab,
// which would hang this computation indefinitely if the user switches away mid-analysis.
function yieldToUI(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Computes a pitchgram: for each of a fixed number of time columns, one magnitude
 * per (octave, sub-semitone) bin from C2 to B6. Magnitude is log-scaled and clamped
 * to DB_FLOOR below the clip's single loudest bin (a fixed global reference, not
 * per-frame — so quiet passages don't get rescaled to look as loud as loud ones).
 *
 * Frame count is fixed regardless of file length, but yields periodically so the
 * tab stays responsive during the low-second-range compute this takes.
 */
export async function computePitchgram(
	samples: Float32Array,
	sampleRate: number
): Promise<PitchgramResult> {
	const totalSamples = samples.length;
	const totalBins = OCTAVE_COUNT * BINS_PER_OCTAVE;
	const frameCount = Math.max(1, Math.min(TARGET_FRAMES, totalSamples));

	// shared time axis across all octave blocks, so columns stay proportional to time
	const centers = new Float32Array(frameCount);
	for (let f = 0; f < frameCount; f++) {
		centers[f] = ((f + 0.5) * totalSamples) / frameCount;
	}

	// target bin frequencies and per-octave-block windows, precomputed once
	const octaveWindows = Array.from({ length: OCTAVE_COUNT }, (_, o) => {
		const size = windowSizeForOctave(o);
		const loMidi = 12 * (OCTAVE_START + o) + 12; // MIDI: C0 = 12
		const hiMidi = loMidi + 12;
		// Low octaves have huge windows (32768 samples = 1.5s at 22050Hz) that already
		// time-smear far past a single column's hop — computing every column is almost
		// entirely redundant work. Stride the frame loop and replicate each computed
		// result across the skipped columns; halves per octave going up, since window
		// size does the same going down.
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
				// nearest target bin in this octave, by log-frequency distance
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

// Melody/inner-voice/bass overlays: per band, the most *salient* bin per frame (a gap
// when nothing in the band clears the noise floor), smoothed with a median filter to
// kill single-frame jumps. Bands overlap on purpose — a melody note dipping into the
// "inner" range is still real melody, not a bug to fix with harmonic suppression.
//
// Salience, not raw magnitude: a real instrument's fundamental has energy at 2f, 3f,
// 4f... too (its harmonic series), and those harmonics routinely outshine the
// fundamental itself. Raw-magnitude argmax locks onto whichever harmonic is loudest —
// often not even in the right band — which is why naive per-bin peak-picking reads as
// "random" on real (non-sine) audio. Harmonic-summation salience (Klapuri-style: sum a
// bin's own magnitude with its harmonics' magnitudes, decayed) scores true fundamentals
// higher than lone harmonics, because only the fundamental's bin collects its whole
// harmonic stack.
// score is the model's own raw confidence for this point (0..1, never smoothed/filled) —
// the UI uses it to hide points the model isn't actually confident about.
export interface LinePoint {
	bin: number;
	score: number;
}
export interface PitchLines {
	melody: (LinePoint | null)[];
	inner: (LinePoint | null)[];
	bass: (LinePoint | null)[];
}

export const BAND_OCTAVES: Record<keyof PitchLines, [lo: number, hi: number]> = {
	bass: [0, 2],
	inner: [1, 3],
	melody: [2, OCTAVE_COUNT]
};

export const LINE_THRESHOLD = 0.15; // normalized salience below this reads as silence, not a note
const MEDIAN_WINDOW = 5; // frames

const HARMONIC_COUNT = 5; // fundamental + 4 overtones
const HARMONIC_DECAY = 0.8; // weight falloff per harmonic — favors the fundamental without ignoring overtone support
// bin offset of harmonic h above a fundamental bin, in this log-frequency bin space
// (BINS_PER_OCTAVE bins = one octave = a 2x frequency ratio, so offset = log2(h) octaves)
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

// Median-filters only the bin (kills single-frame octave/semitone jumps, same as before).
// Score is carried through raw and un-smoothed — a neighbor-median would fabricate
// confidence for a frame the model detected nothing in, which is exactly what the
// confidence gauge is supposed to prevent from being drawn.
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

// Default pitch processor: Spotify's basic-pitch, a small onset/frame/contour neural
// transcription model (runs client-side via tf.js), swapped in ahead of the hand-rolled
// FFT/salience path above. Its "contours" output (264 bins: 88 piano semitones x 3
// bins/semitone, from MIDI 21/A0) is already a pitch-salience grid at fixed 3-bins/semitone
// resolution — same shape of thing computePitchgram produces by hand — so BINS_PER_OCTAVE
// above is set to match it exactly (36 = 3 x 12) and rendering is a slice, not a resample.
// Its "frames" output (88 bins, one per semitone, no sub-bin) is note-presence probability,
// used directly for line-picking instead of the harmonic-summation salience heuristic.
const CONTOUR_BINS_PER_SEMITONE = 3;
const CONTOUR_BASE_MIDI = 21; // basic-pitch's contour/frame grid starts at MIDI 21 (A0)
const RENDER_BASE_MIDI = 12 * OCTAVE_START + 12; // MIDI of bin 0 in our render grid (C2)

// basic-pitch analyzes audio in overlapping ~2s windows and concatenates each window's
// trimmed output frames back-to-back (see evaluateModel above). FFT_HOP/AUDIO_SAMPLE_RATE
// don't divide evenly into the window length, so each window's frame count is slightly off
// from its real duration — a per-window offset that basic-pitch's own (unexported)
// modelFrameToTime corrects for when converting note events to seconds. We duplicate that
// same formula here so the heatmap and note rectangles agree with real audio time too, not
// just with each other. Values match @spotify/basic-pitch's internal toMidi.ts exactly.
const NATIVE_SAMPLE_RATE = 22050;
const NATIVE_FFT_HOP = 256;
const NATIVE_FPS = Math.floor(NATIVE_SAMPLE_RATE / NATIVE_FFT_HOP); // 86
const NATIVE_WINDOW_SECONDS = 2;
const NATIVE_FRAMES_PER_WINDOW = NATIVE_FPS * NATIVE_WINDOW_SECONDS; // 172
const NATIVE_SAMPLES_PER_WINDOW = NATIVE_SAMPLE_RATE * NATIVE_WINDOW_SECONDS - NATIVE_FFT_HOP;
const NATIVE_WINDOW_OFFSET =
	(NATIVE_FFT_HOP / NATIVE_SAMPLE_RATE) *
		(NATIVE_FRAMES_PER_WINDOW - NATIVE_SAMPLES_PER_WINDOW / NATIVE_FFT_HOP) +
	0.0018; // magic number carried over from basic-pitch's own toMidi.ts — needed to align properly

export function nativeFrameToTime(frame: number): number {
	return (
		(frame * NATIVE_FFT_HOP) / NATIVE_SAMPLE_RATE -
		NATIVE_WINDOW_OFFSET * Math.floor(frame / NATIVE_FRAMES_PER_WINDOW)
	);
}

// dev-only self-check: frame 0 must map to time 0, and the drift at ~3 minutes in should
// match the ~1.2s figure this whole correction exists to fix (verified against basic-pitch's
// own toMidi.ts formula) — if this ever fails, the constants above have drifted from upstream.
if (import.meta.env?.DEV) {
	console.assert(nativeFrameToTime(0) === 0, 'nativeFrameToTime(0) should be exactly 0');
	const threeMinuteFrame = NATIVE_FPS * 180;
	const drift = 180 - nativeFrameToTime(threeMinuteFrame);
	console.assert(
		drift > 1.0 && drift < 1.4,
		`nativeFrameToTime drift at 3min should be ~1.2s, got ${drift}`
	);
}

export interface BasicPitchResult {
	result: PitchgramResult;
	lines: PitchLines;
	raw: { frames: number[][]; onsets: number[][] };
}

// module-level singleton: model weights (~900KB) are fetched once per session, not per file
let basicPitchPromise: Promise<import('@spotify/basic-pitch').BasicPitch> | undefined;
function getBasicPitch(modelUrl: string) {
	if (!basicPitchPromise) {
		basicPitchPromise = import('@spotify/basic-pitch').then(
			({ BasicPitch }) => new BasicPitch(modelUrl)
		);
	}
	return basicPitchPromise;
}

// basic-pitch's evaluateModel calls onComplete once per ~1.6s analysis window, not once at
// the end (percentCallback is what fires once at completion) — so results are accumulated
// across calls, not overwritten.
//
// Consecutive raw frames are NOT evenly spaced in real time: each analysis window's frames
// land back-to-back with a small time debt baked in (see nativeFrameToTime below), so naively
// bucketing by raw index — as if frame i were always at i/frameCount of the clip — drifts the
// pooled output later and later relative to real audio time (~1.2s by the end of a 3-minute
// clip). That reads as "the playhead is behind the music": everything downstream (heatmap
// columns, note rectangles) is drawn where the model's own frame count says it is, not where
// it actually happened. Bucketing by nativeFrameToTime instead fixes both at the source.
function maxPoolRows(rows: number[][], targetCount: number, durationSeconds: number): number[][] {
	if (rows.length === 0) return rows;
	const width = rows[0].length;
	const count = Math.min(targetCount, rows.length);
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
		// a bucket past the model's last real frame (the ~1.2s tail the drift correction
		// exposes) genuinely has no data — leave it at 0 rather than smearing the last real
		// column across it, since that would fabricate content that was never detected.
		out[c] = any ? pooled : new Array(width).fill(0);
	}
	return out;
}

function extractLinesFromNoteFrames(noteFrames: number[][]): PitchLines {
	const result = {} as PitchLines;
	for (const key of Object.keys(BAND_OCTAVES) as (keyof PitchLines)[]) {
		const [loOct, hiOct] = BAND_OCTAVES[key];
		const loIdx = 12 * (OCTAVE_START + loOct) + 12 - CONTOUR_BASE_MIDI;
		const hiIdx = Math.min(88, 12 * (OCTAVE_START + hiOct) + 12 - CONTOUR_BASE_MIDI);
		const raw = noteFrames.map((row): LinePoint | null => {
			let bestIdx: number | null = null;
			let bestScore = LINE_THRESHOLD;
			for (let i = loIdx; i < hiIdx; i++) {
				if (row[i] > bestScore) {
					bestScore = row[i];
					bestIdx = i;
				}
			}
			if (bestIdx === null) return null;
			const midi = bestIdx + CONTOUR_BASE_MIDI;
			return {
				bin: (midi - RENDER_BASE_MIDI) * CONTOUR_BINS_PER_SEMITONE + 1, // center of the semitone's 3 bins
				score: bestScore // basic-pitch's own note-presence probability — the confidence gauge's input
			};
		});
		result[key] = medianFilterPoints(raw);
	}
	return result;
}

/**
 * Runs basic-pitch inference on 22050Hz mono audio and reshapes its output into the same
 * PitchgramResult/PitchLines shapes the view already renders — no UI changes needed.
 */
export async function computeBasicPitch(
	samples: Float32Array,
	modelUrl: string
): Promise<BasicPitchResult> {
	const model = await getBasicPitch(modelUrl);

	const frameRows: number[][] = [];
	const contourRows: number[][] = [];
	const onsetRows: number[][] = [];
	await model.evaluateModel(
		samples,
		(frames, onsets, contours) => {
			frameRows.push(...frames);
			contourRows.push(...contours);
			onsetRows.push(...onsets);
		},
		() => {}
	);
	if (frameRows.length === 0)
		return {
			result: { frames: [], totalBins: 0 },
			lines: extractLinesFromNoteFrames([]),
			raw: { frames: [], onsets: [] }
		};

	const durationSeconds = samples.length / NATIVE_SAMPLE_RATE;
	const pooledFrames = maxPoolRows(frameRows, TARGET_FRAMES, durationSeconds);
	const pooledContours = maxPoolRows(contourRows, TARGET_FRAMES, durationSeconds);

	const totalBins = OCTAVE_COUNT * BINS_PER_OCTAVE;
	const contourLo = (RENDER_BASE_MIDI - CONTOUR_BASE_MIDI) * CONTOUR_BINS_PER_SEMITONE;
	const slices = pooledContours.map((row) => row.slice(contourLo, contourLo + totalBins));

	// contour values are sigmoid probabilities that rarely approach 1 even for confident
	// pitches, so rescale against the clip's own peak (not a fixed 0..1 range) — same
	// "loudest bin becomes full brightness" idea the old dB normalization used above.
	let globalMax = 1e-6;
	for (const row of slices) for (const v of row) if (v > globalMax) globalMax = v;
	const frames = slices.map((row) => Float32Array.from(row, (v) => v / globalMax));

	return {
		result: { frames, totalBins },
		lines: extractLinesFromNoteFrames(pooledFrames),
		// native-fps (unpooled), kept so Notes mode can re-segment on a settings change
		// (see segmentNotes below) without re-running the model
		raw: { frames: frameRows, onsets: onsetRows }
	};
}

export interface NoteSegmentSettings {
	onsetThresh: number; // minimum onset activation to start a note
	frameThresh: number; // minimum frame activation for a note to stay "on"
	minNoteLen: number; // minimum note length, in native-fps (~86fps) frames
	inferOnsets: boolean; // also start notes from large frame-amplitude jumps, not just the onset head
	// residual-energy cleanup pass that recovers notes with no clean onset. Measured ~7.4s on a
	// 3-minute clip vs ~250ms without it (see segmentNotes below), for about 19% more notes —
	// runs in the segmentation worker, not the main thread, so it no longer freezes the UI, but
	// still defaults off since it's a real multi-second wait for a marginal note-count gain.
	melodiaTrick: boolean;
}
export const DEFAULT_NOTE_SETTINGS: NoteSegmentSettings = {
	onsetThresh: 0.5,
	frameThresh: 0.3,
	minNoteLen: 5,
	inferOnsets: true,
	melodiaTrick: false
};

export interface RenderedNote {
	bin: number; // same render-space as PitchLines' bin (center of the note's semitone)
	// native-fps (unpooled) frame index — the same axis raw.frames/raw.onsets are indexed on.
	// Convert with nativeFrameToTime (not a plain proportion of raw.frames.length) when
	// positioning against the heatmap, whose columns are now also real-time-bucketed —
	// see nativeFrameToTime above and maxPoolRows' comment for why.
	startFrame: number;
	durationFrames: number;
	amplitude: number; // mean frame activation during the note, 0..1 — a confidence proxy
}

// module-level singleton: one worker per session, reused across files and settings changes.
// Lazily created (never at module scope) so it's never touched during the SSR/prerender pass.
let segmentWorker: Worker | undefined;
let segmentRequestSeq = 0;
const segmentPending = new Map<number, (notes: RawNoteEvent[]) => void>();
let lastRawSent: { frames: number[][]; onsets: number[][] } | undefined;

function getSegmentWorker(): Worker {
	if (!segmentWorker) {
		segmentWorker = new Worker(new URL('./segment.worker.ts', import.meta.url), {
			type: 'module'
		});
		segmentWorker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const resolve = segmentPending.get(e.data.id);
			if (resolve) {
				segmentPending.delete(e.data.id);
				resolve(e.data.notes);
			}
		};
	}
	return segmentWorker;
}

/**
 * basic-pitch's own note-segmentation algorithm (onset peak-picking + energy-tolerance run
 * continuation via outputToNotesPoly) instead of the ad hoc per-frame argmax the melody/inner/
 * bass lines above use. Runs in a dedicated worker (segment.worker.ts) — melodiaTrick alone
 * measured ~7.4s of fully synchronous computation on a 3-minute clip, which would freeze the UI
 * with no yield point if run inline; without it, ~250ms, cheap enough to re-run on every
 * settings change. The worker caches raw.frames/raw.onsets itself, so only a genuinely new
 * `raw` object triggers the (multi-MB) transfer — a settings-only change just sends the settings.
 */
async function getSegmentedNotes(
	raw: { frames: number[][]; onsets: number[][] },
	settings: NoteSegmentSettings
): Promise<RawNoteEvent[]> {
	if (raw.frames.length === 0) return [];
	const worker = getSegmentWorker();
	if (lastRawSent !== raw) {
		worker.postMessage({ type: 'setRaw', raw } satisfies WorkerRequest);
		lastRawSent = raw;
	}
	const id = ++segmentRequestSeq;
	return new Promise<RawNoteEvent[]>((resolve) => {
		segmentPending.set(id, resolve);
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
	raw: { frames: number[][]; onsets: number[][] },
	settings: NoteSegmentSettings
): Promise<RenderedNote[]> {
	return toRenderedNotes(await getSegmentedNotes(raw, settings));
}

// Voice streaming: groups basic-pitch's already-polyphonic note events into up to MAX_VOICES
// monophonic streams, so "inner voices" become actual tracked lines through time instead of
// extractLinesFromNoteFrames' per-frame per-band argmax (which can't represent more than one
// voice at once and flips whenever two real voices cross or straddle a fixed octave band).
//
// This is "VISA-lite": a greedy, single-pass approximation of the voice-separation algorithms
// in the MIR literature (Cambouropoulos' VISA, Chew & Wu's contig mapping, Temperley's
// contrapuntal model) — all of which score candidate note→voice assignments by pitch proximity
// plus temporal continuity and enforce strict monophony per voice, differing mainly in whether
// they solve that scoring via full bipartite matching / global DP or (as here) greedily. Full
// Hungarian matching or a Viterbi search would do better on ambiguous cases, but is real
// implementation weight for cluster sizes (≤6 concurrent notes) where a sorted greedy match is
// already close to optimal.
export const MAX_VOICES = 4;
const VOICE_MAX_JUMP_SEMITONES = 12; // a continuation costlier than this always loses to opening a new voice
const VOICE_NEW_COST = 6; // cost (in pitch-distance units) of opening a fresh voice instead of continuing one
const VOICE_GAP_CAP_FRAMES = 90; // ~1s at native fps — silence longer than this costs no more
const VOICE_GAP_COST_PER_FRAME = VOICE_NEW_COST / VOICE_GAP_CAP_FRAMES;
const VOICE_CLUSTER_TOLERANCE_FRAMES = 1; // onsets this close together are treated as one simultaneous chord

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
				if (v.freeAtFrame > note.startFrame) continue; // hard monophony: voice still sounding
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
				if (voices.length >= maxVoices) continue; // filled up earlier in this same cluster
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

	// stable top-to-bottom order for coloring: highest mean pitch first, like a melody-down-to-bass legend
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
	raw: { frames: number[][]; onsets: number[][] },
	settings: NoteSegmentSettings,
	maxVoices = MAX_VOICES
): Promise<RenderedNote[][]> {
	const notes = await getSegmentedNotes(raw, settings);
	return groupIntoVoices(notes, maxVoices).map(toRenderedNotes);
}

// dev-only self-check: two simultaneous pairs of notes a fifth apart, one pair a fifth higher
// than the other, should separate into exactly 2 voices (not merge simultaneous notes into
// one), and no voice should ever contain two notes that overlap in time (hard monophony).
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
