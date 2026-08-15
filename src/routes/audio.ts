import type { PitchgramResult, PitchLines } from './pitchgram';

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
export type AudioCurrentTimeDetail = {
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
	| { status: 'idle' | 'computing' | 'error' }
	| {
			status: 'done';
			result: PitchgramResult;
			lines: PitchLines;
			raw: { frames: number[][]; onsets: number[][] };
	  };
