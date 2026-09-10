// Free-text search over the OPL picker's ALREADY-LOADED rows.
//
// Client-side by design: every field below is already in memory from the
// picker's existing bulk fetches, so searching costs no round trip and works
// with a dead connection once the list is on screen.
//
// WHITESPACE IS NORMALISED ON BOTH SIDES. Live customer codes contain double
// spaces — "TFC  ED3442-FT" — which no packer will reproduce, so runs of
// whitespace collapse to one before comparing. The stored value is never
// rewritten; only the comparison is normalised, so the row still renders
// "TFC  ED3442-FT" exactly as stored.
//
// SUBSTRING, NOT PREFIX. A packer reading a code off paper often has only the
// middle of it: "3442" has to find "TFC  ED3442-FT", and "TGW" has to find both
// "TGW Flower 01" and "Fresh From Source (TGW)".
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier. The row shape is
// declared structurally here rather than imported from types/packing.

/** The subset of an OPL row this module reads. `OplListItem` satisfies it. */
export interface SearchableOpl {
    name: string;
    customer: string | null;
    salesOrder: string | null;
    consignee: string | null;
    customerCode: { code: string } | null;
    varieties: string[];
    lengths: string[];
    orderLength: string | null;
}

/** Lowercased, whitespace-collapsed, trimmed. The comparison form only. */
export function normalise(value: unknown): string {
    if (value == null) return '';
    return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Every value on a row that a packer might search by. */
function haystack(item: SearchableOpl): string[] {
    return [
        item.customerCode ? item.customerCode.code : null,
        item.consignee,
        item.customer,
        item.name,
        item.salesOrder,
        item.orderLength,
        ...item.varieties,
        ...item.lengths,
    ]
        .map(normalise)
        .filter((v) => v.length > 0);
}

/**
 * Does this row match the term?
 *
 * Fields are tested INDIVIDUALLY rather than concatenated into one string, so a
 * term can never match by straddling two of them — customer "AB" beside
 * consignee "CD" must not be found by "abcd".
 *
 * A blank term matches everything, which is what makes clearing the box restore
 * the list.
 */
export function matchesOplSearch(item: SearchableOpl, term: string): boolean {
    const needle = normalise(term);
    if (!needle) return true;
    return haystack(item).some((field) => field.includes(needle));
}

/** The rows matching `term`, in their original order. */
export function filterOpls<T extends SearchableOpl>(items: T[], term: string): T[] {
    if (!normalise(term)) return items;
    return items.filter((item) => matchesOplSearch(item, term));
}
