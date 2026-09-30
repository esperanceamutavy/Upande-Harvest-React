import assert from 'node:assert/strict';
import test from 'node:test';

import { groupRowsByBox } from './boxProgress.ts';
import { resumePlan } from './resume.ts';

// OPL-2026-06849: 35 bouquets per box over 3 boxes, recorded 35 / 18 / 35.
//
// The packer was moved off box 2 at 18 and filled box 3 instead, so the order
// came up 17 short in the MIDDLE. Two faults did it, and both are pinned here:
// the tally counted one bouquet once per component variety, and the box was
// allowed to be left below its cap.

/** What a bouquet scan actually writes: one row per component, each carrying
 *  the SAME bunch_qty — the number of bouquets. */
function bouquetRows(box: number, bouquets: number) {
    return [
        { bucket_id: String(box), item_code: 'Orange Wave-50CM', bunch_uom: 'Bunch(5)', bunch_qty: bouquets },
        { bucket_id: String(box), item_code: 'Pumba-50CM', bunch_uom: 'Bunch(3)', bunch_qty: bouquets },
        { bucket_id: String(box), item_code: 'Orange babe-50CM', bunch_uom: 'Bunch(2)', bunch_qty: bouquets },
        { bucket_id: String(box), item_code: 'Eucalyptus-50CM', bunch_uom: 'Bunch(3)', bunch_qty: bouquets },
    ];
}

test('A 4-VARIETY BOUQUET READS 35 OF 35 PER BOX, NOT 140', () => {
    const perBox = groupRowsByBox(bouquetRows(1, 35), 'bouquet');
    assert.equal(perBox.get(1)!.bunches, 35, '35 bouquets, not 4 x 35');
});

test('and its stems still sum across every component', () => {
    // 35 x (5 + 3 + 2 + 3) = 455. Stems were never wrong.
    const perBox = groupRowsByBox(bouquetRows(1, 35), 'bouquet');
    assert.equal(perBox.get(1)!.stems, 455);
});

test('the old sum is what closed box 2 at 18', () => {
    // Counted the old way, 18 bouquets read as 72 — twice a 35 cap.
    const summed = groupRowsByBox(bouquetRows(2, 18), 'straight');
    assert.equal(summed.get(2)!.bunches, 72, 'the bug, kept as the regression');
    const counted = groupRowsByBox(bouquetRows(2, 18), 'bouquet');
    assert.equal(counted.get(2)!.bunches, 18, 'the fix');
});

test('a mixed box still SUMS its varieties — they are not one bunch', () => {
    const rows = [
        { bucket_id: '1', item_code: 'A-50CM', bunch_uom: 'Bunch(10)', bunch_qty: 4 },
        { bucket_id: '1', item_code: 'B-50CM', bunch_uom: 'Bunch(10)', bunch_qty: 6 },
    ];
    assert.equal(groupRowsByBox(rows, 'mixed-box').get(1)!.bunches, 10);
});

test('a straight box is unchanged', () => {
    const rows = [
        { bucket_id: '1', item_code: 'A-50CM', bunch_uom: 'Bunch(10)', bunch_qty: 7 },
    ];
    const p = groupRowsByBox(rows, 'straight').get(1)!;
    assert.equal(p.bunches, 7);
    assert.equal(p.stems, 70);
});

test('an unevenly written bouquet counts the fullest variety, never less', () => {
    // Components are written in one request so this should not occur; if it
    // does, undercounting would close the box early all over again.
    const rows = [
        { bucket_id: '1', item_code: 'A-50CM', bunch_uom: 'Bunch(5)', bunch_qty: 35 },
        { bucket_id: '1', item_code: 'B-50CM', bunch_uom: 'Bunch(3)', bunch_qty: 34 },
    ];
    assert.equal(groupRowsByBox(rows, 'bouquet').get(1)!.bunches, 35);
});

test('rows with a non-numeric box are skipped, not merged into box 0', () => {
    const rows = [
        { bucket_id: '', item_code: 'A-50CM', bunch_uom: 'Bunch(5)', bunch_qty: 9 },
        { bucket_id: '2', item_code: 'A-50CM', bunch_uom: 'Bunch(5)', bunch_qty: 4 },
    ];
    const perBox = groupRowsByBox(rows, 'bouquet');
    assert.equal(perBox.size, 1);
    assert.equal(perBox.get(2)!.bunches, 4);
});

// ── resume returns to the hole ─────────────────────────────────────────────

test('RESUMING 35 / 18 / 35 OPENS AT BOX 2, the first below cap', () => {
    const perBox = groupRowsByBox(
        [...bouquetRows(1, 35), ...bouquetRows(2, 18), ...bouquetRows(3, 35)],
        'bouquet',
    );
    const plan = resumePlan(perBox, 35, 3, 'bunches');
    assert.equal(plan.boxNumber, 2, 'the hole is filled before anything after it');
    assert.equal(plan.inBox, 18);
    assert.ok(!plan.isComplete);
    assert.deepEqual(plan.completeBoxes, [1, 3]);
});

test('boxes fill 1, 2, 3 in order with none left short', () => {
    // Walk the sequence the way the packer does, one bouquet at a time.
    const cap = 35;
    const boxCount = 3;
    const filled = new Map<number, number>();

    const planBox = (boxNumber: number, inBox: number, increment: number) => {
        let nextBox = boxNumber;
        let count = inBox;
        if (count + increment > cap) {
            if (count < cap) return null;   // a box below cap keeps receiving
            nextBox += 1;
            count = 0;
        }
        return nextBox > boxCount ? null : { boxId: nextBox, after: count + increment };
    };

    let box = 1;
    let inBox = 0;
    for (let i = 0; i < cap * boxCount; i += 1) {
        const plan = planBox(box, inBox, 1);
        assert.ok(plan, `scan ${i + 1} must be accepted`);
        box = plan!.boxId;
        inBox = plan!.after;
        filled.set(box, inBox);
    }

    assert.deepEqual([...filled.entries()], [[1, 35], [2, 35], [3, 35]]);
    assert.equal(planBox(box, inBox, 1), null, 'and the order is then full');
});

test('a bunch too big for the gap is refused, and the box stays open', () => {
    const cap = 35;
    const planBox = (boxNumber: number, inBox: number, increment: number) => {
        let nextBox = boxNumber;
        let count = inBox;
        if (count + increment > cap) {
            if (count < cap) return null;
            nextBox += 1;
            count = 0;
        }
        return nextBox > 3 ? null : { boxId: nextBox, after: count + increment };
    };

    // Box 2 at 18 of 35 handed a 20-unit bunch: refused, NOT moved to box 3.
    assert.equal(planBox(2, 18, 20), null);
    // A bunch that fits is still accepted into the same box.
    assert.deepEqual(planBox(2, 18, 17), { boxId: 2, after: 35 });
    // And once it is full, the next scan moves on.
    assert.deepEqual(planBox(2, 35, 1), { boxId: 3, after: 1 });
});
