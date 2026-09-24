import assert from 'node:assert/strict';
import test from 'node:test';

import { mixedStemsPerBox, resolveGroupLines } from './mixGroup.ts';
import { varietyFromItemCode } from './lengths.ts';

// Pinned against the two live orders that exposed the bug.
//
// MILELE — SAL-ORD-2026-02139 / OPL-2026-05334. Ten lines share
// custom_mix_group = 1, each with custom_packrate_mixed_box = 50 and
// custom_number_of_boxes = 4. Nine carry the OPL; FUSCHIANA-40CM carries NULL.
// The order also has an eleventh, unrelated STRAIGHT line (Blue Lagoon-50CM,
// custom_mix_group 0, its own OPL) which must never be pulled into the group.
//
// Every field below is transcribed from the live document, not invented.

const MILELE_VARIETIES = [
    'Adalonia-40CM',
    'Dutchess-40CM',
    'Brinessa-40CM',
    'Celly-40CM',
    'FUSCHIANA-40CM', // the line the allocator never linked
    'Madam Ceries-40CM',
    'Trials-40CM',
    'Confidential-40CM',
    'Good Times-40CM',
    'Sovereign-40CM',
];

function mileleItems() {
    const mix = MILELE_VARIETIES.map((item_code) => ({
        item_code,
        // FUSCHIANA is the broken link — everything else points at the OPL.
        custom_opl: item_code === 'FUSCHIANA-40CM' ? null : 'OPL-2026-05334',
        custom_mixed_box: 1,
        custom_mix_group: 1,
        custom_mixed_bunch: 0,
        custom_bunch_group: null,
        custom_packrate: 0,
        custom_packrate_mixed_box: 50,
        custom_number_of_boxes: 4,
        qty: 200,
        uom: 'Stems',
    }));

    // Unrelated straight line on the SAME order, pointing at a different OPL.
    mix.push({
        item_code: 'Blue Lagoon-50CM',
        custom_opl: 'OPL-2026-05438',
        custom_mixed_box: 0,
        custom_mix_group: 0,
        custom_mixed_bunch: 0,
        custom_bunch_group: null,
        custom_packrate: 200,
        custom_packrate_mixed_box: 0,
        custom_number_of_boxes: 1,
        qty: 200,
        uom: 'Stems',
    });
    return mix;
}

// OMNIFLORA — SAL-ORD-2026-02314. Brinessa-50CM holds the OPL; Dutchess-50CM
// and Paranita-50CM are null. Packrates differ per line: 108 + 72 + 72 = 252.
function omniFloraItems() {
    return [
        { item_code: 'Brinessa-50CM', custom_opl: 'OPL-OMNI', custom_mixed_box: 1, custom_mix_group: 7, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate_mixed_box: 108, custom_number_of_boxes: 2 },
        { item_code: 'Dutchess-50CM', custom_opl: null, custom_mixed_box: 1, custom_mix_group: 7, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate_mixed_box: 72, custom_number_of_boxes: 2 },
        { item_code: 'Paranita-50CM', custom_opl: null, custom_mixed_box: 1, custom_mix_group: 7, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate_mixed_box: 72, custom_number_of_boxes: 2 },
    ];
}

test('Milele: the group carries all ten varieties, including the unlinked one', () => {
    const { rows, mode, groupField, groupValue } = resolveGroupLines(mileleItems(), 'OPL-2026-05334');
    assert.equal(mode, 'mixed-box');
    assert.equal(groupField, 'custom_mix_group');
    assert.equal(groupValue, '1');
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.map((r) => r.item_code), MILELE_VARIETIES);
});

test('Milele: FUSCHIANA is in the set despite custom_opl being null', () => {
    const { rows } = resolveGroupLines(mileleItems(), 'OPL-2026-05334');
    const fuschiana = rows.find((r) => r.item_code === 'FUSCHIANA-40CM');
    assert.ok(fuschiana, 'FUSCHIANA must be packable');
    assert.equal(fuschiana.custom_opl, null, 'and it is still the unlinked line');
});

test('Milele: the unrelated straight line is NOT dragged in by group id 0', () => {
    const { rows } = resolveGroupLines(mileleItems(), 'OPL-2026-05334');
    assert.ok(!rows.some((r) => r.item_code === 'Blue Lagoon-50CM'));
});

