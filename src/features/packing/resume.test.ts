// Packing must RESUME, not restart.
//
// Reopening a partially packed OPL showed "Box 1 of N — 0 packed", so the packer
// refilled full boxes and the server rejected every scan as already packed.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boxAcceptsMore, formatBoxRanges, resumePlan, type BoxProgress } from './resume.ts';

const box = (bunches: number, stems: number): BoxProgress => ({ bunches, stems });

test('OPL-2026-02975 — 3 full boxes of a 10-box order opens at box 4, not box 1', () => {
    // The live case. Three Box Labels, each at the pack rate, 10 boxes ordered.
    const perBox = new Map([
        [1, box(34, 340)],
        [2, box(34, 340)],
        [3, box(34, 340)],
    ]);
    const r = resumePlan(perBox, 34, 10, 'bunches');

    assert.equal(r.boxNumber, 4);
    assert.equal(r.inBox, 0);
    assert.deepEqual(r.completeBoxes, [1, 2, 3]);
    assert.equal(r.packedTotal, 102);
    assert.equal(r.isComplete, false);
});

test('a partially filled box resumes MID-BOX, it is not skipped', () => {
    // Box 4 holding 28 of 34 must open at 28 — not at box 5.
    const perBox = new Map([
        [1, box(34, 340)],
        [2, box(34, 340)],
        [3, box(34, 340)],
        [4, box(28, 280)],
    ]);
    const r = resumePlan(perBox, 34, 10, 'bunches');

    assert.equal(r.boxNumber, 4);
    assert.equal(r.inBox, 28);
    assert.deepEqual(r.completeBoxes, [1, 2, 3]);
});

test('the LOWEST box below the cap wins, even with full boxes after it', () => {
    const perBox = new Map([
        [1, box(34, 340)],
        [2, box(28, 280)],
        [3, box(34, 340)],
    ]);
    const r = resumePlan(perBox, 34, 10, 'bunches');

    assert.equal(r.boxNumber, 2);
    assert.equal(r.inBox, 28);
});

test('nothing packed yet — opens at box 1 empty', () => {
    const r = resumePlan(new Map(), 34, 10, 'bunches');

    assert.equal(r.boxNumber, 1);
    assert.equal(r.inBox, 0);
    assert.equal(r.packedTotal, 0);
    assert.deepEqual(r.completeBoxes, []);
    assert.equal(r.isComplete, false);
});

test('every box full — order is complete and scans must be refused', () => {
    const perBox = new Map([
        [1, box(4, 40)],
        [2, box(4, 40)],
    ]);
    const r = resumePlan(perBox, 4, 2, 'bunches');

    // WAS 3, which is the bug this now pins against: a 2-box order reported
    // "Box 3 of 2". The counter holds at the last box and isComplete carries
    // the state, so scans are still refused — planBox reads isComplete, not the
    // box number.
    assert.equal(r.boxNumber, 2);
    assert.equal(r.inBox, 4, 'and it reports that box as full');
    assert.equal(r.isComplete, true);
    assert.deepEqual(r.completeBoxes, [1, 2]);
});

test('counts in STEMS when that is the session unit', () => {
    // Same rows, stem-counted session: the cap is in stems, so the box that is
    // "full" at 34 bunches is full at 340 stems.
    const perBox = new Map([
        [1, box(34, 340)],
        [2, box(20, 200)],
    ]);
    const r = resumePlan(perBox, 340, 10, 'stems');

    assert.equal(r.boxNumber, 2);
    assert.equal(r.inBox, 200);
    assert.equal(r.packedTotal, 540);
});

test('over-full box counts as complete, not as resumable', () => {
    const perBox = new Map([[1, box(36, 360)]]);
    const r = resumePlan(perBox, 34, 10, 'bunches');

    assert.equal(r.boxNumber, 2);
    assert.deepEqual(r.completeBoxes, [1]);
});

test('gaps in box numbering do not confuse the next box', () => {
    const perBox = new Map([
        [1, box(34, 340)],
        [5, box(34, 340)],
    ]);
    const r = resumePlan(perBox, 34, 10, 'bunches');

    assert.equal(r.boxNumber, 6);
});

