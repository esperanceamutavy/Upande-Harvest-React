// Date windows for the greenhouse flow screen.
//
// Same three-option shape as the packing picker, but plain: "Today" here means
// today, unlike packing's `packing_today`, which deliberately means tomorrow's
// deliveries because packers work a day ahead.
//
// Local calendar throughout. NEVER `toISOString()` — it shifts the date across
// midnight for any timezone east of UTC, which includes EAT.
//
// Deliberately no relative imports: loaded directly by `node --test`.

export type FlowRange = 'today' | 'yesterday' | 'week';

/** `YYYY-MM-DD` in the device's own calendar. */
export function localDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive `[from, to]`. Week runs Monday–Sunday and always contains today. */
export function rangeFor(range: FlowRange, now: Date = new Date()): [string, string] {
    const shift = (n: number) => {
        const d = new Date(now.getTime());
        d.setDate(d.getDate() + n);
        return d;
    };

    switch (range) {
        case 'yesterday': {
            const y = localDate(shift(-1));
            return [y, y];
        }
        case 'week': {
            const dow = now.getDay(); // 0 = Sunday
            const from = shift(-(dow === 0 ? 6 : dow - 1));
            const to = new Date(from.getTime());
            to.setDate(to.getDate() + 6);
            return [localDate(from), localDate(to)];
        }
        case 'today':
        default: {
            const t = localDate(now);
            return [t, t];
        }
    }
}
