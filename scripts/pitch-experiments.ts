// Pitch methods that were measured and lost (docs/pitch-methods-eval.md); kept so the
// harness can reproduce those rows. Not shipped: nothing under src/ imports this.

import type { F0Frame, F0Options } from '../src/routes/pitch/f0.ts';

const SILENCE_RMS = 1e-4;

export function freqToMidi(f: number): number {
	return 69 + 12 * Math.log2(f / 440);
}

export function fft(re: Float64Array, im: Float64Array, inverse = false) {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			let t = re[i];
			re[i] = re[j];
			re[j] = t;
			t = im[i];
			im[i] = im[j];
			im[j] = t;
		}
	}
	const sign = inverse ? 1 : -1;
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (sign * 2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		const half = len >> 1;
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < half; k++) {
				const a = i + k;
				const b = a + half;
				const vr = re[b] * cr - im[b] * ci;
				const vi = re[b] * ci + im[b] * cr;
				re[b] = re[a] - vr;
				im[b] = im[a] - vi;
				re[a] += vr;
				im[a] += vi;
				const t = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = t;
			}
		}
	}
	if (inverse)
		for (let i = 0; i < n; i++) {
			re[i] /= n;
			im[i] /= n;
		}
}

interface Setup {
	sr: number;
	hop: number;
	n: number;
	tauMin: number;
	tauMax: number;
	frames: number;
	fmin: number;
	fmax: number;
}

function setup(samples: Float32Array, sr: number, o: F0Options): Setup {
	const fmin = o.fmin ?? 50;
	const fmax = o.fmax ?? 2000;
	const hop = o.hop ?? Math.round((sr * 256) / 22050);
	const n = o.frameSize ?? 2 ** Math.ceil(Math.log2((4 * sr) / fmin));
	const tauMin = Math.max(2, Math.floor(sr / fmax));
	const tauMax = Math.min(n / 2 - 1, Math.ceil(sr / fmin));
	return { sr, hop, n, tauMin, tauMax, frames: Math.floor(samples.length / hop) + 1, fmin, fmax };
}

// centre-aligned frame t, zero-padded past either end
function readFrame(samples: Float32Array, s: Setup, t: number, out: Float64Array) {
	const start = t * s.hop - s.n / 2;
	let energy = 0;
	for (let i = 0; i < s.n; i++) {
		const k = start + i;
		const v = k >= 0 && k < samples.length ? samples[k] : 0;
		out[i] = v;
		energy += v * v;
	}
	return Math.sqrt(energy / s.n);
}

function parabolicShift(y: Float64Array, i: number): number {
	if (i <= 0 || i >= y.length - 1) return 0;
	const a = y[i + 1] + y[i - 1] - 2 * y[i];
	const b = (y[i + 1] - y[i - 1]) / 2;
	if (Math.abs(b) >= Math.abs(a)) return 0;
	return -b / a;
}

// McLeod & Wyvill 2005 normalised square difference, first key maximum above k * best
export function mpm(
	samples: Float32Array,
	sampleRate: number,
	opts: F0Options & { cutoff?: number } = {}
): F0Frame[] {
	const s = setup(samples, sampleRate, opts);
	const cutoff = opts.cutoff ?? 0.9;
	const size = s.n * 2;
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	const nsdf = new Float64Array(s.tauMax + 2);
	const x = new Float64Array(s.n);
	const peaks: number[] = [];
	const out: F0Frame[] = [];
	for (let t = 0; t < s.frames; t++) {
		const timeSec = (t * s.hop) / sampleRate;
		if (readFrame(samples, s, t, x) < SILENCE_RMS) {
			out.push({ timeSec, midi: NaN, confidence: 0 });
			continue;
		}
		re.fill(0);
		im.fill(0);
		re.set(x);
		fft(re, im);
		for (let k = 0; k < size; k++) {
			re[k] = re[k] * re[k] + im[k] * im[k];
			im[k] = 0;
		}
		fft(re, im, true);
		let m = 0;
		for (let i = 0; i < s.n; i++) m += 2 * x[i] * x[i];
		for (let tau = 0; tau <= s.tauMax + 1; tau++) {
			if (tau > 0) m -= x[tau - 1] * x[tau - 1] + x[s.n - tau] * x[s.n - tau];
			nsdf[tau] = m > 0 ? (2 * re[tau]) / m : 0;
		}
		peaks.length = 0;
		let tau = 1;
		while (tau <= s.tauMax && nsdf[tau] > 0) tau++; // skip the zero-lag lobe
		while (tau <= s.tauMax) {
			while (tau <= s.tauMax && nsdf[tau] <= 0) tau++;
			let best = -1;
			while (tau <= s.tauMax && nsdf[tau] > 0) {
				if (tau >= s.tauMin && (best < 0 || nsdf[tau] > nsdf[best])) best = tau;
				tau++;
			}
			if (best > 0) peaks.push(best);
		}
		if (peaks.length === 0) {
			out.push({ timeSec, midi: NaN, confidence: 0 });
			continue;
		}
		let nmax = 0;
		for (const p of peaks) nmax = Math.max(nmax, nsdf[p]);
		const pick = peaks.find((p) => nsdf[p] >= cutoff * nmax)!;
		const period = pick + parabolicShift(nsdf, pick);
		out.push({
			timeSec,
			midi: freqToMidi(sampleRate / period),
			confidence: Math.min(1, Math.max(0, nsdf[pick]))
		});
	}
	return out;
}

