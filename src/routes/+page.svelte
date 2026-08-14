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

    const gridBtn = 'rounded-lg bg-slate-800 py-3 text-xl transition-colors hover:enabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed';
    const modeBtn = 'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-default';
</script>

<header class="mx-auto max-w-xl px-4 pt-10 pb-6 text-center">
    <h1 class="text-3xl font-bold">Transcribe</h1>
    <p class="mt-1 text-slate-400">A simple media player for transcription work.</p>
</header>

<main class="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-12">
    <div class="flex gap-2 rounded-xl bg-slate-800/50 p-4">
        <button class="{modeBtn} {mode === 'local' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}"
            on:click={() => setMode('local')} disabled={mode === 'local'}>🎵 Local File</button>
        <button class="{modeBtn} {mode === 'youtube' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}"
            on:click={() => setMode('youtube')} disabled={mode === 'youtube'}>▶️ YouTube</button>
    </div>

    <div class="rounded-xl bg-slate-800/50 p-4">
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
    </div>

    {#if isReady}
    <div class="flex flex-col gap-4 rounded-xl bg-slate-800/50 p-4">
        <div class="flex justify-center gap-6 font-mono text-lg">
            <strong>⏱️ {secondsToTime(currentTime)}</strong>
            <span>🚩 {secondsToTime(flag)}</span>
        </div>

        <input type="range" aria-label="Seek" value={currentTime}
            on:input={e => seek(e.currentTarget.valueAsNumber)}
            min="0" max={audiolength} step="0.1"
            class="w-full accent-blue-500" />

        <div class="grid grid-cols-3 gap-2">
            <button class={gridBtn} on:click={jumpBack} title={tooltip('jumpBack')}>⏪</button>
            <button class={gridBtn} on:click={togglePlayback} title={tooltip('togglePlayback')}>{paused ? '▶️' : '⏸'}</button>
            <button class={gridBtn} on:click={jumpForward} title={tooltip('jumpForward')}>⏩</button>
        </div>
        <div class="grid grid-cols-4 gap-2">
            <button class={gridBtn} on:click={rewind} title={tooltip('rewind')}>⏮</button>
            <button class={gridBtn} on:click={pushFlagBack} title={tooltip('pushFlagBack')}>◀️</button>
            <button class={gridBtn} on:click={placeFlag} title={tooltip('placeFlag')}>🚩</button>
            <button class={gridBtn} on:click={resetFlag} title={tooltip('resetFlag')}>❌</button>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <button class={gridBtn} on:click={slowDown} title={tooltip('slowDown')}>🐢</button>
            <button class="{gridBtn} font-mono text-sm" disabled>{Math.round(playbackRate * 100)}%</button>
            <button class={gridBtn} on:click={speedUp} title={tooltip('speedUp')}>🐇</button>
        </div>

        <details class="rounded-lg bg-slate-900/50 px-3 py-2">
            <summary class="cursor-pointer text-sm font-medium text-slate-300">Keyboard shortcuts</summary>
            <ul class="mt-2 space-y-1 text-sm text-slate-400">
                {#each Object.entries(behaviorToShortcuts) as [b, key]}
                    <li><kbd class="rounded border border-slate-600 bg-slate-700 px-1.5 py-0.5 font-mono text-xs">{key === ' ' ? 'Space' : key}</kbd> — {label(b)}</li>
                {/each}
            </ul>
        </details>
    </div>
    {/if}
</main>