import { parseLengthCm, varietyFromItemCode, orderLengthFromItemCode } from './lengths.ts';

// SUBSTITUTE VARIETIES — a permission, not an exception.
//
// `Sales Order.custom_substitutes` is a flat table of
// (for_item, variety, notes), where BOTH item codes are VARIANTS:
//
//     for_item  Adalonia-40CM   the ORDERED variety
//     variety   Athena-40CM     what may be packed instead
//
// The floor accepts a substitute the way it already accepts the ordered variety,
// so Rule 3 widens rather than branching: a scanned bunch is valid when its
// variety is on the order OR is listed against something that is.
//
// LENGTH IS MEASURED AGAINST THE LINE THE SUBSTITUTE STANDS IN FOR, not against
// the substitute's own code. A substitute listed against Adalonia-40CM admits a
// 40CM-or-longer bunch, because that is the line it consumes and 40CM is what
// physically leaves in the box. The rule is unchanged; only the line it is
// measured against can now be reached by substitution.
//
// TARGETS ARE UNTOUCHED. A substitute consumes the line it stands in for, so the
// cap, the box count and the order total stay exactly as they were. Packing 50
// Athena against a 200-stem Adalonia line leaves 150 on that line — there is no
// separate substitute budget to track.
//
// Comparisons are on the TEMPLATE. Lines and substitutes both store variants, a
// scanned bunch resolves to its template via `variant_of`, and Rule 3 separately
// allows longer stems — so matching variant-to-variant would reject a 60CM bunch
// against a 40CM line for a string difference the rule exists to permit. Same
// reasoning as mixGroup.ts.

/** A row of `Sales Order.custom_substitutes`, as it arrives on the wire. */
export interface SubstituteRow {
    for_item?: unknown;
    variety?: unknown;
    notes?: unknown;
}

/** One permitted substitution, resolved and scoped to a line on this order. */
export interface PermittedSubstitute {
    /** `for_item` verbatim — the ordered VARIANT, e.g. `Adalonia-40CM`. */
    forItem: string;
    /** Its template, e.g. `Adalonia`. */
    forVariety: string;
    /** The ordered line's length — the floor a bunch of this substitute must meet. */
    forLength: string | null;
    /** The substitute VARIANT as entered, e.g. `Athena-40CM`. */
    variety: string;
    /** Its template, e.g. `Athena` — what a scanned bunch is matched against. */
    varietyBase: string;
    notes: string | null;
}

function text(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const t = String(value).trim();
    return t.length > 0 ? t : null;
}

/**
 * Resolve the order's substitute table, keeping only rows whose `for_item` is
 * actually a line on this pick list.
 *
 * A Sales Order can carry substitutes for lines that belong to OTHER pick lists
 * — one order routinely spans several. Admitting those would let a variety be
 * packed into a box whose line never permitted it.
 */
export function permittedSubstitutes(
    rows: SubstituteRow[],
    orderItemCodes: (string | null)[],
): PermittedSubstitute[] {
    const onOrder = new Set(
        orderItemCodes
            .map((c) => varietyFromItemCode(c))
            .filter((c): c is string => c !== null),
    );

    const out: PermittedSubstitute[] = [];
    for (const r of rows) {
        const forItem = text(r.for_item);
        const variety = text(r.variety);
        if (!forItem || !variety) continue;

        const forVariety = varietyFromItemCode(forItem);
        if (!forVariety || !onOrder.has(forVariety)) continue;

        const varietyBase = varietyFromItemCode(variety);
        if (!varietyBase) continue;

        out.push({
            forItem,
            forVariety,
            forLength: orderLengthFromItemCode(forItem),
            variety,
            varietyBase,
            notes: text(r.notes),
        });
    }
    return out;
}

/**
 * The length floor a scanned bunch must meet.
 *
 * A variety ON the order keeps the order's own length, exactly as before — this
 * is the path every existing session takes, and it is unchanged. A variety
 * reachable only by substitution is measured against the line it stands in for.
 *
 * When one variety substitutes for several lines, the SHORTEST of their lengths
 * wins: the bunch can legitimately serve the least demanding line, and refusing
 * it would block a substitution the order explicitly permits.
 *
 * `orderVarieties` are templates; so is `bunchVariety`.
 */
export function lengthFloorFor(opts: {
    bunchVariety: string | null;
    orderVarieties: (string | null)[];
    substitutes: PermittedSubstitute[];
    orderLength: string | null;
}): string | null {
    const { bunchVariety, orderVarieties, substitutes, orderLength } = opts;
    if (!bunchVariety) return orderLength;

    // On the order in its own right — nothing about substitution applies.
    if (orderVarieties.some((v) => v !== null && v === bunchVariety)) return orderLength;

    const matches = substitutes.filter((s) => s.varietyBase === bunchVariety);
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
    line: { variety: string | null; length: string | null },
): string[] {
    const variety = line.variety;
    if (!variety) return [];
    const out: string[] = [];
    for (const s of substitutes) {
        if (s.forVariety !== variety) continue;
        // A line is identified by variety AND length: Adalonia-40CM and
        // Adalonia-50CM are different lines and may permit different things.
        if (line.length !== null && s.forLength !== null && s.forLength !== line.length) continue;
        if (!out.includes(s.varietyBase)) out.push(s.varietyBase);
    }
    return out;
}
