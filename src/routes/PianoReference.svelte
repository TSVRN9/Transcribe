<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { OCTAVE_START, OCTAVE_COUNT } from './pitchgram';
	import Icon from './Icon.svelte';

	let open = true;

	const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
	const BLACK_NAMES = ['C#', 'D#', '', 'F#', 'G#', 'A#', '']; // '' = no black key after this white key (E, B)
	const BLACK_SEMITONES = [1, 3, -1, 6, 8, 10, -1];

	// fixed key widths so the strip scrolls instead of squeezing 5 octaves
	const TOTAL_WHITE = OCTAVE_COUNT * 7;
	const KEY_WIDTH = 40; // px
	const BLACK_WIDTH = KEY_WIDTH * 0.6;
	const STRIP_WIDTH = TOTAL_WHITE * KEY_WIDTH;

	function midiOf(octave: number, semitone: number): number {
		return (octave + 1) * 12 + semitone; // MIDI 60 = C4
	}
	function midiToFreq(midi: number): number {
		return 440 * 2 ** ((midi - 69) / 12);
	}

	const whiteKeys = Array.from({ length: TOTAL_WHITE }, (_, i) => {
		const octave = OCTAVE_START + Math.floor(i / 7);
		return {
			name: WHITE_NAMES[i % 7],
			octave,
			midi: midiOf(octave, WHITE_SEMITONES[i % 7]),
			left: i * KEY_WIDTH
		};
	});
	const blackKeys = Array.from({ length: TOTAL_WHITE }, (_, i) => {
		const semitone = BLACK_SEMITONES[i % 7];
		const octave = OCTAVE_START + Math.floor(i / 7);
		return {
			name: BLACK_NAMES[i % 7],
			afterIndex: i,
			midi: semitone < 0 ? -1 : midiOf(octave, semitone),
			left: (i + 1) * KEY_WIDTH - BLACK_WIDTH / 2
		};
	}).filter((k) => k.name);

	// lazily, on first press: no AudioContext during prerender
	let audioCtx: AudioContext | undefined;

	// Rhodes-like: near-sine fundamental, fast-fading bright 2nd harmonic, short x7 pickup click
	const HARMONICS = [
		{ mult: 1, amp: 0.9, decay: 3.5 },
		{ mult: 2, amp: 0.5, decay: 0.7 },
		{ mult: 4, amp: 0.15, decay: 0.3 },
		{ mult: 7, amp: 0.25, decay: 0.06 }
	];
	const RELEASE = 0.12; // fast damp on key-up, like a real damper stopping the tine
	const MAX_HOLD = 8; // safety net if a pointerup is ever missed (e.g. capture lost)

	function startNote(midi: number) {
		if (!audioCtx) audioCtx = new AudioContext();
		const ctx = audioCtx;
		const now = ctx.currentTime;
		const freq = midiToFreq(midi);
		const master = ctx.createGain();
		master.gain.setValueAtTime(1, now);
		master.connect(ctx.destination);
		const oscs = HARMONICS.map((h) => {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq * h.mult;
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0, now);
			gain.gain.linearRampToValueAtTime(h.amp, now + 0.004); // fast hammer-strike attack
			gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, h.amp * 0.15), now + h.decay);
			osc.connect(gain).connect(master);
			osc.start(now);
			osc.stop(now + MAX_HOLD);
			return osc;
		});
		return {
			stop() {
				const t = ctx.currentTime;
				master.gain.cancelScheduledValues(t);
				master.gain.setValueAtTime(master.gain.value, t);
				master.gain.exponentialRampToValueAtTime(0.0001, t + RELEASE);
				oscs.forEach((o) => o.stop(t + RELEASE));
			}
		};
	}

	// pointer capture + manual hit-testing so press-and-slide plays a glissando.
	// id is a pointerId or "kbd:<key>", so touch and typing can sound notes together
	type NoteSourceId = number | string;
	const activeVoices = new SvelteMap<NoteSourceId, { stop: VoidFunction }>();
	const activeMidi = new SvelteMap<NoteSourceId, number>(); // source id -> currently sounding midi
	const pressedMidis = new SvelteSet<number>(); // currently sounding midis, for key highlighting

	// key rects measured once per gesture: elementFromPoint on every move forced layout and lagged
	let whiteRects: { midi: number; left: number; right: number }[] = [];
	let blackRects: { midi: number; left: number; right: number; bottom: number }[] = [];

	function captureRects(container: HTMLElement) {
		whiteRects = Array.from(container.querySelectorAll<HTMLElement>('[data-white]')).map((el) => {
			const r = el.getBoundingClientRect();
			return { midi: Number(el.dataset.white), left: r.left, right: r.right };
		});
		blackRects = Array.from(container.querySelectorAll<HTMLElement>('[data-black]')).map((el) => {
			const r = el.getBoundingClientRect();
			return { midi: Number(el.dataset.black), left: r.left, right: r.right, bottom: r.bottom };
		});
	}

	function keyAt(x: number, y: number): number | undefined {
		// black keys sit on top, check them first
		for (const k of blackRects) {
			if (x >= k.left && x <= k.right && y <= k.bottom) return k.midi;
		}
		for (const k of whiteRects) {
			if (x >= k.left && x <= k.right) return k.midi;
		}
		return undefined;
	}

	function setActiveKey(id: NoteSourceId, midi: number) {
		activeVoices.get(id)?.stop();
		activeVoices.set(id, startNote(midi));
		const prevMidi = activeMidi.get(id);
		if (prevMidi !== undefined && ![...activeMidi.values()].includes(prevMidi)) {
			pressedMidis.delete(prevMidi);
		}
		activeMidi.set(id, midi);
		pressedMidis.add(midi);
	}

	function releaseKey(id: NoteSourceId) {
		activeVoices.get(id)?.stop();
		activeVoices.delete(id);
		const midi = activeMidi.get(id);
		activeMidi.delete(id);
		if (midi !== undefined && ![...activeMidi.values()].includes(midi)) pressedMidis.delete(midi);
	}

	function onPointerDown(e: PointerEvent) {
		captureRects(e.currentTarget as HTMLElement);
		const midi = keyAt(e.clientX, e.clientY);
		if (midi === undefined) return;
		e.preventDefault();
		// preventDefault cancelled click-to-focus, so focus explicitly to enable typing
		(e.currentTarget as HTMLElement).focus();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		setActiveKey(e.pointerId, midi);
	}
	function onPointerMove(e: PointerEvent) {
		if (!activeMidi.has(e.pointerId)) return;
		const midi = keyAt(e.clientX, e.clientY);
		if (midi === undefined || midi === activeMidi.get(e.pointerId)) return;
		setActiveKey(e.pointerId, midi);
	}
	function onPointerUp(e: PointerEvent) {
		releaseKey(e.pointerId);
	}

	// musical typing: home row = white keys, row above = black, rooted at the visible octave
	const KEY_MAP: Record<string, number> = {
		a: 0,
		w: 1,
		s: 2,
		e: 3,
		d: 4,
		f: 5,
		t: 6,
		g: 7,
		y: 8,
		h: 9,
		u: 10,
		j: 11,
		k: 12,
		o: 13,
		l: 14,
		p: 15,
		';': 16
	};

	// keep 's'/'f' etc. from also firing the transport shortcuts
	function onKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
		const offset = KEY_MAP[e.key.toLowerCase()];
		if (offset === undefined) return;
		e.preventDefault();
		e.stopPropagation();
		setActiveKey(`kbd:${e.key.toLowerCase()}`, midiOf(octaveLabel, offset));
	}
	function onKeyUp(e: KeyboardEvent) {
		const offset = KEY_MAP[e.key.toLowerCase()];
		if (offset === undefined) return;
		e.stopPropagation();
		releaseKey(`kbd:${e.key.toLowerCase()}`);
	}
	// release held notes on blur, or their keyup never arrives
	function onBlur() {
		for (const id of [...activeMidi.keys()]) {
			if (typeof id === 'string' && id.startsWith('kbd:')) releaseKey(id);
		}
	}

	let scrollEl: HTMLDivElement;
	let scrollLeft = 0;
	let clientWidth = 0;
	$: maxScroll = STRIP_WIDTH - clientWidth;
	$: octaveLabel = OCTAVE_START + Math.round(scrollLeft / (7 * KEY_WIDTH));
	$: keyLabelByMidi = new Map(
		Object.entries(KEY_MAP).map(([key, offset]) => [midiOf(octaveLabel, offset), key.toUpperCase()])
	);

	function nudgeOctave(delta: number) {
		scrollEl?.scrollBy({ left: delta * 7 * KEY_WIDTH, behavior: 'smooth' });
	}

	onMount(() => {
		// start around middle C
		scrollEl.scrollLeft = (4 - OCTAVE_START) * 7 * KEY_WIDTH - clientWidth / 3;
	});
