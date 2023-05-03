import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			base: '/Transcribe',
			manifest: {
				short_name: 'Transcribe',
				name: 'Transcribe',
				display: 'standalone',
				theme_color: "#000000",
				background_color: "#000000",
				icons: [
					{
						src: './400x400.png',
						sizes: '400x400',
						type: 'image/png'
					}
				]
//				icons: [
//					{
//						src: '/pwa-192x192.png',
//						sizes: '192x192',
//						type: 'image/png',
//					},
//					{
//						src: '/pwa-512x512.png',
//						sizes: '512x512',
//						type: 'image/png',
//					},
//					{
//						src: '/pwa-512x512.png',
//						sizes: '512x512',
//						type: 'image/png',
//						purpose: 'any maskable',
//					},
//				],
			},
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
		})
	]
});