// harmonic product spectrum; baseline only (octave-prone by construction)
export function hps(
	samples: Float32Array,
	sampleRate: number,
	opts: F0Options & { harmonics?: number } = {}
): F0Frame[] {
	const s = setup(samples, sampleRate, opts);
	const H = opts.harmonics ?? 5;
	const size = s.n * 2; // zero-pad 2x for bin resolution
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	const logMag = new Float64Array(size / 2);
	const prod = new Float64Array(size / 2);
	const x = new Float64Array(s.n);
	const win = new Float64Array(s.n);
	for (let i = 0; i < s.n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / s.n);
	const kLo = Math.max(1, Math.floor((s.fmin * size) / sampleRate));
	const kHi = Math.min(Math.floor(size / 2 / H) - 1, Math.ceil((s.fmax * size) / sampleRate));
	const out: F0Frame[] = [];
	for (let t = 0; t < s.frames; t++) {
		const timeSec = (t * s.hop) / sampleRate;
		if (readFrame(samples, s, t, x) < SILENCE_RMS || kHi <= kLo) {
			out.push({ timeSec, midi: NaN, confidence: 0 });
			continue;
		}
		re.fill(0);
		im.fill(0);
		for (let i = 0; i < s.n; i++) re[i] = x[i] * win[i];
		fft(re, im);
		let total = 0;
		for (let k = 0; k < size / 2; k++) {
			const p = re[k] * re[k] + im[k] * im[k];
			total += p;
			logMag[k] = Math.log(p + 1e-20) / 2;
		}
		let best = kLo;
		for (let k = kLo; k <= kHi; k++) {
			let v = 0;
			for (let h = 1; h <= H; h++) v += logMag[k * h];
			prod[k] = v;
			if (v > prod[best]) best = k;
		}
		const shift =
			best > kLo && best < kHi
				? parabolicShift(logMag, best) // refine on the fundamental's own peak
				: 0;
		let harm = 0;
		for (let h = 1; h <= H; h++) {
			const k = best * h;
			for (let dk = -1; dk <= 1; dk++) harm += Math.exp(2 * logMag[k + dk]);
		}
		out.push({
			timeSec,
			midi: freqToMidi(((best + shift) * sampleRate) / size),
			confidence: Math.min(1, harm / (total + 1e-20))
		});
	}
	return out;
}

export interface LineOptions {
	lo?: number; // first bin searched (inclusive)
	hi?: number; // last bin searched (exclusive)
	threshold?: number; // probability at which "note" and "silence" are equally likely
	jumpCost?: number; // log-penalty per bin of pitch change between frames
	switchCost?: number; // log-penalty for entering or leaving silence
}

/**
 * Viterbi path with an L1 pitch-jump penalty and an explicit silence state, so a line
 * holds through brief dips and does not flicker between octaves. Returns a bin per frame, -1 = silent.
 */
