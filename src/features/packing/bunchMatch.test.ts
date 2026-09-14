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
