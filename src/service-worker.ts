/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: (PrecacheEntry | string)[];
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// Web Share Target: files shared to this PWA arrive as a POST to this URL. GitHub Pages
// serves static files only, so there's no server to handle the POST — this service worker
// intercepts the navigation request itself, stashes the file in the Cache API, and redirects
// to a normal GET of the same page, which reads the file back out (see share-target/+page.svelte).
// (This file must be named src/service-worker.ts — @vite-pwa/sveltekit's injectManifest
// strategy only picks up SvelteKit's own service-worker build convention.)
const SHARE_TARGET_PATH = '/Transcribe/share-target/';
const SHARE_CACHE = 'share-target';
// origin-absolute (leading slash) so it resolves to the same Cache key regardless of which
// page's location.href the caller is resolving from — a bare string resolves relative to that
const SHARE_CACHE_KEY = '/shared-audio';

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
		event.respondWith(handleShareTarget(event.request));
	}
});

async function handleShareTarget(request: Request): Promise<Response> {
	const formData = await request.formData();
	const file = formData.get('audio');
	if (file instanceof File) {
		const cache = await caches.open(SHARE_CACHE);
		await cache.put(
			SHARE_CACHE_KEY,
			new Response(file, {
				headers: {
					'Content-Type': file.type,
					'X-Filename': encodeURIComponent(file.name)
				}
			})
		);
	}
	return Response.redirect(SHARE_TARGET_PATH, 303);
}