test('Milele: per-box target is 500 — ten lines at 50, not the nine that were linked', () => {
    const { rows } = resolveGroupLines(mileleItems(), 'OPL-2026-05334');
    assert.equal(mixedStemsPerBox(rows), 500);

    // What the link-based selection used to produce, kept as the regression it is.
    const linkedOnly = mileleItems().filter((r) => r.custom_opl === 'OPL-2026-05334');
    assert.equal(mixedStemsPerBox(linkedOnly), 450);
});

test('OmniFlora: three varieties, two of them unlinked, target 252', () => {
    const { rows, mode } = resolveGroupLines(omniFloraItems(), 'OPL-OMNI');
    assert.equal(mode, 'mixed-box');
    assert.equal(rows.length, 3);
    assert.equal(mixedStemsPerBox(rows), 252);
});

test('bouquet lines group on custom_bunch_group, not custom_mix_group', () => {
    const items = [
        { item_code: 'A-50CM', custom_opl: 'OPL-B', custom_mixed_bunch: 1, custom_bunch_group: 3, custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 120 },
        { item_code: 'B-50CM', custom_opl: null, custom_mixed_bunch: 1, custom_bunch_group: 3, custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 60 },
        // Same order, a DIFFERENT bouquet group — must not be included.
        { item_code: 'C-50CM', custom_opl: null, custom_mixed_bunch: 1, custom_bunch_group: 4, custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 99 },
    ];
    const { rows, mode, groupField } = resolveGroupLines(items, 'OPL-B');
    assert.equal(mode, 'bouquet');
    assert.equal(groupField, 'custom_bunch_group');
    assert.deepEqual(rows.map((r) => r.item_code), ['A-50CM', 'B-50CM']);
    assert.equal(mixedStemsPerBox(rows), 180);
});

test('a straight box is unaffected — still matched on custom_opl', () => {
    const items = [
        { item_code: 'Madam Red-50CM', custom_opl: 'OPL-S', custom_mixed_box: 0, custom_mix_group: 0, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate: 140 },
        { item_code: 'Madam Red-60CM', custom_opl: 'OPL-S', custom_mixed_box: 0, custom_mix_group: 0, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate: 140 },
        { item_code: 'Other-50CM', custom_opl: 'OPL-OTHER', custom_mixed_box: 0, custom_mix_group: 0, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate: 140 },
    ];
    const { rows, mode, groupField, groupValue } = resolveGroupLines(items, 'OPL-S');
    assert.equal(mode, 'straight');
    assert.equal(groupField, null);
    assert.equal(groupValue, null);
    assert.deepEqual(rows.map((r) => r.item_code), ['Madam Red-50CM', 'Madam Red-60CM']);
});

test('a mix with no group id falls back to the linked lines rather than nothing', () => {
    const items = [
        { item_code: 'A-40CM', custom_opl: 'OPL-X', custom_mixed_box: 1, custom_mix_group: null, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate_mixed_box: 50 },
        { item_code: 'B-40CM', custom_opl: null, custom_mixed_box: 1, custom_mix_group: null, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate_mixed_box: 50 },
    ];
    const { rows, groupValue } = resolveGroupLines(items, 'OPL-X');
    assert.equal(groupValue, null);
    assert.deepEqual(rows.map((r) => r.item_code), ['A-40CM']);
});

// Rule 3 matches on the TEMPLATE, which is what lets a longer bunch through.
test('group varieties reduce to templates so a 60CM bunch matches a 40CM line', () => {
    const { rows } = resolveGroupLines(mileleItems(), 'OPL-2026-05334');
    const templates = rows.map((r) => varietyFromItemCode(r.item_code));
    assert.ok(templates.includes('FUSCHIANA'));
    assert.ok(templates.includes('Madam Ceries'), 'a two-word variety keeps both words');
    assert.ok(!templates.includes('FUSCHIANA-40CM'));
});

test('a code whose suffix is not a length keeps all of itself', () => {
    assert.equal(varietyFromItemCode('Odd-Name'), 'Odd-Name');
    assert.equal(varietyFromItemCode('Brinessa-50CM'), 'Brinessa');
});

