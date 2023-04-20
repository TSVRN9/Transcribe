<script lang="ts">
    let files: FileList | undefined;
    $: audioFile = files == undefined ? undefined : files[0];
    
    // playback control
    let start = 0; // also for flag
    let playbackRate: number = 1, currentTime: number = 0, paused: boolean = true, volume: number = 1, muted: boolean = false;
    
    // behavior
    type Behavior = 'flag' | 'resetFlag' | 'rewind' | 'speedUp' | 'slowDown' | 'togglePlayback';
    
    const behavior: Record<Behavior, VoidFunction> = {
        flag: () => start = currentTime,
        resetFlag: () => start = 0,
        rewind: () => currentTime = start,
        speedUp: () => playbackRate += .1,
        slowDown: () => playbackRate -= .1,
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
    
    // extract this maybe?
    type ObjectKey = string | number | symbol;
    function invertObject<K extends ObjectKey, V extends ObjectKey>(o: Record<K, V>): Record<V, K> {
        return Object.entries(o).reduce((p, [k, v]) => ({ ...p, v: k })) as Record<V, K>;
    }

</script>

<div on:keyup>
    <article class="container">
        <div class="grid">
            <div />
            <input type="file" accept=".mp3, .ogg, .wav" bind:files>
            <div />
        </div>
    </article>
    {#if audioFile}
    <article class="container">
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
            <section></section>
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