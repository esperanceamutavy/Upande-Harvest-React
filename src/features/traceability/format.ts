// Display helpers for the traceability screen.
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier. Same constraint as
// packing/lengths.ts and receiving/sprayOverride.ts.

/** The minimum shape `findGradingEvent` needs. Keeps this module import-free. */
export interface GradedEventLike {
    event: string | null;
    eventTime: string | null;
    gradedBy: string | null;
    gradedByName: string | null;
}

/**
 * Bunch counts arrive unrounded — a Bunch(7) box holding 25 stems comes back as
 * 3.5714285714285716. One decimal is enough to read; the underlying value is
 * never modified, only formatted.
 */
export function formatBunches(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    // A whole count should not read as "13.0".
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1);
}

/**
 * The Grading event — what a user scanning a bunch actually wants to know.
 *
 * Matched case-insensitively on the stock_entry_type containing "grading", not
 * on equality: the type is "Grading" today, but the events list also carries
 * Receiving, Shelving and Bucket Transfer, and a near-miss on capitalisation
 * should not silently drop the one row the screen leads with.
 *
 * The FIRST grading event wins. A bunch is graded once; if a correction created
 * a second, the original is when it was graded.
 */
export function findGradingEvent<T extends GradedEventLike>(events: T[]): T | null {
    for (const e of events) {
        if ((e.event ?? '').toLowerCase().includes('grading')) return e;
    }
    return null;
}

/** Who graded it: the resolved Employee name, else the raw id, else null. */
export function graderLabel(event: GradedEventLike | null): string | null {
    if (!event) return null;
    const name = (event.gradedByName ?? '').trim();
    if (name) return name;
    const id = (event.gradedBy ?? '').trim();
    return id || null;
}

/**
 * `2026-08-26 00:45:44.648120` → `26 Aug 2026, 00:45`.
 *
 * Frappe returns a space-separated datetime, which `new Date()` parses
 * inconsistently across engines, so the parts are split by hand. Anything
 * unrecognised is passed through rather than blanked — a raw timestamp on
 * screen beats an em dash hiding one.
 */
export function formatTimestamp(value: string | null | undefined): string {
    if (!value) return '—';

    const text = String(value).trim();
    const [datePart, timePart] = text.split(' ');
    const bits = (datePart ?? '').split('-');
    if (bits.length !== 3) return text;

    const [y, m, d] = bits;
    const monthIndex = Number.parseInt(m, 10) - 1;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!(monthIndex >= 0 && monthIndex < 12)) return text;

    const day = Number.parseInt(d, 10);
    if (!Number.isFinite(day)) return text;

    const hhmm = (timePart ?? '').slice(0, 5);
    return `${day} ${MONTHS[monthIndex]} ${y}${hhmm ? `, ${hhmm}` : ''}`;
}
