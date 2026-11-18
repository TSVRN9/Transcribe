/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: (PrecacheEntry | string)[];
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// Share target: GitHub Pages can't take the POST, so stash the file in the Cache API and
// redirect to a GET that reads it back (share-target/+page.svelte).
const SHARE_TARGET_PATH = '/Transcribe/share-target/';
const SHARE_CACHE = 'share-target';
const SHARE_CACHE_KEY = '/shared-audio'; // origin-absolute so every page resolves the same key

// the model isn't precached (see vite.config.ts); cache it on first use instead
const MODEL_CACHE = 'basic-pitch-model';
const MODEL_PATH_PREFIX = '/Transcribe/basic-pitch-model/';

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
		event.respondWith(handleShareTarget(event.request));
		return;
	}
	if (event.request.method === 'GET' && url.pathname.startsWith(MODEL_PATH_PREFIX)) {
		event.respondWith(handleModelRequest(event.request));
	}
});

// stale-while-revalidate: the model URLs aren't content-hashed, so a redeploy must still refresh them
async function handleModelRequest(request: Request): Promise<Response> {
	const cache = await caches.open(MODEL_CACHE);
	const cached = await cache.match(request);
	const refresh = fetch(request).then((response) => {
		if (response.ok) cache.put(request, response.clone());
		return response;
	});
	if (cached) {
		refresh.catch(() => {}); // offline is fine, the cached copy already served
		return cached;
	}
	return refresh;
}

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
