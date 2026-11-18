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
export type PitchAnalyzer = 'neural' | 'fft';
export type PitchEvent = {
	pitch: PitchEventDetail;
};
export type PitchEventDetail =
	| { status: 'idle' | 'error' }
	| { status: 'computing'; partial?: { result: PitchgramResult; lines: PitchLines } }
	| {
			status: 'done';
			result: PitchgramResult;
			lines: PitchLines;
			raw: RawModelOutput;
	  };
