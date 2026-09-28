// Packing must RESUME, not restart.
//
// Reopening a partially packed OPL showed "Box 1 of N — 0 packed", so the packer
// refilled full boxes and the server rejected every scan as already packed.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatBoxRanges, resumePlan, type BoxProgress } from './resume.ts';

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

    assert.equal(r.boxNumber, 3);
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