</script>

<div>
	<button
		type="button"
		class="flex w-full items-center gap-2 py-1 text-sm font-semibold text-graphite hover:text-ink"
		on:click={() => (open = !open)}
		aria-expanded={open}
	>
		<Icon name="musical-note" class="h-4 w-4" />
		Piano
		<Icon
			name="chevron-left"
			class="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 {open
				? '-rotate-90'
				: 'rotate-90'}"
		/>
	</button>
	{#if open}
		<div transition:slide={{ duration: 200 }}>
			<div class="mt-3 flex items-center gap-3 text-sm text-graphite">
				<button
					class="rounded-md bg-wash p-2 text-ink hover:enabled:bg-wash-strong disabled:opacity-30"
					on:click={() => nudgeOctave(-1)}
					disabled={scrollLeft <= 0}
					aria-label="Scroll down an octave"><Icon name="chevron-left" class="h-4 w-4" /></button
				>
				<span class="w-8 text-center font-semibold text-ink tabular-nums">C{octaveLabel}</span>
				<button
					class="rounded-md bg-wash p-2 text-ink hover:enabled:bg-wash-strong disabled:opacity-30"
					on:click={() => nudgeOctave(1)}
					disabled={scrollLeft >= maxScroll}
					aria-label="Scroll up an octave"
					><Icon name="chevron-left" class="h-4 w-4 rotate-180" /></button
				>
			</div>
			<p id="piano-reference-keymap" class="sr-only">
				Type A, S, D, F, G, H, J, K, L, or semicolon to play the white keys, and W, E, T, Y, U, O,
				or P to play the black keys in between, rooted at the octave currently shown.
			</p>
			<!-- role=application: musical typing forwards every key; the keymap is described for screen readers -->
			<div
				class="mt-3 h-32 touch-pan-x overflow-x-auto rounded-xs outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper [&::-webkit-scrollbar]:hidden"
				bind:this={scrollEl}
				bind:clientWidth
				on:scroll={() => (scrollLeft = scrollEl.scrollLeft)}
				role="application"
				tabindex="0"
				aria-label="Piano keyboard reference — click or tab here, then type to play notes"
				aria-describedby="piano-reference-keymap"
				on:pointerdown={onPointerDown}
				on:pointermove={onPointerMove}
				on:pointerup={onPointerUp}
				on:pointercancel={onPointerUp}
				on:keydown={onKeyDown}
				on:keyup={onKeyUp}
				on:blur={onBlur}
			>
				<div class="relative h-full select-none" style="width: {STRIP_WIDTH}px">
					{#each whiteKeys as key (key.midi)}
						<button
							type="button"
							tabindex="-1"
							data-white={key.midi}
							class="absolute top-0 flex h-full flex-col items-center justify-between rounded-b-md border border-[#a3b1be] bg-white pt-1 pb-1.5 text-[10px] font-semibold text-[#1a2433] {pressedMidis.has(
								key.midi
							)
								? 'bg-[#c9d4de]!'
								: ''}"
							style="left: {key.left}px; width: {KEY_WIDTH}px"
						>
							<span class="text-[10px] text-[#56606c]">{keyLabelByMidi.get(key.midi) ?? ''}</span>
							<span>{key.name}{key.name === 'C' ? key.octave : ''}</span>
						</button>
					{/each}
					{#each blackKeys as key (key.midi)}
						<button
							type="button"
							tabindex="-1"
							data-black={key.midi}
							class="absolute top-0 z-10 flex h-[60%] flex-col items-center justify-between rounded-b-md border border-[#1a2433] bg-[#1a2433] pt-0.5 pb-1 text-[9px] font-semibold text-[#d2d9de] {pressedMidis.has(
								key.midi
							)
								? 'bg-[#56606c]!'
								: ''}"
							style="left: {key.left}px; width: {BLACK_WIDTH}px"
						>
							<span class="text-[9px] text-[#a3b1be]">{keyLabelByMidi.get(key.midi) ?? ''}</span>
							<span>{key.name}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
