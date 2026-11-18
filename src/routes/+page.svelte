<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	import LocalAudio from './LocalAudio.svelte';
	import YoutubeAudio from './YoutubeAudio.svelte';
	import PitchgramView from './PitchgramView.svelte';
	import PianoReference from './PianoReference.svelte';
	import Icon from './Icon.svelte';
	import { invertObject, secondsToTime, gridBtn, primaryBtn, iconSize } from './utils';
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

	// a shared file always means local mode; no confirm, the user already chose by sharing
	$: if ($sharedFile && mode !== 'local') setMode('local', { confirm: false });

	// the select screen stays mounted under the player so the sources keep their state
	let screen: 'select' | 'player' = 'select';

	// switching unmounts the old source and loses its file, flag and analysis
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
		pitchStatus = 'idle';
		pitchResult = undefined;
		pitchLines = undefined;
		pitchRaw = undefined;
	}

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
			// raw stays as-is: Notes/Voices need the final onset/frame data
			pitchResult = e.detail.partial.result;
			pitchLines = e.detail.partial.lines;
		} else {
			pitchResult = undefined;
			pitchLines = undefined;
			pitchRaw = undefined;
		}
	}

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
		return `${behaviorLabels[b]} (${KEY_NAMES[key] ?? key})`;
	}

	const KEY_NAMES: Record<string, string> = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→' };

	function label(b: string) {
		return behaviorLabels[b as Behavior];
	}

	function getShortcut(b: Behavior) {
		return behaviorToShortcuts[b];
	}

	// these keep their own key handling; <button> isn't here so Space after a click toggles once
	const SHORTCUT_EXEMPT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY']);
	function isShortcutExempt(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		return !!el && (SHORTCUT_EXEMPT_TAGS.has(el.tagName) || el.isContentEditable);
	}

	// held keys repeat only for these; pushFlagBack would walk the flag to 0 with no undo
	const REPEATABLE_BEHAVIORS: ReadonlySet<Behavior> = new Set([
		'jumpBack',
		'jumpForward',
		'speedUp',
		'slowDown'
	]);

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

	// open on first visit only
	let shortcutsOpen = false;
	onMount(() => {
		shortcutsOpen = localStorage.getItem('transcribe-shortcuts-seen') !== '1';
	});
	function markShortcutsSeen() {
		localStorage.setItem('transcribe-shortcuts-seen', '1');
	}

	const modeBtn =
		'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors';
	$: progress = audiolength ? (currentTime / audiolength) * 100 : 0;
	$: flagPos = audiolength ? (flag / audiolength) * 100 : 0;
</script>

<header
	class="mx-auto flex max-w-2xl items-baseline justify-between gap-4 px-4 pt-8 pb-6 sm:px-6 {pitchgramOpen
		? 'lg:max-w-none lg:px-8'
		: ''}"
>
	<h1 class="wordmark text-3xl leading-none font-extrabold">Transcribe</h1>
	{#if screen === 'player'}
		<button
			class="rounded-md px-2 py-1 text-sm font-medium text-graphite transition-colors hover:bg-wash hover:text-ink"
			on:click={() => (screen = 'select')}>Change source</button
		>
	{/if}
</header>

<main
	class="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-16 sm:px-6 {pitchgramOpen
		? 'lg:max-w-none lg:px-8'
		: ''}"
