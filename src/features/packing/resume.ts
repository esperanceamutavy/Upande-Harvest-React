// Resuming a partially packed OPL.
//
// Reopening an OPL used to start at "Box 1 of N — 0 packed", so a packer refilled
// boxes that were already full and the server rejected every scan as already
// packed. Session state is now rebuilt from the existing Farm Pack List.
//
// Per-box state comes from `pack_list_item` rows, NEVER from the header's
// `total_stems`: that is a sum across every box and cannot say which box is open.

export interface BoxProgress {
    /** Sum of `bunch_qty` for the box. */
    bunches: number;
    /** Sum of `bunch_qty × stems-per-unit`, from each row's own `bunch_uom`. */
    stems: number;
}

export interface ResumeState {
    /** The box to open at. */
    boxNumber: number;
    /** What that box already holds, in the session's unit. */
    inBox: number;
    /** Total already packed across all boxes, in the session's unit. */
    packedTotal: number;
    /** Box numbers already at or over the cap. */
    completeBoxes: number[];
    /** Every box in the order is full — refuse further scans. */
    isComplete: boolean;
}

/**
 * Where to resume.
 *
 *   - current box = the LOWEST box number still below the cap
 *   - if every existing box is full, the next box number after the highest
 *   - the counter is seeded with that box's existing count, so a box holding
 *     28 of 34 opens at 28 rather than being skipped
 *   - if that lands past the order's box count, the order is complete
 */
export function resumePlan(
    perBox: Map<number, BoxProgress>,
    capPerBox: number,
    boxCount: number,
    unit: 'bunches' | 'stems',
): ResumeState {
    const countOf = (p: BoxProgress) => (unit === 'bunches' ? p.bunches : p.stems);

    const numbers = [...perBox.keys()].sort((a, b) => a - b);
    const completeBoxes = numbers.filter((n) => countOf(perBox.get(n)!) >= capPerBox);
    const packedTotal = numbers.reduce((sum, n) => sum + countOf(perBox.get(n)!), 0);

    // A partially filled box is normal and must be resumable mid-box.
    const partial = numbers.find((n) => countOf(perBox.get(n)!) < capPerBox);

    let boxNumber: number;
    let inBox: number;
    if (partial !== undefined) {
        boxNumber = partial;
        inBox = countOf(perBox.get(partial)!);
    } else {
        boxNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
        inBox = 0;
    }

    return {
        boxNumber,
        inBox,
        packedTotal,
        completeBoxes,
        // Only reachable when every existing box was full and the next number
        // runs past the end of the order.
        isComplete: boxNumber > boxCount,
    };
}

/** `[1,2,3]` → `"1-3"`; `[1,2,4]` → `"1-2, 4"`. Empty → null. */
export function formatBoxRanges(boxes: number[]): string | null {
    if (boxes.length === 0) return null;

    const sorted = [...boxes].sort((a, b) => a - b);
    const parts: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (const n of sorted.slice(1)) {
        if (n === prev + 1) {
            prev = n;
            continue;
        }
        parts.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = n;
        prev = n;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);

    return parts.join(', ');
}

/**
 * Can this box still take another bunch?
 *
 * ⛔ "FULL" IS NOT `count === cap`. It is "nothing more would fit" — exactly the
 * rule planBox applies when it decides to advance:
 *
 *     if (count + increment > capPerBox) { nextBox += 1 }
 *
 * A STRAIGHT box lands exactly on the cap, because one bunch size divides it:
 * ten Bunch(10) into a 100-stem box. A MIXED box does not. With Bunch(10) and
 * Bunch(15) against a 455-stem cap, a box legitimately closes at 450 — no
 * remaining bunch fills the last 5 stems — and it is finished at 450.
 *
 * Treating "below cap" as "unfinished" therefore traps a packer in a mixed box
 * forever: nothing exists that fits the gap, so they can never leave it. That
 * shipped on 2026-09-28 and stopped every mixed and bouquet order on the floor
 * while straight orders ran untouched, which is the signature of this mistake.
 *
 * `unit` must be a bunch size that REALLY EXISTS — pass the increment of the
 * bunch just packed. Do not derive it from the pick list's own rows: they carry
 * uom "Stems" on real orders (OPL-2026-06565 does), so the derived size is
 * absent, falls back to 1, and every mixed box reads as having room for one
 * more stem. That is the trap this function exists to prevent, rebuilt.
 *
 * Erring high releases a box a little early, costing a few stems. Erring low
 * strands a packer. So when in doubt, pass the larger unit.
 */
export function boxAcceptsMore(count: number, capPerBox: number, unit: number): boolean {
    return count + Math.max(1, unit) <= capPerBox;
}
