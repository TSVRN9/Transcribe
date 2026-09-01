// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	interface Window {
		// the YouTube IFrame API script (loaded in YoutubeAudio.svelte's onMount) calls this
		// global once it's ready — declared here instead of `(window as any)` so setting it
		// type-checks properly
		onYouTubeIframeAPIReady?: () => void;
	}
}

export {};
