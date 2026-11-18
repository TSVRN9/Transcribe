<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { base } from '$app/paths';
	import type {
		AudioCurrentTime,
		AudioReady,
		PitchEvent,
		PitchEventDetail,
		PitchAnalyzer
	} from './audio';
	import { computeBasicPitch, computePitchgram, extractLines, mixToMono } from './pitchgram';
	import { sharedFile } from './shareTarget';

	const readyDispatch = createEventDispatcher<AudioReady>();
	const currentTimeDispatch = createEventDispatcher<AudioCurrentTime>();
	const pitchDispatch = createEventDispatcher<PitchEvent>();

	let audioFile: File | undefined;
	let handledShared: File | undefined;
	// consume once, or switching modes would reload a stale shared file
	$: if ($sharedFile && $sharedFile !== handledShared) {
		audioFile = handledShared = $sharedFile;
		sharedFile.set(undefined);
	}
	$: readyDispatch('ready', {
		isReady: !!audioFile,
		audioLength: audioFile ? duration : 0,
		seek: (t: number) => {
			time = t;
		}
	});
	$: currentTimeDispatch('currentTime', { currentTime: time });
	$: if (audioFile !== pitchFile) {
		pitchFile = audioFile;
		pitchCache.clear();
		pitchStatus = 'idle';
	}
	// one computation at a time; an analyzer switch mid-run waits, and cached results replay
	$: if (analyze && audioFile && pitchStatus !== 'computing') {
		const cached = pitchCache.get(analyzer);
		if (cached) pitchDispatch('pitch', cached);
		else computePitch(audioFile, analyzer);
	}

	let time: number = 0;
	let duration: number = 0;

	// revoke the previous blob URL, or every file in a session leaks
	let audioUrl: string | undefined;
	$: if (audioFile) {
		const nextUrl = URL.createObjectURL(audioFile);
		if (audioUrl) URL.revokeObjectURL(audioUrl);
		audioUrl = nextUrl;
	} else if (audioUrl) {
		URL.revokeObjectURL(audioUrl);
		audioUrl = undefined;
	}
	onMount(() => () => {
		if (audioUrl) URL.revokeObjectURL(audioUrl);
	});

	export let playbackRate: number = 1,
		paused: boolean = true,
		volume: number = 1,
		muted: boolean = false,
		analyze: boolean = false,
		analyzer: PitchAnalyzer = 'neural';

	let pitchFile: File | undefined;
	let pitchStatus: 'idle' | 'computing' = 'idle';
	// keyed by analyzer, cleared only when the file changes
	const pitchCache = new SvelteMap<
		PitchAnalyzer,
		PitchEventDetail & { status: 'done' | 'error' }
	>();

	async function computePitch(file: File, chosenAnalyzer: PitchAnalyzer) {
		pitchStatus = 'computing';
		if (file === audioFile && chosenAnalyzer === analyzer)
			pitchDispatch('pitch', { status: 'computing' });
		try {
			const arrayBuffer = await file.arrayBuffer();
			// basic-pitch needs 22050Hz mono
			const ctx = new OfflineAudioContext(1, 1, 22050);
			const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
			if (file !== audioFile) return; // file was swapped mid-decode — cache would be stale, drop it

			const samples = mixToMono(audioBuffer);
			const { result, lines, raw } =
				chosenAnalyzer === 'fft'
					? await (async () => {
							const result = await computePitchgram(samples, audioBuffer.sampleRate);
							return {
								result,
								lines: extractLines(result.frames, result.totalBins),
								raw: undefined
							};
						})()
					: await computeBasicPitch(
							samples,
							`${base}/basic-pitch-model/model.json`,
							duration,
							(partial) => {
								// stale: file or analyzer changed mid-analysis
								if (file === audioFile && chosenAnalyzer === analyzer)
									pitchDispatch('pitch', { status: 'computing', partial });
							}
						);
			if (file !== audioFile) return;

			const entry: PitchEventDetail & { status: 'done' } = {
				status: 'done',
				result,
				lines,
				raw: raw ?? { frames: [], onsets: [] }
			};
			pitchCache.set(chosenAnalyzer, entry);
			pitchStatus = 'idle';
			if (chosenAnalyzer === analyzer) pitchDispatch('pitch', entry);
		} catch (err) {
			console.error('pitch analysis failed', err);
			pitchStatus = 'idle';
			// not cached, so a transient failure (offline model fetch) retries on reopen
			if (file === audioFile && chosenAnalyzer === analyzer)
				pitchDispatch('pitch', { status: 'error' });
		}
	}
</script>

<label
	class="group relative flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-staff px-6 py-8 text-center transition-colors hover:border-ink has-[:focus-visible]:border-ink"
>
	<input
		type="file"
		accept="audio/*,.mp3,.ogg,.wav"
		on:change={(e) => (audioFile = e.currentTarget.files?.[0])}
		class="absolute inset-0 cursor-pointer opacity-0"
	/>
	{#if audioFile}
		<span class="max-w-full truncate text-lg font-semibold">{audioFile.name}</span>
		<span class="text-sm text-graphite">Drop or choose another file to replace it</span>
	{:else}
		<span class="text-lg font-semibold">Drop an audio file here</span>
		<span class="text-sm text-graphite">or click to choose one</span>
	{/if}
</label>
{#if audioFile && audioUrl}
	<!-- blur so a focused native control doesn't double-toggle on the global Space shortcut -->
	<audio
		controls
		src={audioUrl}
		bind:playbackRate
		bind:currentTime={time}
		bind:paused
		bind:volume
		bind:muted
		bind:duration
		on:play={(e) => e.currentTarget.blur()}
		on:pause={(e) => e.currentTarget.blur()}
		class="w-full"
	></audio>
{/if}
