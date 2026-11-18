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
			// must repeat base and match +layout.ts's trailingSlash, or precache entries 404/redirect and the SW install fails
			kit: { base: '/Transcribe/', trailingSlash: 'always' },
			// injectManifest so src/service-worker.ts can handle the share-target POST
			strategies: 'injectManifest',
			manifest: {
				scope: '/Transcribe',
				short_name: 'Transcribe',
				name: 'Transcribe',
				description: 'A simple, keyboard-driven media player for transcription work.',
				display: 'standalone',
				theme_color: '#f3f5f4',
				background_color: '#f3f5f4',
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
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2,json,bin}'],
				// ~900KB model is cached on first use instead (src/service-worker.ts)
				globIgnores: ['**/basic-pitch-model/**']
			}
		})
	]
});
