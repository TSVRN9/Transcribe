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
<div class="grid">
    <div />
    <input type="file" accept=".mp3, .ogg, .wav" bind:files>
    <div />
</div>
<!-- Source -->
{#if audioFile}
<div class="grid">
    <div />            
    <audio controls src={URL.createObjectURL(audioFile)} 
        bind:playbackRate
        bind:currentTime={time}
        bind:paused
        bind:volume
        bind:muted
        bind:duration
    />
    <div />
</div>
{/if}