test('formatBoxRanges collapses runs', () => {
    assert.equal(formatBoxRanges([1, 2, 3]), '1-3');
    assert.equal(formatBoxRanges([1, 2, 4]), '1-2, 4');
    assert.equal(formatBoxRanges([3, 1, 2]), '1-3');
    assert.equal(formatBoxRanges([7]), '7');
    assert.equal(formatBoxRanges([1, 3, 5]), '1, 3, 5');
    assert.equal(formatBoxRanges([]), null);
});

// ── FPL-2026-01090: boxes left short, and finishing them ───────────────────
//
// A bouquet order for APH: 35 bouquets per box x 13 stems = a 455-stem box,
// 10 boxes. The phone closed boxes at 33, 32 and 14 bouquets and announced each
// one complete, because box state lived only in its own memory and the stored
// rows were never consulted after the session opened.
//
// These pin the behaviour the reconcile-at-close fix depends on: resumePlan
// must send the packer BACK to the lowest unfinished box, not forward to a new
// one. Without that the fix would refuse the advance and then have nowhere to
// go.

const CAP_455 = 455;
const TEN_BOXES = 10;

/** The live shape: bouquets per box -> stems, at 13 stems a bouquet. */
function boxesOf(bouquets: number[]): Map<number, BoxProgress> {
    const m = new Map<number, BoxProgress>();
    bouquets.forEach((n, i) => m.set(i + 1, { bunches: n * 4, stems: n * 13 }));
    return m;
}

test('THE LIVE CASE: resume returns to the first short box, not a new one', () => {
    // 35, 35, 33, 32, 14, 17 bouquets -> boxes 1 and 2 full, 3 onward short.
    const plan = resumePlan(boxesOf([35, 35, 33, 32, 14, 17]), CAP_455, TEN_BOXES, 'stems');
    assert.equal(plan.boxNumber, 3, 'box 3 holds 429 of 455 and must be finished first');
    assert.equal(plan.inBox, 429);
    assert.deepEqual(plan.completeBoxes, [1, 2], 'only two boxes are actually full');
    assert.equal(plan.isComplete, false);
});

test('a box one bouquet short is still short', () => {
    const plan = resumePlan(boxesOf([34]), CAP_455, TEN_BOXES, 'stems');
    assert.equal(plan.boxNumber, 1);
    assert.equal(plan.inBox, 442, '34 x 13 = 442, under the 455 cap');
});

test('an exactly full box moves on', () => {
    const plan = resumePlan(boxesOf([35]), CAP_455, TEN_BOXES, 'stems');
    assert.equal(plan.boxNumber, 2);
    assert.equal(plan.inBox, 0);
});

test('finishing the short boxes eventually reaches a fresh one', () => {
    const plan = resumePlan(boxesOf([35, 35, 35, 35, 35, 35]), CAP_455, TEN_BOXES, 'stems');
    assert.equal(plan.boxNumber, 7, 'six full boxes -> start box 7');
    assert.equal(plan.completeBoxes.length, 6);
});

test('the order is only complete when every box of the order is full', () => {
    const all = Array.from({ length: TEN_BOXES }, () => 35);
    const plan = resumePlan(boxesOf(all), CAP_455, TEN_BOXES, 'stems');
    assert.ok(plan.isComplete, 'ten full boxes is the whole order');
});

test('six boxes packed is NOT the order complete, however it was announced', () => {
    const plan = resumePlan(boxesOf([35, 35, 33, 32, 14, 17]), CAP_455, TEN_BOXES, 'stems');
    assert.ok(!plan.isComplete);
    const packedBouquets = 35 + 35 + 33 + 32 + 14 + 17;
    assert.equal(plan.packedTotal, packedBouquets * 13, '2,158 stems of 4,550');
});

// ── boxAcceptsMore ─────────────────────────────────────────────────────────
//
// THE TEST THAT WOULD HAVE CAUGHT IT. The reconcile-at-close fix first shipped
// asking "is this box at the cap?", which is only ever true for a straight box.
// Every mixed and bouquet order was sent back into a box it had rightly closed
// and could never fill, and packing stopped on the floor.
//
// These cases are built from the live pick lists that were being packed at the
// time, so the straight/mixed split is pinned rather than assumed.