export function viterbiLine(grid: ArrayLike<number>[], opts: LineOptions = {}): Int32Array {
	const T = grid.length;
	const path = new Int32Array(T).fill(-1);
	if (T === 0) return path;
	const lo = opts.lo ?? 0;
	const hi = opts.hi ?? grid[0].length;
	const B = hi - lo;
	const logThr = Math.log(opts.threshold ?? 0.3);
	const jump = opts.jumpCost ?? 0.5;
	const sw = opts.switchCost ?? 2;
	const EPS = 1e-6;
	let score = new Float64Array(B + 1); // last slot = silence
	let next = new Float64Array(B + 1);
	const fwd = new Float64Array(B);
	const fwdArg = new Int32Array(B);
	const back = new Int32Array(T * (B + 1));
	for (let b = 0; b < B; b++) score[b] = Math.log(grid[0][lo + b] + EPS);
	score[B] = logThr;
	for (let t = 1; t < T; t++) {
		const row = grid[t];
		// best predecessor under an L1 penalty in O(B): left-to-right then right-to-left sweep
		for (let b = 0; b < B; b++) {
			fwd[b] = score[b];
			fwdArg[b] = b;
			if (b > 0 && fwd[b - 1] - jump > fwd[b]) {
				fwd[b] = fwd[b - 1] - jump;
				fwdArg[b] = fwdArg[b - 1];
			}
		}
		for (let b = B - 2; b >= 0; b--) {
			if (fwd[b + 1] - jump > fwd[b]) {
				fwd[b] = fwd[b + 1] - jump;
				fwdArg[b] = fwdArg[b + 1];
			}
		}
		let bestVoiced = 0;
		for (let b = 1; b < B; b++) if (score[b] > score[bestVoiced]) bestVoiced = b;
		const base = t * (B + 1);
		for (let b = 0; b < B; b++) {
			const fromSilence = score[B] - sw;
			const emit = Math.log(row[lo + b] + EPS);
			if (fromSilence > fwd[b]) {
				next[b] = fromSilence + emit;
				back[base + b] = B;
			} else {
				next[b] = fwd[b] + emit;
				back[base + b] = fwdArg[b];
			}
		}
		const fromVoiced = score[bestVoiced] - sw;
		if (fromVoiced > score[B]) {
			next[B] = fromVoiced + logThr;
			back[base + B] = bestVoiced;
		} else {
			next[B] = score[B] + logThr;
			back[base + B] = B;
		}
		[score, next] = [next, score];
	}
	let s = 0;
	for (let b = 1; b <= B; b++) if (score[b] > score[s]) s = b;
	for (let t = T - 1; t >= 0; t--) {
		path[t] = s === B ? -1 : lo + s;
		s = back[t * (B + 1) + s];
	}
	return path;
}

export interface MultiF0Frame {
	timeSec: number;
	midis: number[]; // fractional MIDI of each detected f0, in detection order (most salient first)
}

export interface KlapuriOptions {
	hop?: number;
	fmin?: number;
	fmax?: number;
	maxPolyphony?: number;
}

const NU = 0.33; // whitening compression
const ALPHA = 27; // Hz, harmonic weighting for ~93ms frames
const BETA = 320;
const D_CANCEL = 0.89;
const GAMMA = 0.7; // polyphony-estimation exponent
const CENTS_STEP = 20;
const SILENCE_DB = -40; // relative to the loudest frame
const EXCLUDE = Math.round(100 / CENTS_STEP);

