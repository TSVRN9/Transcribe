<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { OCTAVE_START, OCTAVE_COUNT } from './pitchgram';

	const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
	const BLACK_NAMES = ['C#', 'D#', '', 'F#', 'G#', 'A#', '']; // '' = no black key after this white key (E, B)
	const BLACK_SEMITONES = [1, 3, -1, 6, 8, 10, -1];

	// two octaves at a time, shiftable across the pitchgram's full C2..B6 range — keeps
	// keys touch-sized instead of cramming all 5 octaves into one row (see PitchgramView
	// for the range these line up with)
	const VISIBLE_OCTAVES = 2;
	const MIN_BASE_OCTAVE = OCTAVE_START;
	const MAX_BASE_OCTAVE = OCTAVE_START + OCTAVE_COUNT - VISIBLE_OCTAVES;
	let baseOctave = 4; // C4 = middle C, a familiar starting point

	function midiOf(octave: number, semitone: number): number {
		return (octave + 1) * 12 + semitone; // MIDI 60 = C4
	}
	function midiToFreq(midi: number): number {
		return 440 * 2 ** ((midi - 69) / 12);
	}
	function shiftOctave(delta: number) {
		baseOctave = Math.min(MAX_BASE_OCTAVE, Math.max(MIN_BASE_OCTAVE, baseOctave + delta));
	}

	$: whiteKeys = Array.from({ length: VISIBLE_OCTAVES * 7 }, (_, i) => {
		const octave = baseOctave + Math.floor(i / 7);
		return {
			name: WHITE_NAMES[i % 7],
			octave,
			midi: midiOf(octave, WHITE_SEMITONES[i % 7])
		};
	});
	$: blackKeys = Array.from({ length: VISIBLE_OCTAVES * 7 }, (_, i) => {
		const semitone = BLACK_SEMITONES[i % 7];
		const octave = baseOctave + Math.floor(i / 7);
		return {
			name: BLACK_NAMES[i % 7],
			afterIndex: i,
			midi: semitone < 0 ? -1 : midiOf(octave, semitone)
		};
	}).filter((k) => k.name);

	const whitePct = 100 / (VISIBLE_OCTAVES * 7); // key count is fixed, doesn't depend on baseOctave
	const blackPct = whitePct * 0.6;

	// created lazily on first key press, client-side only — this component's <script>
	// also runs during the prerender/SSR pass, where AudioContext doesn't exist
	let audioCtx: AudioContext | undefined;

	// additive harmonics approximating a struck string: higher partials are quieter and
	// decay faster than the fundamental, which is what makes a tone read as "piano" rather
	// than a flat sine beep
	const HARMONICS = [
		{ mult: 1, amp: 1, decay: 1.2 },
		{ mult: 2, amp: 0.55, decay: 0.9 },
		{ mult: 3, amp: 0.3, decay: 0.65 },
		{ mult: 4, amp: 0.18, decay: 0.5 },
		{ mult: 6, amp: 0.08, decay: 0.35 }
	];
	const RELEASE = 0.12; // fast damp on key-up, like a real damper stopping the string
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
	// playing the same fixed-length decay regardless of how long the key is held
	const activeVoices = new SvelteMap<number, { stop: VoidFunction }>();

	function onKeyDown(e: PointerEvent, midi: number) {
		activeVoices.get(e.pointerId)?.stop();
		activeVoices.set(e.pointerId, startNote(midi));
	}
	function onKeyUp(e: PointerEvent) {
		activeVoices.get(e.pointerId)?.stop();
		activeVoices.delete(e.pointerId);
	}
</script>

<details class="rounded-lg bg-slate-900/50 px-3 py-2">
	<summary class="cursor-pointer text-sm font-medium text-slate-300">🎹 Piano reference</summary>
	<div class="mt-3 flex items-center justify-center gap-3 text-xs text-slate-400">
		<button
			class="rounded-sm border border-slate-600 px-2 py-0.5 hover:enabled:bg-slate-700 disabled:opacity-30"
			on:click={() => shiftOctave(-1)}
			disabled={baseOctave <= MIN_BASE_OCTAVE}
			aria-label="Shift down an octave">‹</button
		>
		<span class="font-mono">C{baseOctave}–B{baseOctave + VISIBLE_OCTAVES - 1}</span>
		<button
			class="rounded-sm border border-slate-600 px-2 py-0.5 hover:enabled:bg-slate-700 disabled:opacity-30"
			on:click={() => shiftOctave(1)}
			disabled={baseOctave >= MAX_BASE_OCTAVE}
			aria-label="Shift up an octave">›</button
		>
	</div>
	<div class="relative mt-3 h-32 select-none">
		<div class="flex h-full gap-px">
			{#each whiteKeys as key (key.octave + key.name)}
				<button
					type="button"
					class="flex flex-1 touch-none items-end justify-center rounded-b-sm border border-slate-600 bg-slate-100 pb-1 text-[10px] font-medium text-slate-700 active:bg-slate-300"
					on:pointerdown={(e) => onKeyDown(e, key.midi)}
					on:pointerup={onKeyUp}
					on:pointercancel={onKeyUp}
					on:pointerleave={onKeyUp}>{key.name}{key.name === 'C' ? key.octave : ''}</button
				>
			{/each}
		</div>
		{#each blackKeys as key (key.afterIndex)}
			<button
				type="button"
				class="absolute top-0 flex h-[60%] touch-none items-end justify-center rounded-b-sm border border-slate-950 bg-slate-900 pb-1 text-[9px] font-medium text-slate-300 active:bg-slate-700"
				style="left: {(key.afterIndex + 1) * whitePct - blackPct / 2}%; width: {blackPct}%"
				on:pointerdown={(e) => onKeyDown(e, key.midi)}
				on:pointerup={onKeyUp}
				on:pointercancel={onKeyUp}
				on:pointerleave={onKeyUp}>{key.name}</button
			>
		{/each}
	</div>
</details>
