// Longer stems are cut DOWN to the order's length during packing, so the order
// governs both what is displayed and what is acceptable.
//
// Live case throughout: SAL-ORD-2026-01540 line "Brinessa-50CM" -> OPL-2026-03106
// whose item_locations are all 60CM and 70CM.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    compareLength,
    displayLength,
    orderLengthFromItemCode,
    parseLengthCm,
} from './lengths.ts';

test('DISPLAY — a 50CM order over a 60/70CM allocation shows 50CM', () => {
    // The pinning case, end to end: item_code -> order length -> what is shown.
    // The OPL says 60CM and 70CM; the box holds 50CM and so does the label.
    const orderLength = orderLengthFromItemCode('Brinessa-50CM');
    assert.equal(displayLength(orderLength, ['60CM', '70CM']), '50CM');
});

test('display falls back to the OPL lengths when the code has no suffix', () => {
    assert.equal(displayLength(orderLengthFromItemCode('Brinessa'), ['60CM', '70CM']), '60CM, 70CM');
    assert.equal(displayLength(null, ['60CM']), '60CM');
});

test('order length comes off the item_code suffix', () => {
    assert.equal(orderLengthFromItemCode('Brinessa-50CM'), '50CM');
    assert.equal(orderLengthFromItemCode('Madam Red-40CM'), '40CM');
    // Hyphenated variety names: the LAST hyphen wins.
    assert.equal(orderLengthFromItemCode('Multi-Word-Variety-70CM'), '70CM');
    assert.equal(orderLengthFromItemCode('NoSuffix'), null);
    assert.equal(orderLengthFromItemCode('Trailing-'), null);
    assert.equal(orderLengthFromItemCode(null), null);
});

test('RULE 3 — a 50CM order accepts 50CM, 60CM and 70CM', () => {
    assert.equal(compareLength('50CM', '50CM'), 'ok');
    assert.equal(compareLength('60CM', '50CM'), 'ok');
    assert.equal(compareLength('70CM', '50CM'), 'ok');
});

test('RULE 3 — a 50CM order rejects 40CM, which cannot be cut UP', () => {
    assert.equal(compareLength('40CM', '50CM'), 'shorter');
    assert.equal(compareLength('35CM', '50CM'), 'shorter');
});

test('RULE 3 — an unparseable length ALLOWS the scan rather than blocking', () => {
    // A format surprise must not stop a packer mid-shift.
    assert.equal(compareLength('', '50CM'), 'unknown');
    assert.equal(compareLength('Long', '50CM'), 'unknown');
    assert.equal(compareLength('50CM', null), 'unknown');
    assert.equal(compareLength('50CM', 'Standard'), 'unknown');
});

test('length parsing tolerates spacing and case', () => {
    assert.equal(parseLengthCm('50CM'), 50);
    assert.equal(parseLengthCm('50 cm'), 50);
    assert.equal(parseLengthCm('50'), 50);
    assert.equal(parseLengthCm('cm'), null);
    assert.equal(parseLengthCm(null), null);
});

test('comparison is numeric, not lexicographic', () => {
    // "9CM" > "70CM" as strings; 9 < 70 as numbers.
    assert.equal(compareLength('9CM', '70CM'), 'shorter');
    assert.equal(compareLength('100CM', '70CM'), 'ok');
});
