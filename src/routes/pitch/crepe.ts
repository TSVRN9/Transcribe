// CREPE (Kim et al. 2018) pre/post-processing around a tf.js model the caller runs.
// Model: the "tiny" Keras model from marl/crepe's web demo (MIT, 1.96MB): input [n, 1024] at 16kHz, output [n, 360].

import type { F0Frame } from './f0';

export const CREPE_SAMPLE_RATE = 16000;
export const CREPE_FRAME = 1024;
const CENTS_STEP = 7180 / 359;
const CENTS_BASE = 1997.3794084376191; // cents above 10Hz of output bin 0

/** Frames `count` windows starting at frame `start`, centred on t * hop, each zero-mean / unit-variance. */
export function crepeBatch(samples16k: Float32Array, hop: number, start: number, count: number) {
	const batch = new Float32Array(count * CREPE_FRAME);
	for (let b = 0; b < count; b++) {
		const c = (start + b) * hop - CREPE_FRAME / 2;
		let mean = 0;
		for (let i = 0; i < CREPE_FRAME; i++) mean += samples16k[c + i] ?? 0;
		mean /= CREPE_FRAME;
		let sd = 0;
		for (let i = 0; i < CREPE_FRAME; i++) sd += ((samples16k[c + i] ?? 0) - mean) ** 2;
		sd = Math.max(1e-8, Math.sqrt(sd / CREPE_FRAME));
		for (let i = 0; i < CREPE_FRAME; i++) {
			batch[b * CREPE_FRAME + i] = ((samples16k[c + i] ?? 0) - mean) / sd;
		}
	}
	return batch;
}

/** Local weighted average of the 9 bins around the peak, as crepe's to_local_average_cents. */
export function crepeDecode(activations: Float32Array, hop: number, start: number): F0Frame[] {
	const out: F0Frame[] = [];
	for (let b = 0; b * 360 < activations.length; b++) {
		const a = activations.subarray(b * 360, b * 360 + 360);
		let peak = 0;
		for (let i = 1; i < 360; i++) if (a[i] > a[peak]) peak = i;
		let ws = 0;
		let cs = 0;
		for (let i = Math.max(0, peak - 4); i < Math.min(360, peak + 5); i++) {
			ws += a[i];
			cs += a[i] * (CENTS_BASE + i * CENTS_STEP);
		}
		const hz = 10 * 2 ** (cs / ws / 1200);
		out.push({
			timeSec: ((start + b) * hop) / CREPE_SAMPLE_RATE,
			midi: 69 + 12 * Math.log2(hz / 440),
			confidence: a[peak]
		});
	}
	return out;
}

// dev-only self-check: a one-hot activation at bin 180 decodes to its bin centre
if (import.meta.env?.DEV) {
	const act = new Float32Array(360);
	act[180] = 1;
	const [f] = crepeDecode(act, 160, 0);
	const expected = 69 + 12 * Math.log2((10 * 2 ** ((CENTS_BASE + 180 * CENTS_STEP) / 1200)) / 440);
	console.assert(Math.abs(f.midi - expected) < 1e-6, `crepeDecode self-check: got ${f.midi}`);
}
