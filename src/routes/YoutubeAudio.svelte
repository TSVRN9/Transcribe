<script lang="ts">
	import { onMount, afterUpdate, createEventDispatcher, onDestroy } from 'svelte';
	import { placeholderSeek, type AudioReady, type AudioCurrentTime } from './audio';

	export let playbackRate: number;
	export let paused: boolean;
	export let volume: number;
	export let muted: boolean;

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
		} catch (e) {
			return undefined;
		}
	})();
	let player: YT.Player | undefined;
	let error = '';
	let intervalId: ReturnType<typeof setInterval>;

	const loadVideo = () => {
		error = '';
		if (!videoId || !apiReady) {
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
					readyDispatch('ready', {
						isReady: true,
						audioLength: youtubePlayer.getDuration(),
						seek: (time: number) => {
							player?.seekTo(time, true);
						}
					});
				},
				onError: (event: any) => {
					error = 'Error: Unable to play the video.';
					console.error('YouTube Player Error:', event.data);
					readyDispatch('ready', {
						isReady: false,
						audioLength: 0,
						seek: placeholderSeek
					});
				},
				onStateChange: (event: any) => {
					if (event.data === YT.PlayerState.PLAYING) {
						paused = false;
					} else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
						paused = true;
					}
				}
			}
		});
	};

	onMount(() => {
		if (typeof YT !== 'undefined' && YT.Player) {
			apiReady = true;
		} else {
			(window as any).onYouTubeIframeAPIReady = () => { apiReady = true; };
			if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
				tag = document.createElement('script');
				tag.src = 'https://www.youtube.com/iframe_api';
				document.head.appendChild(tag);
			}
		}

		intervalId = setInterval(() => {
			if (player)
				currentTimeDispatch('currentTime', {
					currentTime: player.getCurrentTime()
				})
		}, 50);
	});

	onDestroy(() => {
		player?.destroy();
		tag?.remove();
		clearInterval(intervalId);
	})

	afterUpdate(() => {
 		if (player) {
			if (player.getPlaybackRate() != playbackRate) {
				player.setPlaybackRate(playbackRate);
			}
 			if (paused) {
 				player.pauseVideo();
 			} else {
 				player.playVideo();
 			}
			player.setVolume(volume * 100);
			if (muted) {
				player.mute();
			} else {
				player.unMute();
			};
		}
	});
</script>

<div class="flex gap-2">
	<input type="text" bind:value={videoLink} placeholder="Paste YouTube link"
		on:keydown={(e) => e.key === 'Enter' && loadVideo()}
		class="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
	<button on:click={loadVideo} disabled={!apiReady} aria-busy={!apiReady}
		class="shrink-0 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium transition-colors hover:enabled:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50">
		{apiReady ? 'Load Video' : 'Loading player…'}
	</button>
</div>

<div id="youtube-player"></div>

{#if error}
	<div class="mt-2 text-sm text-red-400">{error}</div>
{/if}