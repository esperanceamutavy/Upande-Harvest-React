// Split an `in` filter across several requests.
//
// ── WHY ────────────────────────────────────────────────────────────────────
//
// Frappe's `/api/resource` takes its filters in the QUERY STRING, and the
// server caps the request LINE — not the body — at 4,094 characters. An `in`
// list grows with the day's volume, so a query that is comfortable in testing
// fails on a busy morning with:
//
//     Request Line is too large (4465 > 4094)
//
// which axios surfaces as a bare "Request failed with status code 400". It
// appears with NO DEPLOY and breaks OLD BUILDS TOO, because nothing changed in
// the app — only the number of orders. That is what makes it confusing enough
// to be worth this comment: the trigger is data, not code.
//
// The picker's Sales Order Item query sent 46 order names AND 127 OPL names in
// one line: 4,465 characters. The contents query is already at 3,106 and one
// busy morning from the same failure.
//
// ── SIZE ───────────────────────────────────────────────────────────────────
//
// 25 names per request. A Frappe docname runs ~18 characters plus quoting and a
// comma, so 25 is roughly 550 characters of list — leaving the rest of the
// budget for fields, the doctype and the other filters, with room to spare.
// Deliberately conservative: the cost of a chunk too small is one extra
// round-trip, and the cost of a chunk too large is a production outage that
// only shows up on the busiest day.
//
// Batches run in PARALLEL — they are independent reads, and serialising them
// would multiply the picker's load time by the chunk count.

/** Names per request. See the note above before raising it. */
export const CHUNK_SIZE = 25;

/** Split a list into fixed-size groups. An empty list yields no groups. */
export function chunk<T>(items: T[], size: number = CHUNK_SIZE): T[][] {
    if (size < 1) throw new Error(`chunk size must be at least 1, got ${size}`);
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/**
 * Run `query` once per chunk of `items`, in parallel, and flatten the results.
 *
 * Returns `[]` for an empty list WITHOUT calling `query` — which matters: an
 * empty `in` filter is not a narrower query in Frappe, it is NO filter, so a
 * single call would return every row in the table. The picker already guards
 * that in one place and forgot it in another; this makes it structural.
 */
export async function chunkedQuery<T, R>(
    items: T[],
    query: (batch: T[]) => Promise<R[]>,
    size: number = CHUNK_SIZE,
): Promise<R[]> {
    if (items.length === 0) return [];
    const batches = await Promise.all(chunk(items, size).map(query));
    return batches.flat();
}
