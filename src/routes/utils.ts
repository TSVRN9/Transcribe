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
}

export const gridBtn =
	'flex items-center justify-center rounded-lg bg-wash py-3 text-ink transition-colors hover:enabled:bg-wash-strong active:enabled:bg-staff/60 disabled:opacity-40 disabled:cursor-not-allowed';
export const primaryBtn =
	'flex items-center justify-center rounded-lg bg-ink py-3 text-paper transition-colors hover:enabled:bg-ink/85 active:enabled:bg-ink/75 disabled:opacity-40 disabled:cursor-not-allowed';
export const iconSize = 'h-6 w-6';
