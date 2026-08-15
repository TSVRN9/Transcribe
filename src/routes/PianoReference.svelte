<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { OCTAVE_START, OCTAVE_COUNT } from './pitchgram';
	import Icon from './Icon.svelte';

	// expanded by default — this is the primary way to check pitch against a real key,
	// not a buried extra, so it shouldn't start collapsed
	let open = true;

	const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
	const BLACK_NAMES = ['C#', 'D#', '', 'F#', 'G#', 'A#', '']; // '' = no black key after this white key (E, B)
	const BLACK_SEMITONES = [1, 3, -1, 6, 8, 10, -1];

	// full C2..B6 range in one horizontally-scrollable strip (fixed pixel key widths, not
	// percentages, so scrolling reveals more keys instead of squeezing 5 octaves into one
	// screen-width row) — matches the pitchgram's own C2..B6 render window, see PitchgramView.
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

	// created lazily on first key press, client-side only — this component's <script>
	// also runs during the prerender/SSR pass, where AudioContext doesn't exist
	let audioCtx: AudioContext | undefined;

	// Rhodes-style electric piano tone, not a plucked string: a tine struck by a hammer
	// rings close to a pure sine, so the fundamental dominates and sustains long instead of
	// decaying fast. The characteristic "bell" comes from a strong 2nd harmonic that's
	// brighter than the fundamental at the very start but fades much quicker, mellowing the
	// note as it sustains. mult 7 is the pickup "bark" — a short, near-inharmonic click from
	// the tine's initial strike against the pickup, gone within ~60ms.
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

	// pointerdown/pointerup (not click) so a note sounds the instant a key is pressed and
	// stops the instant it's released, instead of waiting for a full click cycle and always
	// playing the same fixed-length decay regardless of how long the key is held.
	//
	// Pointer capture + manual hit-testing (not per-button pointer handlers) so a press-and-
	// slide plays a run of notes glissando-style, GarageBand-keyboard fashion: the pointer is
	// captured once on the key first touched, so the browser keeps routing move/up events to
	// this component instead of letting them fall through to native drag/text-selection as the
	// cursor crosses sibling keys — which is what made dragging across the keyboard feel like
	// it was dragging the page.
	// id is a pointerId (pointer/touch) or a "kbd:<key>" string (computer keyboard) — two
	// namespaces sharing one voice-management scheme, so touching and typing can both sound
	// notes at once without either stepping on the other's state.
	type NoteSourceId = number | string;
	const activeVoices = new SvelteMap<NoteSourceId, { stop: VoidFunction }>();
	const activeMidi = new SvelteMap<NoteSourceId, number>(); // source id -> currently sounding midi
	const pressedMidis = new SvelteSet<number>(); // currently sounding midis, for key highlighting

	// Hit-testing used to call document.elementFromPoint on every pointermove, which forces a
	// synchronous layout on every call — during a fast glissando slide that's dozens of forced
	// layouts a second, which is what made the keyboard feel laggy. Instead, measure every
	// key's rect once when a gesture starts (cheap: one batched read, not one per move) and
	// hit-test against those cached numbers for the rest of the gesture. Rects go stale if the
	// strip is scrolled mid-gesture by a second touch — acceptable, glissando + simultaneous
	// scroll-with-another-finger is not a real usage pattern here.
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
		// black keys render on top and only cover the strip's upper portion — check them first
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
		// preventDefault above also suppresses the browser's normal click-to-focus behavior
		// (since focusing is part of the default action it just cancelled) — focus explicitly
		// so a mouse click "activates" computer-keyboard note input the same way tabbing in does
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

	// Computer-keyboard input: classic "musical typing" layout (GarageBand/Ableton
	// convention) — the home row plays white keys, the row above plays black keys, rooted at
	// whatever octave is currently scrolled into view (octaveLabel below), so scrolling the
	// strip re-tunes what your QWERTY keys play. Keydown starts the note immediately (not on
	// some debounced/delayed trigger) for the same instant-response feel the pointer glissando
	// has; keyup releases it. event.repeat is skipped so holding a key doesn't re-strike the
	// note on every OS auto-repeat tick.
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

	// stopPropagation on every mapped key so it never reaches +page's document-level transport
	// shortcuts — 's' and 'f' are both note keys here and transport shortcuts (push flag back /
	// set flag) elsewhere. Scoped to only fire while this element actually has focus (click or
	// Tab to it), so typing normally everywhere else on the page is unaffected.
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
	// releases any still-held computer-keyboard notes if focus leaves mid-press (alt-tab, click
	// elsewhere) — otherwise a note could ring forever since its keyup would never arrive here
	function onBlur() {
		for (const id of [...activeMidi.keys()]) {
			if (typeof id === 'string' && id.startsWith('kbd:')) releaseKey(id);
		}
	}

	// horizontal scroll: native touch/trackpad panning does the real work (touch-action:
	// pan-x below, rather than the old two-octaves-at-a-time paging buttons); the ‹ › buttons
	// just nudge by an octave for people who'd rather click. octaveLabel tracks scroll
	// position so the readout stays meaningful while scrolling instead of going stale.
	let scrollEl: HTMLDivElement;
	let scrollLeft = 0;
	let clientWidth = 0;
	$: maxScroll = STRIP_WIDTH - clientWidth;
	$: octaveLabel = OCTAVE_START + Math.round(scrollLeft / (7 * KEY_WIDTH));
	// which on-screen key each QWERTY key currently plays, for the little letter badges below
	$: keyLabelByMidi = new Map(
		Object.entries(KEY_MAP).map(([key, offset]) => [midiOf(octaveLabel, offset), key.toUpperCase()])
	);

	function nudgeOctave(delta: number) {
		scrollEl?.scrollBy({ left: delta * 7 * KEY_WIDTH, behavior: 'smooth' });
	}

	onMount(() => {
		// start centered around middle C, same starting point the old paged view had
		scrollEl.scrollLeft = (4 - OCTAVE_START) * 7 * KEY_WIDTH - clientWidth / 3;
	});
