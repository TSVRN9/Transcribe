<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { fade, fly } from 'svelte/transition';
	import type { LinePoint, PitchLines, RawModelOutput, RenderedNote } from './pitchgram';
	import {
		OCTAVE_START,
		OCTAVE_COUNT,
		BINS_PER_OCTAVE,
		LINE_THRESHOLD,
		DEFAULT_NOTE_SETTINGS,
		segmentNotes,
		segmentVoices,
		nativeFrameToTime
	} from './pitchgram';
	import type { PitchStatus, PitchAnalyzer } from './audio';
	import { placeholderSeek, type SeekFunction } from './audio';
	import type { Behavior } from './behavior';
	import { secondsToTime, gridBtn, primaryBtn, iconSize } from './utils';
	import Icon from './Icon.svelte';
	import PianoReference from './PianoReference.svelte';

	export let status: PitchStatus = 'idle';
	export let frames: Float32Array[] | undefined = undefined;
	export let lines: PitchLines | undefined = undefined;
	export let raw: RawModelOutput | undefined = undefined;
	export let analyzer: PitchAnalyzer = 'neural';
	export let currentTime = 0;
	export let flag = 0;
	export let duration = 0;
	export let seek: SeekFunction = placeholderSeek;

	// mobile widget: playback state/behaviors owned by the parent, this view just calls them
	// through the same `behavior` map +page.svelte builds — one prop instead of one per
	// behavior, so a new Behavior doesn't also mean a new prop here and in every call site below
	export let paused = true;
	export let playbackRate = 1;
	export let behavior: Record<Behavior, VoidFunction>;
	export let resetSpeed: VoidFunction;
	export let onClose: VoidFunction;

	// mobile "screens": pitchgram takes the whole viewport on a phone (see the fixed-inset
	// wrapper in +page.svelte), so speed/flag controls and the piano — all reachable from the
	// sidebar on desktop — have nowhere to live. Instead of cramming them permanently into the
	// pitchgram's own vertical budget, they live in a sheet that slides up on demand and slides
	// back down out of the way, keeping the canvas full-height the rest of the time.
	let mobileSheet: 'none' | 'controls' | 'piano' = 'none';
	function toggleSheet(which: 'controls' | 'piano') {
		mobileSheet = mobileSheet === which ? 'none' : which;
	}

	const TOTAL_BINS = OCTAVE_COUNT * BINS_PER_OCTAVE;
	const SEMITONE_BINS = BINS_PER_OCTAVE / 12;
	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

	// note gutter: only "C" labels at low vertical zoom (matches the old octave-only
	// view), every semitone name once there's enough pixel height per row to read them
	$: pxPerSemitone = scaleY * SEMITONE_BINS;
	$: noteLabels = (() => {
		const showAll = pxPerSemitone >= 18;
		const out: { name: string; top: number }[] = [];
		for (let s = 0; s < OCTAVE_COUNT * 12; s++) {
			const name = NOTE_NAMES[s % 12];
			if (!showAll && name !== 'C') continue;
			const row = TOTAL_BINS - 1 - s * SEMITONE_BINS; // bin 0 = C(OCTAVE_START), rows count from the top
			const octave = OCTAVE_START + Math.floor(s / 12);
			out.push({
				name: name === 'C' ? `${name}${octave}` : name,
				top: ((row + 0.5) / TOTAL_BINS) * 100
			});
		}
		return out;
	})();

	// horizontal grid lines via CSS gradients (semitone + brighter octave lines) — stay
	// correct at any vertical zoom since they're percentage-based, not pixel-based
	const octavePct = 100 / OCTAVE_COUNT;
	const semitonePct = 100 / (OCTAVE_COUNT * 12);
	const gridStyle =
		`background-image:` +
		`repeating-linear-gradient(to top, rgba(255,255,255,0.16) 0, rgba(255,255,255,0.16) 1px, transparent 1px, transparent ${octavePct}%),` +
		`repeating-linear-gradient(to top, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent ${semitonePct}%);`;

	// dark -> blue -> cyan -> yellow-white: keeps quiet/buried bins distinguishable
	// instead of crushing them into near-black the way a single-hue lightness ramp would
	const COLOR_STOPS: [number, number, number, number][] = [
		[0, 8, 10, 20],
		[0.35, 30, 60, 140],
		[0.65, 0, 180, 200],
		[1, 255, 240, 150]
	];
	function pitchColor(t: number): [number, number, number] {
		for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
			const [p0, r0, g0, b0] = COLOR_STOPS[i];
			const [p1, r1, g1, b1] = COLOR_STOPS[i + 1];
			if (t <= p1) {
				const f = (t - p0) / (p1 - p0);
				return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
			}
		}
		const [, r, g, b] = COLOR_STOPS[COLOR_STOPS.length - 1];
		return [r, g, b];
	}

	let canvasEl: HTMLCanvasElement;
	$: if (canvasEl && frames) draw(frames);

	function draw(frames: Float32Array[]) {
		canvasEl.width = frames.length;
		canvasEl.height = TOTAL_BINS;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		const image = ctx.createImageData(frames.length, TOTAL_BINS);
		for (let x = 0; x < frames.length; x++) {
			for (let row = 0; row < TOTAL_BINS; row++) {
				// bin 0 = lowest octave (C{OCTAVE_START}), so higher pitch reads higher on screen
				const bin = TOTAL_BINS - 1 - row;
				const [r, g, b] = pitchColor(frames[x][bin]);
				const i = (row * frames.length + x) * 4;
				image.data[i] = r;
				image.data[i + 1] = g;
				image.data[i + 2] = b;
				image.data[i + 3] = 255;
			}
		}
		ctx.putImageData(image, 0, 0);
	}

	// draws a gap wherever the model's own confidence for a point falls below the
	// gauge threshold, instead of connecting through a note it wasn't sure about
	// shared by the Notes and Voices SVG rects — real-time positioning via nativeFrameToTime,
	// not a plain proportion of raw frame count (see nativeFrameToTime's comment in pitchgram.ts)
	function noteX(startFrame: number, duration: number, frameCount: number): number {
		return (nativeFrameToTime(startFrame) / duration) * frameCount;
	}
	function noteWidth(
		startFrame: number,
		durationFrames: number,
		duration: number,
		frameCount: number
	): number {
		const span = nativeFrameToTime(startFrame + durationFrames) - nativeFrameToTime(startFrame);
		return Math.max(0.5, (span / duration) * frameCount);
	}

	function linePath(values: (LinePoint | null)[] | undefined, minConfidence: number): string {
		if (!values) return '';
		let d = '';
		let drawing = false;
		for (let i = 0; i < values.length; i++) {
			const point = values[i];
			if (!point || point.score < minConfidence) {
				drawing = false;
				continue;
			}
			const x = i + 0.5;
			const y = TOTAL_BINS - (point.bin + 0.5);
			d += (drawing ? 'L' : 'M') + x + ' ' + y + ' ';
			drawing = true;
		}
		return d;
	}

	// viewMode is the single on/off switch for lines/notes (off by default, per request) —
	// the per-band checkboxes and confidence gauge only matter once it's 'combined', and the
	// advanced note-segmentation settings only matter once it's 'notes'
	type ViewMode = 'heatmap' | 'combined' | 'notes' | 'voices';
	let viewMode: ViewMode = 'heatmap';
	// Notes/Voices need basic-pitch's onset/frame data to segment — the FFT analyzer has none,
	// so fall back out of them if the analyzer switches while one is selected.
	$: notesAvailable = !!raw?.frames.length;
	$: if ((viewMode === 'notes' || viewMode === 'voices') && !notesAvailable) viewMode = 'heatmap';

	const VIEW_MODE_INFO: Record<ViewMode, string> = {
		heatmap:
			"Everything that's happening, pitch-wise — the brighter a spot, the more that pitch is present. Nothing's picked out yet, so it can look busy.",
		combined:
			"Adds three lines on top of the heatmap, each tracking whatever's strongest right now in the melody, inner-voice, and bass ranges — a quick way to follow the main line without reading the whole heatmap.",
		notes:
			'Turns the heatmap into distinct note blocks, the way the model would actually transcribe it, instead of a continuous smear of pitch.',
		voices:
			'Groups those notes into up to four separate melodic lines, so you can follow one voice at a time instead of untangling them yourself.'
	};
	const ANALYZER_INFO: Record<PitchAnalyzer, string> = {
		neural:
			'A neural model trained specifically to recognize real note pitches — the more accurate choice for actual instruments and voices.',
		fft: "A straightforward frequency analysis with no learned model behind it — faster, but it reads raw spectral energy rather than real notes, so there's no Notes or Voices view for this one."
	};

	let showMelody = true;
	let showInner = true;
	let showBass = true;
	// LINE_THRESHOLD is already the floor nothing below ever reaches `lines` (see
	// pitchgram.ts), so the gauge only usefully ranges above it
	let confidenceThreshold = 0.4;

	$: showLines = viewMode === 'combined';
	$: bassPath = showLines && showBass ? linePath(lines?.bass, confidenceThreshold) : '';
	$: innerPath = showLines && showInner ? linePath(lines?.inner, confidenceThreshold) : '';
	$: melodyPath = showLines && showMelody ? linePath(lines?.melody, confidenceThreshold) : '';

	// Notes mode: basic-pitch's own onset/energy-tolerance note segmentation, offloaded to
	// segment.worker.ts so melodiaTrick's ~7.4s synchronous pass (see pitchgram.ts) doesn't
	// freeze the UI. The sliders still apply on release (on:change, not bind:value) rather
	// than live — the worker only keeps one job at a time, so a fast drag would otherwise
	// queue up a pile of stale ~250ms segmentation passes behind whatever's running.
	let onsetThresh = DEFAULT_NOTE_SETTINGS.onsetThresh;
	let frameThresh = DEFAULT_NOTE_SETTINGS.frameThresh;
	let minNoteLen = DEFAULT_NOTE_SETTINGS.minNoteLen;
	let inferOnsets = DEFAULT_NOTE_SETTINGS.inferOnsets;
	let melodiaTrick = DEFAULT_NOTE_SETTINGS.melodiaTrick;

	let notes: RenderedNote[] = [];
	let notesComputing = false;
	let notesError = false;
	let notesRequestId = 0;
	$: if (viewMode === 'notes' && raw) {
		const requestId = ++notesRequestId;
		notesComputing = true;
		notesError = false;
		segmentNotes(raw, { onsetThresh, frameThresh, minNoteLen, inferOnsets, melodiaTrick })
			.then((result) => {
				if (requestId === notesRequestId) {
					notes = result;
					notesComputing = false;
				}
			})
			.catch(() => {
				if (requestId === notesRequestId) {
					notesComputing = false;
					notesError = true;
				}
			});
	} else {
		notes = [];
		notesComputing = false;
		notesError = false;
	}

	// Voices mode: same segmentation, then grouped into monophonic streams (see groupIntoVoices
	// in pitchgram.ts) — shares the advanced settings above since it's built on the same notes.
	const VOICE_COLORS = ['#fb923c', '#a78bfa', '#22d3ee', '#f472b6'];
	let voiceStreams: RenderedNote[][] = [];
	let voicesComputing = false;
	let voicesError = false;
	let voicesRequestId = 0;
	$: if (viewMode === 'voices' && raw) {
		const requestId = ++voicesRequestId;
		voicesComputing = true;
		voicesError = false;
		segmentVoices(raw, { onsetThresh, frameThresh, minNoteLen, inferOnsets, melodiaTrick })
			.then((result) => {
				if (requestId === voicesRequestId) {
					voiceStreams = result;
					voicesComputing = false;
				}
			})
			.catch(() => {
				if (requestId === voicesRequestId) {
					voicesComputing = false;
					voicesError = true;
				}
			});
	} else {
		voiceStreams = [];
		voicesComputing = false;
		voicesError = false;
	}

	// horizontal (time) zoom: px per frame column, auto-fit to the container once on load.
	// minScale is a *floor*, not a fixed constant: the scale at which the canvas exactly
	// fills the container width. Zooming out can never go below it, so the pitchgram can
	// never shrink to less than the viewport — same reasoning as minScaleY below.
	const FALLBACK_MIN_SCALE = 0.3; // used only before containerWidth is measured
	const MAX_SCALE = 20;
	let scale = 2;
	let fitted = false;
	let containerWidth = 0;
	$: minScale = frames && containerWidth ? containerWidth / frames.length : FALLBACK_MIN_SCALE;
	$: if (frames && containerWidth) {
		if (!fitted) {
			scale = minScale;
			fitted = true;
		} else if (scale < minScale) {
			scale = minScale; // container grew (e.g. rotation) past the old floor
		}
	}
	$: if (!frames) fitted = false;

	// vertical (pitch) zoom: px per bin row. Auto-fit once per file to the range that's
	// actually occupied (plus a little headroom), not the full 5-octave C2..B6 grid — most
	// clips only use 2-3 octaves of it, so fitting the whole grid leaves everything a sliver
	// with no room for semitone labels. Mirrors the x-fit pattern below, but also has to set
	// scrollTop once, since "fit" here means "scroll to the right rows", not just "size them".
	const FALLBACK_MIN_SCALE_Y = 0.4; // used only before containerHeight is measured
	const MAX_SCALE_Y = 20;
	const OCCUPIED_THRESHOLD = 0.2; // normalized salience — same order as LINE_THRESHOLD
	const OCCUPIED_PAD_SEMITONES = 3;
	let scaleY = 3;
	let fittedY = false;
	let containerHeight = 0;
	// same floor reasoning as minScale: never let vertical zoom shrink the grid below the
	// container's own height
	$: minScaleY = containerHeight ? containerHeight / TOTAL_BINS : FALLBACK_MIN_SCALE_Y;

	function fitVerticalZoom(frames: Float32Array[]) {
		let minBin = TOTAL_BINS;
		let maxBin = -1;
		for (const frame of frames) {
			for (let b = 0; b < TOTAL_BINS; b++) {
				if (frame[b] > OCCUPIED_THRESHOLD) {
					if (b < minBin) minBin = b;
					if (b > maxBin) maxBin = b;
				}
			}
		}
		if (maxBin < 0) return; // nothing cleared the threshold — keep the default scale/scroll
		const pad = OCCUPIED_PAD_SEMITONES * SEMITONE_BINS;
		minBin = Math.max(0, minBin - pad);
		maxBin = Math.min(TOTAL_BINS - 1, maxBin + pad);
		scaleY = Math.max(minScaleY, Math.min(MAX_SCALE_Y, containerHeight / (maxBin - minBin + 1)));
		const topRow = TOTAL_BINS - 1 - maxBin;
		requestAnimationFrame(() => {
			if (scrollEl) scrollEl.scrollTop = topRow * scaleY;
		});
	}
	// Gated on status !== 'computing' (unlike the x-fit above, which is safe to latch
	// immediately since it only depends on frames.length — always the fixed pooled column
	// count, partial or final): fitVerticalZoom scans actual bin *content* for what's
	// occupied, and a partial result (see computeBasicPitch's onProgress in pitchgram.ts) is
	// only ever a prefix of the real clip. Fitting to that early would auto-zoom to whatever
	// pitch range the first few seconds happened to use and then never re-fit once the rest
	// of a longer clip's range comes in.
	$: if (frames && containerHeight && status !== 'computing') {
		if (!fittedY) {
			fitVerticalZoom(frames);
			fittedY = true;
		} else if (scaleY < minScaleY) {
			scaleY = minScaleY;
		}
	}
	$: if (!frames) fittedY = false;

	// zooming keeps whatever content was under (clientX, clientY) fixed on screen — defaults to
	// the viewport center for the toolbar +/- buttons, which have no cursor position of their own
	function zoomBy(factor: number, clientX?: number) {
		const oldScale = scale;
		const newScale = Math.max(minScale, Math.min(MAX_SCALE, scale * factor));
		if (newScale === oldScale || !scrollEl) {
			scale = newScale;
			return;
		}
		const rect = scrollEl.getBoundingClientRect();
		const offsetX = (clientX ?? rect.left + rect.width / 2) - rect.left;
		const contentX = scrollEl.scrollLeft + offsetX;
		scale = newScale;
		tick().then(() => {
			if (!scrollEl) return;
			scrollEl.scrollLeft = (contentX * newScale) / oldScale - offsetX;
		});
	}
	function zoomYBy(factor: number, clientY?: number) {
		const oldScaleY = scaleY;
		const newScaleY = Math.max(minScaleY, Math.min(MAX_SCALE_Y, scaleY * factor));
		if (newScaleY === oldScaleY || !scrollEl) {
			scaleY = newScaleY;
			return;
		}
		const rect = scrollEl.getBoundingClientRect();
		const offsetY = (clientY ?? rect.top + rect.height / 2) - rect.top;
		const contentY = scrollEl.scrollTop + offsetY;
		scaleY = newScaleY;
		tick().then(() => {
			if (!scrollEl) return;
			scrollEl.scrollTop = (contentY * newScaleY) / oldScaleY - offsetY;
		});
	}

	let scrollEl: HTMLDivElement;

	// plain wheel pans pitch/time together — a mouse wheel only ever reports deltaY, so
	// this reduces to vertical-only there, but a trackpad's two-finger swipe reports both
	// axes and pans diagonally as expected. ctrl zooms time (also how browsers report a
	// trackpad pinch gesture). shift or alt force horizontal panning for wheel-only mice —
	// vertical zoom lives on the note gutter's own wheel handler below, mirroring how a DAW
	// zooms its piano-roll ruler independently of the timeline.
	function onWheel(e: WheelEvent) {
		if (e.ctrlKey) {
			e.preventDefault();
			zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX);
			return;
		}
		e.preventDefault();
		if (e.shiftKey || e.altKey) {
			scrollEl.scrollLeft += e.deltaX || e.deltaY;
			return;
		}
		scrollEl.scrollTop += e.deltaY;
		scrollEl.scrollLeft += e.deltaX;
	}

	function onGutterWheel(e: WheelEvent) {
		zoomYBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientY);
	}

	$: canvasWidthPx = frames ? frames.length * scale : 0;
	$: canvasHeightPx = TOTAL_BINS * scaleY;
	$: pxPerSecond = duration ? canvasWidthPx / duration : 0;

	const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
	function niceInterval(rawSeconds: number): number {
		return TICK_STEPS.find((s) => s >= rawSeconds) ?? TICK_STEPS[TICK_STEPS.length - 1];
	}
	$: ticks = (() => {
		if (!duration || !pxPerSecond) return [];
		const interval = niceInterval(80 / pxPerSecond);
		const out: { t: number; x: number }[] = [];
		for (let t = 0; t <= duration; t += interval) {
			out.push({ t, x: (t / duration) * canvasWidthPx });
		}
		return out;
	})();

	// click-drag pans (grab-and-drag, content sticks to the cursor); a plain click with no
	// movement still seeks, same as before — distinguished by movement past a small threshold
	// so a slightly-shaky click doesn't get misread as a pan. A second touch upgrades the
	// gesture to a pinch: finger-distance change zooms both axes, the moving midpoint keeps
	// whatever content was between the fingers fixed on screen — same anchor math as the
	// mouse-wheel zoom, recomputed from the pinch's start state each move so it can't drift.
	let dragging = false;
	let dragMoved = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartScrollLeft = 0;
	let dragStartScrollTop = 0;
	const DRAG_THRESHOLD = 4; // px

	let pointers = new SvelteMap<number, { x: number; y: number }>();
	let pinching = false;
	let pinchStartDist = 1;
	let pinchStartScale = 1;
	let pinchStartScaleY = 1;
	let pinchStartContentX = 0;
	let pinchStartContentY = 0;

	function onPointerDown(e: PointerEvent) {
		canvasEl.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2) {
			dragging = false;
			pinching = true;
			followEnabled = false;
			const [a, b] = [...pointers.values()];
			pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
			pinchStartScale = scale;
			pinchStartScaleY = scaleY;
			const rect = scrollEl.getBoundingClientRect();
			pinchStartContentX = scrollEl.scrollLeft + ((a.x + b.x) / 2 - rect.left);
			pinchStartContentY = scrollEl.scrollTop + ((a.y + b.y) / 2 - rect.top);
			return;
		}
		dragging = true;
		dragMoved = false;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartScrollLeft = scrollEl.scrollLeft;
		dragStartScrollTop = scrollEl.scrollTop;
	}

	function onPointerMove(e: PointerEvent) {
		if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pinching && pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
			const factor = dist / pinchStartDist;
			scale = Math.max(minScale, Math.min(MAX_SCALE, pinchStartScale * factor));
			scaleY = Math.max(minScaleY, Math.min(MAX_SCALE_Y, pinchStartScaleY * factor));
			const midX = (a.x + b.x) / 2;
			const midY = (a.y + b.y) / 2;
			tick().then(() => {
				if (!scrollEl) return;
				const rect = scrollEl.getBoundingClientRect();
				scrollEl.scrollLeft = (pinchStartContentX * scale) / pinchStartScale - (midX - rect.left);
				scrollEl.scrollTop = (pinchStartContentY * scaleY) / pinchStartScaleY - (midY - rect.top);
			});
			return;
		}
		if (!dragging) return;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		if (!dragMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragMoved = true;
		if (dragMoved) {
			followEnabled = false;
			scrollEl.scrollLeft = dragStartScrollLeft - dx;
			scrollEl.scrollTop = dragStartScrollTop - dy;
		}
	}

	function onPointerUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinching = false;
		if (dragging && !dragMoved) seekFromEvent(e);
		dragging = false;
	}

	function onPointerCancel(e: PointerEvent) {
		pointers.delete(e.pointerId);
		pinching = pointers.size >= 2;
		dragging = false;
	}

	// ruler scrub: click-drag along the time ruler seeks continuously, mirroring how
	// DAW/editor rulers (Ableton, Premiere) let you drag the playhead directly
	let scrubbing = false;
	function onRulerPointerDown(e: PointerEvent) {
		scrubbing = true;
		followEnabled = false;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		seekFromEvent(e);
	}
	function onRulerPointerMove(e: PointerEvent) {
		if (scrubbing) seekFromEvent(e);
	}
	function onRulerPointerUp() {
		scrubbing = false;
	}

	// keyboard equivalent for the ruler's own role="slider" — without this, arrow/Home/End
	// only seemed to work here because +page.svelte's global shortcut handler leaked through
	// (jumpBack/jumpForward/goToStart/goToEnd); narrowing that handler's guard removed the
	// accident, so the ruler needs its own handling to stay keyboard-operable (WCAG 2.1.1).
	const RULER_SEEK_STEP = 5; // seconds per arrow press, same as +page.svelte's jumpBack/jumpForward
	function onRulerKeyDown(e: KeyboardEvent) {
		if (!duration) return;
		if (e.key === 'ArrowLeft') seek(Math.max(0, currentTime - RULER_SEEK_STEP));
		else if (e.key === 'ArrowRight') seek(Math.min(duration, currentTime + RULER_SEEK_STEP));
		else if (e.key === 'Home') seek(0);
		else if (e.key === 'End') seek(duration);
		else return;
		e.preventDefault();
		// this div isn't an input/select/summary, so +page.svelte's global shortcut guard
		// doesn't exempt it — without stopPropagation, the same keydown bubbles to the
		// document listener too and double-seeks (its own jumpBack/jumpForward on the same
		// keys, applied to the same pre-update `currentTime`). Same fix PianoReference.svelte
		// already uses for its own note keys, for the same reason.
		e.stopPropagation();
		followEnabled = false;
	}

	function seekFromEvent(e: PointerEvent) {
		if (!duration) return;
		// rect always comes from the canvas, even when the pointer is on the ruler below it —
		// they share canvasWidthPx, and the ruler's own rect is offset by scroll position
		const rect = canvasEl.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		seek(duration * ratio);
	}

	// auto-follow: pin the playhead near the left edge during playback, timeline scrolling
	// underneath it (DAW-style), rather than re-centering only once it nears an edge.
	// Disarmed by a manual pan or ruler-scrub and re-armed when playback (re)starts, so it
	// doesn't fight the user's own scroll position — same "follow" toggle DAWs expose.
	const LEFT_ANCHOR_FRACTION = 0.1;
	let followEnabled = true;
	let prevPaused = paused;
	$: if (paused !== prevPaused) {
		prevPaused = paused;
		if (!paused) followEnabled = true;
	}
	function followPlayhead(time: number) {
		if (!scrollEl || !duration || !canvasWidthPx) return;
		const playheadX = (time / duration) * canvasWidthPx;
		const anchor = scrollEl.clientWidth * LEFT_ANCHOR_FRACTION;
		scrollEl.scrollLeft = Math.max(0, playheadX - anchor);
	}
	$: if (!paused && !dragging && !scrubbing && followEnabled) followPlayhead(currentTime);
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs text-stone-300">
		<div class="flex items-center gap-2">
			<label class="flex items-center gap-1">
				<span class="hidden text-stone-500 sm:inline">Analyzer</span>
				<select
					bind:value={analyzer}
					title={ANALYZER_INFO[analyzer]}
					class="min-h-9 rounded-sm border border-stone-600 bg-stone-800 px-1.5 py-1.5"
				>
					<option value="neural">Neural</option>
					<option value="fft">FFT</option>
				</select>
			</label>
			<label class="flex items-center gap-1">
				<span class="hidden text-stone-500 sm:inline">View</span>
				<select
					bind:value={viewMode}
					title={VIEW_MODE_INFO[viewMode]}
					class="min-h-9 rounded-sm border border-stone-600 bg-stone-800 px-1.5 py-1.5"
				>
					<option value="heatmap">Heatmap</option>
					<option value="combined">Combined</option>
					<option value="notes" disabled={!notesAvailable}>Notes</option>
					<option value="voices" disabled={!notesAvailable}>Voices</option>
				</select>
			</label>
		</div>
		<div class="flex items-center gap-1.5">
			<span class="hidden text-stone-500 sm:inline">time</span>
			<button
				class="{gridBtn} h-11 w-11"
				on:click={() => zoomBy(1 / 1.5)}
				aria-label="Zoom time out"><Icon name="minus" class="h-5 w-5" /></button
			>
			<button class="{gridBtn} h-11 w-11" on:click={() => zoomBy(1.5)} aria-label="Zoom time in"
				><Icon name="plus" class="h-5 w-5" /></button
			>
			<span class="hidden text-stone-500 sm:inline">pitch</span>
			<button
				class="{gridBtn} h-11 w-11"
				on:click={() => zoomYBy(1 / 1.5)}
				aria-label="Zoom pitch out"><Icon name="minus" class="h-5 w-5" /></button
			>
			<button class="{gridBtn} h-11 w-11" on:click={() => zoomYBy(1.5)} aria-label="Zoom pitch in"
				><Icon name="plus" class="h-5 w-5" /></button
			>
			<button
				class="{gridBtn} ml-1 h-11 w-11"
				on:click={() => {
					followEnabled = true;
					followPlayhead(currentTime);
				}}
				title="Jump to playhead"
				aria-label="Jump to playhead"><Icon name="viewfinder-circle" class="h-5 w-5" /></button
			>
			<button
				class="{gridBtn} ml-2 h-11 w-11"
				on:click={onClose}
				title="Close"
				aria-label="Close pitchgram"><Icon name="x-mark" class="h-5 w-5" /></button
			>
		</div>
	</div>

	{#if showLines}
		<div
			class="mb-2 flex flex-wrap items-center gap-3 rounded-sm border border-stone-700 bg-stone-900/40 px-2 py-1.5 text-xs text-stone-300"
		>
			<label
				class="flex items-center gap-1"
				title="Strongest confident pitch in C4 and up, each frame — the lead line"
				><input type="checkbox" bind:checked={showMelody} /><span class="text-orange-400">●</span> Melody</label
			>
			<label
				class="flex items-center gap-1"
				title="Strongest confident pitch in C3–C5, each frame — harmony between bass and melody"
				><input type="checkbox" bind:checked={showInner} /><span class="text-violet-400">●</span> Inner
				voices</label
			>
			<label
				class="flex items-center gap-1"
				title="Strongest confident pitch in C2–C4, each frame — the lowest register"
				><input type="checkbox" bind:checked={showBass} /><span class="text-cyan-400">●</span> Bass</label
			>
			<label class="flex items-center gap-1" title="Hide notes the model isn't confident about">
				<span class="text-stone-500">Confidence</span>
				<input
					type="range"
					min={LINE_THRESHOLD}
					max="1"
					step="0.05"
					bind:value={confidenceThreshold}
					on:pointerup={(e) => e.currentTarget.blur()}
					class="w-16 accent-amber-500"
				/>
				<span class="w-9 font-mono text-stone-400">{Math.round(confidenceThreshold * 100)}%</span>
			</label>
		</div>
	{/if}

	<p class="mb-2 hidden text-[11px] text-stone-500 lg:block">
		{ANALYZER_INFO[analyzer]} · {VIEW_MODE_INFO[viewMode]}
	</p>

	{#if viewMode === 'notes' || viewMode === 'voices'}
		<details class="mb-2 rounded-sm border border-stone-700 bg-stone-900/50 px-3 py-2 text-xs">
			<summary class="flex cursor-pointer items-center gap-1.5 font-medium text-stone-300">
				<Icon name="adjustments-horizontal" class="h-4 w-4" /> Advanced note settings</summary
			>
			<div class="mt-2 flex flex-wrap items-center gap-4 text-stone-300">
				<label class="flex items-center gap-1" title="Minimum onset activation to start a note">
					<span class="text-stone-500">Onset</span>
					<input
						type="range"
						min="0.1"
						max="0.9"
						step="0.05"
						value={onsetThresh}
						on:change={(e) => (onsetThresh = e.currentTarget.valueAsNumber)}
						on:pointerup={(e) => e.currentTarget.blur()}
						class="w-20 accent-amber-500"
					/>
					<span class="w-9 font-mono text-stone-400">{Math.round(onsetThresh * 100)}%</span>
				</label>
				<label class="flex items-center gap-1" title="Minimum activation for a note to stay 'on'">
					<span class="text-stone-500">Frame</span>
					<input
						type="range"
						min="0.1"
						max="0.9"
						step="0.05"
						value={frameThresh}
						on:change={(e) => (frameThresh = e.currentTarget.valueAsNumber)}
						on:pointerup={(e) => e.currentTarget.blur()}
						class="w-20 accent-amber-500"
					/>
					<span class="w-9 font-mono text-stone-400">{Math.round(frameThresh * 100)}%</span>
				</label>
				<label class="flex items-center gap-1" title="Minimum note length, in ~86fps model frames">
					<span class="text-stone-500">Min length</span>
					<input
						type="range"
						min="1"
						max="20"
						step="1"
						value={minNoteLen}
						on:change={(e) => (minNoteLen = e.currentTarget.valueAsNumber)}
						on:pointerup={(e) => e.currentTarget.blur()}
						class="w-20 accent-amber-500"
					/>
					<span class="w-9 font-mono text-stone-400">{minNoteLen}f</span>
				</label>
				<label
					class="flex items-center gap-1"
					title="Also start notes from large frame-amplitude jumps, not just clean onsets"
				>
					<input type="checkbox" bind:checked={inferOnsets} /> Infer onsets
				</label>
				<label
					class="flex items-center gap-1"
					title="Recovers notes with no clean onset. Runs in a background worker so the page stays responsive, but can take several seconds on a long or noisy clip."
				>
					<input type="checkbox" bind:checked={melodiaTrick} /> Melodia trick (slow)
				</label>
				{#if notesComputing || voicesComputing}
					<span class="text-stone-500">Computing notes…</span>
				{:else if notesError || voicesError}
					<span class="text-red-400">Couldn't compute notes — try different settings.</span>
				{/if}
			</div>
		</details>
	{/if}

	{#if status === 'computing' && !frames}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-stone-400">
			<div
				class="h-8 w-8 animate-spin rounded-full border-2 border-stone-700 border-t-amber-400"
				role="status"
				aria-label="Analyzing pitch content"
			></div>
			<p>Analyzing pitch content…</p>
		</div>
	{:else if status === 'error'}
		<p class="flex flex-1 items-center justify-center text-sm text-red-400">
			Couldn't analyze this file.
		</p>
	{:else if frames}
		<div
			class="relative min-h-0 min-w-0 flex-1 touch-none overflow-auto overscroll-contain rounded-sm bg-stone-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			bind:this={scrollEl}
			bind:clientWidth={containerWidth}
			bind:clientHeight={containerHeight}
			on:wheel={onWheel}
		>
			{#if status === 'computing'}
				<div
					class="pointer-events-none sticky top-1 z-20 float-right mr-1 flex w-fit items-center gap-1.5 rounded-full bg-stone-950/80 px-2 py-1 text-[11px] text-stone-300"
					role="status"
				>
					<div
						class="h-2.5 w-2.5 animate-spin rounded-full border-2 border-stone-600 border-t-amber-400"
					></div>
					Still analyzing…
				</div>
			{/if}
			<div class="relative" style="width: {canvasWidthPx}px; height: {canvasHeightPx}px">
				<canvas
					bind:this={canvasEl}
					class="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
					style="image-rendering: pixelated; touch-action: none;"
					aria-label="Pitchgram heatmap, {duration
						? secondsToTime(duration)
						: 'unknown length'} of analyzed audio. Drag to pan, or use the seek slider below to navigate by keyboard."
					on:pointerdown={onPointerDown}
					on:pointermove={onPointerMove}
					on:pointerup={onPointerUp}
					on:pointercancel={onPointerCancel}
				></canvas>
				<div class="pointer-events-none absolute inset-0" style={gridStyle}></div>
				<svg
					class="pointer-events-none absolute inset-0 h-full w-full"
					viewBox="0 0 {frames.length} {TOTAL_BINS}"
					preserveAspectRatio="none"
				>
					{#if bassPath}
						<path
							d={bassPath}
							fill="none"
							stroke="#22d3ee"
							stroke-width="2"
							vector-effect="non-scaling-stroke"
						/>
					{/if}
					{#if innerPath}
						<path
							d={innerPath}
							fill="none"
							stroke="#a78bfa"
							stroke-width="2"
							vector-effect="non-scaling-stroke"
						/>
					{/if}
					{#if melodyPath}
						<path
							d={melodyPath}
							fill="none"
							stroke="#fb923c"
							stroke-width="2"
							vector-effect="non-scaling-stroke"
						/>
					{/if}
					{#if viewMode === 'notes' && raw && duration}
						{#each notes as note, i (i)}
							<rect
								x={noteX(note.startFrame, duration, frames.length)}
								y={TOTAL_BINS - note.bin - 2}
								width={noteWidth(note.startFrame, note.durationFrames, duration, frames.length)}
								height={SEMITONE_BINS}
								fill="#fbbf24"
								stroke="#78350f"
								stroke-width="0.15"
								vector-effect="non-scaling-stroke"
								opacity={0.35 + note.amplitude * 0.65}
							/>
						{/each}
					{/if}
					{#if viewMode === 'voices' && raw && duration}
						{#each voiceStreams as stream, v (v)}
							{#each stream as note, i (i)}
								<rect
									x={noteX(note.startFrame, duration, frames.length)}
									y={TOTAL_BINS - note.bin - 2}
									width={noteWidth(note.startFrame, note.durationFrames, duration, frames.length)}
									height={SEMITONE_BINS}
									fill={VOICE_COLORS[v % VOICE_COLORS.length]}
									stroke="#0f172a"
									stroke-width="0.15"
									vector-effect="non-scaling-stroke"
									opacity={0.35 + note.amplitude * 0.65}
								/>
							{/each}
						{/each}
					{/if}
				</svg>
				{#if duration}
					<div
						class="pointer-events-none absolute inset-y-0 w-px bg-red-400"
						style="left: {(flag / duration) * 100}%"
					></div>
					<div
						class="pointer-events-none absolute inset-y-0 w-px bg-white/80"
						style="left: {(currentTime / duration) * 100}%"
					></div>
					<div class="pointer-events-none sticky top-0 z-10 h-0 w-full">
						<div
							class="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-white/90"
							style="left: {(currentTime / duration) * 100}%"
						></div>
					</div>
				{/if}
				<!-- frozen note gutter: sticky to the left edge on time-scroll, scrolls normally with pitch-scroll -->
				<div
					class="sticky left-0 h-full w-8 text-[10px] text-stone-500"
					on:wheel|preventDefault|stopPropagation={onGutterWheel}
				>
					{#each noteLabels as label (label.top)}
						<span
							class="absolute -translate-y-1/2 bg-stone-800/70 px-0.5 leading-none"
							style="top: {label.top}%">{label.name}</span
						>
					{/each}
				</div>
			</div>
			<!-- frozen time ruler: sticky to the bottom on pitch-scroll, scrolls normally with time-scroll.
			     Draggable to scrub the playhead — seek math reads canvasEl's rect (see seekFromEvent),
			     not this element's, since scroll offset would otherwise throw off the ratio. -->
			<div
				class="sticky bottom-0 h-4 cursor-ew-resize text-[10px] text-stone-400"
				style="width: {canvasWidthPx}px; touch-action: none;"
				role="slider"
				tabindex="0"
				aria-label="Seek (pitchgram ruler)"
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={currentTime}
				on:keydown={onRulerKeyDown}
				on:pointerdown={onRulerPointerDown}
				on:pointermove={onRulerPointerMove}
				on:pointerup={onRulerPointerUp}
				on:pointercancel={onRulerPointerUp}
			>
				{#each ticks as rulerTick (rulerTick.t)}
					<span
						class="absolute -translate-x-1/2 bg-stone-800/70 px-0.5"
						style="left: {rulerTick.x}px">{secondsToTime(rulerTick.t)}</span
					>
				{/each}
			</div>
		</div>
	{:else}
		<p class="flex flex-1 items-center justify-center text-sm text-stone-400">
			Load a local audio file to see its pitchgram.
		</p>
	{/if}

	<!-- mobile transport bar: pitchgram takes the full viewport on a phone, so this is the only
	     way back to speed/flag controls and the piano short of closing the view — see the
	     mobileSheet comment above. Buttons are h-11 (44px) for a real touch target. -->
	<div class="mt-2 flex items-center justify-center gap-2 lg:hidden">
		<button class="{gridBtn} w-11 shrink-0" on:click={behavior.jumpBack} aria-label="Back 5 seconds"
			><Icon name="backward" class={iconSize} /></button
		>
		<button
			class="{primaryBtn} w-11 shrink-0"
			on:click={behavior.togglePlayback}
			aria-label={paused ? 'Play' : 'Pause'}
			><Icon name={paused ? 'play' : 'pause'} class={iconSize} /></button
		>
		<button
			class="{gridBtn} w-11 shrink-0"
			on:click={behavior.jumpForward}
			aria-label="Forward 5 seconds"><Icon name="forward" class={iconSize} /></button
		>
		<button
			class="{gridBtn} flex-1 gap-1.5 font-mono text-xs {mobileSheet === 'controls'
				? 'bg-stone-700'
				: ''}"
			on:click={() => toggleSheet('controls')}
			aria-pressed={mobileSheet === 'controls'}
			aria-label="Speed and flag controls"
		>
			<Icon name="adjustments-horizontal" class="h-5 w-5" />{Math.round(playbackRate * 100)}%
		</button>
		<button
			class="{gridBtn} w-11 shrink-0 {mobileSheet === 'piano' ? 'bg-stone-700' : ''}"
			on:click={() => toggleSheet('piano')}
			aria-pressed={mobileSheet === 'piano'}
			aria-label="Piano reference"><Icon name="musical-note" class={iconSize} /></button
		>
	</div>

	{#if mobileSheet !== 'none'}
		<button
			type="button"
			transition:fade={{ duration: 150 }}
			class="fixed inset-0 z-40 cursor-default bg-black/50 lg:hidden"
			on:click={() => (mobileSheet = 'none')}
			aria-label="Close panel"
		></button>
		<div
			transition:fly={{ y: 320, duration: 220, opacity: 1 }}
			class="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl border-t border-stone-800 bg-stone-900 p-4 lg:hidden"
			style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
		>
			<div class="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-700"></div>
			{#if mobileSheet === 'controls'}
				<div class="flex flex-col gap-3">
					<div class="grid grid-cols-3 gap-2">
						<button class={gridBtn} on:click={behavior.slowDown} aria-label="Slow down"
							><Icon name="minus" class={iconSize} /></button
						>
						<button
							class="{gridBtn} font-mono text-sm"
							on:click={resetSpeed}
							aria-label="Reset speed to 100%">{Math.round(playbackRate * 100)}%</button
						>
						<button class={gridBtn} on:click={behavior.speedUp} aria-label="Speed up"
							><Icon name="plus" class={iconSize} /></button
						>
					</div>
					<div class="grid grid-cols-4 gap-2">
						<button class={gridBtn} on:click={behavior.rewind} aria-label="Go to flag"
							><Icon name="flag" class="{iconSize} text-orange-400" /></button
						>
						<button class={gridBtn} on:click={behavior.pushFlagBack} aria-label="Push flag back 1s"
							><Icon name="chevron-left" class={iconSize} /></button
						>
						<button class={gridBtn} on:click={behavior.placeFlag} aria-label="Set flag"
							><Icon name="flag-solid" class="{iconSize} text-orange-400" /></button
						>
						<button class={gridBtn} on:click={behavior.resetFlag} aria-label="Reset flag"
							><Icon name="x-mark" class={iconSize} /></button
						>
					</div>
				</div>
			{:else}
				<PianoReference />
			{/if}
		</div>
	{/if}
</div>
