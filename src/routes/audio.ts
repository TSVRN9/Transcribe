import type { PitchgramResult, PitchLines, RawModelOutput } from './pitchgram';

export type SeekFunction = (time: number) => void;
export type AudioReady = {
	ready: AudioReadyDetail;
};
export type AudioReadyDetail = {
	isReady: boolean;
	audioLength: number;
	seek: SeekFunction;
};
export type AudioCurrentTime = {
	currentTime: AudioCurrentTimeDetail;
};
type AudioCurrentTimeDetail = {
	currentTime: number;
};
export const placeholderSeek: SeekFunction = () => {
	return;
};

export type PitchStatus = 'idle' | 'computing' | 'error' | 'done';
// neural: Spotify's basic-pitch transcription model (default) — also unlocks Notes mode and
// polyphonic note segmentation, since only it produces onset/frame data to segment.
// fft: the hand-rolled per-octave FFT + harmonic-salience heatmap (no neural network,
// no Notes mode — just raw spectral energy).
export type PitchAnalyzer = 'neural' | 'fft';
export type PitchEvent = {
	pitch: PitchEventDetail;
};
export type PitchEventDetail =
	| { status: 'idle' | 'error' }
	// `partial` carries whatever's been analyzed so far (basic-pitch streams results in
	// ~1.6s windows) so the view can render a real pitchgram instead of only a spinner
	// while status stays 'computing' — see computeBasicPitch's onProgress in pitchgram.ts.
	| { status: 'computing'; partial?: { result: PitchgramResult; lines: PitchLines } }
	| {
			status: 'done';
			result: PitchgramResult;
			lines: PitchLines;
			raw: RawModelOutput;
	  };
