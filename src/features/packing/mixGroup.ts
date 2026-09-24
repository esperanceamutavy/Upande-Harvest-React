// Which Sales Order lines make up this pick list?
//
// ── THE BUG THIS FIXES ─────────────────────────────────────────────────────
//
// The allocator does not write `custom_opl` to every line of a mix. On
// SAL-ORD-2026-02139 / OPL-2026-05334 (Milele) ten lines share
// `custom_mix_group = 1`; nine carry the OPL and FUSCHIANA-40CM carries NULL.
// SAL-ORD-2026-02314 is worse — Brinessa-50CM holds the OPL while
// Dutchess-50CM and Paranita-50CM are null.
//
// Selecting lines by `custom_opl` therefore DROPS varieties, and a dropped
// variety cannot be listed, cannot be scanned, and cannot be packed.
//
// It is a broken LINK, not an allocation shortfall. The line is on the order and
// the flowers are on the shelf; only the pointer is missing.
//
// ── THE RULE ───────────────────────────────────────────────────────────────
//
//   1. the OPL names its `sales_order`
//   2. any ONE line carrying `custom_opl = <this OPL>` reveals the group
//   3. the packable set is EVERY line on that order sharing that group
//
// Which field holds the group depends on the line's own flag:
//
//   custom_mixed_bunch = 1  ->  group on custom_bunch_group   (bouquet)
//   custom_mixed_box   = 1  ->  group on custom_mix_group     (mixed box)
//
// A line is never both — `patches/add_mixed_bunch_fields.py` enforces that bunch
// wins — but the order of the checks below does not depend on that holding.
//
// ── STRAIGHT BOXES ARE UNTOUCHED ───────────────────────────────────────────
//
// They match on `custom_opl` exactly as before. Widening them would be wrong:
// several straight lines on one order can point at different OPLs, and a group
// field of 0 is shared by every one of them.
//
// That last point is why membership tests the line's own FLAG and not just the
// group value. SAL-ORD-2026-02139's Blue Lagoon-50CM line carries
// `custom_mix_group = 0` with `custom_mixed_box = 0` and belongs to a different
// pick list entirely; matching on the group id alone would drag it in.
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier. Same constraint as
// lengths.ts, targets.ts and resume.ts.

/** The subset of a Sales Order line this module reads. */
export interface GroupableLine {
    item_code?: unknown;
    custom_opl?: unknown;
    custom_mixed_box?: unknown;
    custom_mix_group?: unknown;
    custom_mixed_bunch?: unknown;
    custom_bunch_group?: unknown;
}

export type PackMode = 'straight' | 'mixed-box' | 'bouquet';

export interface ResolvedGroup<T> {
    /** The packable line set. */
    rows: T[];
    mode: PackMode;
    /** Which field the group was read from. Null for a straight box. */
    groupField: 'custom_mix_group' | 'custom_bunch_group' | null;
    /** The group id, as text. Null for a straight box. */
    groupValue: string | null;
}

/** Frappe sends checkboxes as 0/1 and sometimes as "0"/"1". */
function isSet(value: unknown): boolean {
    return Number(value ?? 0) === 1;
}

/** Trimmed text, or null for anything empty — so `0` survives and `""` does not. */
function asKey(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/**
 * Resolve the Sales Order lines that belong to `oplName`.
 *
 * Falls back to the linked lines whenever the group cannot be established — a
 * malformed order should pack what it can rather than nothing at all.
 */
export function resolveGroupLines<T extends GroupableLine>(
    items: T[],
    oplName: string,
): ResolvedGroup<T> {
    const linked = items.filter((r) => asKey(r.custom_opl) === oplName);

    // The seed's only job is to reveal the group, so any linked line will do.
    const seed = linked.find((r) => isSet(r.custom_mixed_bunch) || isSet(r.custom_mixed_box));
    if (!seed) {
        return { rows: linked, mode: 'straight', groupField: null, groupValue: null };
    }

    // Bunch wins, per the patch. Checked rather than assumed.
    const bouquet = isSet(seed.custom_mixed_bunch);
    const groupField = bouquet ? 'custom_bunch_group' : 'custom_mix_group';
    const mode: PackMode = bouquet ? 'bouquet' : 'mixed-box';
    const groupValue = asKey(seed[groupField]);

    if (groupValue === null) {
        return { rows: linked, mode, groupField, groupValue: null };
    }

    const rows = items.filter((r) => {
        // A bouquet line is never also a mixed-box line; reading them in that
        // order means a doubly-flagged row is treated as the bouquet it is.
        const isBouquet = isSet(r.custom_mixed_bunch);
        const inKind = bouquet ? isBouquet : !isBouquet && isSet(r.custom_mixed_box);
        return inKind && asKey(r[groupField]) === groupValue;
    });

    return { rows: rows.length > 0 ? rows : linked, mode, groupField, groupValue };
}

/**
 * The per-box cap for a mixed pick list: the SUM of `custom_packrate_mixed_box`
 * across the group, in STEMS.
 *
 * `custom_packrate` is 0 on every mixed line and must stay so — it means "whole
 * box", and no single variety knows that number. Writing a per-variety figure
 * there once closed a box at 10 of 20 stems and reported it full.
 *
 * Bouquets use the identical formula: the wizard writes
 * `custom_packrate_mixed_box = custom_stems_per_bunch × custom_bunches_per_box`.
 */
export function mixedStemsPerBox(rows: { custom_packrate_mixed_box?: unknown }[]): number {
    return rows.reduce((sum, r) => sum + (Number(r.custom_packrate_mixed_box ?? 0) || 0), 0);
}
