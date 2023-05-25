<script lang="ts">
	import { onMount, afterUpdate, createEventDispatcher, onDestroy, tick } from 'svelte';
	// @ts-ignore
    import type YT from 'youtube';

	export let playbackRate: number;
	export let currentTime: number;
	export let paused: boolean;
	export let volume: number;
	export let muted: boolean;

    const dispatch = createEventDispatcher<{ready: {isReady: boolean, audioLength: number}}>();
	
	let tag: HTMLScriptElement;

	let videoLink = '';
	$: videoId = videoLink ? new URLSearchParams(new URL(videoLink).search).get('v') : undefined;
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
					dispatch('ready', {
						isReady: true,
						audioLength: youtubePlayer.getDuration()
					});
				},
				onError: (event: any) => {
					error = 'Error: Unable to play the video.';
					console.error('YouTube Player Error:', event.data);
					dispatch('ready', {
						isReady: false,
						audioLength: 0
					});
				},
				onStateChange: (event: any) => {
					paused = event.data != YT.PlayerState.PLAYING;
				}
			}
		});
	};

	onMount(() => {
		tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';

		const head = document.head || document.getElementsByTagName('head')[0];
		head.appendChild(tag);

		intervalId = setInterval(async () => {
			await tick();
			currentTime = player?.getCurrentTime();
		}, 50);
	});

	onDestroy(() => {
		const head = document.head || document.getElementsByTagName('head')[0];
		head.removeChild(tag);

		clearInterval(intervalId);
	})

	afterUpdate(async () => {
 		if (player) {
			await tick();
			const epsilon = .5;
			if (player.getCurrentTime() > currentTime + epsilon || player.getCurrentTime() < currentTime - epsilon) {
				player.seekTo(currentTime, true);
			}
			if (player.getPlaybackRate() != playbackRate) {
				player.setPlaybackRate(playbackRate);
			}
// 			if (paused) {
// 				player.pauseVideo();
// 			} else {
// 				player.playVideo();
// 			}
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

<div>
	<section />
	<div id="youtube-player" />
	<section />
</div>

{#if error}
	<div>{error}</div>
{/if}
