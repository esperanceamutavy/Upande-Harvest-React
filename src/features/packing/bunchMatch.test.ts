// Matching a scanned bunch to a pick list, mono and bouquet.
//
// The bouquet case in live data: TEST BUNCH = Celeb-40CM 3 + Madam Red-40CM 4
// + Adalonia-40CM 3, one Bunch(10), whose label carries item_code "Celeb-40CM"
// and names only that one.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    effectiveStemLength,
    matchBunchToOpl,
    type MatchableBunch,
} from './bunchMatch.ts';
import { compareLength } from './lengths.ts';

const mono: MatchableBunch = {
    itemCode: 'Celeb-50CM',
    variantParent: 'Celeb',
    isMixedBunch: false,
    components: [],
};

const bouquet: MatchableBunch = {
    itemCode: 'Celeb-40CM',
    variantParent: 'Celeb',
    isMixedBunch: true,
    components: [
        { variety: 'Celeb-40CM', variantParent: 'Celeb' },
        { variety: 'Madam Red-40CM', variantParent: 'Madam Red' },
        { variety: 'Adalonia-40CM', variantParent: 'Adalonia' },
    ],
};

const rows = (...codes: string[]) => codes.map((itemCode) => ({ itemCode }));

test('MONO — matches on the variant, and on the template', () => {
    assert.equal(matchBunchToOpl(mono, rows('Celeb-50CM')), null);
    assert.equal(matchBunchToOpl(mono, rows('Celeb')), null);
});

test('MONO — a different variety is refused, and named', () => {
    const m = matchBunchToOpl(mono, rows('Athena'));
    assert.deepEqual(m, { reason: 'variety-mismatch', missing: ['Celeb-50CM'] });
});

test('BOUQUET — accepted when EVERY component is on the pick list', () => {
    assert.equal(matchBunchToOpl(bouquet, rows('Celeb', 'Madam Red', 'Adalonia')), null);
});

test('BOUQUET — the pinning case: first variety present, others not', () => {
    // item_code is "Celeb-40CM", so a first-variety-only check would ACCEPT
    // this. It is a different bouquet and must be refused.
    const m = matchBunchToOpl(bouquet, rows('Celeb'));
    assert.deepEqual(m, {
        reason: 'variety-mismatch',
        missing: ['Madam Red-40CM', 'Adalonia-40CM'],
    });
});

test('BOUQUET — one missing component is enough to refuse, and is named', () => {
    const m = matchBunchToOpl(bouquet, rows('Celeb', 'Madam Red'));
    assert.deepEqual(m, { reason: 'variety-mismatch', missing: ['Adalonia-40CM'] });
});

test('BOUQUET — with no recipe it is refused rather than guessed at', () => {
    const bare = { ...bouquet, components: [] };
    assert.equal(matchBunchToOpl(bare, rows('Celeb'))?.reason, 'variety-mismatch');
});

// ── length ────────────────────────────────────────────────────────────────

/** Stand-in for compareLength, which answers 'ok' | 'shorter' | 'unknown'. */
const cmp = (a: string, b: string): string => {
    const n = (s: string) => parseInt(s, 10);
    if (Number.isNaN(n(a)) || Number.isNaN(n(b))) return 'unknown';
    return n(a) < n(b) ? 'shorter' : 'ok';
};

test('LENGTH — a mono bunch uses its own', () => {
    assert.equal(
        effectiveStemLength({ isMixedBunch: false, stemLength: '50CM', components: [] }, cmp),
        '50CM',
    );
});

test('LENGTH — a bouquet is governed by its SHORTEST component', () => {
    // A 40CM stem in a 50CM order is short however long the others are.
    const b = {
        isMixedBunch: true,
        stemLength: '60CM',
        components: [{ stemLength: '60CM' }, { stemLength: '40CM' }, { stemLength: '50CM' }],
    };
    assert.equal(effectiveStemLength(b, cmp), '40CM');
});

test('LENGTH — falls back to the header when components carry none', () => {
    const b = {
        isMixedBunch: true,
        stemLength: '50CM',
        components: [{ stemLength: '' }, { stemLength: '' }],
    };
    assert.equal(effectiveStemLength(b, cmp), '50CM');
});

// ── equal lengths must pass ────────────────────────────────────────────────
//
// BUNCH-380466 is a 50CM bouquet scanned against a 50CM line and rejected with
//
//     "50CM is shorter than the 50CM line it would fill. Pick 50CM or longer."
//
// compareLength was never at fault — it is `bunch >= order` and always has
// been. The bouquet's components are Orange Wave-50CM, Orange babe-50CM,
// Pumba-50CM and Eucalyptus-50CM, and the PUMBA row recorded stem_length
// "40CM" against its own -50CM item code. effectiveStemLength takes the
// shortest component, so the bouquet measured 40CM.
//
// useBunchDetails now resolves a component's length from its item code, which
// is what the order, the pick list and the box label all key on.

test('EQUAL LENGTHS PASS: 50CM against a 50CM line is accepted', () => {
    assert.equal(compareLength('50CM', '50CM'), 'ok');
});

test('longer passes, shorter does not', () => {
    assert.equal(compareLength('60CM', '50CM'), 'ok');
    assert.equal(compareLength('40CM', '50CM'), 'shorter');
});

test('THE LIVE BOUQUET: every component reads 50CM once resolved from item codes', () => {
    // What fetchComponents now produces for BUNCH-380466.
    const bunch = {
        isMixedBunch: true,
        stemLength: '50CM',
        components: [
            { stemLength: '50CM' }, // Orange Wave-50CM
            { stemLength: '50CM' }, // Orange babe-50CM
            { stemLength: '50CM' }, // Pumba-50CM  (stem_length field said 40CM)
            { stemLength: '50CM' }, // Eucalyptus-50CM
        ],
    };
    assert.equal(effectiveStemLength(bunch, compareLength), '50CM');
    assert.equal(compareLength(effectiveStemLength(bunch, compareLength), '50CM'), 'ok');
});

test('a bouquet that IS genuinely short is still refused', () => {
    // Not every short component is a data slip: a -40CM item really is 40CM.
    const bunch = {
        isMixedBunch: true,
        stemLength: '50CM',
        components: [{ stemLength: '50CM' }, { stemLength: '40CM' }],
    };
    assert.equal(effectiveStemLength(bunch, compareLength), '40CM');
    assert.equal(compareLength(effectiveStemLength(bunch, compareLength), '50CM'), 'shorter');
});

test('a straight bunch is measured by its own length', () => {
    const bunch = { isMixedBunch: false, stemLength: '50CM', components: [] };
    assert.equal(effectiveStemLength(bunch, compareLength), '50CM');
});