export function klapuriMultiF0(
	samples: Float32Array,
	sampleRate: number,
	opts: KlapuriOptions = {}
): MultiF0Frame[] {
	const hop = opts.hop ?? Math.round((sampleRate * 256) / 22050);
	const fmin = opts.fmin ?? 50;
	const fmax = opts.fmax ?? 2000;
	const maxPoly = opts.maxPolyphony ?? 6;
	const N = 2 ** Math.round(Math.log2(sampleRate * 0.093)); // ~93ms frame
	const K = 2 * N; // zero-padded FFT
	const half = K / 2;
	const binHz = sampleRate / K;
	const win = new Float64Array(N);
	for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

	// whitening bands (centre frequencies on a critical-band-like scale) -> per-bin gain lookup
	const centres: number[] = [];
	for (let b = 0; ; b++) {
		const c = 229 * (10 ** ((b + 1) / 21.4) - 1);
		if (c >= sampleRate / 2) break;
		centres.push(c);
	}

	const cands: number[] = [];
	for (let f = fmin; f <= fmax; f *= 2 ** (CENTS_STEP / 1200)) cands.push(f);
	const maxHarm = (f: number) => Math.max(1, Math.min(20, Math.floor((0.9 * sampleRate) / 2 / f)));
	const spread = 2 ** (CENTS_STEP / 2 / 1200);
	// [lo, hi] bin range searched for harmonic m of candidate c
	const ranges = cands.map((f) =>
		Array.from({ length: maxHarm(f) }, (_, i) => {
			const m = i + 1;
			const lo = Math.floor((m * f) / spread / binHz);
			const hi = Math.max(lo + 1, Math.ceil((m * f * spread) / binHz));
			return [Math.max(1, lo), Math.min(half - 1, hi)];
		})
	);
	const weights = cands.map((f) =>
		Array.from({ length: maxHarm(f) }, (_, i) => (f + ALPHA) / ((i + 1) * f + BETA))
	);

	const frames = Math.floor(samples.length / hop) + 1;
	const re = new Float64Array(K);
	const im = new Float64Array(K);
	const Y = new Float64Array(half);
	const YR = new Float64Array(half);
	const YD = new Float64Array(half);
	const gain = new Float64Array(half);
	const taken = new Uint8Array(cands.length);
	const rms = new Float64Array(frames);
	for (let t = 0; t < frames; t++) {
		let e = 0;
		for (let i = 0; i < N; i++) {
			const k = t * hop - N / 2 + i;
			const v = k >= 0 && k < samples.length ? samples[k] : 0;
			e += v * v;
		}
		rms[t] = Math.sqrt(e / N);
	}
	let peak = 0;
	for (const r of rms) peak = Math.max(peak, r);
	const gate = peak * 10 ** (SILENCE_DB / 20);

	const salience = (spec: Float64Array, c: number) => {
		let s = 0;
		const r = ranges[c];
		const w = weights[c];
		for (let m = 0; m < r.length; m++) {
			let mx = 0;
			for (let k = r[m][0]; k <= r[m][1]; k++) if (spec[k] > mx) mx = spec[k];
			s += w[m] * mx;
		}
		return s;
	};

	const out: MultiF0Frame[] = [];
	for (let t = 0; t < frames; t++) {
		const timeSec = (t * hop) / sampleRate;
		if (rms[t] < gate || rms[t] === 0) {
			out.push({ timeSec, midis: [] });
			continue;
		}
		re.fill(0);
		im.fill(0);
		for (let i = 0; i < N; i++) {
			const k = t * hop - N / 2 + i;
			re[i] = k >= 0 && k < samples.length ? samples[k] * win[i] : 0;
		}
		fft(re, im);
		for (let k = 0; k < half; k++) Y[k] = Math.hypot(re[k], im[k]);

		// whitening: band std-dev under triangular responses, compressed, interpolated per bin
		const g = centres.map((c, b) => {
			const lo = b > 0 ? centres[b - 1] : 0;
			const hi = b + 1 < centres.length ? centres[b + 1] : sampleRate / 2;
			let acc = 0;
			let wsum = 0;
			for (let k = Math.ceil(lo / binHz); k < Math.min(half, hi / binHz); k++) {
				const f = k * binHz;
				const h = f <= c ? (f - lo) / (c - lo) : (hi - f) / (hi - c);
				acc += h * Y[k] * Y[k];
				wsum += h;
			}
			const sigma = Math.sqrt(acc / Math.max(wsum, 1e-9));
			return Math.max(sigma, 1e-12) ** (NU - 1);
		});
		for (let k = 0, b = 0; k < half; k++) {
			const f = k * binHz;
			while (b + 1 < centres.length && centres[b + 1] < f) b++;
			if (f <= centres[0]) gain[k] = g[0];
			else if (b + 1 >= centres.length) gain[k] = g[centres.length - 1];
			else {
				const u = (f - centres[b]) / (centres[b + 1] - centres[b]);
				gain[k] = g[b] * (1 - u) + g[b + 1] * u;
			}
			Y[k] *= gain[k];
			YR[k] = Y[k];
		}
		YD.fill(0);

		const midis: number[] = [];
		taken.fill(0);
		let sumS = 0;
		let prevScore = -Infinity;
		for (let j = 1; j <= maxPoly; j++) {
			let best = 0;
			let bestS = -1;
			for (let c = 0; c < cands.length; c++) {
				if (taken[c]) continue;
				const s = salience(YR, c);
				if (s > bestS) {
					bestS = s;
					best = c;
				}
			}
			sumS += bestS;
			const score = sumS / j ** GAMMA;
			if (score <= prevScore) break;
			prevScore = score;
			// refine the f0 from the strongest partial positions, then cancel those partials
			const r = ranges[best];
			let num = 0;
			let den = 0;
			for (let m = 0; m < r.length; m++) {
				let km = r[m][0];
				for (let k = r[m][0]; k <= r[m][1]; k++) if (YR[k] > YR[km]) km = k;
				const a = YR[km];
				num += (a * (km * binHz)) / (m + 1);
				den += a;
				for (let k = Math.max(1, km - 1); k <= Math.min(half - 1, km + 1); k++) {
					YD[k] += (weights[best][m] / weights[best][0]) * YR[k] * (k === km ? 1 : 0.5);
				}
			}
			for (let k = 0; k < half; k++) YR[k] = Math.max(0, Y[k] - D_CANCEL * YD[k]);
			// a semitone either side of a detected f0 cannot be detected again in this frame
			for (
				let c = Math.max(0, best - EXCLUDE);
				c <= Math.min(cands.length - 1, best + EXCLUDE);
				c++
			) {
				taken[c] = 1;
			}
			const f = den > 0 ? num / den : cands[best];
			midis.push(69 + 12 * Math.log2(f / 440));
		}
		out.push({ timeSec, midis });
	}
	return out;
}
