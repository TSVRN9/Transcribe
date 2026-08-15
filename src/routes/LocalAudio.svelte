<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { base } from '$app/paths';
	import type { AudioCurrentTime, AudioReady, PitchEvent, PitchAnalyzer } from './audio';
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
	$: if (audioFile !== pitchFile || analyzer !== pitchAnalyzerUsed) resetPitch();
	// analyze is set true once the caller opens the pitchgram view; compute lazily, once per
	// file+analyzer combination
	$: if (analyze && audioFile && pitchStatus === 'idle') computePitch(audioFile, analyzer);

	let time: number = 0;
	let duration: number = 0;

	export let playbackRate: number = 1,
		paused: boolean = true,
		volume: number = 1,
		muted: boolean = false,
		analyze: boolean = false,
		analyzer: PitchAnalyzer = 'neural';

	let pitchFile: File | undefined;
	let pitchAnalyzerUsed: PitchAnalyzer | undefined;
	let pitchStatus: 'idle' | 'computing' | 'error' | 'done' = 'idle';

	function resetPitch() {
		pitchFile = audioFile;
		pitchAnalyzerUsed = analyzer;
		pitchStatus = 'idle';
		pitchDispatch('pitch', { status: 'idle' });
	}

	async function computePitch(file: File, chosenAnalyzer: PitchAnalyzer) {
		pitchStatus = 'computing';
		pitchDispatch('pitch', { status: 'computing' });
		try {
			const arrayBuffer = await file.arrayBuffer();
			// basic-pitch requires mono audio at exactly 22050Hz; the FFT path doesn't strictly
			// need it, but decoding once at a fixed rate keeps both analyzers on the same footing
			const ctx = new OfflineAudioContext(1, 1, 22050);
			const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
			if (file !== audioFile) return; // file was swapped mid-decode

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
					: await computeBasicPitch(samples, `${base}/basic-pitch-model/model.json`);
			if (file !== audioFile || chosenAnalyzer !== analyzer) return;

			pitchStatus = 'done';
			pitchDispatch('pitch', {
				status: 'done',
				result,
				lines,
				raw: raw ?? { frames: [], onsets: [] }
			});
		} catch {
			pitchStatus = 'error';
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
		class="text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-100 file:hover:bg-slate-600"
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
