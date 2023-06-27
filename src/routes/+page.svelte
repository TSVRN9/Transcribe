<script lang="ts">
    import { onMount, tick } from 'svelte';

    import LocalAudio from './LocalAudio.svelte';
	import YoutubeAudio from './YoutubeAudio.svelte';
    import { invertObject, secondsToTime } from './utils';
	import { placeholderSeek, type AudioReadyDetail, type SeekFunction } from './audio';

    let mode: 'local' | 'youtube' = 'local';
    
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
    const step = .1;

    function handleReady(fromMode: 'local' | 'youtube', e: CustomEvent<AudioReadyDetail>) {
        if (mode === fromMode) {
            isReady = e.detail.isReady;
            audiolength = e.detail.audioLength;
            seek = e.detail.seek;
        }
    }
    
    // behavior
    type Behavior = 'placeFlag' | 'pushFlagBack' | 'resetFlag' | 'rewind' | 'speedUp' | 'slowDown' | 'togglePlayback';
    
    const behavior: Record<Behavior, VoidFunction> = {
        placeFlag: () => flag = currentTime,
        pushFlagBack: () => flag = Math.max(0, flag - 1),
        resetFlag: () => flag = 0,
        rewind: async () => {
            await tick();
            seek(flag);
        },
        speedUp: () => playbackRate += step,
        slowDown: () => { if (playbackRate - step > 0) playbackRate -= step },
        togglePlayback: () => paused = !paused,
    }
    
    const { placeFlag, resetFlag, rewind, speedUp, slowDown, togglePlayback, pushFlagBack } = behavior;
    
    // shortcuts
    const shortcuts: Record<string, Behavior> = {
        'v': 'resetFlag',
        's': 'pushFlagBack',
        'f': 'placeFlag',
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

<article class="container">
    <button on:click={() => mode = mode == 'local' ? 'youtube' : 'local'}>Change Source</button>
</article>
<article class="container">
    {#if mode === 'local'}
        <LocalAudio 
            bind:playbackRate
            bind:paused
            bind:volume
            bind:muted
            on:ready={e => handleReady('local', e)}
            on:currentTime={e => currentTime = e.detail.currentTime }
        />
    {:else if mode === 'youtube'}
        <YoutubeAudio 
            bind:playbackRate
            bind:paused
            bind:volume
            bind:muted
            on:ready={e => handleReady('youtube', e)}
            on:currentTime={e => currentTime = e.detail.currentTime }
        />
    {/if}
</article>
<div>
    {#if isReady}
    <article class="container">
        <section />
        <div class="centered">⏱️: {secondsToTime(currentTime)}</div>
        <div class="centered">🚩: {secondsToTime(flag)}</div>
        <section />
        <div class="grid">
            <input type="range" value={currentTime} on:input={e => {
                // @ts-ignore
                seek(e.target.value);
            }} min="0" max={audiolength}/>
        </div>
        <div class="grid">
            <button on:click={rewind} data-tooltip="Go Back ({getShortcut('rewind')})">⏮</button>
            <button on:click={pushFlagBack} data-tooltip="Push Flag Back ({getShortcut('pushFlagBack')})">◀️</button>
            <button on:click={placeFlag} data-tooltip="Flag ({getShortcut('placeFlag')})">🚩</button>
            <button on:click={togglePlayback} data-tooltip="Pause/Unpause ({getShortcut('togglePlayback')})">{paused ? '▶️' : '⏸'}</button>
            <button on:click={resetFlag} data-tooltip="Reset Flag ({getShortcut('resetFlag')})">❌</button>
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