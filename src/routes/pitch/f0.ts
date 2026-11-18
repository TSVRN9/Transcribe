// Monophonic f0 trackers (YIN, pYIN). Pure math: Float32Array mono in, per-frame f0 out.

export interface F0Frame {
	timeSec: number; // frame centre
	midi: number; // fractional MIDI (cents precision); NaN when the frame is silent
	confidence: number; // 0..1, method-specific; threshold it to decide voicing
}

export interface F0Options {
	hop?: number; // samples; default ~11.6ms (basic-pitch's frame rate)
	fmin?: number;
	fmax?: number;
	frameSize?: number; // power of 2; default covers 4 periods of fmin
}

const SILENCE_RMS = 1e-4;

export function freqToMidi(f: number): number {
	return 69 + 12 * Math.log2(f / 440);
}

function fft(re: Float64Array, im: Float64Array, inverse = false) {
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

// YIN cumulative-mean-normalised difference, type-II (full frame, shrinking overlap) so the
// analysis stays centred on the frame time; a half-frame window reads ~20ms early on glides
function makeCmndf(s: Setup) {
	const size = s.n * 2;
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	const cum = new Float64Array(s.n + 1);
	const out = new Float64Array(s.tauMax + 1);
	return (x: Float64Array) => {
		re.fill(0);
		im.fill(0);
		re.set(x);
		fft(re, im);
		for (let k = 0; k < size; k++) {
			re[k] = re[k] * re[k] + im[k] * im[k];
			im[k] = 0;
		}
		fft(re, im, true);
		cum[0] = 0;
		for (let i = 0; i < s.n; i++) cum[i + 1] = cum[i] + x[i] * x[i];
		let running = 0;
		out[0] = 1;
		for (let tau = 1; tau <= s.tauMax; tau++) {
			const d = Math.max(0, cum[s.n - tau] + (cum[s.n] - cum[tau]) - 2 * re[tau]);
			running += d;
			out[tau] = running > 0 ? (d * tau) / running : 1;
		}
		return out;
	};
}

function parabolicShift(y: Float64Array, i: number): number {
	if (i <= 0 || i >= y.length - 1) return 0;
	const a = y[i + 1] + y[i - 1] - 2 * y[i];
	const b = (y[i + 1] - y[i - 1]) / 2;
	if (Math.abs(b) >= Math.abs(a)) return 0;
	return -b / a;
}

export function yin(
	samples: Float32Array,
	sampleRate: number,
	opts: F0Options & { threshold?: number } = {}
): F0Frame[] {
	const s = setup(samples, sampleRate, opts);
	const threshold = opts.threshold ?? 0.1;
	const cmndf = makeCmndf(s);
	const x = new Float64Array(s.n);
	const out: F0Frame[] = [];
	for (let t = 0; t < s.frames; t++) {
		const timeSec = (t * s.hop) / sampleRate;
		if (readFrame(samples, s, t, x) < SILENCE_RMS) {
			out.push({ timeSec, midi: NaN, confidence: 0 });
			continue;
		}
		const d = cmndf(x);
		let tau = -1;
		for (let k = s.tauMin; k <= s.tauMax; k++) {
			if (d[k] < threshold) {
				while (k + 1 <= s.tauMax && d[k + 1] < d[k]) k++;
				tau = k;
				break;
			}
		}
		if (tau < 0) {
			tau = s.tauMin;
			for (let k = s.tauMin; k <= s.tauMax; k++) if (d[k] < d[tau]) tau = k;
		}
		const period = tau + parabolicShift(d, tau);
		out.push({
			timeSec,
			midi: freqToMidi(sampleRate / period),
			confidence: Math.min(1, Math.max(0, 1 - d[tau]))
		});
	}
	return out;
}

// Mauch & Dixon 2014, parameters as librosa.pyin
const PYIN_THRESHOLDS = 100;
const PYIN_BETA_B = 18; // beta(2, 18) prior over YIN thresholds
const PYIN_BOLTZMANN = 2;
const PYIN_NO_TROUGH = 0.01;
const PYIN_BINS_PER_SEMITONE = 10;
const PYIN_MAX_OCTAVES_PER_SEC = 35.92;
const PYIN_SWITCH = 0.01;

function betaCdf2(x: number): number {
	const b = PYIN_BETA_B;
	return 1 - (1 - x) ** (b + 1) - (b + 1) * x * (1 - x) ** b;
}

export function pyin(samples: Float32Array, sampleRate: number, opts: F0Options = {}): F0Frame[] {
	const s = setup(samples, sampleRate, opts);
	const cmndf = makeCmndf(s);
	const x = new Float64Array(s.n);
	const nBins = Math.floor(PYIN_BINS_PER_SEMITONE * 12 * Math.log2(s.fmax / s.fmin)) + 1;
	const betaProbs = new Float64Array(PYIN_THRESHOLDS);
	for (let i = 0; i < PYIN_THRESHOLDS; i++) {
		betaProbs[i] = betaCdf2((i + 1) / PYIN_THRESHOLDS) - betaCdf2(i / PYIN_THRESHOLDS);
	}
	const boltz = (k: number, nT: number) =>
		((1 - Math.exp(-PYIN_BOLTZMANN)) * Math.exp(-PYIN_BOLTZMANN * k)) /
		(1 - Math.exp(-PYIN_BOLTZMANN * nT));

	// per frame: candidate (bin, exact midi, prob) lists, plus total voiced probability
	const candBins: Int32Array[] = [];
	const candMidi: Float64Array[] = [];
	const candProb: Float64Array[] = [];
	const voicedProb = new Float64Array(s.frames);
	const troughs: number[] = [];
	for (let t = 0; t < s.frames; t++) {
		troughs.length = 0;
		if (readFrame(samples, s, t, x) >= SILENCE_RMS) {
			const d = cmndf(x);
			if (d[s.tauMin] < d[s.tauMin + 1]) troughs.push(s.tauMin);
			for (let k = s.tauMin + 1; k < s.tauMax; k++) {
				if (d[k] < d[k - 1] && d[k] <= d[k + 1]) troughs.push(k);
			}
			if (troughs.length > 0) {
				const probs = new Float64Array(troughs.length);
				let globalMin = 0;
				for (let j = 1; j < troughs.length; j++) {
					if (d[troughs[j]] < d[troughs[globalMin]]) globalMin = j;
				}
				let belowMin = 0;
				for (let i = 0; i < PYIN_THRESHOLDS; i++) {
					const th = (i + 1) / PYIN_THRESHOLDS;
					let nBelow = 0;
					for (const k of troughs) if (d[k] < th) nBelow++;
					if (d[troughs[globalMin]] >= th) belowMin += betaProbs[i];
					if (nBelow === 0) continue;
					let pos = 0;
					for (let j = 0; j < troughs.length; j++) {
						if (d[troughs[j]] < th) probs[j] += boltz(pos++, nBelow) * betaProbs[i];
					}
				}
				probs[globalMin] += PYIN_NO_TROUGH * belowMin;
				const bins = new Int32Array(troughs.length);
				const midis = new Float64Array(troughs.length);
				let total = 0;
				for (let j = 0; j < troughs.length; j++) {
					const k = troughs[j];
					const f = sampleRate / (k + parabolicShift(d, k));
					midis[j] = freqToMidi(f);
					bins[j] = Math.min(
						nBins - 1,
						Math.max(0, Math.round(PYIN_BINS_PER_SEMITONE * 12 * Math.log2(f / s.fmin)))
					);
					total += probs[j];
				}
				candBins.push(bins);
				candMidi.push(midis);
				candProb.push(probs);
				voicedProb[t] = Math.min(1, total);
				continue;
			}
		}
		candBins.push(new Int32Array(0));
		candMidi.push(new Float64Array(0));
		candProb.push(new Float64Array(0));
	}

	// Viterbi over [voiced bins | unvoiced bins] with a triangular local pitch transition
	const maxSemis = Math.round((PYIN_MAX_OCTAVES_PER_SEC * 12 * s.hop) / sampleRate);
	const half = (maxSemis * PYIN_BINS_PER_SEMITONE) >> 1;
	const width = 2 * half + 1;
	const logTri = new Float64Array(half + 1);
	for (let dd = 0; dd <= half; dd++) logTri[dd] = Math.log(1 - dd / ((width + 1) / 2));
	const logRow = new Float64Array(nBins);
	for (let i = 0; i < nBins; i++) {
		let sum = 0;
		for (let j = Math.max(0, i - half); j <= Math.min(nBins - 1, i + half); j++) {
			sum += Math.exp(logTri[Math.abs(i - j)]);
		}
		logRow[i] = Math.log(sum);
	}
	const lStay = Math.log(1 - PYIN_SWITCH);
	const lSwitch = Math.log(PYIN_SWITCH);
	const TINY = 1e-300;
	const S = 2 * nBins;
	let delta = new Float64Array(S);
	let next = new Float64Array(S);
	const back = new Int16Array(s.frames * S); // source state per (frame, state)
	const obs = new Float64Array(S);
	const fillObs = (t: number) => {
		obs.fill(TINY);
		const bins = candBins[t];
		for (let j = 0; j < bins.length; j++) obs[bins[j]] = candProb[t][j] + TINY;
		const u = (1 - voicedProb[t]) / nBins + TINY;
		for (let b = nBins; b < S; b++) obs[b] = u;
		for (let b = 0; b < S; b++) obs[b] = Math.log(obs[b]);
	};
	fillObs(0);
	for (let b = 0; b < S; b++) delta[b] = b < nBins ? -Infinity : obs[b] - Math.log(nBins);
	const fromV = new Float64Array(nBins);
	const fromU = new Float64Array(nBins);
	for (let t = 1; t < s.frames; t++) {
		fillObs(t);
		for (let i = 0; i < nBins; i++) {
			fromV[i] = delta[i] - logRow[i];
			fromU[i] = delta[nBins + i] - logRow[i];
		}
		const base = t * S;
		for (let j = 0; j < nBins; j++) {
			let bestV = -Infinity;
			let argV = 0;
			let bestU = -Infinity;
			let argU = 0;
			const lo = Math.max(0, j - half);
			const hi = Math.min(nBins - 1, j + half);
			for (let i = lo; i <= hi; i++) {
				const lt = logTri[i > j ? i - j : j - i];
				const vv = fromV[i] + lStay + lt;
				const uv = fromU[i] + lSwitch + lt;
				const vu = fromV[i] + lSwitch + lt;
				const uu = fromU[i] + lStay + lt;
				if (vv > bestV) {
					bestV = vv;
					argV = i;
				}
				if (uv > bestV) {
					bestV = uv;
					argV = nBins + i;
				}
				if (uu > bestU) {
					bestU = uu;
					argU = nBins + i;
				}
				if (vu > bestU) {
					bestU = vu;
					argU = i;
				}
			}
			next[j] = bestV + obs[j];
			back[base + j] = argV;
			next[nBins + j] = bestU + obs[nBins + j];
			back[base + nBins + j] = argU;
		}
		[delta, next] = [next, delta];
	}
	let state = 0;
	for (let b = 1; b < S; b++) if (delta[b] > delta[state]) state = b;
	const path = new Int32Array(s.frames);
	for (let t = s.frames - 1; t >= 0; t--) {
		path[t] = state;
		if (t > 0) state = back[t * S + state];
	}

	const binMidi = (b: number) => freqToMidi(s.fmin) + b / PYIN_BINS_PER_SEMITONE;
	const out: F0Frame[] = [];
	for (let t = 0; t < s.frames; t++) {
		const timeSec = (t * s.hop) / sampleRate;
		const voiced = path[t] < nBins;
		const b = path[t] % nBins;
		let midi = candBins[t].length === 0 && voicedProb[t] === 0 ? NaN : binMidi(b);
		// snap the 10-cent HMM bin back to the exact interpolated candidate it came from
		let bestDist = 3;
		for (let j = 0; j < candBins[t].length; j++) {
			const dist = Math.abs(candBins[t][j] - b);
			if (dist < bestDist) {
				bestDist = dist;
				midi = candMidi[t][j];
			}
		}
		out.push({ timeSec, midi, confidence: voiced ? voicedProb[t] : 0 });
	}
	return out;
}

// dev-only self-check: a 1.2s harmonic tone at A3 + 13 cents must read back within 5 cents
if (import.meta.env?.DEV) {
	const sr = 22050;
	const f = 220 * 2 ** (13 / 1200);
	const tone = new Float32Array(sr * 1.2);
	for (let i = 0; i < tone.length; i++) {
		for (let h = 1; h <= 5; h++) tone[i] += (0.2 / h) * Math.sin((2 * Math.PI * f * h * i) / sr);
	}
	for (const [name, fn] of Object.entries({ yin, pyin })) {
		const mid = fn(tone, sr)[Math.floor(tone.length / 2 / 256)];
		console.assert(
			Math.abs(mid.midi - 57.13) < 0.05,
			`${name} self-check: expected MIDI 57.13, got ${mid.midi}`
		);
	}
}
