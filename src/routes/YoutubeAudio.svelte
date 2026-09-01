<script lang="ts">
	import { onMount, createEventDispatcher, onDestroy } from 'svelte';
	import { placeholderSeek, type AudioReady, type AudioCurrentTime } from './audio';

	// defaulted to match LocalAudio's props — the two are meant to be interchangeable behind
	// the same parent contract (see audio.ts), so one shouldn't require what the other doesn't
	export let playbackRate: number = 1;
	export let paused: boolean = true;
	export let volume: number = 1;
	export let muted: boolean = false;

	const readyDispatch = createEventDispatcher<AudioReady>();
	const currentTimeDispatch = createEventDispatcher<AudioCurrentTime>();

	let tag: HTMLScriptElement | undefined;
	let apiReady = false;

	let videoLink = '';
	$: videoId = (() => {
		try {
			const url = new URL(videoLink);
			if (url.hostname == 'youtu.be') {
				return url.pathname.substring(1);
			} else {
				return videoLink ? new URLSearchParams(url.search).get('v') : undefined;
			}
		} catch {
			return undefined;
		}
	})();
	let player: YT.Player | undefined;
	let error = '';
	let intervalId: ReturnType<typeof setInterval>;

	const seek = (time: number) => player?.seekTo(time, true);

	// The IFrame API fires onReady once per player *instance*, not once per loaded video —
	// so readiness (and getDuration(), which changes per video) is dispatched from
	// onStateChange instead, which fires for every loadVideoById() call on the same
	// instance too. CUED covers a paused/first load, PLAYING covers autoplay kicking in.
	const loadVideo = () => {
		error = '';
		if (!apiReady) return; // button is disabled + labeled "Loading player…" in this state
		if (!videoId) {
			error = "Couldn't find a video ID in that link.";
			return;
		}

		if (player) {
			player.loadVideoById(videoId);
			return;
		}

		const youtubePlayer = new YT.Player('youtube-player', {
			width: 1,
			height: 1,
			videoId,
			playerVars: {
				autoplay: 1,
				controls: 0,
				disablekb: 1,
				enablejsapi: 1,
				iv_load_policy: 3,
				modestbranding: 1,
				playsinline: 1,
				origin: window.location.origin
			},
			events: {
				onReady: () => {
					player = youtubePlayer;
				},
				onError: (event: YT.OnErrorEvent) => {
					error = 'Error: Unable to play the video.';
					console.error('YouTube Player Error:', event.data);
					// don't leave a broken instance around — the next loadVideo() should build a
					// fresh player rather than take the loadVideoById branch on this one
					player?.destroy();
					player = undefined;
					readyDispatch('ready', { isReady: false, audioLength: 0, seek: placeholderSeek });
				},
				onStateChange: (event: YT.OnStateChangeEvent) => {
					if (event.data === YT.PlayerState.PLAYING) {
						paused = false;
					} else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
						paused = true;
					}
					if (event.data === YT.PlayerState.CUED || event.data === YT.PlayerState.PLAYING) {
						readyDispatch('ready', {
							isReady: true,
							audioLength: youtubePlayer.getDuration(),
							seek
						});
					}
				}
			}
		});
	};

	onMount(() => {
		if (typeof YT !== 'undefined' && YT.Player) {
			apiReady = true;
		} else {
			window.onYouTubeIframeAPIReady = () => {
				apiReady = true;
			};
			if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
				tag = document.createElement('script');
				tag.src = 'https://www.youtube.com/iframe_api';
				document.head.appendChild(tag);
			}
		}

		// the IFrame API has no timeupdate event; polling is the only option. 250ms rather
		// than 50ms — the transport display rounds to whole seconds anyway (secondsToTime in
		// utils.ts), so 50ms bought nothing visible while re-rendering the parent (and
		// PitchgramView's reactive block) 20 times a second regardless of whether anything's
		// even playing.
		intervalId = setInterval(() => {
			if (player)
				currentTimeDispatch('currentTime', {
					currentTime: player.getCurrentTime()
				});
		}, 250);
	});

	onDestroy(() => {
		player?.destroy();
		tag?.remove();
		clearInterval(intervalId);
	});

	// Per-prop reactive statements instead of one afterUpdate that fired all four calls on
	// every render regardless of which prop actually changed — also the direct portable
	// equivalent of $effect for a future runes migration, unlike afterUpdate (which doesn't
	// exist in runes mode at all).
	$: if (player && player.getPlaybackRate() !== playbackRate) player.setPlaybackRate(playbackRate);
	$: if (player) {
		if (paused) player.pauseVideo();
		else player.playVideo();
	}
	$: if (player) player.setVolume(volume * 100);
	$: if (player) {
		if (muted) player.mute();
		else player.unMute();
	}
</script>

<div class="flex gap-2">
	<input
		type="text"
		bind:value={videoLink}
		placeholder="Paste YouTube link"
		on:keydown={(e) => e.key === 'Enter' && loadVideo()}
		class="flex-1 rounded-md bg-stone-950 px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
	/>
	<button
		on:click={loadVideo}
		disabled={!apiReady}
		aria-busy={!apiReady}
		class="shrink-0 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium transition-colors hover:enabled:bg-amber-500 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:opacity-50"
	>
		{apiReady ? 'Load Video' : 'Loading player…'}
	</button>
</div>

<div id="youtube-player"></div>

{#if error}
	<div class="mt-2 text-sm text-red-400">{error}</div>
{/if}
