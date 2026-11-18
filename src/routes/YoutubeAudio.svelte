<script lang="ts">
	import { onMount, createEventDispatcher, onDestroy } from 'svelte';
	import { placeholderSeek, type AudioReady, type AudioCurrentTime } from './audio';

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

	// onReady fires once per player, not per video, so readiness comes from onStateChange
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
					error =
						"This video can't be played here. It may be private, removed, or blocked from embedding.";
					console.error('YouTube Player Error:', event.data);
					// drop the broken instance so the next load builds a fresh player
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

		// the IFrame API has no timeupdate event
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
		class="min-w-0 flex-1 rounded-lg border border-staff bg-paper px-3 py-2.5 placeholder:text-graphite focus:border-ink focus:outline-hidden"
	/>
	<button
		on:click={loadVideo}
		disabled={!apiReady}
		aria-busy={!apiReady}
		class="shrink-0 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:enabled:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40"
	>
		{apiReady ? 'Load video' : 'Loading player…'}
	</button>
</div>

<div id="youtube-player"></div>

{#if error}
	<p class="text-sm text-pencil" role="alert">{error}</p>
{/if}