</script>

<div class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2">
	<button
		type="button"
		class="flex w-full items-center gap-2 py-1 text-sm font-medium text-stone-300"
		on:click={() => (open = !open)}
		aria-expanded={open}
	>
		<Icon name="musical-note" class="h-4 w-4 text-amber-500" />
		Piano reference
		<Icon
			name="chevron-left"
			class="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 {open
				? '-rotate-90'
				: 'rotate-90'}"
		/>
	</button>
	{#if open}
		<div transition:slide={{ duration: 200 }}>
			<div class="mt-3 flex items-center justify-center gap-3 text-xs text-stone-400">
				<button
					class="rounded-sm border border-stone-600 p-2 hover:enabled:bg-stone-700 disabled:opacity-30"
					on:click={() => nudgeOctave(-1)}
					disabled={scrollLeft <= 0}
					aria-label="Scroll down an octave"><Icon name="chevron-left" class="h-4 w-4" /></button
				>
				<span class="font-mono">C{octaveLabel}</span>
				<button
					class="rounded-sm border border-stone-600 p-2 hover:enabled:bg-stone-700 disabled:opacity-30"
					on:click={() => nudgeOctave(1)}
					disabled={scrollLeft >= maxScroll}
					aria-label="Scroll up an octave"
					><Icon name="chevron-left" class="h-4 w-4 rotate-180" /></button
				>
			</div>
			<!-- tabindex + keydown/keyup here is intentional: role="application" is the WAI-ARIA
			     pattern for a custom keyboard-driven widget (musical typing), not a document region -->
			<div
				class="mt-3 h-32 touch-pan-x overflow-x-auto rounded-xs outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900 [&::-webkit-scrollbar]:hidden"
				bind:this={scrollEl}
				bind:clientWidth
				on:scroll={() => (scrollLeft = scrollEl.scrollLeft)}
				role="application"
				tabindex="0"
				aria-label="Piano keyboard reference — click or tab here, then type to play notes"
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
							class="absolute top-0 flex h-full flex-col items-center justify-between border border-stone-600 bg-stone-100 pt-1 pb-1 text-[10px] font-medium text-stone-700 {pressedMidis.has(
								key.midi
							)
								? 'bg-amber-300'
								: ''}"
							style="left: {key.left}px; width: {KEY_WIDTH}px"
						>
							<span class="font-mono text-[9px] text-amber-700"
								>{keyLabelByMidi.get(key.midi) ?? ''}</span
							>
							<span>{key.name}{key.name === 'C' ? key.octave : ''}</span>
						</button>
					{/each}
					{#each blackKeys as key (key.midi)}
						<button
							type="button"
							tabindex="-1"
							data-black={key.midi}
							class="absolute top-0 z-10 flex h-[60%] flex-col items-center justify-between rounded-b-sm border border-stone-950 bg-stone-900 pt-0.5 pb-1 text-[9px] font-medium text-stone-300 {pressedMidis.has(
								key.midi
							)
								? 'bg-amber-700'
								: ''}"
							style="left: {key.left}px; width: {BLACK_WIDTH}px"
						>
							<span class="font-mono text-[8px] text-amber-400"
								>{keyLabelByMidi.get(key.midi) ?? ''}</span
							>
							<span>{key.name}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
