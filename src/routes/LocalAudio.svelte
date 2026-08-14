<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { AudioCurrentTime, AudioReady } from './audio';
    const readyDispatch = createEventDispatcher<AudioReady>();
    const currentTimeDispatch = createEventDispatcher<AudioCurrentTime>();

    let files: FileList | undefined;
    $: audioFile = files == undefined ? undefined : files[0];
    $: readyDispatch('ready', {
        isReady: !!audioFile,
        audioLength: audioFile ? duration : 0,
        seek: (t: number) => { time = t; },
    });
    $: currentTimeDispatch('currentTime', { currentTime: time });

    let time: number = 0;
    let duration: number = 0;

    export let playbackRate: number = 1,
        paused: boolean = true,
        volume: number = 1,
        muted: boolean = false;
</script>

<!-- Input -->
<div class="flex justify-center">
    <input type="file" accept=".mp3, .ogg, .wav" bind:files
        class="text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-100 file:hover:bg-slate-600">
</div>
<!-- Source -->
{#if audioFile}
<div class="mt-3 flex justify-center">
    <audio controls src={URL.createObjectURL(audioFile)}
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