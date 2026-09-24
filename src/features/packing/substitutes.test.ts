import assert from 'node:assert/strict';
import test from 'node:test';

import { lengthFloorFor, scopeToOrder, substitutesForLine } from './substitutes.ts';
import type { ResolvedSubstituteRow } from './substitutes.ts';

// Pinned to the live case that was being rejected.
//
// SAL-ORD-2026-02326 / OPL-2026-05967 — one line, Madam Red-40CM at 40CM,
// 20 stems — carries a single substitute row:
//
//     for_item  Madam Red-40CM
//     variety   EVER RED-40CM
//
// Scanning BUNCH-303682 (EVER RED-40CM) gave
// "EVER RED-40CM is not on OPL-2026-05967".
//
// Both codes resolve through variant_of, verified against the live Item table:
//     Madam Red-40CM -> Madam Red      EVER RED-40CM -> EVER RED
// Rows below are POST-resolution, which is what the hook hands this module.

const EVER_RED: ResolvedSubstituteRow = {
    forItem: 'Madam Red-40CM',
    forTemplate: 'Madam Red',
    forLength: '40CM',
    variety: 'EVER RED-40CM',
    varietyTemplate: 'EVER RED',
    notes: null,
};

const ORDER_TEMPLATES = ['Madam Red'];

test('the live case: EVER RED is permitted against the Madam Red line', () => {
    const subs = scopeToOrder([EVER_RED], ORDER_TEMPLATES);
    assert.equal(subs.length, 1);
    assert.equal(subs[0].varietyTemplate, 'EVER RED');
});

test('the live case: a 40CM EVER RED bunch is measured against the 40CM line', () => {
    const subs = scopeToOrder([EVER_RED], ORDER_TEMPLATES);
    assert.equal(
        lengthFloorFor({
            bunchTemplate: 'EVER RED',
            orderTemplates: ORDER_TEMPLATES,
            substitutes: subs,
            orderLength: '40CM',
        }),
        '40CM',
        'the floor is the line it stands in for, so a 40CM bunch clears it',
    );
});

test('a substitute SHORTER than its for_item line is refused by the floor', () => {
    const subs = scopeToOrder(
        [{ ...EVER_RED, forItem: 'Madam Red-50CM', forLength: '50CM' }],
        ORDER_TEMPLATES,
    );
    // The floor comes back as the LINE's length; compareLength then refuses a
    // 40CM bunch against it. This asserts the floor, which is what this module owns.
    assert.equal(
        lengthFloorFor({
            bunchTemplate: 'EVER RED',
            orderTemplates: ORDER_TEMPLATES,
            substitutes: subs,
            orderLength: '50CM',
        }),
        '50CM',
    );
});

test('an UNLISTED variety is not permitted — Rule 3 still rejects it', () => {
    const subs = scopeToOrder([EVER_RED], ORDER_TEMPLATES);
    assert.ok(
        !subs.some((s) => s.varietyTemplate === 'Athena'),
        'nothing admits Athena, so the membership test never sees it',
    );
});

test('a substitute for a line on ANOTHER pick list does not leak in', () => {
    const other: ResolvedSubstituteRow = {
        forItem: 'Sovereign-50CM',
        forTemplate: 'Sovereign',
        forLength: '50CM',
        variety: 'Madam Cerise-50CM',
        varietyTemplate: 'Madam Cerise',
        notes: null,
    };
    const subs = scopeToOrder([EVER_RED, other], ORDER_TEMPLATES);
    assert.deepEqual(subs.map((s) => s.varietyTemplate), ['EVER RED']);
});

test('an order with NO substitutes behaves exactly as now', () => {
    assert.deepEqual(scopeToOrder([], ORDER_TEMPLATES), []);
    assert.equal(
        lengthFloorFor({
            bunchTemplate: 'EVER RED',
            orderTemplates: ORDER_TEMPLATES,
            substitutes: [],
            orderLength: '40CM',
        }),
        '40CM',
        'no substitutes means the order length, untouched',
    );
});

test("a variety on the order keeps the order's own length", () => {
    const subs = scopeToOrder([EVER_RED], ORDER_TEMPLATES);
    assert.equal(
        lengthFloorFor({
            bunchTemplate: 'Madam Red',
            orderTemplates: ORDER_TEMPLATES,
            substitutes: subs,
            orderLength: '40CM',
        }),
        '40CM',
    );
});

test('substituting for several lines takes the SHORTEST floor', () => {
    const subs = scopeToOrder(
        [
            { ...EVER_RED, forItem: 'Madam Red-60CM', forLength: '60CM' },
            { ...EVER_RED, forItem: 'Dutchess-40CM', forTemplate: 'Dutchess', forLength: '40CM' },
        ],
        ['Madam Red', 'Dutchess'],
    );
    assert.equal(
        lengthFloorFor({
            bunchTemplate: 'EVER RED',
            orderTemplates: ['Madam Red', 'Dutchess'],
            substitutes: subs,
            orderLength: '60CM',
        }),
        '40CM',
        'it can serve the least demanding line, so refusing it would block a permitted substitution',
    );
});

// ── display ─────────────────────────────────────────────────────────────────

test('the line lists its substitute, by template', () => {
    const subs = scopeToOrder([EVER_RED], ORDER_TEMPLATES);
    assert.deepEqual(
        substitutesForLine(subs, { template: 'Madam Red', length: '40CM' }),
        ['EVER RED'],
    );
});

test('a line with none lists none', () => {
    const subs = scopeToOrder([EVER_RED], ORDER_TEMPLATES);
    assert.deepEqual(substitutesForLine(subs, { template: 'Dutchess', length: '40CM' }), []);
});

test('length distinguishes two lines of the same variety', () => {
    const subs = scopeToOrder(
        [
            EVER_RED,
            { ...EVER_RED, forItem: 'Madam Red-50CM', forLength: '50CM', varietyTemplate: 'Athena' },
        ],
        ORDER_TEMPLATES,
    );
    assert.deepEqual(substitutesForLine(subs, { template: 'Madam Red', length: '40CM' }), ['EVER RED']);
    assert.deepEqual(substitutesForLine(subs, { template: 'Madam Red', length: '50CM' }), ['Athena']);
});

// The trap this module exists to avoid: a raw string compare, or a suffix strip,
// instead of variant_of.
test('matching is on resolved templates, never on the raw codes', () => {
    const subs = scopeToOrder([EVER_RED], ORDER_TEMPLATES);
    // The bunch arrives as its template; the table stored a variant. These differ
    // as strings and must still match.
    assert.notEqual(EVER_RED.variety, EVER_RED.varietyTemplate);
    assert.equal(
        lengthFloorFor({
            bunchTemplate: 'EVER RED',
            orderTemplates: ORDER_TEMPLATES,
            substitutes: subs,
            orderLength: '40CM',
        }),
        '40CM',
    );
});
