<script>
	import '../app.css';
	import { pwaInfo } from 'virtual:pwa-info';

	const webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags — build-time constant from vite-plugin-pwa -->
	{@html webManifestLink}
</svelte:head>

<slot />
