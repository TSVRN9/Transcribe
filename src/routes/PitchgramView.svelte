<script lang="ts">
	import { onMount, tick } from 'svelte';
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
	import { estimateKey } from './pitch/rhythmKey';

	export let status: PitchStatus = 'idle';
	export let frames: Float32Array[] | undefined = undefined;
	export let lines: PitchLines | undefined = undefined;
	export let raw: RawModelOutput | undefined = undefined;
	export let analyzer: PitchAnalyzer = 'neural';
	export let currentTime = 0;
	export let flag = 0;
	export let duration = 0;
	export let seek: SeekFunction = placeholderSeek;

	export let paused = true;
	export let playbackRate = 1;
	export let behavior: Record<Behavior, VoidFunction>;
	export let resetSpeed: VoidFunction;
	export let onClose: VoidFunction;

	let mobileSheet: 'none' | 'controls' | 'piano' = 'none';
	function toggleSheet(which: 'controls' | 'piano') {
		mobileSheet = mobileSheet === which ? 'none' : which;
	}

	const TOTAL_BINS = OCTAVE_COUNT * BINS_PER_OCTAVE;
	const SEMITONE_BINS = BINS_PER_OCTAVE / 12;
	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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

	const octavePct = 100 / OCTAVE_COUNT;
	const semitonePct = 100 / (OCTAVE_COUNT * 12);
	const BLACK_KEYS = [1, 3, 6, 8, 10];
	const blackKeyLanes = Array.from({ length: 12 }, (_, k) => {
		const c = BLACK_KEYS.includes(k)
			? 'color-mix(in srgb, var(--color-ink) 5%, transparent)'
			: 'transparent';
		return `${c} ${k * semitonePct}% ${(k + 1) * semitonePct}%`;
	}).join(', ');
	const gridStyle =
		`background-image:` +
		`repeating-linear-gradient(to top, color-mix(in srgb, var(--color-ink) 22%, transparent) 0 1px, transparent 1px ${octavePct}%),` +
		`repeating-linear-gradient(to top, color-mix(in srgb, var(--color-ink) 7%, transparent) 0 1px, transparent 1px ${semitonePct}%),` +
		`repeating-linear-gradient(to top, ${blackKeyLanes});`;

	// multi-hue ramps keep quiet bins distinguishable from silence
	type Stops = [number, number, number, number][];
	const PAPER_STOPS: Stops = [
		[0, 243, 245, 244],
		[0.3, 186, 203, 219],
		[0.6, 76, 108, 150],
		[1, 18, 26, 40]
	];
	const NIGHT_STOPS: Stops = [
		[0, 18, 24, 33],
		[0.35, 36, 66, 108],
		[0.7, 110, 165, 205],
		[1, 240, 244, 236]
	];
	let colorStops = PAPER_STOPS;
	onMount(() => {
		const dark = matchMedia('(prefers-color-scheme: dark)');
		const update = () => (colorStops = dark.matches ? NIGHT_STOPS : PAPER_STOPS);
		update();
		dark.addEventListener('change', update);
		return () => dark.removeEventListener('change', update);
	});
	function pitchColor(t: number, stops: Stops): [number, number, number] {
		for (let i = 0; i < stops.length - 1; i++) {
			const [p0, r0, g0, b0] = stops[i];
			const [p1, r1, g1, b1] = stops[i + 1];
			if (t <= p1) {
				const f = (t - p0) / (p1 - p0);
				return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
			}
		}
		const [, r, g, b] = stops[stops.length - 1];
		return [r, g, b];
	}

	let canvasEl: HTMLCanvasElement;
	$: if (canvasEl && frames) draw(frames, colorStops);

	function draw(frames: Float32Array[], stops: Stops) {
		canvasEl.width = frames.length;
		canvasEl.height = TOTAL_BINS;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		const image = ctx.createImageData(frames.length, TOTAL_BINS);
		for (let x = 0; x < frames.length; x++) {
			for (let row = 0; row < TOTAL_BINS; row++) {
				const bin = TOTAL_BINS - 1 - row;
				const [r, g, b] = pitchColor(frames[x][bin], stops);
				const i = (row * frames.length + x) * 4;
				image.data[i] = r;
				image.data[i + 1] = g;
				image.data[i + 2] = b;
				image.data[i + 3] = 255;
			}
		}
		ctx.putImageData(image, 0, 0);
	}

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

	const selectCls =
		'min-h-9 rounded-lg border border-staff bg-paper px-2 py-1.5 font-medium text-ink';
	const zoomBtn =
		'flex h-10 w-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-wash-strong';

	type ViewMode = 'heatmap' | 'combined' | 'notes' | 'voices';
	let viewMode: ViewMode = 'heatmap';
	// FFT has no onset/frame data to segment
	$: notesAvailable = !!raw?.frames.length;
	$: if ((viewMode === 'notes' || viewMode === 'voices') && !notesAvailable) viewMode = 'heatmap';

	let showMelody = true;
	let showInner = true;
	let showBass = true;
	let confidenceThreshold = 0.3;

	$: musicalKey = raw?.frames.length
		? estimateKey(raw.frames).replace('b', '♭').replace('#', '♯')
		: ''; // 0.4 cost the lines 0.02-0.06 accuracy on annotated sets

	$: showLines = viewMode === 'combined';
	$: bassPath = showLines && showBass ? linePath(lines?.bass, confidenceThreshold) : '';
	$: innerPath = showLines && showInner ? linePath(lines?.inner, confidenceThreshold) : '';
	$: melodyPath = showLines && showMelody ? linePath(lines?.melody, confidenceThreshold) : '';

	// sliders apply on release: a live drag would queue stale segmentation jobs
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

	const VOICE_COLORS = [1, 2, 3, 4].map((n) => `var(--color-voice-${n})`);
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

	// zoom floors: the grid never shrinks below the container
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

	// auto-fit pitch zoom to the occupied range once per file
	const FALLBACK_MIN_SCALE_Y = 0.4; // used only before containerHeight is measured
	const MAX_SCALE_Y = 20;
	const OCCUPIED_THRESHOLD = 0.2; // inclusive on purpose: a quiet bass should still fit in view
	const OCCUPIED_PAD_SEMITONES = 3;
	let scaleY = 3;
	let fittedY = false;
	let containerHeight = 0;
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
	// wait for the final result: a partial one would fit to just the first few seconds
	$: if (frames && containerHeight && status !== 'computing') {
		if (!fittedY) {
			fitVerticalZoom(frames);
			fittedY = true;
		} else if (scaleY < minScaleY) {
			scaleY = minScaleY;
		}
	}
	$: if (!frames) fittedY = false;

	// keeps the content under the cursor (or viewport center) fixed
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

	// wheel pans, ctrl/pinch zooms time, shift/alt force horizontal; the gutter zooms pitch
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

	// drag pans, a still click seeks, two fingers pinch-zoom around their midpoint
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

	let hoverSemitone: number | undefined;
	function trackHover(e: PointerEvent) {
		const rect = canvasEl.getBoundingClientRect();
		const fromBottom = 1 - (e.clientY - rect.top) / rect.height;
		hoverSemitone =
			fromBottom >= 0 && fromBottom <= 1
				? Math.min(OCTAVE_COUNT * 12 - 1, Math.floor(fromBottom * OCTAVE_COUNT * 12))
				: undefined;
	}
	function noteName(semitone: number) {
		return NOTE_NAMES[semitone % 12] + (OCTAVE_START + Math.floor(semitone / 12));
	}

	function onPointerMove(e: PointerEvent) {
		if (e.pointerType === 'mouse') trackHover(e);
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

	const RULER_SEEK_STEP = 5; // seconds per arrow press, same as +page.svelte's jumpBack/jumpForward
	function onRulerKeyDown(e: KeyboardEvent) {
		if (!duration) return;
		if (e.key === 'ArrowLeft') seek(Math.max(0, currentTime - RULER_SEEK_STEP));
		else if (e.key === 'ArrowRight') seek(Math.min(duration, currentTime + RULER_SEEK_STEP));
		else if (e.key === 'Home') seek(0);
		else if (e.key === 'End') seek(duration);
		else return;
		e.preventDefault();
		// stop it reaching the global shortcuts, which would seek a second time
		e.stopPropagation();
		followEnabled = false;
	}

	function seekFromEvent(e: PointerEvent) {
		if (!duration) return;
		// the ruler shares the canvas width but its own rect is scroll-offset
		const rect = canvasEl.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		seek(duration * ratio);
	}

	// keep the playhead near the left edge while playing; a manual pan disarms until next play
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

<div class="flex h-full min-h-0 flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
		<div class="flex items-center gap-2">
			<label class="flex items-center gap-1.5">
				<span class="hidden text-graphite sm:inline">Analyzer</span>
				<select bind:value={analyzer} class={selectCls}>
					<option value="neural">Neural</option>
					<option value="fft">FFT</option>
				</select>
			</label>
			<label class="flex items-center gap-1.5">
				<span class="hidden text-graphite sm:inline">View</span>
				<select bind:value={viewMode} class={selectCls}>
					<option value="heatmap">Heatmap</option>
					<option value="combined">Lines</option>
					<option value="notes" disabled={!notesAvailable}>Notes</option>
					<option value="voices" disabled={!notesAvailable}>Voices</option>
				</select>
			</label>
			{#if musicalKey}
				<output class="px-1 font-semibold whitespace-nowrap" aria-label="Key">{musicalKey}</output>
			{/if}
		</div>
		<div class="flex items-center gap-1">
			<div class="flex items-center rounded-lg bg-wash" role="group" aria-label="Time zoom">
				<button class={zoomBtn} on:click={() => zoomBy(1 / 1.5)} aria-label="Zoom time out"
					><Icon name="minus" class="h-4 w-4" /></button
				>
				<span class="hidden px-1 text-xs text-graphite sm:inline">Time</span>
				<button class={zoomBtn} on:click={() => zoomBy(1.5)} aria-label="Zoom time in"
					><Icon name="plus" class="h-4 w-4" /></button
				>
			</div>
			<div class="flex items-center rounded-lg bg-wash" role="group" aria-label="Pitch zoom">
				<button class={zoomBtn} on:click={() => zoomYBy(1 / 1.5)} aria-label="Zoom pitch out"
					><Icon name="minus" class="h-4 w-4" /></button
				>
				<span class="hidden px-1 text-xs text-graphite sm:inline">Pitch</span>
				<button class={zoomBtn} on:click={() => zoomYBy(1.5)} aria-label="Zoom pitch in"
					><Icon name="plus" class="h-4 w-4" /></button
				>
			</div>
			<button
				class="{zoomBtn} rounded-lg bg-wash"
				on:click={() => {
					followEnabled = true;
					followPlayhead(currentTime);
				}}
				title="Jump to playhead"
				aria-label="Jump to playhead"><Icon name="viewfinder-circle" class="h-5 w-5" /></button
			>
			<button
				class="{zoomBtn} ml-1 rounded-lg"
				on:click={onClose}
				title="Close pitchgram"
				aria-label="Close pitchgram"><Icon name="x-mark" class="h-5 w-5" /></button
			>
		</div>
	</div>

	{#if showLines}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			<label class="flex items-center gap-1.5"
				><input type="checkbox" bind:checked={showMelody} class="accent-ink" /><span
					class="h-0.5 w-4 rounded-full bg-voice-1"
				></span> Melody</label
			>
			<label class="flex items-center gap-1.5"
				><input type="checkbox" bind:checked={showInner} class="accent-ink" /><span
					class="h-0.5 w-4 rounded-full bg-voice-2"
				></span> Inner</label
			>
			<label class="flex items-center gap-1.5"
				><input type="checkbox" bind:checked={showBass} class="accent-ink" /><span
					class="h-0.5 w-4 rounded-full bg-voice-3"
				></span> Bass</label
			>
			<label class="flex items-center gap-1.5">
				<span class="text-graphite">Confidence</span>
				<input
					type="range"
					min={LINE_THRESHOLD}
					max="1"
					step="0.05"
					bind:value={confidenceThreshold}
					on:pointerup={(e) => e.currentTarget.blur()}
					class="w-20 accent-ink"
				/>
				<span class="w-9 tabular-nums">{Math.round(confidenceThreshold * 100)}%</span>
			</label>
		</div>
	{/if}

	{#if viewMode === 'notes' || viewMode === 'voices'}
		<details class="group text-sm">
			<summary
				class="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-graphite hover:text-ink"
			>
				<Icon name="adjustments-horizontal" class="h-4 w-4" /> Note detection
				{#if notesComputing || voicesComputing}
					<span class="ml-1 font-normal">Working…</span>
				{/if}
			</summary>
			<div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
				<label class="flex items-center gap-1.5">
					<span class="text-graphite">Onset</span>
					<input
						type="range"
						min="0.1"
						max="0.9"
						step="0.05"
						value={onsetThresh}
						on:change={(e) => (onsetThresh = e.currentTarget.valueAsNumber)}
						on:pointerup={(e) => e.currentTarget.blur()}
						class="w-20 accent-ink"
					/>
					<span class="w-9 tabular-nums">{Math.round(onsetThresh * 100)}%</span>
				</label>
				<label class="flex items-center gap-1.5">
					<span class="text-graphite">Sustain</span>
					<input
						type="range"
						min="0.1"
						max="0.9"
						step="0.05"
						value={frameThresh}
						on:change={(e) => (frameThresh = e.currentTarget.valueAsNumber)}
						on:pointerup={(e) => e.currentTarget.blur()}
						class="w-20 accent-ink"
					/>
					<span class="w-9 tabular-nums">{Math.round(frameThresh * 100)}%</span>
				</label>
				<label class="flex items-center gap-1.5">
					<span class="text-graphite">Shortest note</span>
					<input
						type="range"
						min="1"
						max="20"
						step="1"
						value={minNoteLen}
						on:change={(e) => (minNoteLen = e.currentTarget.valueAsNumber)}
						on:pointerup={(e) => e.currentTarget.blur()}
						class="w-20 accent-ink"
					/>
					<span class="w-12 tabular-nums">{Math.round((minNoteLen / 86) * 1000)}ms</span>
				</label>
				<label class="flex items-center gap-1.5">
					<input type="checkbox" bind:checked={inferOnsets} class="accent-ink" /> Infer onsets
				</label>
				<label class="flex items-center gap-1.5">
					<input type="checkbox" bind:checked={melodiaTrick} class="accent-ink" /> Recover soft notes
					(slow)
				</label>
			</div>
			{#if notesError || voicesError}
				<p class="mt-2 text-pencil" role="alert">Couldn't detect notes. Try other settings.</p>
			{/if}
		</details>
	{/if}

	{#if status === 'computing' && !frames}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-graphite">
			<div
				class="h-8 w-8 animate-spin rounded-full border-2 border-staff border-t-ink"
				role="status"
				aria-label="Analyzing pitch"
			></div>
			<p>Analyzing pitch…</p>
		</div>
	{:else if status === 'error'}
		<p class="flex flex-1 items-center justify-center text-sm text-pencil" role="alert">
			Couldn't analyze this file. Close the pitchgram and open it again to retry.
		</p>
	{:else if frames}
		<div
			class="relative min-h-0 min-w-0 flex-1 touch-none overflow-auto overscroll-contain rounded-lg border border-staff bg-paper [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			bind:this={scrollEl}
			bind:clientWidth={containerWidth}
			bind:clientHeight={containerHeight}
			on:wheel={onWheel}
		>
			{#if status === 'computing'}
				<div
					class="pointer-events-none sticky top-2 z-20 float-right mr-2 flex w-fit items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-xs text-paper"
					role="status"
				>
					<div
						class="h-2.5 w-2.5 animate-spin rounded-full border-2 border-paper/30 border-t-paper"
					></div>
					Still analyzing…
				</div>
			{/if}
			<div class="relative" style="width: {canvasWidthPx}px; height: {canvasHeightPx}px">
				<canvas
					bind:this={canvasEl}
					class="absolute inset-0 h-full w-full cursor-grab transition-opacity active:cursor-grabbing {viewMode ===
						'notes' || viewMode === 'voices'
						? 'opacity-35'
						: ''}"
					style="image-rendering: pixelated; touch-action: none;"
					aria-label="Pitchgram of {duration
						? secondsToTime(duration)
						: 'unknown length'} of audio. Drag to pan, or use the ruler to seek."
					on:pointerdown={onPointerDown}
					on:pointermove={onPointerMove}
					on:pointerup={onPointerUp}
					on:pointercancel={onPointerCancel}
					on:pointerleave={() => (hoverSemitone = undefined)}
				></canvas>
				<div class="pointer-events-none absolute inset-0" style={gridStyle}></div>
				{#if hoverSemitone !== undefined}
					<div
						class="pointer-events-none absolute inset-x-0 bg-ink/10"
						style="bottom: {(hoverSemitone / (OCTAVE_COUNT * 12)) * 100}%; height: {100 /
							(OCTAVE_COUNT * 12)}%"
					></div>
				{/if}
				<svg
					class="pointer-events-none absolute inset-0 h-full w-full"
					viewBox="0 0 {frames.length} {TOTAL_BINS}"
					preserveAspectRatio="none"
				>
					{#if bassPath}
						<path
							d={bassPath}
							fill="none"
							stroke="var(--color-voice-3)"
							stroke-width="2.5"
							vector-effect="non-scaling-stroke"
						/>
					{/if}
					{#if innerPath}
						<path
							d={innerPath}
							fill="none"
							stroke="var(--color-voice-2)"
							stroke-width="2.5"
							vector-effect="non-scaling-stroke"
						/>
					{/if}
					{#if melodyPath}
						<path
							d={melodyPath}
							fill="none"
							stroke="var(--color-voice-1)"
							stroke-width="2.5"
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
								fill="var(--color-ink)"
								opacity={0.45 + note.amplitude * 0.55}
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
									opacity={0.5 + note.amplitude * 0.5}
								/>
							{/each}
						{/each}
					{/if}
				</svg>
				{#if duration}
					{#if flag > 0}
						<div
							class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-pencil"
							style="left: {(flag / duration) * 100}%"
						></div>
					{/if}
					<div
						class="pointer-events-none absolute inset-y-0 w-px bg-ink"
						style="left: {(currentTime / duration) * 100}%"
					></div>
					<div class="pointer-events-none sticky top-0 z-10 h-0 w-full">
						<div
							class="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-ink"
							style="left: {(currentTime / duration) * 100}%"
						></div>
					</div>
				{/if}
				<div
					class="sticky left-0 h-full w-9 text-[10px] font-semibold"
					on:wheel|preventDefault|stopPropagation={onGutterWheel}
				>
					{#each noteLabels as label (label.top)}
						<span
							class="absolute -translate-y-1/2 rounded-r-sm bg-paper/85 px-1 leading-none"
							style="top: {label.top}%">{label.name}</span
						>
					{/each}
					{#if hoverSemitone !== undefined}
						<span
							class="absolute z-10 -translate-y-1/2 rounded-r-sm bg-ink px-1 py-0.5 leading-none text-paper"
							style="top: {(1 - (hoverSemitone + 0.5) / (OCTAVE_COUNT * 12)) * 100}%"
							>{noteName(hoverSemitone)}</span
						>
					{/if}
				</div>
			</div>
			<div
				class="sticky bottom-0 h-5 cursor-ew-resize bg-paper/85 text-[10px] text-graphite tabular-nums"
				style="width: {canvasWidthPx}px; touch-action: none;"
				role="slider"
				tabindex="0"
				aria-label="Seek"
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={currentTime}
				aria-valuetext={secondsToTime(currentTime)}
				on:keydown={onRulerKeyDown}
				on:pointerdown={onRulerPointerDown}
				on:pointermove={onRulerPointerMove}
				on:pointerup={onRulerPointerUp}
				on:pointercancel={onRulerPointerUp}
			>
				{#each ticks as rulerTick (rulerTick.t)}
					<span
						class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 px-0.5"
						style="left: {rulerTick.x}px">{secondsToTime(rulerTick.t)}</span
					>
				{/each}
			</div>
		</div>
	{:else}
		<p class="flex flex-1 items-center justify-center text-sm text-graphite">
			Load an audio file to see its pitchgram.
		</p>
	{/if}

	<div class="flex items-center justify-center gap-2 lg:hidden">
		<button class="{gridBtn} w-12 shrink-0" on:click={behavior.jumpBack} aria-label="Back 5 seconds"
			><Icon name="backward" class={iconSize} /></button
		>
		<button
			class="{primaryBtn} w-16 shrink-0"
			on:click={behavior.togglePlayback}
			aria-label={paused ? 'Play' : 'Pause'}
			><Icon name={paused ? 'play' : 'pause'} class={iconSize} /></button
		>
		<button
			class="{gridBtn} w-12 shrink-0"
			on:click={behavior.jumpForward}
			aria-label="Forward 5 seconds"><Icon name="forward" class={iconSize} /></button
		>
		<button
			class="{gridBtn} flex-1 gap-1.5 text-sm font-semibold tabular-nums {mobileSheet === 'controls'
				? 'bg-wash-strong'
				: ''}"
			on:click={() => toggleSheet('controls')}
			aria-pressed={mobileSheet === 'controls'}
			aria-label="Speed and flag controls"
		>
			<Icon name="adjustments-horizontal" class="h-5 w-5" />{Math.round(playbackRate * 100)}%
		</button>
		<button
			class="{gridBtn} w-12 shrink-0 {mobileSheet === 'piano' ? 'bg-wash-strong' : ''}"
			on:click={() => toggleSheet('piano')}
			aria-pressed={mobileSheet === 'piano'}
			aria-label="Piano"><Icon name="musical-note" class={iconSize} /></button
		>
	</div>

	{#if mobileSheet !== 'none'}
		<button
			type="button"
			transition:fade={{ duration: 150 }}
			class="fixed inset-0 z-40 cursor-default bg-ink/30 lg:hidden"
			on:click={() => (mobileSheet = 'none')}
			aria-label="Close panel"
		></button>
		<div
			transition:fly={{ y: 320, duration: 220, opacity: 1 }}
			class="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-paper p-4 shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.35)] lg:hidden"
			style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
		>
			<div class="mx-auto mb-4 h-1 w-10 rounded-full bg-staff"></div>
			{#if mobileSheet === 'controls'}
				<div class="flex flex-col gap-2">
					<div class="grid grid-cols-3 gap-2">
						<button class={gridBtn} on:click={behavior.slowDown} aria-label="Slow down"
							><Icon name="minus" class={iconSize} /></button
						>
						<button
							class="{gridBtn} font-semibold tabular-nums"
							on:click={resetSpeed}
							aria-label="Reset speed to 100%">{Math.round(playbackRate * 100)}%</button
						>
						<button class={gridBtn} on:click={behavior.speedUp} aria-label="Speed up"
							><Icon name="plus" class={iconSize} /></button
						>
					</div>
					<div class="grid grid-cols-4 gap-2">
						<button class={gridBtn} on:click={behavior.placeFlag} aria-label="Set flag"
							><Icon name="flag-solid" class="{iconSize} text-pencil" /></button
						>
						<button class={gridBtn} on:click={behavior.rewind} aria-label="Go to flag"
							><Icon name="flag" class="{iconSize} text-pencil" /></button
						>
						<button class={gridBtn} on:click={behavior.pushFlagBack} aria-label="Push flag back 1s"
							><Icon name="chevron-left" class={iconSize} /></button
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
