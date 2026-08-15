<script lang="ts">
	import { createEventDispatcher } from 'svelte';
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
	// consume once, then clear — otherwise switching away and back to local mode would
	// silently reload a stale shared file every time
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
	// a new file invalidates every cached analyzer result; switching analyzer on the same file
	// doesn't — see pitchCache below
	$: if (audioFile !== pitchFile) {
		pitchFile = audioFile;
		pitchCache.clear();
		pitchStatus = 'idle';
	}
	// analyze is set true once the caller opens the pitchgram view. Re-runs whenever analyzer
	// changes too (it's referenced below), so switching Neural <-> FFT lands here: a cached
	// result replays instantly, otherwise a fresh computation starts. pitchStatus === 'computing'
	// gates against starting a second computation while one's already in flight — switching
	// analyzer mid-computation just queues the new one for when the current one finishes,
	// rather than fighting it for the main thread.
	$: if (analyze && audioFile && pitchStatus !== 'computing') {
		const cached = pitchCache.get(analyzer);
		if (cached) pitchDispatch('pitch', cached);
		else computePitch(audioFile, analyzer);
	}

	let time: number = 0;
	let duration: number = 0;

	export let playbackRate: number = 1,
		paused: boolean = true,
		volume: number = 1,
		muted: boolean = false,
		analyze: boolean = false,
		analyzer: PitchAnalyzer = 'neural';

	let pitchFile: File | undefined;
	let pitchStatus: 'idle' | 'computing' = 'idle';
	// keyed by analyzer, cleared only when the file itself changes — switching between Neural
	// and FFT (or back to a view already open before) replays the cached result instead of
	// re-running the model/FFT from scratch
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
			// basic-pitch requires mono audio at exactly 22050Hz; the FFT path doesn't strictly
			// need it, but decoding once at a fixed rate keeps both analyzers on the same footing
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
					: await computeBasicPitch(samples, `${base}/basic-pitch-model/model.json`, duration);
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
		} catch {
			if (file === audioFile) pitchCache.set(chosenAnalyzer, { status: 'error' });
			pitchStatus = 'idle';
			if (file === audioFile && chosenAnalyzer === analyzer)
				pitchDispatch('pitch', { status: 'error' });
		}
	}
</script>

<!-- Input -->
<div class="flex justify-center">
	<input
		type="file"
		accept=".mp3, .ogg, .wav"
		on:change={(e) => (audioFile = e.currentTarget.files?.[0])}
		class="text-sm text-stone-400 file:mr-3 file:rounded-md file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-stone-100 file:hover:bg-amber-500"
	/>
</div>
<!-- Source -->
{#if audioFile}
	<div class="mt-3 flex justify-center">
		<audio
			controls
			src={URL.createObjectURL(audioFile)}
			bind:playbackRate
			bind:currentTime={time}
			bind:paused
			bind:volume
			bind:muted
			bind:duration
			class="w-full"
		></audio>
	</div>
{/if}