>
	<div class="flex flex-col gap-6 {pitchgramOpen ? 'lg:flex-row lg:items-start' : ''}">
		<div
			class="flex flex-col gap-6 {pitchgramOpen
				? 'sr-only lg:not-sr-only lg:flex lg:w-[26rem] lg:shrink-0'
				: ''}"
		>
			<!-- sr-only, not display:none: Chrome stops loading metadata for a hidden <audio> -->
			<section class="flex flex-col gap-4 {screen === 'select' ? '' : 'sr-only'}">
				<div class="flex gap-1 rounded-lg bg-wash p-1" role="group" aria-label="Source">
					<button
						class="{modeBtn} {mode === 'local'
							? 'bg-paper text-ink shadow-sm'
							: 'text-graphite hover:text-ink'}"
						on:click={() => setMode('local')}
						aria-pressed={mode === 'local'}
						><Icon name="musical-note" class="h-4 w-4" /> File</button
					>
					<button
						class="{modeBtn} {mode === 'youtube'
							? 'bg-paper text-ink shadow-sm'
							: 'text-graphite hover:text-ink'}"
						on:click={() => setMode('youtube')}
						aria-pressed={mode === 'youtube'}><Icon name="film" class="h-4 w-4" /> YouTube</button
					>
				</div>

				<!-- one source at a time: both bind the same playback props and would both play -->
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

				{#if isReady}
					<button class="{gridBtn} text-sm font-semibold" on:click={() => (screen = 'player')}
						>Back to player</button
					>
				{/if}
			</section>

			{#if screen === 'player'}
				<section class="flex flex-col gap-5" aria-label="Player">
					<div class="flex items-end justify-between gap-4">
						<output
							class="timecode text-6xl leading-[0.85] font-bold sm:text-7xl"
							aria-label="Current time">{secondsToTime(currentTime)}</output
						>
						<button
							class="flex items-center gap-1.5 rounded-md px-2 py-1 text-pencil transition-colors hover:bg-wash"
							on:click={rewind}
							title={tooltip('rewind')}
							aria-label="{tooltip('rewind')}, flag at {secondsToTime(flag)}"
						>
							<Icon name="flag-solid" class="h-4 w-4" />
							<span class="timecode text-xl font-semibold">{secondsToTime(flag)}</span>
						</button>
					</div>

					<div class="relative" style="--p: {progress}%">
						<input
							type="range"
							aria-label="Seek"
							value={currentTime}
							on:input={(e) => seek(e.currentTarget.valueAsNumber)}
							on:pointerup={(e) => e.currentTarget.blur()}
							min="0"
							max={audiolength}
							step="0.1"
							class="seek"
						/>
						{#if flag > 0}
							<span
								class="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pencil"
								style="left: {flagPos}%"
								aria-hidden="true"
							></span>
						{/if}
					</div>

					<div class="grid grid-cols-[1fr_1.6fr_1fr] gap-2">
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
							><Icon name={paused ? 'play' : 'pause'} class="h-7 w-7" /></button
						>
						<button
							class={gridBtn}
							on:click={jumpForward}
							title={tooltip('jumpForward')}
							aria-label={tooltip('jumpForward')}><Icon name="forward" class={iconSize} /></button
						>
					</div>

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-[4fr_3fr] sm:gap-4">
						<div class="grid grid-cols-4 gap-2" role="group" aria-label="Flag">
							<button
								class={gridBtn}
								on:click={placeFlag}
								title={tooltip('placeFlag')}
								aria-label={tooltip('placeFlag')}
								><Icon name="flag-solid" class="{iconSize} text-pencil" /></button
							>
							<button
								class={gridBtn}
								on:click={rewind}
								title={tooltip('rewind')}
								aria-label={tooltip('rewind')}
								><Icon name="flag" class="{iconSize} text-pencil" /></button
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
								on:click={resetFlag}
								title={tooltip('resetFlag')}
								aria-label={tooltip('resetFlag')}><Icon name="x-mark" class={iconSize} /></button
							>
						</div>
						<div class="grid grid-cols-3 gap-2" role="group" aria-label="Speed">
							<button
								class={gridBtn}
								on:click={slowDown}
								title={tooltip('slowDown')}
								aria-label={tooltip('slowDown')}><Icon name="minus" class={iconSize} /></button
							>
							<button
								class="{gridBtn} timecode text-base font-semibold"
								on:click={() => (playbackRate = 1)}
								title="Reset speed to 100%"
								aria-label="Speed {Math.round(playbackRate * 100)}%, reset to 100%"
								>{Math.round(playbackRate * 100)}%</button
							>
							<button
								class={gridBtn}
								on:click={speedUp}
								title={tooltip('speedUp')}
								aria-label={tooltip('speedUp')}><Icon name="plus" class={iconSize} /></button
							>
						</div>
					</div>

					{#if mode === 'local'}
						<button
							class="{gridBtn} gap-2 text-sm font-semibold"
							on:click={() => (pitchgramOpen = true)}
							><Icon name="presentation-chart-line" class="h-5 w-5" /> Open pitchgram</button
						>
					{:else}
						<p class="text-sm text-graphite">
							Pitchgram works with audio files, not YouTube links.
						</p>
					{/if}
				</section>

				<PianoReference />

				<details class="group" bind:open={shortcutsOpen} on:toggle={markShortcutsSeen}>
					<summary
						class="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-graphite hover:text-ink"
					>
						<Icon
							name="chevron-left"
							class="h-4 w-4 rotate-180 transition-transform group-open:rotate-90"
						/>
						Keyboard shortcuts
					</summary>
					<ul class="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
						{#each Object.entries(behaviorToShortcuts) as [b, key] (b)}
							<li class="flex items-center gap-3">
								<kbd
									class="inline-block min-w-12 rounded-md border border-b-2 border-staff bg-paper px-1.5 text-center font-sans text-xs font-semibold"
									>{KEY_NAMES[key] ?? key}</kbd
								>
								<span class="text-graphite">{label(b)}</span>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>

		{#if pitchgramOpen}
			<div
				transition:fade={{ duration: 150 }}
				class="fixed inset-0 z-40 flex min-w-0 flex-col bg-paper p-3 lg:static lg:inset-auto lg:z-auto lg:h-[calc(100vh-8rem)] lg:min-h-[32rem] lg:flex-1 lg:p-0"
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

<style>
	.wordmark {
		font-stretch: 75%;
		letter-spacing: -0.01em;
	}
	.timecode {
		font-variant-numeric: tabular-nums;
		font-stretch: 75%;
		letter-spacing: -0.02em;
	}

	.seek {
		appearance: none;
		display: block;
		width: 100%;
		height: 24px;
		background: transparent;
		cursor: pointer;
	}
	.seek::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 9999px;
		background: linear-gradient(to right, var(--color-ink) var(--p), var(--color-staff) var(--p));
	}
	.seek::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		margin-top: -5px;
		border-radius: 50%;
		background: var(--color-ink);
		transition: transform 0.1s;
	}
	.seek:hover::-webkit-slider-thumb {
		transform: scale(1.25);
	}
	.seek::-moz-range-track {
		height: 6px;
		border-radius: 9999px;
		background: var(--color-staff);
	}
	.seek::-moz-range-progress {
		height: 6px;
		border-radius: 9999px;
		background: var(--color-ink);
	}
	.seek::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border: 0;
		border-radius: 50%;
		background: var(--color-ink);
		transition: transform 0.1s;
	}
	.seek:hover::-moz-range-thumb {
		transform: scale(1.25);
	}
</style>
