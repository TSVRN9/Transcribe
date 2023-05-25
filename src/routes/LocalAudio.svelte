<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
    const dispatch = createEventDispatcher<{ready: {isReady: boolean, audioLength: number}}>();

    let files: FileList | undefined;
    $: audioFile = files == undefined ? undefined : files[0];
    $: dispatch('ready', {
        isReady: !!audioFile,
        audioLength: audioFile ? duration : 0
    });

    let time: number = 0;
    let duration: number = 0;
    
    export let playbackRate: number = 1, 
        currentTime: number = 0, 
        paused: boolean = true, 
        volume: number = 1, 
        muted: boolean = false; 
    
    async function setTime(n: number) {
        await tick();
        time = n;
        paused = false;
    }

    $: setTime(currentTime);
    $: currentTime = time;
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