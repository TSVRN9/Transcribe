// Runs outputToNotesPoly off the main thread. Imports esm/toMidi.js directly so tf.js stays out.
/// <reference lib="webworker" />
import type { NoteSegmentSettings, RawModelOutput } from './pitchgram';

export interface RawNoteEvent {
	pitchMidi: number;
	startFrame: number;
	durationFrames: number;
	amplitude: number;
}

export type WorkerRequest =
	| { type: 'setRaw'; raw: RawModelOutput }
	| { type: 'segment'; id: number; settings: NoteSegmentSettings };
export type WorkerResponse =
	| { type: 'result'; id: number; notes: RawNoteEvent[] }
	| { type: 'error'; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let currentRaw: RawModelOutput | undefined;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
	const msg = e.data;
	if (msg.type === 'setRaw') {
		currentRaw = msg.raw;
		return;
	}

	if (!currentRaw || currentRaw.frames.length === 0) {
		ctx.postMessage({ type: 'result', id: msg.id, notes: [] } satisfies WorkerResponse);
		return;
	}

	// an async onmessage rejection never reaches worker.onerror, so report it explicitly
	try {
		const { outputToNotesPoly } = await import('@spotify/basic-pitch/esm/toMidi.js');
		const { onsetThresh, frameThresh, minNoteLen, inferOnsets, melodiaTrick } = msg.settings;
		const noteEvents = outputToNotesPoly(
			currentRaw.frames.map((r) => r.slice()), // outputToNotesPoly mutates in place when min/maxFreq are set
			currentRaw.onsets.map((r) => r.slice()),
			onsetThresh,
			frameThresh,
			minNoteLen,
			inferOnsets,
			null,
			null,
			melodiaTrick
		);
		const notes: RawNoteEvent[] = noteEvents.map((n) => ({
			pitchMidi: n.pitchMidi,
			startFrame: n.startFrame,
			durationFrames: n.durationFrames,
			amplitude: n.amplitude
		}));
		ctx.postMessage({ type: 'result', id: msg.id, notes } satisfies WorkerResponse);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		ctx.postMessage({ type: 'error', id: msg.id, message } satisfies WorkerResponse);
	}
};
