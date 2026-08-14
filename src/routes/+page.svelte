<script lang="ts">
    import { onMount } from 'svelte';

    import LocalAudio from './LocalAudio.svelte';
	import YoutubeAudio from './YoutubeAudio.svelte';
    import { invertObject, secondsToTime } from './utils';
	import { placeholderSeek, type AudioReadyDetail, type SeekFunction } from './audio';

    let mode: 'local' | 'youtube' = 'local';

    function setMode(newMode: 'local' | 'youtube') {
        if (mode === newMode) return;
        mode = newMode;
        isReady = false;
        currentTime = 0;
        flag = 0;
        seek = placeholderSeek;
    }

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
    const jump = 5;
    const MIN_RATE = 0.25;
    const MAX_RATE = 2;

    function handleReady(fromMode: 'local' | 'youtube', e: CustomEvent<AudioReadyDetail>) {
        if (mode === fromMode) {
            isReady = e.detail.isReady;
            audiolength = e.detail.audioLength;
            seek = e.detail.seek;
        }
    }

    // behavior
    type Behavior = 'placeFlag' | 'pushFlagBack' | 'resetFlag' | 'rewind' | 'speedUp' | 'slowDown' | 'togglePlayback' | 'jumpBack' | 'jumpForward';

    const behavior: Record<Behavior, VoidFunction> = {
        placeFlag: () => flag = currentTime,
        pushFlagBack: () => flag = Math.max(0, flag - 1),
        resetFlag: () => flag = 0,
        rewind: () => seek(flag),
        speedUp: () => playbackRate = Math.min(MAX_RATE, Math.round((playbackRate + step) * 10) / 10),
        slowDown: () => playbackRate = Math.max(MIN_RATE, Math.round((playbackRate - step) * 10) / 10),
        togglePlayback: () => paused = !paused,
        jumpBack: () => seek(Math.max(0, currentTime - jump)),
        jumpForward: () => seek(Math.min(audiolength, currentTime + jump)),
    }

    const { placeFlag, resetFlag, rewind, speedUp, slowDown, togglePlayback, pushFlagBack, jumpBack, jumpForward } = behavior;

    // shortcuts
    const shortcuts: Record<string, Behavior> = {
        'v': 'resetFlag',
        's': 'pushFlagBack',
        'f': 'placeFlag',
        'r': 'rewind',
        '>': 'speedUp',
        '<': 'slowDown',
        ' ': 'togglePlayback',
        'ArrowLeft': 'jumpBack',
        'ArrowRight': 'jumpForward',
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
    };

    function tooltip(b: Behavior) {
        const key = getShortcut(b);
        return key === ' ' ? `${behaviorLabels[b]} (Space)` : `${behaviorLabels[b]} (${key})`;
    }

    function label(b: string) {
        return behaviorLabels[b as Behavior];
    }


    function getShortcut(b: Behavior) {
        return behaviorToShortcuts[b];
    }

    function keyup(event: KeyboardEvent) {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const b = shortcuts[event.key];
        if (b) behavior[b]();
    }

    onMount(() => {
        document.addEventListener('keyup', keyup);
        return () => document.removeEventListener('keyup', keyup);
    });
</script>

<header class="container">
    <hgroup>
        <h1>Transcribe</h1>
        <p>A simple media player for transcription work.</p>
    </hgroup>
</header>

<main class="container">
    <article>
        <div role="group">
            <button on:click={() => setMode('local')} disabled={mode === 'local'}>🎵 Local File</button>
            <button on:click={() => setMode('youtube')} disabled={mode === 'youtube'}>▶️ YouTube</button>
        </div>
    </article>

    <article>
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

    {#if isReady}
    <article>
        <div class="centered">
            <strong>⏱️ {secondsToTime(currentTime)}</strong>
            &nbsp;&nbsp;🚩 {secondsToTime(flag)}
        </div>

        <input type="range" aria-label="Seek" value={currentTime}
            on:input={e => seek(e.currentTarget.valueAsNumber)}
            min="0" max={audiolength} step="0.1" />

        <div class="grid">
            <button on:click={jumpBack} data-tooltip={tooltip('jumpBack')}>⏪</button>
            <button on:click={togglePlayback} data-tooltip={tooltip('togglePlayback')}>{paused ? '▶️' : '⏸'}</button>
            <button on:click={jumpForward} data-tooltip={tooltip('jumpForward')}>⏩</button>
        </div>
        <div class="grid">
            <button on:click={rewind} data-tooltip={tooltip('rewind')}>⏮</button>
            <button on:click={pushFlagBack} data-tooltip={tooltip('pushFlagBack')}>◀️</button>
            <button on:click={placeFlag} data-tooltip={tooltip('placeFlag')}>🚩</button>
            <button on:click={resetFlag} data-tooltip={tooltip('resetFlag')}>❌</button>
        </div>
        <div class="grid">
            <button on:click={slowDown} data-tooltip={tooltip('slowDown')}>🐢</button>
            <button disabled>{Math.round(playbackRate * 100)}%</button>
            <button on:click={speedUp} data-tooltip={tooltip('speedUp')}>🐇</button>
        </div>

        <details>
            <summary>Keyboard shortcuts</summary>
            <ul>
                {#each Object.entries(behaviorToShortcuts) as [b, key]}
                    <li><kbd>{key === ' ' ? 'Space' : key}</kbd> — {label(b)}</li>
                {/each}
            </ul>
        </details>
    </article>
    {/if}
</main>

<style>
    .centered {
        text-align: center;
        width: 100%;
    }
</style>