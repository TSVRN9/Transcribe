<script>
	import '../app.css';
	import { pwaInfo } from 'virtual:pwa-info';

	// not `$: ` — pwaInfo is a static import, never reassigned, so there's nothing reactive here
	const webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags — standard vite-plugin-pwa pattern; webManifestLink is a build-time constant from the plugin, not user input -->
	{@html webManifestLink}
</svelte:head>

<slot />
