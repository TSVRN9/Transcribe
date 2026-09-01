<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	import LocalAudio from './LocalAudio.svelte';
	import YoutubeAudio from './YoutubeAudio.svelte';
	import PitchgramView from './PitchgramView.svelte';
	import PianoReference from './PianoReference.svelte';
	import Icon from './Icon.svelte';
	import { invertObject, secondsToTime, gridBtn, primaryBtn, iconSize, panel } from './utils';
	import {
		placeholderSeek,
		type AudioReadyDetail,
		type SeekFunction,
		type PitchStatus,
		type PitchEventDetail,
		type PitchAnalyzer
	} from './audio';
	import type { Behavior } from './behavior';
	import type { PitchgramResult, PitchLines, RawModelOutput } from './pitchgram';
	import { sharedFile } from './shareTarget';

	let mode: 'local' | 'youtube' = 'local';

	// a share-target hand-off always means "play this local file" — switch source even if
	// YouTube mode was active so LocalAudio mounts and can pick the file up. Skips the confirm
	// gate below: the user already made this choice by sharing a file into the app, a modal
	// asking them to confirm their own action would just be in the way (and if unanswered
	// would strand $sharedFile unconsumed, since a declined confirm leaves mode unchanged).
	$: if ($sharedFile && mode !== 'local') setMode('local', { confirm: false });

	// two-screen flow: pick a source, then the player. 'select' stays mounted underneath
	// (hidden via CSS, not {#if}) so LocalAudio/YoutubeAudio never unmount and lose
	// playback/decoded state when the user comes back to change source.
	let screen: 'select' | 'player' = 'select';

	// Switching source unmounts the losing component (LocalAudio/YoutubeAudio, see the
	// {#if mode ...} below), which silently drops its loaded file/video, flag position, and
	// any completed pitch analysis. Confirm first whenever there's something real to lose —
	// this is a UI guard, not a fix for the underlying unmount (see the comment at the
	// {#if mode ...} block for why keeping both mounted isn't the easy swap it looks like).
	function setMode(newMode: 'local' | 'youtube', { confirm: shouldConfirm = true } = {}) {
		if (mode === newMode) return;
		if (
			shouldConfirm &&
			(isReady || flag > 0) &&
			!confirm(
				'Switching source will discard the current file/video, flag, and pitch analysis. Continue?'
			)
		)
			return;
		mode = newMode;
		isReady = false;
		currentTime = 0;
		flag = 0;
		seek = placeholderSeek;
		pitchgramOpen = false;
		screen = 'select';
		// pitchStatus/pitchResult/pitchLines/pitchRaw aren't reset by handlePitch until the new
		// mode's source dispatches its own 'pitch' event — reset them here too, so a pitchgram
		// opened before that happens doesn't render the old mode's analysis against this mode's
		// (zero) duration.
		pitchStatus = 'idle';
		pitchResult = undefined;
		pitchLines = undefined;
		pitchRaw = undefined;
	}

	// pitchgram view (local audio only — YouTube gives no raw samples to analyze)
	let pitchgramOpen = false;
	let pitchStatus: PitchStatus = 'idle';
	let pitchAnalyzer: PitchAnalyzer = 'neural';
	let pitchResult: PitchgramResult | undefined;
	let pitchLines: PitchLines | undefined;
	let pitchRaw: RawModelOutput | undefined;

	function handlePitch(e: CustomEvent<PitchEventDetail>) {
		pitchStatus = e.detail.status;
		if (e.detail.status === 'done') {
			pitchResult = e.detail.result;
			pitchLines = e.detail.lines;
			pitchRaw = e.detail.raw;
		} else if (e.detail.status === 'computing' && e.detail.partial) {
			// a partial result while still computing — render it, but raw stays whatever it
			// was (Notes/Voices need the final onset/frame data, which only 'done' carries)
			pitchResult = e.detail.partial.result;
			pitchLines = e.detail.partial.lines;
		} else {
			pitchResult = undefined;
			pitchLines = undefined;
			pitchRaw = undefined;
		}
	}

	// playback control
	let flag = 0; // also for flag
	let playbackRate: number = 1,
		currentTime: number = 0,
		paused: boolean = true,
		volume: number = 1,
		muted: boolean = false,
		isReady: boolean = false,
		audiolength: number = 0,
		seek: SeekFunction = placeholderSeek;
	const step = 0.1;
	const jump = 5;
	const MIN_RATE = 0.25;
	const MAX_RATE = 2;

	function handleReady(fromMode: 'local' | 'youtube', e: CustomEvent<AudioReadyDetail>) {
		if (mode === fromMode) {
			isReady = e.detail.isReady;
			audiolength = e.detail.audioLength;
			seek = e.detail.seek;
			if (isReady) screen = 'player';
		}
	}

	// behavior
	const behavior: Record<Behavior, VoidFunction> = {
		placeFlag: () => (flag = currentTime),
		pushFlagBack: () => (flag = Math.max(0, flag - 1)),
		resetFlag: () => (flag = 0),
		rewind: () => seek(flag),
		speedUp: () => (playbackRate = Math.min(MAX_RATE, Math.round((playbackRate + step) * 10) / 10)),
		slowDown: () =>
			(playbackRate = Math.max(MIN_RATE, Math.round((playbackRate - step) * 10) / 10)),
		togglePlayback: () => (paused = !paused),
		jumpBack: () => seek(Math.max(0, currentTime - jump)),
		jumpForward: () => seek(Math.min(audiolength, currentTime + jump)),
		goToStart: () => seek(0),
		goToEnd: () => seek(audiolength)
	};

	const {
		placeFlag,
		resetFlag,
		rewind,
		speedUp,
		slowDown,
		togglePlayback,
		pushFlagBack,
		jumpBack,
		jumpForward
	} = behavior;

	// shortcuts
	const shortcuts: Record<string, Behavior> = {
		v: 'resetFlag',
		s: 'pushFlagBack',
		f: 'placeFlag',
		r: 'rewind',
		'>': 'speedUp',
		'<': 'slowDown',
		' ': 'togglePlayback',
		ArrowLeft: 'jumpBack',
		ArrowRight: 'jumpForward',
		Home: 'goToStart',
		End: 'goToEnd'
	};

	const behaviorToShortcuts: Record<Behavior, string> = invertObject(shortcuts);

	const behaviorLabels: Record<Behavior, string> = {
		placeFlag: 'Set flag',
		pushFlagBack: 'Push flag back 1s',
		resetFlag: 'Reset flag',
		rewind: 'Go to flag',
		speedUp: 'Speed up',
		slowDown: 'Slow down',
		togglePlayback: 'Play / pause',
		jumpBack: `Back ${jump}s`,
		jumpForward: `Forward ${jump}s`,
		goToStart: 'Go to start',
		goToEnd: 'Go to end'
	};

	function tooltip(b: Behavior) {
		const key = getShortcut(b);
		return key === ' ' ? `${behaviorLabels[b]} (Space)` : `${behaviorLabels[b]} (${key})`;
	}

	function label(b: string) {
		return behaviorLabels[b as Behavior];
	}

	function getShortcut(b: Behavior) {
		return behaviorToShortcuts[b];
	}

	// Elements that keep their own keyboard behavior instead of ours — text entry, native
	// <select>/<summary> (whose own arrow/Space handling our preventDefault below would
	// otherwise hijack), and anything contenteditable. <button> is deliberately NOT here:
	// Space after clicking Play should toggle playback once via our shortcut, not
	// scroll/re-click through the browser's own default too (see keydown's comment).
	const SHORTCUT_EXEMPT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY']);
	function isShortcutExempt(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		return !!el && (SHORTCUT_EXEMPT_TAGS.has(el.tagName) || el.isContentEditable);
	}

	// Repeatable while a key is held (native OS auto-repeat is exactly what you want for
	// ramping speed/seek). Everything else fires once per physical press only:
	// auto-repeating togglePlayback would flicker play/pause on every OS repeat, and
	// pushFlagBack deliberately isn't here either — the flag is a manually-placed marker
	// with no "undo" direction, so holding 's' walking it to 0 in under a second at OS
	// repeat rate would be a real, unrecoverable data-loss footgun, not a convenience.
	// `event.repeat` (native) distinguishes repeatable from one-shot without a manual timer.
	const REPEATABLE_BEHAVIORS: ReadonlySet<Behavior> = new Set([
		'jumpBack',
		'jumpForward',
		'speedUp',
		'slowDown'
	]);

	// Browsers apply their own default action to these keys on keydown — Space scrolls the
	// page and/or clicks whatever's focused, Home/End scroll the viewport, arrows nudge a
	// focused range input. Suppress the default whenever the key is one of ours so only our
	// shortcut runs. Firing the behavior here too (not on keyup) lets a held key auto-repeat
	// the shortcut the same way holding an arrow key repeats in any text field.
	function keydown(event: KeyboardEvent) {
		if (isShortcutExempt(event.target)) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const b = shortcuts[event.key];
		if (!b) return;
		event.preventDefault();
		if (event.repeat && !REPEATABLE_BEHAVIORS.has(b)) return;
		behavior[b]();
	}

	onMount(() => {
		document.addEventListener('keydown', keydown);
		return () => document.removeEventListener('keydown', keydown);
	});

	// Keyboard-shortcut legend: opened by default the first time only (then respects
	// whatever the user leaves it at), read from localStorage — the app's main value
	// proposition is otherwise invisible to a first-time user until they stumble onto it.
	// Starts closed for the prerendered/pre-mount render (no localStorage on the server);
	// onMount flips it open before paint if this browser hasn't seen it before.
	let shortcutsOpen = false;
	onMount(() => {
		shortcutsOpen = localStorage.getItem('transcribe-shortcuts-seen') !== '1';
	});
	function markShortcutsSeen() {
		localStorage.setItem('transcribe-shortcuts-seen', '1');
	}

	const modeBtn =
		'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-default';
	// tape-deck reels flanking the player panel — spin speed tracks playback rate, pause with playback.
	// Pure decoration (aria-hidden), so no padding/border/background — just the icon, bigger than a
	// normal control icon since it reads as faceplate detail, not something to click.
	$: reelSpinStyle = `animation-duration: ${2 / playbackRate}s; animation-play-state: ${paused ? 'paused' : 'running'}`;
