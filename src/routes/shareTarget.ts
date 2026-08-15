import { writable } from 'svelte/store';

// Set once by share-target/+page.svelte after pulling a shared file out of the
// service worker's cache; consumed and cleared by LocalAudio.svelte.
export const sharedFile = writable<File | undefined>(undefined);