// ── the order-level fallback ────────────────────────────────────────────────
//
// On a BOUQUET order the allocator can leave custom_opl null on every line, so
// the seed step has nothing to read a group from. Four live orders are in that
// state — SAL-ORD-2026-02332 is Lovana-50CM, Malibu Purple-50CM,
// Royal Magic-50CM and Lepidium/Limonium-50CM, all four unlinked, one group.
//
// Lepidium/Limonium is bought in and never allocated, so it has no OPL row
// either: without the group it is invisible and unscannable.

function bouquetOrder(opl) {
    return [
        { item_code: 'Lovana-50CM', custom_opl: opl, custom_mixed_bunch: 1, custom_bunch_group: '1', custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 175 },
        { item_code: 'Malibu Purple-50CM', custom_opl: null, custom_mixed_bunch: 1, custom_bunch_group: '1', custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 70 },
        { item_code: 'Royal Magic-50CM', custom_opl: null, custom_mixed_bunch: 1, custom_bunch_group: '1', custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 105 },
        { item_code: 'Lepidium/Limonium-50CM', custom_opl: null, custom_mixed_bunch: 1, custom_bunch_group: '1', custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 105 },
    ];
}

test('no line carries the OPL: the group comes from the ORDER', () => {
    const { rows, mode, groupField, groupValue, viaOrder } = resolveGroupLines(
        bouquetOrder(null),
        'OPL-2026-05970',
    );
    assert.equal(mode, 'bouquet');
    assert.equal(groupField, 'custom_bunch_group');
    assert.equal(groupValue, '1');
    assert.equal(viaOrder, true, 'flagged, because the allocator did not write the link');
    assert.deepEqual(rows.map((r) => r.item_code), [
        'Lovana-50CM',
        'Malibu Purple-50CM',
        'Royal Magic-50CM',
        'Lepidium/Limonium-50CM',
    ]);
});

test('the bought-in component is in the set, and the group sums to the box target', () => {
    const { rows } = resolveGroupLines(bouquetOrder(null), 'OPL-2026-05970');
    assert.ok(rows.some((r) => r.item_code === 'Lepidium/Limonium-50CM'));
    assert.equal(mixedStemsPerBox(rows), 455);
});

test('one linked line is enough — the fallback does not engage', () => {
    const { rows, viaOrder } = resolveGroupLines(bouquetOrder('OPL-2026-05970'), 'OPL-2026-05970');
    assert.equal(viaOrder, undefined, 'the normal seed path handled it');
    assert.equal(rows.length, 4);
});

test('MORE THAN ONE group on the order: refuse to guess', () => {
    const twoGroups = [
        ...bouquetOrder(null),
        { item_code: 'Orange Wave-50CM', custom_opl: null, custom_mixed_bunch: 1, custom_bunch_group: '2', custom_mixed_box: 0, custom_mix_group: 0, custom_packrate_mixed_box: 50 },
    ];
    const res = resolveGroupLines(twoGroups, 'OPL-2026-05970');
    assert.equal(res.ambiguous, true);
    assert.deepEqual(res.rows, [], 'nothing resolved — picking wrong would fill the wrong box');
    assert.equal(res.mode, 'straight', "today's behaviour is kept");
});

test('mixed BOX orders fall back the same way, on custom_mix_group', () => {
    const boxOrder = [
        { item_code: 'A-40CM', custom_opl: null, custom_mixed_box: 1, custom_mix_group: '3', custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate_mixed_box: 50 },
        { item_code: 'B-40CM', custom_opl: null, custom_mixed_box: 1, custom_mix_group: '3', custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate_mixed_box: 50 },
    ];
    const { rows, mode, groupField, viaOrder } = resolveGroupLines(boxOrder, 'OPL-X');
    assert.equal(mode, 'mixed-box');
    assert.equal(groupField, 'custom_mix_group');
    assert.equal(viaOrder, true);
    assert.equal(rows.length, 2);
});

test('a STRAIGHT order with no links is unchanged — no fallback, no guess', () => {
    const straight = [
        { item_code: 'Madam Red-50CM', custom_opl: null, custom_mixed_box: 0, custom_mix_group: 0, custom_mixed_bunch: 0, custom_bunch_group: null, custom_packrate: 140 },
    ];
    const res = resolveGroupLines(straight, 'OPL-S');
    assert.equal(res.mode, 'straight');
    assert.equal(res.viaOrder, undefined);
    assert.deepEqual(res.rows, []);
});
