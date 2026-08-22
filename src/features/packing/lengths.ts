// Stem lengths: what to DISPLAY, and what to ACCEPT.
//
// Longer stems are allocated and CUT DOWN during packing. SAL-ORD-2026-01540's
// line "Brinessa-50CM" points at OPL-2026-03106, whose item_locations are all
// 60CM and 70CM — the box ends up holding 50CM, and 50CM is what goes on the
// label. A packer may equally grab a 50CM bunch for the same order.
//
// So the ORDER's length is the headline, and a bunch is acceptable at that
// length or longer.
//
// Deliberately no relative imports: this module is loaded directly by
// `node --test`, which is plain ESM and cannot resolve an extensionless
// specifier. Same constraint as resume.ts and targets.ts.

/**
 * The order's length, from the Sales Order Item's `item_code` suffix.
 * `"Brinessa-50CM"` → `"50CM"`. The SO line has no separate length field, so
 * the suffix is the only source.
 */
export function orderLengthFromItemCode(itemCode: string | null | undefined): string | null {
    if (!itemCode) return null;
    const at = itemCode.lastIndexOf('-');
    if (at < 0) return null;
    const suffix = itemCode.slice(at + 1).trim();
    return suffix.length > 0 ? suffix : null;
}

/** `"50CM"` → 50. `"50 cm"` → 50. Anything without digits → null. */
export function parseLengthCm(text: string | null | undefined): number | null {
    if (!text) return null;
    const match = /(\d+)/.exec(String(text));
    if (!match) return null;
    const n = Number.parseInt(match[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export type LengthVerdict =
    /** At or above the order's length — cut down if longer. */
    | 'ok'
    /** Shorter than the order. Cannot be cut UP. */
    | 'shorter'
    /** One side would not parse. Caller ALLOWS and logs. */
    | 'unknown';

/**
 * Is this bunch long enough for the order?
 *
 * A format surprise must not block a packer mid-shift, so an unparseable length
 * on either side returns `unknown` and the caller lets the scan through.
 */
export function compareLength(
    bunchLength: string | null | undefined,
    orderLength: string | null | undefined,
): LengthVerdict {
    const bunch = parseLengthCm(bunchLength);
    const order = parseLengthCm(orderLength);
    if (bunch == null || order == null) return 'unknown';
    return bunch >= order ? 'ok' : 'shorter';
}

/**
 * The length to SHOW for an order — the order's own, not the allocation's.
 *
 * Takes the ALREADY-PARSED order length, since both call sites hold it. Falls
 * back to the OPL's lengths when the item_code carried no parseable suffix, so
 * a naming surprise degrades to the old behaviour rather than a blank.
 */
export function displayLength(orderLength: string | null, oplLengths: string[]): string {
    return orderLength ?? oplLengths.join(', ');
}
