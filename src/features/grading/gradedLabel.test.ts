import assert from 'node:assert/strict';
import test from 'node:test';

import { bunchIdentity, componentLabel, gradedHeadline } from './gradedLabel.ts';

// Pinned to the live bunch that exposed the bug.
//
// BUNCH-289162 — Bunch(20), item_code "Good Times-35CM", components
// Good Times-35CM 7 + Albatross-35CM 7 + Brinessa-35CM 6 = 20.
//
// `mobile_grading_entry` answers `variety: "Good Times-35CM", qty: 20`, because
// it returns `item_code` and the doctype's own field description says that names
// the FIRST variety only. Rendering it told a grader they had 20 Good Times.

const BUNCH_289162 = [
    { variety: 'Good Times-35CM', stems: 7, stemLength: '35CM' },
    { variety: 'Albatross-35CM', stems: 7, stemLength: '35CM' },
    { variety: 'Brinessa-35CM', stems: 6, stemLength: '35CM' },
];

test('a bouquet is named by its SIZE and names no variety', () => {
    const headline = gradedHeadline({
        isMixedBunch: true,
        bunchUom: 'Bunch(20)',
        qty: 20,
        variety: 'Good Times-35CM', // what the server returns — must not appear
    });
    assert.equal(headline, 'Bunch(20) graded');
    assert.ok(!headline.includes('Good Times'), 'the first variety must not stand for the bunch');
    assert.ok(!headline.includes('Albatross'));
});

test('every component is listed with its stem count', () => {
    const lines = BUNCH_289162.map(componentLabel);
    assert.deepEqual(lines, ['Good Times-35CM 7', 'Albatross-35CM 7', 'Brinessa-35CM 6']);
    // The recipe accounts for the whole bunch — 7 + 7 + 6 = Bunch(20).
    assert.equal(
        BUNCH_289162.reduce((n, c) => n + c.stems, 0),
        20,
    );
});

test('a mono bunch is unchanged and still names its variety', () => {
    assert.equal(
        gradedHeadline({
            isMixedBunch: false,
            bunchUom: 'Bunch(10)',
            qty: 10,
            variety: 'Athena-35CM',
        }),
        'Graded: 10 stems · Athena-35CM',
    );
});

test('a mono bunch with no variety returned still reads sensibly', () => {
    assert.equal(
        gradedHeadline({ isMixedBunch: false, bunchUom: null, qty: 10, variety: null }),
        'Graded: 10 stems',
    );
    assert.equal(
        gradedHeadline({ isMixedBunch: false, bunchUom: null, qty: null, variety: null }),
        'Graded: graded',
    );
});

test('a bouquet whose size is missing falls back to the count, never to a variety', () => {
    const headline = gradedHeadline({
        isMixedBunch: true,
        bunchUom: null,
        qty: 20,
        variety: 'Good Times-35CM',
    });
    assert.equal(headline, '20 stems graded');
    assert.ok(!headline.includes('Good Times'));
});

test('a bouquet with neither size nor count still says what it is', () => {
    assert.equal(
        gradedHeadline({ isMixedBunch: true, bunchUom: null, qty: null, variety: 'Good Times-35CM' }),
        'Bouquet graded',
    );
});

test('a component with no stems recorded still names its variety', () => {
    assert.equal(componentLabel({ variety: 'Albatross-35CM', stems: 0, stemLength: null }), 'Albatross-35CM 0');
});

// Grading and traceability must say the same thing about the same bunch.
test('bunchIdentity is the size, and grading is that plus a verb', () => {
    const opts = { isMixedBunch: true, bunchUom: 'Bunch(20)', qty: 20 };
    assert.equal(bunchIdentity(opts), 'Bunch(20)');
    assert.equal(gradedHeadline({ ...opts, variety: 'Good Times-35CM' }), 'Bunch(20) graded');
});

test('bunchIdentity falls back to the count, never to a variety', () => {
    assert.equal(bunchIdentity({ isMixedBunch: true, bunchUom: null, qty: 20 }), '20 stems');
    assert.equal(bunchIdentity({ isMixedBunch: true, bunchUom: null, qty: null }), 'Bouquet');
});
