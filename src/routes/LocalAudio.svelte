<script lang="ts">
	import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher<{ready: boolean}>();

    let files: FileList | undefined;
    $: audioFile = files == undefined ? undefined : files[0];
    $: dispatch('ready', !!audioFile);

    export let playbackRate: number = 1, 
        currentTime: number = 0, 
        paused: boolean = true, 
        volume: number = 1, 
        muted: boolean = false; 
</script>

<!-- Input -->
<article class="container">
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
            bind:currentTime
            bind:paused
            bind:volume
            bind:muted
        />
        <div />
    </div>
    {/if}
</article>
