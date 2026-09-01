// Runs basic-pitch's outputToNotesPoly off the main thread. melodiaTrick alone measured ~7.4s
// of fully synchronous computation on a 3-minute clip (see pitchgram.ts) — inline, that freezes
// the UI with no yield point; here it just keeps this worker busy while the page stays live.
//
// Imports the toMidi submodule directly (@spotify/basic-pitch/esm/toMidi.js) rather than the
// package's top-level barrel, specifically to avoid pulling tf.js into this worker: this
// algorithm doesn't need it, and tf.js isn't guaranteed to behave well outside a window context.
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

// cached across calls so re-segmenting on a settings change doesn't re-send the whole
// (multi-MB, native-fps) frames/onsets payload — only 'setRaw' does that, once per file
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

	// Caught explicitly (rather than left to throw) because a rejection from an async
	// onmessage handler fires 'unhandledrejection' inside the worker, not the main thread's
	// worker.onerror — an uncaught failure here would otherwise leave the caller's promise
	// pending forever with no signal that anything went wrong.
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
