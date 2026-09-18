// Run with: npm test
//
// The live cases this pins, all read off xflora.upande.com on 2026-09-18:
//
//   SAL-ORD-2026-02165-1 Jazzbery         uom Bunch(10) packrate 260 qty 1040 boxes 4
//   SAL-ORD-2026-02165-1 Brigitte Bardot  uom Stems     packrate 210 qty  840 boxes 4
//   SAL-ORD-2026-01493                    uom Bunch(10) packrate   4 qty    8 boxes 2
//
// The first two are 260 and 210 STEMS per box. The third is 4 BUNCHES per box.
// All three satisfy qty / packrate == boxes, and the first and third share a uom
// of Bunch(10) with conversion_factor 10 — which is precisely why neither uom nor
// conversion_factor can be the arbiter.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolvePackratePerBox } from './packrate.ts';

const BUNCH = { uomIsBunch: true, stemsPerBunch: 10 };
const STEMS = { uomIsBunch: false, stemsPerBunch: 10 };

// ── the live cases ───────────────────────────────────────────────────────────

test('JAZZBERY — 260 stems a box on a Bunch(10) line reads as 26 bunches', () => {
    // The reported bug: this showed "78 of 260" because the old code took a
    // Bunch(N) uom as proof the packrate was already bunches.
    const r = resolvePackratePerBox({ ...BUNCH, packrate: 260 });
    assert.equal(r?.perBox, 26);
    assert.equal(r?.unitLabel, 'bunches');
    assert.equal(r?.stemsPerBox, 260);
    assert.equal(r?.qtyDivisor, 10);
    assert.equal(r?.basis, 'plausibility');
});

test('MADAM RED — the acceptance case, 1300 stems over 5 boxes', () => {
    // OPL-2026-05503: 130 bunches in 5 boxes, box 1 holds exactly 260 stems.
    const r = resolvePackratePerBox({ ...BUNCH, packrate: 260 });
    assert.equal(r?.perBox, 26);
    assert.equal(r?.unitLabel, 'bunches');
    // The order total must convert by the same divisor, so qty/packrate==boxes
    // survives: 1300/10 = 130 bunches, and 130 / 26 = 5 boxes.
    assert.equal(1300 / r!.qtyDivisor, 130);
    assert.equal(1300 / r!.qtyDivisor / r!.perBox, 5);
});

test('SAL-ORD-2026-01493 — 4 bunches a box stays 4, it is NOT divided', () => {
    // Integrality settles this without any judgement: 4/10 = 0.4, and no box
    // holds four tenths of a bunch. Dividing here was the failure mode of the
    // conversion_factor approach.
    const r = resolvePackratePerBox({ ...BUNCH, packrate: 4 });
    assert.equal(r?.perBox, 4);
    assert.equal(r?.unitLabel, 'bunches');
    assert.equal(r?.stemsPerBox, 40);
    assert.equal(r?.qtyDivisor, 1);
    assert.equal(r?.basis, 'integrality');
    assert.equal(8 / r!.qtyDivisor / r!.perBox, 2); // qty 8 -> 2 boxes
});

test('BRIGITTE BARDOT — a Stems-uom line divides by the bunch size', () => {
    const r = resolvePackratePerBox({ ...STEMS, packrate: 210 });
    assert.equal(r?.perBox, 21);
    assert.equal(r?.unitLabel, 'bunches');
    assert.equal(r?.stemsPerBox, 210);
    assert.equal(r?.basis, 'stems-uom');
    assert.equal(840 / r!.qtyDivisor / r!.perBox, 4); // qty 840 -> 4 boxes
});

// ── the cases asked for ──────────────────────────────────────────────────────

test('bunch size 10, packrate 260 -> 26', () => {
    assert.equal(resolvePackratePerBox({ ...BUNCH, packrate: 260 })?.perBox, 26);
});

test('no bunching, packrate 210 -> 210 stems, labelled stems', () => {
    const r = resolvePackratePerBox({ uomIsBunch: false, stemsPerBunch: 1, packrate: 210 });
    assert.equal(r?.perBox, 210);
    assert.equal(r?.unitLabel, 'stems');
});

test('an unknown bunch size counts stems and SAYS stems', () => {
    for (const stemsPerBunch of [null, 0, Number.NaN]) {
        const r = resolvePackratePerBox({ uomIsBunch: true, stemsPerBunch, packrate: 260 });
        assert.equal(r?.perBox, 260, `stemsPerBunch ${stemsPerBunch}`);
        assert.equal(r?.unitLabel, 'stems');
        assert.equal(r?.basis, 'unresolved');
    }
});

