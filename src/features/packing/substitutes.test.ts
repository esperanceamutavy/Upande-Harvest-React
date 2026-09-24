import assert from 'node:assert/strict';
import test from 'node:test';

import { lengthFloorFor, permittedSubstitutes, substitutesForLine } from './substitutes.ts';

// An Adalonia-40CM line that accepts Athena or Brinessa in its place, plus a
// line on a DIFFERENT pick list of the same order, which must never leak in.
const ORDER_LINES = ['Adalonia-40CM', 'Dutchess-40CM'];

const TABLE = [
    { for_item: 'Adalonia-40CM', variety: 'Athena-40CM', notes: 'agreed with the customer' },
    { for_item: 'Adalonia-40CM', variety: 'Brinessa-40CM', notes: null },
    // for_item is NOT on this pick list — belongs to another OPL of the order.
    { for_item: 'Sovereign-50CM', variety: 'Madam Red-50CM', notes: null },
    // Unusable rows.
    { for_item: '', variety: 'Ghost-40CM', notes: null },
    { for_item: 'Adalonia-40CM', variety: '  ', notes: null },
];

test('only substitutes whose for_item is on this pick list are permitted', () => {
    const subs = permittedSubstitutes(TABLE, ORDER_LINES);
    assert.deepEqual(
        subs.map((s) => s.varietyBase),
        ['Athena', 'Brinessa'],
    );
    assert.ok(
        !subs.some((s) => s.varietyBase === 'Madam Red'),
        'a substitute for another pick list must not leak in',
    );
});

test('both sides resolve to templates, and the line length is carried', () => {
    const [athena] = permittedSubstitutes(TABLE, ORDER_LINES);
    assert.equal(athena.forItem, 'Adalonia-40CM');
    assert.equal(athena.forVariety, 'Adalonia');
    assert.equal(athena.forLength, '40CM');
    assert.equal(athena.variety, 'Athena-40CM');
    assert.equal(athena.varietyBase, 'Athena');
    assert.equal(athena.notes, 'agreed with the customer');
});

test('an order with no substitutes yields none — the unchanged path', () => {
    assert.deepEqual(permittedSubstitutes([], ORDER_LINES), []);
});

// ── the floor ───────────────────────────────────────────────────────────────

const SUBS = permittedSubstitutes(TABLE, ORDER_LINES);

test('a listed substitute is measured against the line it stands in for', () => {
    assert.equal(
        lengthFloorFor({
            bunchVariety: 'Athena',
            orderVarieties: ['Adalonia', 'Dutchess'],
            substitutes: SUBS,
            orderLength: '50CM', // the order's headline — must NOT be used here
        }),
        '40CM',
    );
});

test("a variety on the order keeps the order's own length", () => {
    assert.equal(
        lengthFloorFor({
            bunchVariety: 'Adalonia',
            orderVarieties: ['Adalonia', 'Dutchess'],
            substitutes: SUBS,
            orderLength: '40CM',
        }),
        '40CM',
    );
});

test('an unlisted variety falls back to the order length — and Rule 3 rejects it on variety anyway', () => {
    assert.equal(
        lengthFloorFor({
            bunchVariety: 'Madam Red',
            orderVarieties: ['Adalonia', 'Dutchess'],
            substitutes: SUBS,
            orderLength: '40CM',
        }),
        '40CM',
    );
});

test('substituting for several lines takes the SHORTEST floor', () => {
    const many = permittedSubstitutes(
        [
            { for_item: 'Adalonia-60CM', variety: 'Athena-60CM' },
            { for_item: 'Dutchess-40CM', variety: 'Athena-40CM' },
        ],
        ['Adalonia-60CM', 'Dutchess-40CM'],
    );
    assert.equal(
        lengthFloorFor({
            bunchVariety: 'Athena',
            orderVarieties: ['Adalonia', 'Dutchess'],
            substitutes: many,
            orderLength: '60CM',
        }),
        '40CM',
        'it can serve the least demanding line, so refusing it would block a permitted substitution',
    );
});

test('no substitutes at all leaves the floor exactly as it was', () => {
    assert.equal(
        lengthFloorFor({
            bunchVariety: 'Athena',
            orderVarieties: ['Adalonia'],
            substitutes: [],
            orderLength: '50CM',
        }),
        '50CM',
    );
});

// ── display ─────────────────────────────────────────────────────────────────

test('a line lists its own substitutes, by template', () => {
    assert.deepEqual(
        substitutesForLine(SUBS, { variety: 'Adalonia', length: '40CM' }),
        ['Athena', 'Brinessa'],
    );
});

test('a line with none lists none', () => {
    assert.deepEqual(substitutesForLine(SUBS, { variety: 'Dutchess', length: '40CM' }), []);
});

test('length distinguishes two lines of the same variety', () => {
    const subs = permittedSubstitutes(
        [
            { for_item: 'Adalonia-40CM', variety: 'Athena-40CM' },
            { for_item: 'Adalonia-50CM', variety: 'Brinessa-50CM' },
        ],
        ['Adalonia-40CM', 'Adalonia-50CM'],
    );
    assert.deepEqual(substitutesForLine(subs, { variety: 'Adalonia', length: '40CM' }), ['Athena']);
    assert.deepEqual(substitutesForLine(subs, { variety: 'Adalonia', length: '50CM' }), ['Brinessa']);
});
