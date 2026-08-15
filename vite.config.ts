import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			base: '/Transcribe/',
			injectRegister: 'auto',
			// base must be repeated here (kit.base, not just the top-level `base` above) and
			// trailingSlash must match +layout.ts's trailingSlash = 'always' — otherwise the
			// plugin's auto-discovered route entries resolve wrong (e.g. the root route precache
			// entry becomes "/" instead of "/Transcribe/", a 404; "share-target" without the
			// trailing slash 307-redirects) and workbox refuses to precache a redirected or
			// missing response, which fails the whole service worker install.
			kit: { base: '/Transcribe/', trailingSlash: 'always' },
			// injectManifest (not the default generateSW) so the custom fetch handler in
			// src/service-worker.ts can intercept the share-target POST — generateSW only lets
			// you configure caching strategies, not arbitrary fetch logic.
			strategies: 'injectManifest',
			manifest: {
				scope: '/Transcribe',
				short_name: 'Transcribe',
				name: 'Transcribe',
				description: 'A simple, keyboard-driven media player for transcription work.',
				display: 'standalone',
				theme_color: '#000000',
				background_color: '#000000',
				icons: [
					{
						src: './pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: './pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: './pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
					}
				],
				share_target: {
					action: '/Transcribe/share-target/',
					method: 'POST',
					enctype: 'multipart/form-data',
					params: {
						files: [{ name: 'audio', accept: ['audio/*', '.mp3', '.ogg', '.wav'] }]
					}
				}
			},
			injectManifest: {
				// include the basic-pitch model (.json/.bin) so the pitchgram view also works offline
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2,json,bin}']
			}
		})
	]
});