test('a straight box lands exactly on the cap and is then finished', () => {
    // Bunch(10) into a 100-stem box: 10 bunches, no remainder.
    assert.ok(boxAcceptsMore(90, 100, 10), 'room for one more');
    assert.ok(!boxAcceptsMore(100, 100, 10), 'exactly full');
});

test('THE BREAKAGE: a mixed box closing under the cap is still finished', () => {
    // FPL-2026-01125 mixes Bunch(10) and Bunch(15) — nothing fills the last 5
    // stems of a 455 cap, so 450 is a finished box.
    assert.ok(!boxAcceptsMore(450, 455, 10), 'no bunch fits the 5-stem gap');
    assert.ok(boxAcceptsMore(440, 455, 10), '15 left, a Bunch(10) still fits');
});

test('a box closed genuinely early is still refused', () => {
    // FPL-2026-01090: box 3 held 429 of 455 and a 13-stem bouquet fits the gap.
    assert.ok(boxAcceptsMore(429, 455, 2), 'a 26-stem gap takes more');
    assert.ok(boxAcceptsMore(416, 455, 2), 'box 4 at 416 likewise');
});

test('counting in bunches, one bunch is the smallest unit', () => {
    assert.ok(boxAcceptsMore(33, 35, 1));
    assert.ok(boxAcceptsMore(34, 35, 1), 'one bunch short is not full');
    assert.ok(!boxAcceptsMore(35, 35, 1));
});

test('an over-filled box takes nothing more', () => {
    assert.ok(!boxAcceptsMore(460, 455, 10));
});

test('a nonsense unit never reports infinite room', () => {
    assert.ok(!boxAcceptsMore(455, 455, 0), 'zero would otherwise loop forever');
    assert.ok(!boxAcceptsMore(455, 455, -5));
});

// ── the unit must be a bunch that really exists ────────────────────────────
//
// The first attempt at this derived the unit from the pick list's own rows.
// OPL-2026-06565 carries uom "Stems" on every Pick List Item, so no bunch size
// could be parsed, the fallback was 1, and a mixed box at 450 of 455 read as
// having room for one more stem — the packer would have been trapped exactly as
// before. The unit is now the increment of the bunch just packed.

test('THE SECOND TRAP: a unit of 1 holds a mixed box nothing can fill', () => {
    // What the OPL-derived unit would have produced on a 450/455 mixed box.
    assert.ok(boxAcceptsMore(450, 455, 1), 'a 1-stem unit always finds room');
    // What the scanned bunch produces on the same box.
    assert.ok(!boxAcceptsMore(450, 455, 10), 'a real Bunch(10) does not fit');
    assert.ok(!boxAcceptsMore(450, 455, 15), 'nor a Bunch(15)');
});

test('OPL-2026-06565: box 3 at 429 of 455 still holds for a 13-stem bouquet', () => {
    assert.ok(boxAcceptsMore(429, 455, 13), 'two bouquets short, one clearly fits');
    assert.ok(!boxAcceptsMore(455, 455, 13), 'and releases once full');
});

test('erring high releases, never strands', () => {
    // A 15 was scanned but a 10 was available: released a touch early.
    assert.ok(!boxAcceptsMore(448, 455, 15));
    // The reverse would have held a box only a 10 could fill — still fine,
    // because planBox advances anyway when the next bunch does not fit.
    assert.ok(boxAcceptsMore(444, 455, 10));
});

// ── the counter must never name a box that does not exist ──────────────────
//
// Closing the last box advanced to boxCount + 1, so a finished 3-box order read
// "Box 4 of 3" in the header while the footer correctly said all boxes were
// packed. The packer was shown a box they could not fill and did not have.

/** A box-number -> progress map where every listed box is full. */
function fullBoxes(n: number, cap: number): Map<number, BoxProgress> {
    const m = new Map<number, BoxProgress>();
    for (let i = 1; i <= n; i += 1) m.set(i, { bunches: cap, stems: cap });
    return m;
}

