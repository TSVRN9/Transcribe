<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { sharedFile } from '../shareTarget';

	// must match SHARE_CACHE_KEY in src/service-worker.ts
	const SHARE_CACHE_KEY = '/shared-audio';

	onMount(async () => {
		try {
			const cache = await caches.open('share-target');
			const response = await cache.match(SHARE_CACHE_KEY);
			if (response) {
				const blob = await response.blob();
				const name = decodeURIComponent(response.headers.get('X-Filename') ?? 'shared-audio');
				sharedFile.set(new File([blob], name, { type: blob.type }));
				await cache.delete(SHARE_CACHE_KEY);
			}
		} catch (err) {
			// no Cache API in e.g. Safari private browsing
			console.error('failed to read shared file', err);
		} finally {
			goto(resolve('/'), { replaceState: true });
		}
	});
</script>

<p class="p-10 text-center text-graphite">Opening shared file…</p>
