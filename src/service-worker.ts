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

// The basic-pitch model (.json + .bin) is deliberately excluded from the precache manifest
// (see vite.config.ts's globIgnores) so visitors who never open the pitchgram don't pay for
// it. This caches it the first time it's actually requested instead, and serves cache-first
// after that — same offline support the eager precache would have given, just paid for by
// the people who actually use the feature.
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

// Stale-while-revalidate, not plain cache-first: the model files aren't content-hashed (they're
// static/ passthroughs, not part of the build's asset pipeline), so a redeployed model update
// would otherwise serve the old cached bytes forever — the URL never changes to bust it. Serving
// the cached copy immediately (fast, works offline) while a background fetch refreshes the cache
// for next time means a redeploy self-heals within one extra load instead of staying stale.
async function handleModelRequest(request: Request): Promise<Response> {
	const cache = await caches.open(MODEL_CACHE);
	const cached = await cache.match(request);
	const refresh = fetch(request).then((response) => {
		if (response.ok) cache.put(request, response.clone());
		return response;
	});
	if (cached) {
		refresh.catch(() => {}); // best-effort background refresh — offline/network errors here are fine, the cached copy already served
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