test('A 3-BOX ORDER FULLY PACKED SHOWS BOX 3 OF 3, with the completion notice', () => {
    const plan = resumePlan(fullBoxes(3, 100), 100, 3, 'stems');
    assert.equal(plan.boxNumber, 3, 'holds at the last box, never 4');
    assert.ok(plan.isComplete, 'and the completion state still fires');
    assert.deepEqual(plan.completeBoxes, [1, 2, 3]);
});

test('the held box reports its own contents, not zero', () => {
    const plan = resumePlan(fullBoxes(3, 100), 100, 3, 'stems');
    assert.equal(plan.inBox, 100, 'Box 3 of 3 — 100 of 100 reads true');
});

test('CLOSING BOX 2 OF 3 STILL ADVANCES TO BOX 3', () => {
    const plan = resumePlan(fullBoxes(2, 100), 100, 3, 'stems');
    assert.equal(plan.boxNumber, 3);
    assert.equal(plan.inBox, 0, 'a fresh box starts empty');
    assert.ok(!plan.isComplete, 'two of three boxes is not a finished order');
});

test('a one-box order finishes on box 1', () => {
    const plan = resumePlan(fullBoxes(1, 100), 100, 1, 'stems');
    assert.equal(plan.boxNumber, 1);
    assert.ok(plan.isComplete);
});

test('a part-filled last box is not complete and does not hold', () => {
    const m = fullBoxes(2, 100);
    m.set(3, { bunches: 40, stems: 40 });
    const plan = resumePlan(m, 100, 3, 'stems');
    assert.equal(plan.boxNumber, 3);
    assert.equal(plan.inBox, 40, 'resumes mid-box');
    assert.ok(!plan.isComplete);
});

test('an empty pack list opens at box 1 of N, not complete', () => {
    const plan = resumePlan(new Map(), 100, 3, 'stems');
    assert.equal(plan.boxNumber, 1);
    assert.equal(plan.inBox, 0);
    assert.ok(!plan.isComplete);
});

test('more boxes packed than ordered still holds at the ordered count', () => {
    // Defensive: planBox refuses to exceed boxCount, but a hand-built pack list
    // could. The counter must not name box 5 of 3 either.
    const plan = resumePlan(fullBoxes(4, 100), 100, 3, 'stems');
    assert.equal(plan.boxNumber, 3);
    assert.ok(plan.isComplete);
});

test('counting in bunches holds the same way', () => {
    const plan = resumePlan(fullBoxes(3, 35), 35, 3, 'bunches');
    assert.equal(plan.boxNumber, 3);
    assert.equal(plan.inBox, 35);
    assert.ok(plan.isComplete);
});

test('A SCAN IS STILL REFUSED on a complete order — inBox is load-bearing', () => {
    // planBox is pure and lives in packing.tsx, so its rule is replayed here
    // against the resumed state. It is the reason inBox must report the held
    // box's REAL count rather than 0:
    //
    //   hold at box 3 with inBox = cap  ->  cap + 1 > cap, so it advances to
    //                                       box 4, which is past boxCount, and
    //                                       the scan is refused.
    //   hold at box 3 with inBox = 0    ->  0 + 1 fits, so the scan lands in an
    //                                       already-full box 3. Silent over-pack.
    //
    // A future edit that zeroes inBox here would break refusal with every test
    // above still green, which is exactly why this one exists.
    const cap = 100;
    const boxCount = 3;
    const plan = resumePlan(fullBoxes(3, cap), cap, boxCount, 'stems');

    const planBox = (boxNumber: number, inBox: number, increment: number) => {
        let nextBox = boxNumber;
        let count = inBox;
        if (count + increment > cap) {
            nextBox += 1;
            count = 0;
        }
        return nextBox > boxCount ? null : { boxId: nextBox, after: count + increment };
    };

    assert.equal(planBox(plan.boxNumber, plan.inBox, 10), null, 'the order is full — refuse');
});

test('and a scan on the last box is still ACCEPTED while it has room', () => {
    const cap = 100;
    const boxCount = 3;
    const m = fullBoxes(2, cap);
    m.set(3, { bunches: 90, stems: 90 });
    const plan = resumePlan(m, cap, boxCount, 'stems');

    assert.equal(plan.boxNumber, 3);
    assert.equal(plan.inBox, 90);
    assert.ok(!plan.isComplete, '90 of 100 is not a finished order');
});
