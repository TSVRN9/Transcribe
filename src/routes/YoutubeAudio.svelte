<script lang="ts">
	import { onMount, afterUpdate, createEventDispatcher, onDestroy } from 'svelte';
	// @ts-ignore
    import type YT from 'youtube';

	export let playbackRate: number;
	export let currentTime: number;
	export let paused: boolean;
	export let volume: number;
	export let muted: boolean;

    const dispatch = createEventDispatcher<{ready: boolean}>();

	let videoLink = '';
	$: videoId = new URLSearchParams(new URL(videoLink).search).get('v');
	let player: YT.Player | undefined;
	let error = '';
	let intervalId: NodeJS.Timer;

	const loadVideo = () => {
		if (!videoId) {
			return;
		}

		const youtubePlayer = new YT.Player('youtube-player', {
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
					dispatch('ready', true);
				},
				onError: (event: any) => {
					error = 'Error: Unable to play the video.';
					console.error('YouTube Player Error:', event.data);
					dispatch('ready', false);
				},
				onStateChange: (event: any) => {
					paused = event.data == YT.PlayerState.PAUSED;
				}
			}
		});
	};

	onMount(() => {
		const tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';

		const head = document.head || document.getElementsByTagName('head')[0];
		head.appendChild(tag);

		intervalId = setInterval(() => {
			currentTime = player?.getCurrentTime();
		}, 50);
	});

	onDestroy(() => {
		const tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';

		const head = document.head || document.getElementsByTagName('head')[0];
		head.removeChild(tag);

		clearInterval(intervalId);
	})

	afterUpdate(() => {
		if (player) {
			player.setPlaybackRate(playbackRate);
			if (player.getCurrentTime() != currentTime) {
				player.seekTo(currentTime, true);
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

	$: {
		error = '';
	}
</script>

<div>
	<input type="text" bind:value={videoLink} placeholder="Paste YouTube link" />
	<button on:click={loadVideo}>Load Video</button>
</div>

<div id="youtube-player" />

{#if error}
	<div>{error}</div>
{/if}
