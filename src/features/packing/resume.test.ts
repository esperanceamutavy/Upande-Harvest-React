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
