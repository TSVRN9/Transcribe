export type ObjectKey = string | number | symbol;
export function invertObject<K extends ObjectKey, V extends ObjectKey>(
	o: Record<K, V>
): Record<V, K> {
	return Object.entries(o).reduce((p, [k, v]) => ({ ...p, [v as V]: k }), {}) as Record<V, K>;
}

export function secondsToTime(e: number) {
	const h = Math.floor(e / 3600)
			.toString()
			.padStart(2, '0'),
		m = Math.floor((e % 3600) / 60)
			.toString()
			.padStart(2, '0'),
		s = Math.floor(e % 60)
			.toString()
			.padStart(2, '0');

	return h + ':' + m + ':' + s;
	//return `${h}:${m}:${s}`;
}

// shared button styling — kept here so the transport controls look identical whether
// they're rendered in +page's sidebar or PitchgramView's mobile control sheet
export const gridBtn =
	'flex items-center justify-center rounded-md bg-stone-800 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-2px_3px_rgba(0,0,0,0.35)] transition-all hover:enabled:bg-stone-700 active:enabled:translate-y-px active:enabled:bg-stone-600 active:enabled:shadow-[inset_0_2px_3px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed';
export const primaryBtn =
	'flex items-center justify-center rounded-md bg-amber-500 py-3 text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-2px_3px_rgba(0,0,0,0.3)] transition-all hover:enabled:bg-amber-400 active:enabled:translate-y-px active:enabled:bg-amber-500 active:enabled:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:cursor-not-allowed';
export const iconSize = 'h-6 w-6';
export const panel = 'rounded-md border border-stone-800 bg-stone-900 p-4';