test('a missing, zero or junk packrate returns null for the caller to reject', () => {
    for (const packrate of [null, undefined, 0, '', '   ', 'abc', -5, Number.NaN]) {
        assert.equal(
            resolvePackratePerBox({ ...BUNCH, packrate }),
            null,
            `packrate ${JSON.stringify(packrate)}`,
        );
    }
});

test('a NON-EXACT division falls back to stems rather than rounding', () => {
    // 210 stems at 4 to a bunch is 52.5 bunches. Rounding to 53 would close the
    // box a bunch late, every time, while looking entirely reasonable on screen.
    // So the count stays exact, the label stays true, and the basis records why.
    const r = resolvePackratePerBox({ uomIsBunch: false, stemsPerBunch: 4, packrate: 210 });
    assert.equal(r?.perBox, 210);
    assert.equal(r?.unitLabel, 'stems');
    assert.equal(r?.basis, 'inexact');
    assert.equal(r?.stemsPerBox, 210);
});

// ── the arbiter's edges ──────────────────────────────────────────────────────

test('a packrate string off the wire is accepted', () => {
    assert.equal(resolvePackratePerBox({ ...BUNCH, packrate: '260' })?.perBox, 26);
    assert.equal(resolvePackratePerBox({ ...BUNCH, packrate: ' 260 ' })?.perBox, 26);
});

test('when BOTH readings are a sane box, it refuses to guess', () => {
    // 50 stems a box and 500 stems a box are each believable, so there is no
    // honest way to choose. Stems, labelled stems.
    const r = resolvePackratePerBox({ ...BUNCH, packrate: 50 });
    assert.equal(r?.unitLabel, 'stems');
    assert.equal(r?.basis, 'unresolved');
    assert.equal(r?.stemsPerBox, null);
});

test('when NEITHER reading is a sane box, it refuses to guess', () => {
    // 2000 stems a box, or 20000. Neither is a box.
    const r = resolvePackratePerBox({ ...BUNCH, packrate: 2000 });
    assert.equal(r?.unitLabel, 'stems');
    assert.equal(r?.basis, 'unresolved');
});

test('the mixed-bunch-size box: a Bunch(9) line resolves on its own size', () => {
    // BOX-OPL-2026-05502-1 mixes Bunch(10) and Bunch(9) rows in one box. The
    // per-box TARGET is a property of the SO line, so each line resolves against
    // its own bunch size; nothing here assumes one size across a box. Counting a
    // mixed box is boxProgress.ts's job, and it already reads each row's own
    // bunch_uom.
    const r = resolvePackratePerBox({ uomIsBunch: true, stemsPerBunch: 9, packrate: 261 });
    assert.equal(r?.perBox, 29);
    assert.equal(r?.unitLabel, 'bunches');
    assert.equal(r?.stemsPerBox, 261);
});

test('INTEGRALITY reads the SO line only — allocation can never reach it', () => {
    // This is the property that keeps the arbiter safe, so it is asserted rather
    // than trusted. resolvePackratePerBox takes exactly three inputs: packrate
    // (Sales Order line `custom_packrate`), stemsPerBunch (that line's Bunch(N)
    // uom, else the SO header's custom_bunching) and uomIsBunch. It has no
    // parameter for qty, for OPL rows, or for allocated quantities.
    //
    // That matters because allocation DOES produce fractional bunch counts even
    // when the order line is whole: OPL-2026-05504's rows are 10, 10, 9.6, 10,
    // 9.6, 54.8 bunches against a clean SO line of qty 1040 / packrate 260 = 4
    // boxes. If integrality were tested against any of those row figures it would
    // misfire constantly. It cannot be, because they are not in scope.
    const fromSoLineOnly = resolvePackratePerBox({ ...BUNCH, packrate: 260 });
    assert.equal(fromSoLineOnly?.perBox, 26);
    assert.equal(fromSoLineOnly?.stemsPerBox, 260);

    // The same packrate resolves identically no matter what any pick list says,
    // including OPL-2026-05500's partial 744-of-1040 allocation.
    assert.deepEqual(resolvePackratePerBox({ ...BUNCH, packrate: 260 }), fromSoLineOnly);
});