</script>

<header
	class="relative mx-auto max-w-xl px-4 pt-10 pb-6 text-center {pitchgramOpen
		? 'lg:max-w-6xl'
		: ''}"
>
	{#if screen === 'player'}
		<button
			class="absolute top-9 left-4 rounded-md px-2 py-1 text-sm text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-200"
			on:click={() => (screen = 'select')}>← Change source</button
		>
	{/if}
	<h1
		class="font-display text-4xl font-semibold tracking-wide text-stone-100 uppercase"
		style="letter-spacing: 0.06em"
	>
		Transcribe
	</h1>
	<p class="mt-1 font-mono text-[11px] tracking-[0.3em] text-amber-500/70 uppercase">
		Model TR‑1 · Tape Transcription Unit
	</p>
</header>

<main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-12 {pitchgramOpen ? 'lg:max-w-6xl' : ''}">
	<div class="flex flex-col gap-4 {pitchgramOpen ? 'lg:flex-row lg:items-start' : ''}">
		<div
			class="flex flex-col gap-4 {pitchgramOpen
				? 'sr-only lg:not-sr-only lg:flex lg:w-96 lg:shrink-0'
				: ''}"
		>
			<!-- select screen: stays mounted (hidden via CSS, not {#if}) once a source is playing,
			     so LocalAudio/YoutubeAudio never lose their decoded/playback state. Uses sr-only
			     (clipped + off-screen) rather than display:none — Chrome suspends metadata loading
			     on a display:none <audio> element, which silently breaks seek/duration forever. -->
			<div class="flex flex-col gap-4 {screen === 'select' ? '' : 'sr-only'}">
				<div class="flex gap-2 {panel}">
					<button
						class="{modeBtn} flex items-center justify-center gap-1.5 {mode === 'local'
							? 'bg-amber-500 text-stone-950'
							: 'bg-stone-700 hover:bg-stone-600'}"
						on:click={() => setMode('local')}
						aria-pressed={mode === 'local'}
						><Icon name="musical-note" class="h-4 w-4" /> Local File</button
					>
					<button
						class="{modeBtn} flex items-center justify-center gap-1.5 {mode === 'youtube'
							? 'bg-amber-500 text-stone-950'
							: 'bg-stone-700 hover:bg-stone-600'}"
						on:click={() => setMode('youtube')}
						aria-pressed={mode === 'youtube'}><Icon name="film" class="h-4 w-4" /> YouTube</button
					>
				</div>

				<div class={panel}>
					<!-- Unmounts the losing source on switch (setMode's confirm guards the data loss).
					     Deliberately not "stays mounted, hidden" like the screen toggle above: paused/
					     playbackRate/volume/muted are bound to both LocalAudio and YoutubeAudio here —
					     if both were mounted at once, playing one would call playVideo()/setVolume() on
					     the other too via its own reactive afterUpdate, so only one may exist at a time. -->
					{#if mode === 'local'}
						<LocalAudio
							bind:playbackRate
							bind:paused
							bind:volume
							bind:muted
							analyze={pitchgramOpen}
							analyzer={pitchAnalyzer}
							on:ready={(e) => handleReady('local', e)}
							on:currentTime={(e) => (currentTime = e.detail.currentTime)}
							on:pitch={handlePitch}
						/>
					{:else if mode === 'youtube'}
						<YoutubeAudio
							bind:playbackRate
							bind:paused
							bind:volume
							bind:muted
							on:ready={(e) => handleReady('youtube', e)}
							on:currentTime={(e) => (currentTime = e.detail.currentTime)}
						/>
					{/if}
				</div>

				{#if isReady}
					<button
						class="rounded-md bg-stone-800 py-3 text-sm font-medium hover:bg-stone-700"
						on:click={() => (screen = 'player')}>→ Back to player</button
					>
				{/if}
			</div>

			{#if screen === 'player'}
				<div class="relative flex flex-col gap-4 {panel}">
					<span
						class="absolute -top-4 -left-4 animate-spin"
						style={reelSpinStyle}
						aria-hidden="true"
					>
						<Icon name="tape-reel" class="h-8 w-8 text-stone-500 sm:h-10 sm:w-10" />
					</span>
					<span
						class="absolute -top-4 -right-4 animate-spin"
						style={reelSpinStyle}
						aria-hidden="true"
					>
						<Icon name="tape-reel" class="h-8 w-8 text-stone-500 sm:h-10 sm:w-10" />
					</span>
					<div
						class="flex items-stretch justify-center divide-x divide-stone-800 rounded-sm border border-stone-800 bg-stone-950"
					>
						<div class="flex flex-1 items-center justify-center gap-2 px-4 py-2.5">
							<span
								class="font-mono text-lg tracking-[0.15em] text-amber-400"
								style="text-shadow: 0 0 8px rgba(251, 191, 36, 0.45)"
								>{secondsToTime(currentTime)}</span
							>
						</div>
						<div class="flex flex-1 items-center justify-center gap-2 px-4 py-2.5">
							<Icon name="flag-solid" class="h-4 w-4 text-orange-500" />
							<span
								class="font-mono text-lg tracking-[0.15em] text-orange-400"
								style="text-shadow: 0 0 8px rgba(251, 146, 60, 0.45)">{secondsToTime(flag)}</span
							>
						</div>
					</div>

					<input
						type="range"
						aria-label="Seek"
						value={currentTime}
						on:input={(e) => seek(e.currentTarget.valueAsNumber)}
						on:pointerup={(e) => e.currentTarget.blur()}
						min="0"
						max={audiolength}
						step="0.1"
						class="h-1.5 w-full appearance-none rounded-full bg-stone-800 accent-amber-500"
					/>

					<div class="grid grid-cols-3 gap-2">
						<button
							class={gridBtn}
							on:click={jumpBack}
							title={tooltip('jumpBack')}
							aria-label={tooltip('jumpBack')}><Icon name="backward" class={iconSize} /></button
						>
						<button
							class={primaryBtn}
							on:click={togglePlayback}
							title={tooltip('togglePlayback')}
							aria-label={tooltip('togglePlayback')}
							><Icon name={paused ? 'play' : 'pause'} class={iconSize} /></button
						>
						<button
							class={gridBtn}
							on:click={jumpForward}
							title={tooltip('jumpForward')}
							aria-label={tooltip('jumpForward')}><Icon name="forward" class={iconSize} /></button
						>
					</div>
					<div class="grid grid-cols-4 gap-2">
						<button
							class={gridBtn}
							on:click={rewind}
							title={tooltip('rewind')}
							aria-label={tooltip('rewind')}
							><Icon name="flag" class="{iconSize} text-orange-400" /></button
						>
						<button
							class={gridBtn}
							on:click={pushFlagBack}
							title={tooltip('pushFlagBack')}
							aria-label={tooltip('pushFlagBack')}
							><Icon name="chevron-left" class={iconSize} /></button
						>
						<button
							class={gridBtn}
							on:click={placeFlag}
							title={tooltip('placeFlag')}
							aria-label={tooltip('placeFlag')}
							><Icon name="flag-solid" class="{iconSize} text-orange-400" /></button
						>
						<button
							class={gridBtn}
							on:click={resetFlag}
							title={tooltip('resetFlag')}
							aria-label={tooltip('resetFlag')}><Icon name="x-mark" class={iconSize} /></button
						>
					</div>
					<div class="grid grid-cols-3 gap-2">
						<button
							class={gridBtn}
							on:click={slowDown}
							title={tooltip('slowDown')}
							aria-label={tooltip('slowDown')}><Icon name="minus" class={iconSize} /></button
						>
						<button
							class="{gridBtn} font-mono text-sm"
							on:click={() => (playbackRate = 1)}
							title="Reset speed to 100%"
							aria-label="Reset speed to 100%">{Math.round(playbackRate * 100)}%</button
						>
						<button
							class={gridBtn}
							on:click={speedUp}
							title={tooltip('speedUp')}
							aria-label={tooltip('speedUp')}><Icon name="plus" class={iconSize} /></button
						>
					</div>

					{#if mode === 'local'}
						<button
							class="flex items-center justify-center gap-2 rounded-md bg-stone-800 py-3 text-sm font-medium hover:bg-stone-700"
							on:click={() => (pitchgramOpen = true)}
							><Icon name="presentation-chart-line" class="h-5 w-5" /> Open Pitchgram</button
						>
					{:else}
						<p
							class="flex items-center justify-center gap-2 rounded-md border border-stone-800 py-3 text-center text-sm text-stone-500"
							title="Pitchgram analyzes raw audio samples, which the YouTube IFrame player never exposes — switch to a local file to use it."
						>
							<Icon name="presentation-chart-line" class="h-5 w-5" /> Pitchgram needs a local audio file
						</p>
					{/if}

					<details
						class="rounded-md border border-stone-800 bg-stone-950/50 px-3 py-2"
						bind:open={shortcutsOpen}
						on:toggle={markShortcutsSeen}
					>
						<summary class="cursor-pointer text-sm font-medium text-stone-300"
							>Keyboard shortcuts</summary
						>
						<ul class="mt-2 space-y-1 text-sm text-stone-400">
							{#each Object.entries(behaviorToShortcuts) as [b, key] (b)}
								<li>
									<kbd
										class="rounded-sm border border-stone-600 bg-stone-700 px-1.5 py-0.5 font-mono text-xs"
										>{key === ' ' ? 'Space' : key}</kbd
									>
									— {label(b)}
								</li>
							{/each}
						</ul>
					</details>
				</div>

				<PianoReference />
			{/if}
		</div>

		{#if pitchgramOpen}
			<div
				transition:fade={{ duration: 150 }}
				class="fixed inset-0 z-40 flex min-w-0 flex-col bg-stone-950 p-3 lg:static lg:inset-auto lg:z-auto lg:h-[75vh] lg:flex-1 lg:rounded-md lg:border lg:border-stone-800 lg:bg-stone-900 lg:p-4"
			>
				<PitchgramView
					status={pitchStatus}
					frames={pitchResult?.frames}
					lines={pitchLines}
					raw={pitchRaw}
					bind:analyzer={pitchAnalyzer}
					{currentTime}
					{flag}
					duration={audiolength}
					{seek}
					{paused}
					{playbackRate}
					{behavior}
					resetSpeed={() => (playbackRate = 1)}
					onClose={() => (pitchgramOpen = false)}
				/>
			</div>
		{/if}
	</div>
</main>
