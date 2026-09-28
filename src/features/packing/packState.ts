// Which picker tab a pick list belongs in, and whether anyone has begun it.
//
// ── THE BUG THIS FIXES ─────────────────────────────────────────────────────
//
// A Farm Pack List submits only when its LAST box closes, so a part-packed
// pick list carries a DRAFT one. That used to classify as a third status,
// 'in_progress', with a tab of its own — and a packer who started a box on the
// 25th went looking for it under "To pack" on the 26th and did not find it.
// OPL-2026-06186 is the live case: FPL-2026-00859, docstatus 0, delivery
// 2026-09-27. It was reported as "hidden because it was allocated before
// today", and no date filter was involved at all.
//
// ── THE RULE ───────────────────────────────────────────────────────────────
//
//   no Farm Pack List        ->  To pack   (started false)
//   Farm Pack List, draft    ->  To pack   (started TRUE)
//   Farm Pack List, docstatus 1  ->  Packed
//
// Unfinished is unfinished. The only honest line is whether the last box has
// closed, and submission is exactly that event — never inferred from box
// counts or total_stems.
//
// TWO QUESTIONS, NOT ONE. "Which tab" and "has anyone begun it" are separate,
// and answering them with a single enum is what hid the row. `started` keeps
// the second one without moving the pick list anywhere.
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier. Same constraint as
// chunked.ts, mixGroup.ts and lengths.ts — so the status union is restated
// here rather than imported from types/packing.ts.

export type PackTab = 'to_pack' | 'packed';

/**
 * The picker's segments. NOT the same thing as PackTab.
 *
 * 'in_progress' is a VIEW, not a classification: it narrows "To pack" down to
 * the pick lists somebody has already begun. A part-packed pick list is still
 * to pack — that is the whole point of classifying a draft Farm Pack List as
 * to_pack — so it appears under BOTH "To pack" and "In progress", and packers
 * looking for unfinished work under "To pack" still find everything.
 *
 * The overlap is deliberate and is why this is a separate type. Reading the
 * segment back into PackTab is what hid OPL-2026-06186 in the first place.
 */
export type PickerSegment = PackTab | 'in_progress';

export interface PackClassification {
    status: PackTab;
    /** A pack list exists and is not submitted — someone has begun this one. */
    started: boolean;
}

/** Classify from a Farm Pack List's `docstatus`. Frappe sends it as a number,
 *  and occasionally as a string over REST. */
export function classifyPackList(docstatus: unknown): PackClassification {
    const submitted = Number(docstatus ?? 0) === 1;
    return { status: submitted ? 'packed' : 'to_pack', started: !submitted };
}

/** With no Farm Pack List at all, nothing has been started. */
export const NOT_STARTED: PackClassification = { status: 'to_pack', started: false };

/**
 * Part-packed rows to the top, everything else in the order it arrived.
 *
 * This is what replaced the "In progress" tab. A segment that merely SUBSETS
 * another one shows the same row in two places; sorting surfaces half-done work
 * without that. `sort` is stable, so untouched rows keep their query order.
 */
export function startedFirst<T extends { started: boolean }>(items: T[]): T[] {
    return [...items].sort((a, b) => Number(b.started) - Number(a.started));
}

/** Does this row belong under `segment`? See `PickerSegment`. */
export function matchesSegment(
    item: { status: PackTab; started: boolean },
    segment: PickerSegment,
): boolean {
    // Narrows "To pack" rather than replacing it — a started pick list is in
    // both, and is unfinished work either way.
    if (segment === 'in_progress') return item.status === 'to_pack' && item.started;
    return item.status === segment;
}
