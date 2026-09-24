import { parseLengthCm } from './lengths.ts';

// SUBSTITUTE VARIETIES — a permission, not an exception.
//
// `Sales Order.custom_substitutes` is a flat table of (for_item, variety, notes):
//
//     for_item  Madam Red-40CM   the ORDERED variety
//     variety   EVER RED-40CM    what may be packed instead
//
// Rule 3 widens rather than branching: a scanned bunch is valid when its variety
// is on the order OR is listed against something that is.
//
// ── MATCHING IS ON THE TEMPLATE, RESOLVED BY variant_of ────────────────────
//
// Both columns are Links to Item, and NOTHING guarantees which level they hold.
// The table may carry a variant (`EVER RED-40CM`) where the bunch carries a
// template (`EVER RED`), or the reverse. A raw string compare rejects valid
// scans, and stripping a `-40CM` suffix only appears to work: it is wrong for
// any variety whose name does not follow `Name-NNCM`, and `Odd-Name` would
// either lose half its code or keep all of it depending on the guard.
//
// So every code on every side goes through `resolveVariantParent` — the same
// cached `Item.variant_of` lookup useBunchDetails already uses for scanned
// bunches, and the same relation the server resolves with. This module is given
// codes that are ALREADY resolved; it does no parsing of its own. That is the
// trap mixGroup hit, and it is why the resolution happens once in the hook
// rather than per comparison here.
//
// ── LENGTH IS MEASURED AGAINST THE LINE THE SUBSTITUTE STANDS IN FOR ───────
//
// Not against the substitute's own code. A substitute listed against
// Madam Red-40CM admits a 40CM-or-longer bunch, because that is the line it
// consumes and 40CM is what physically leaves in the box. The rule is unchanged;
// only the line it is measured against can now be reached by substitution.
//
// ── TARGETS ARE UNTOUCHED ──────────────────────────────────────────────────
//
// A substitute consumes the line it stands in for, so the cap, the box count and
// the order total stay exactly as they were. 10 EVER RED against a 20-stem
// Madam Red line leaves 10 on that line — there is no separate substitute budget.

/** A row of `custom_substitutes` with both codes already resolved to templates. */
export interface ResolvedSubstituteRow {
    /** `for_item` verbatim, e.g. `Madam Red-40CM`. */
    forItem: string;
    /** Its template via variant_of, e.g. `Madam Red`. */
    forTemplate: string;
    /** The ordered line's length — the floor a bunch of this substitute must meet. */
    forLength: string | null;
    /** `variety` verbatim, e.g. `EVER RED-40CM`. */
    variety: string;
    /** Its template via variant_of, e.g. `EVER RED`. */
    varietyTemplate: string;
    notes: string | null;
}

/** A substitution scoped to a line on THIS pick list. */
export type PermittedSubstitute = ResolvedSubstituteRow;

/**
 * Keep only substitutions whose `for_item` is actually a line on this pick list.
 *
 * A Sales Order can carry substitutes for lines belonging to OTHER pick lists —
 * one order routinely spans several. Admitting those would let a variety be
 * packed into a box whose line never permitted it.
 *
 * `orderTemplates` are the order lines' templates, resolved the same way.
 */
export function scopeToOrder(
    rows: ResolvedSubstituteRow[],
    orderTemplates: (string | null)[],
): PermittedSubstitute[] {
    const onOrder = new Set(orderTemplates.filter((t): t is string => !!t));
    return rows.filter((r) => onOrder.has(r.forTemplate));
}

/**
 * The length floor a scanned bunch must clear.
 *
 * A variety ON the order keeps the order's own length, exactly as before — the
 * path every existing session takes, unchanged. A variety reachable only by
 * substitution is measured against the line it stands in for.
 *
 * When one variety substitutes for several lines the SHORTEST length wins: the
 * bunch can legitimately serve the least demanding line, and refusing it would
 * block a substitution the order explicitly permits.
 *
 * `bunchTemplate` and `orderTemplates` are variant_of-resolved.
 */
export function lengthFloorFor(opts: {
    bunchTemplate: string | null;
    orderTemplates: (string | null)[];
    substitutes: PermittedSubstitute[];
    orderLength: string | null;
}): string | null {
    const { bunchTemplate, orderTemplates, substitutes, orderLength } = opts;
    if (!bunchTemplate) return orderLength;

    // On the order in its own right — nothing about substitution applies.
    if (orderTemplates.some((t) => t !== null && t === bunchTemplate)) return orderLength;

    const matches = substitutes.filter((s) => s.varietyTemplate === bunchTemplate);
    if (matches.length === 0) return orderLength;

    let best: string | null = null;
    let bestCm: number | null = null;
    for (const m of matches) {
        const cm = parseLengthCm(m.forLength);
        if (cm === null) continue;
        if (bestCm === null || cm < bestCm) {
            bestCm = cm;
            best = m.forLength;
        }
    }
    // Every candidate length was unparseable — fall back rather than invent one.
    return best ?? orderLength;
}

/** The substitute varieties permitted for one displayed line, as templates. */
export function substitutesForLine(
    substitutes: PermittedSubstitute[],
    line: { template: string | null; length: string | null },
): string[] {
    const template = line.template;
    if (!template) return [];
    const out: string[] = [];
    for (const s of substitutes) {
        if (s.forTemplate !== template) continue;
        // A line is identified by variety AND length: Madam Red-40CM and
        // Madam Red-50CM are different lines and may permit different things.
        if (line.length !== null && s.forLength !== null && s.forLength !== line.length) continue;
        if (!out.includes(s.varietyTemplate)) out.push(s.varietyTemplate);
    }
    return out;
}
