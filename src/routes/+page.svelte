<script lang="ts">
    import { onMount } from 'svelte';
    import { tick } from 'svelte';

    import LocalAudio from './LocalAudio.svelte';
    import { invertObject, secondsToTime } from './utils';

    let mode: 'local' | 'youtube' = 'local';
    
    // playback control
    let start = 0; // also for flag
    let playbackRate: number = 1, 
        currentTime: number = 0, 
        paused: boolean = true, 
        volume: number = 1, 
        muted: boolean = false,
        isReady: boolean = false;
    const step = .1;

    function handleReady(fromMode: 'local' | 'youtube', e: CustomEvent<boolean>) {
        if (mode === fromMode)
            isReady = e.detail;
    }
    
    // behavior
    type Behavior = 'flag' | 'resetFlag' | 'rewind' | 'speedUp' | 'slowDown' | 'togglePlayback';
    
    const behavior: Record<Behavior, VoidFunction> = {
        flag: () => start = currentTime,
        resetFlag: () => start = 0,
        rewind: async () => {
            await tick();
            currentTime = start;
        },
        speedUp: () => playbackRate += step,
        slowDown: () => { if (playbackRate - step > 0) playbackRate -= step },
        togglePlayback: () => paused = !paused,
    }
    
    const { flag, resetFlag, rewind, speedUp, slowDown, togglePlayback } = behavior;
    
    // shortcuts
    const shortcuts: Record<string, Behavior> = {
        'v': 'resetFlag',
        'f': 'flag',
        'r': 'rewind',
        '>': 'speedUp',
        '<': 'slowDown',
        ' ': 'togglePlayback',
    };
    
    const behaviorToShortcuts: Record<Behavior, string> = invertObject(shortcuts);
    

    function getShortcut(b: Behavior) {
        return behaviorToShortcuts[b];
    }

    function keyup(event: KeyboardEvent) { 
        const b = shortcuts[event.key];
        if (b) behavior[b]();
    }
    
    onMount(() => {
        document.addEventListener('keyup', keyup);
    });
</script>

{#if mode === 'local'}
<LocalAudio 
    bind:playbackRate
    bind:currentTime
    bind:paused
    bind:volume
    bind:muted
    on:ready={e => handleReady('local', e)}
/>
{/if}


<div>
    {#if isReady}
    <article class="container">
        <section />
        <div class="centered">🚩: {secondsToTime(start)}</div>
        <section />
        <div class="grid">
            <button on:click={resetFlag} data-tooltip="Reset Flag ({getShortcut('resetFlag')})">❌</button>
            <button on:click={flag} data-tooltip="Flag ({getShortcut('flag')})">🚩</button>
            <button on:click={rewind} data-tooltip="Go Back ({getShortcut('rewind')})">⏮</button>
        </div>
        <div class="grid">
            <button on:click={slowDown} data-tooltip="Slow Down ({getShortcut('slowDown')})">🐢</button>
            <button>{Math.round(playbackRate * 10 ) * 10}%</button>
            <button on:click={speedUp} data-tooltip="Speed Up ({getShortcut('speedUp')})">🐇</button>
        </div>
    </article>
    {/if}
</div>

<style>
    .centered {
        text-align: center;
        width: 100%;
    }
</style>