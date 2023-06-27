<script lang="ts">
	import { onMount, afterUpdate, createEventDispatcher, onDestroy, tick } from 'svelte';
	// @ts-ignore
    import type YT from 'youtube';
	import { placeholderSeek, type AudioReady, type AudioCurrentTime } from './audio';

	export let playbackRate: number;
	export let paused: boolean;
	export let volume: number;
	export let muted: boolean;

    const readyDispatch = createEventDispatcher<AudioReady>();
    const currentTimeDispatch = createEventDispatcher<AudioCurrentTime>();
	
	let tag: HTMLScriptElement;

	let videoLink = '';
	$: videoId = (() => {
		try {
			return videoLink ? new URLSearchParams(new URL(videoLink).search).get('v') : undefined;
		} catch (e) {}
	})();
	let player: YT.Player | undefined;
	let error = '';
	let intervalId: NodeJS.Timer;

	const loadVideo = () => {
		console.log(videoId);
		if (!videoId) {
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
							player.seekTo(time);
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
					paused = event.data == YT.PlayerState.PAUSED;
				}
			}
		});
	};

	onMount(() => {
		tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';

		const head = document.head || document.getElementsByTagName('head')[0];
		head.appendChild(tag);

		intervalId = setInterval(() => {
			if (player)
				currentTimeDispatch('currentTime', {
					currentTime: player.getCurrentTime() 
				})
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