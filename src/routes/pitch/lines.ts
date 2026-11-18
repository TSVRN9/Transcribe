// Melody / bass lines from basic-pitch outputs: per frame the highest (melody), lowest (bass) or
// most likely note above a threshold, median-filtered, then refined to cents with the contours.

// basic-pitch contour bin 3s+1 is semitone s's centre (measured against exact f0 on Bach10-mf0-synth:
// argmax sits one bin above k = 3s), so bin 0 is a third of a semitone below A0
export const CONTOUR_BIN0_MIDI = 21 - 1 / 3;
const NOTE_BIN0_MIDI = 21;
const MEDIAN_FRAMES = 5;

export interface LinePoint {
	midi: number; // fractional when refined with contours
	score: number; // the picked note's raw frame probability
}

export interface NoteLineOptions {
	threshold?: number;
	loMidi?: number; // inclusive
	hiMidi?: number; // exclusive
}

/**
 * noteFrames: basic-pitch `frames` ([frame][88], MIDI 21..108). contours: basic-pitch `contours`
 * ([frame][264]) for cents precision, or null for semitone output. pick: 'top' = melody (skyline),
 * 'bottom' = bass, 'max' = most likely note (monophonic material).
 */
export function noteLine(
	noteFrames: ArrayLike<number>[],
	contours: ArrayLike<number>[] | null,
	pick: 'top' | 'bottom' | 'max',
	{ threshold = 0.3, loMidi = 36, hiMidi = 96 }: NoteLineOptions = {}
): (LinePoint | null)[] {
	const raw = noteFrames.map((row): LinePoint | null => {
		let best: LinePoint | null = null;
		for (let i = 0; i < hiMidi - loMidi; i++) {
			const midi = pick === 'top' ? hiMidi - 1 - i : loMidi + i;
			const p = row[midi - NOTE_BIN0_MIDI];
			if (p < threshold) continue;
			if (pick !== 'max') return { midi, score: p };
			if (!best || p > best.score) best = { midi, score: p };
		}
		return best;
	});
	const h = MEDIAN_FRAMES >> 1;
	const near: number[] = [];
	return raw.map((point, t) => {
		near.length = 0;
		for (let j = Math.max(0, t - h); j <= Math.min(raw.length - 1, t + h); j++) {
			const p = raw[j];
			if (p) near.push(p.midi);
		}
		if (near.length === 0) return null;
		near.sort((a, b) => a - b);
		const midi = near[near.length >> 1];
		return {
			midi: contours ? refineMidi(contours[t], midi) : midi,
			score: point?.score ?? 0
		};
	});
}

/** Probability-weighted mean of the contour bins around a semitone pick. Returns fractional MIDI. */
export function refineMidi(contourRow: ArrayLike<number>, midi: number): number {
	const centre = Math.round((midi - CONTOUR_BIN0_MIDI) * 3);
	let best = centre;
	for (let k = centre - 1; k <= centre + 1; k++) {
		if (k >= 0 && k < contourRow.length && contourRow[k] > contourRow[best]) best = k;
	}
	let wsum = 0;
	let msum = 0;
	for (let k = best - 2; k <= best + 2; k++) {
		if (k < 0 || k >= contourRow.length) continue;
		wsum += contourRow[k];
		msum += contourRow[k] * (CONTOUR_BIN0_MIDI + k / 3);
	}
	return wsum > 0 ? msum / wsum : midi;
}

// dev-only self-check: a C4+G4+C5 chord gives melody C5 and bass C4; a contour peak 1/3 semitone
// sharp of C4 refines to ~60.33
if (import.meta.env?.DEV) {
	const frames = Array.from({ length: 7 }, () => {
		const row = new Float32Array(88);
		for (const m of [60, 67, 72]) row[m - 21] = 0.8;
		return row;
	});
	const top = noteLine(frames, null, 'top')[3];
	const bottom = noteLine(frames, null, 'bottom')[3];
	console.assert(
		top?.midi === 72 && bottom?.midi === 60,
		`noteLine self-check: ${top?.midi}/${bottom?.midi}`
	);
	const contour = new Float32Array(264);
	contour[Math.round((60 - CONTOUR_BIN0_MIDI) * 3) + 1] = 1;
	const refined = refineMidi(contour, 60);
	console.assert(Math.abs(refined - 60.333) < 0.01, `refineMidi self-check: ${refined}`);
}
