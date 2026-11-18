import { writable } from 'svelte/store';

// set by share-target/+page.svelte, consumed and cleared by LocalAudio.svelte
export const sharedFile = writable<File | undefined>(undefined);
