// Global tempo + beat grid from an onset-strength curve (Ellis 2007), and key from note
// probabilities (Krumhansl-Kessler). Inputs are basic-pitch outputs at its native ~86fps.

const MIN_BPM = 40;
const MAX_BPM = 240;
const PRIOR_BPM = 120;
const PRIOR_OCTAVES = 1; // log-Gaussian tempo prior width
const TIGHTNESS = 100; // how strongly beat spacing is held to the tempo
const TEMPO_HARMONICS = 4; // also score 2x..4x the lag, which favours the true beat over 2:3 neighbours
const KEY_NOTE_THRESHOLD = 0.3; // below this, frame probabilities are mostly harmonic bleed

export interface BeatResult {
	bpm: number;
	beatFrames: number[]; // fractional frame indices into the onset curve
}

/** onsetStrength: per-frame max over pitches of basic-pitch's onsets output. */
export function estimateBeats(onsetStrength: ArrayLike<number>, fps: number): BeatResult {
	const n = onsetStrength.length;
	// detrend with a ~1s moving mean, half-wave rectify, unit-normalise
	const env = new Float64Array(n);
	const w = Math.round(fps / 2);
	let acc = 0;
	for (let i = 0; i < n + w; i++) {
		if (i < n) acc += onsetStrength[i];
		if (i - 2 * w - 1 >= 0) acc -= onsetStrength[i - 2 * w - 1];
		const c = i - w;
		if (c >= 0 && c < n) {
			const count = Math.min(n - 1, c + w) - Math.max(0, c - w) + 1;
			env[c] = Math.max(0, onsetStrength[c] - acc / count);
		}
	}
	let sd = 0;
	for (const v of env) sd += v * v;
	sd = Math.sqrt(sd / Math.max(1, n)) || 1;
	for (let i = 0; i < n; i++) env[i] /= sd;

	const lagMin = Math.max(1, Math.floor((60 * fps) / MAX_BPM));
	const lagMax = Math.min(n - 1, Math.ceil((60 * fps) / MIN_BPM));
	const ac = (lag: number) => {
		let s = 0;
		for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
		return s / (n - lag);
	};
	const score = new Float64Array(lagMax + 2);
	for (let lag = lagMin; lag <= lagMax; lag++) {
		let s = 0;
		for (let k = 1; k <= TEMPO_HARMONICS && lag * k < n; k++) s += ac(lag * k) / k;
		const oct = Math.log2((60 * fps) / lag / PRIOR_BPM) / PRIOR_OCTAVES;
		score[lag] = s * Math.exp(-0.5 * oct * oct);
	}
	let best = lagMin;
	for (let lag = lagMin; lag <= lagMax; lag++) if (score[lag] > score[best]) best = lag;
	let period = best;
	if (best > lagMin && best < lagMax) {
		const a = score[best - 1] - 2 * score[best] + score[best + 1];
		if (a < 0) period = best - (score[best + 1] - score[best - 1]) / (2 * a);
	}
	if (n < 2 * period) return { bpm: (60 * fps) / period, beatFrames: [] };

	// dynamic-programming beat placement: onset strength vs log-deviation from the period
	const cum = new Float64Array(n);
	const prev = new Int32Array(n).fill(-1);
	for (let i = 0; i < n; i++) {
		let bestScore = 0;
		const lo = Math.max(0, Math.round(i - 2 * period));
		const hi = Math.round(i - period / 2);
		for (let j = lo; j <= hi; j++) {
			const dev = Math.log((i - j) / period);
			const s = cum[j] - TIGHTNESS * dev * dev;
			if (prev[i] < 0 || s > bestScore) {
				bestScore = s;
				prev[i] = j;
			}
		}
		cum[i] = env[i] + (prev[i] >= 0 ? bestScore : 0);
	}
	let end = n - 1;
	for (let i = Math.max(0, Math.round(n - period)); i < n; i++) if (cum[i] > cum[end]) end = i;
	const beats: number[] = [];
	for (let i = end; i >= 0; i = prev[i]) beats.push(i);
	beats.reverse();
	return { bpm: (60 * fps) / period, beatFrames: beats };
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
	const ma = a.reduce((s, v) => s + v, 0) / a.length;
	const mb = b.reduce((s, v) => s + v, 0) / b.length;
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < a.length; i++) {
		num += (a[i] - ma) * (b[i] - mb);
		da += (a[i] - ma) ** 2;
		db += (b[i] - mb) ** 2;
	}
	return num / Math.sqrt(da * db || 1);
}

/** Key name like "Eb major" / "F# minor" ('' when nothing is pitched) from basic-pitch's frames output ([frame][88], MIDI 21..108). */
export function estimateKey(noteFrames: ArrayLike<number>[]): string {
	const chroma = new Array(12).fill(0);
	for (const row of noteFrames) {
		for (let k = 0; k < row.length; k++) {
			if (row[k] >= KEY_NOTE_THRESHOLD) chroma[(21 + k) % 12] += row[k];
		}
	}
	if (!chroma.some((v) => v > 0)) return ''; // silence or drums: every correlation ties, so no key
	let best = '';
	let bestR = -Infinity;
	for (let tonic = 0; tonic < 12; tonic++) {
		const rotated = chroma.map((_, i) => chroma[(i + tonic) % 12]);
		for (const [mode, profile] of [
			['major', MAJOR],
			['minor', MINOR]
		] as const) {
			const r = pearson(rotated, profile);
			if (r > bestR) {
				bestR = r;
				best = `${NAMES[tonic]} ${mode}`;
			}
		}
	}
	return best;
}

// dev-only self-check: a click every 0.5s at 86fps reads as ~120 BPM; a C major scale reads as C major
if (import.meta.env?.DEV) {
	const fps = 86;
	const clicks = new Float32Array(fps * 10);
	for (let t = 0; t < 10; t += 0.5) clicks[Math.round(t * fps)] = 1;
	const { bpm } = estimateBeats(clicks, fps);
	console.assert(Math.abs(bpm - 120) < 2, `estimateBeats self-check: expected ~120, got ${bpm}`);
	const scale = [0, 2, 4, 5, 7, 9, 11, 12, 7, 4, 0].map((s) => {
		const row = new Float32Array(88);
		row[60 + s - 21] = 1;
		return row;
	});
	const key = estimateKey(scale);
	console.assert(key === 'C major', `estimateKey self-check: expected C major, got ${key}`);
	console.assert(estimateKey([new Float32Array(88)]) === '', 'estimateKey self-check: silence');
}
