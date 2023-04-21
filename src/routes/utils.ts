export type ObjectKey = string | number | symbol;
export function invertObject<K extends ObjectKey, V extends ObjectKey>(o: Record<K, V>): Record<V, K> {
    return Object.entries(o).reduce((p, [k, v]) => ({ ...p, [v as V]: k }), {}) as Record<V, K>;
}

export function secondsToTime(e: number){
    const h = Math.floor(e / 3600).toString().padStart(2,'0'),
            m = Math.floor(e % 3600 / 60).toString().padStart(2,'0'),
            s = Math.floor(e % 60).toString().padStart(2,'0');
    
    return h + ':' + m + ':' + s;
    //return `${h}:${m}:${s}`;
}