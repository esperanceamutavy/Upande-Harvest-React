// Regression guard for the packing cap arithmetic.
//
// A live blocker: SAL-ORD-2026-01494 is a Stems-uom order with packrate 200 and
// qty 1200. Those are STEMS — 20 bunches per box, 120 overall — but the screen
// rendered "200 bunches" and "1200 bunches", so the cap was never reached and
// the box could not close. Packers were stopped.
//
// `conversion_factor` is not the bunch size on such a line (it is 1), so the
// bunch size has to be resolved elsewhere. These cases pin that resolution and
// the three unit branches that follow from it.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveTargetUnits } from './targets.ts';

test('SAL-ORD-2026-01494 — Stems uom, bunch size from the OPL row', () => {
  assert.deepEqual(
    resolveTargetUnits({
      uom: 'Stems',
      packRate: 200,
      qty: 1200,
      conversionFactor: 1,
      oplUom: 'Bunch(10)',
      bunching: 'X10',
    }),
    { unitLabel: 'bunches', capPerBox: 20, orderTotal: 120, stemsPerBunch: 10, basis: 'stems-uom' },
  );
});

test('Stems uom, OPL row also Stems — falls back to custom_bunching', () => {
  assert.deepEqual(
    resolveTargetUnits({
      uom: 'Stems',
      packRate: 200,
      qty: 1200,
      conversionFactor: 1,
      oplUom: 'Stems',
      bunching: 'X10',
    }),
    { unitLabel: 'bunches', capPerBox: 20, orderTotal: 120, stemsPerBunch: 10, basis: 'stems-uom' },
  );
});

test('neither source resolves — counts STEMS and says so, no division', () => {
  assert.deepEqual(
    resolveTargetUnits({
      uom: 'Stems',
      packRate: 200,
      qty: 1200,
      conversionFactor: 1,
      oplUom: 'Stems',
      bunching: '',
    }),
    { unitLabel: 'stems', capPerBox: 200, orderTotal: 1200, stemsPerBunch: null, basis: 'unresolved' },
  );
});

test('SAL-ORD-2026-01493 — Bunch uom is already bunches, no double-divide', () => {
  assert.deepEqual(
    resolveTargetUnits({
      uom: 'Bunch(10)',
      packRate: 4,
      qty: 8,
      conversionFactor: 10,
      oplUom: 'Bunch(10)',
      bunching: 'X10',
    }),
    { unitLabel: 'bunches', capPerBox: 4, orderTotal: 8, stemsPerBunch: 10, basis: 'integrality' },
  );
});

test('custom_bunching parses with or without the leading X', () => {
  const base = { uom: 'Stems', packRate: 240, qty: 240, conversionFactor: 1, oplUom: 'Stems' };
  assert.equal(resolveTargetUnits({ ...base, bunching: 'X12' }).stemsPerBunch, 12);
  assert.equal(resolveTargetUnits({ ...base, bunching: 'x12' }).stemsPerBunch, 12);
  assert.equal(resolveTargetUnits({ ...base, bunching: '12' }).stemsPerBunch, 12);
  assert.equal(resolveTargetUnits({ ...base, bunching: 'rubbish' }).stemsPerBunch, null);
});

test('a number is never labelled bunches unless stemsPerBunch resolved', () => {
  const r = resolveTargetUnits({
    uom: 'Stems',
    packRate: 200,
    qty: 1200,
    conversionFactor: 1,
    oplUom: '',
    bunching: '',
  });
  assert.equal(r.stemsPerBunch, null);
  assert.equal(r.unitLabel, 'stems');
});

// ── the 2026-09-17/18 orders that exposed the unit bug ───────────────────────

test('JAZZBERY — the reported bug: 260 STEMS on a Bunch(10) line', () => {
  // SAL-ORD-2026-02165-1 / OPL-2026-05504. This showed "78 of 260" because a
  // Bunch(N) uom was taken as proof the packrate was already bunches. 78 bunches
  // was three full boxes of 26.
  assert.deepEqual(
    resolveTargetUnits({
      uom: 'Bunch(10)',
      packRate: 260,
      qty: 1040,
      conversionFactor: 10,
      oplUom: 'Bunch(10)',
      bunching: 'X10',
    }),
    { unitLabel: 'bunches', capPerBox: 26, orderTotal: 104, stemsPerBunch: 10, basis: 'plausibility' },
  );
});

test('MADAM RED — the acceptance case: box 1 holds 260 stems, cap reads 26', () => {
  // SAL-ORD-2026-02165-1 / OPL-2026-05503: 130 bunches in 5 boxes.
  const units = resolveTargetUnits({
    uom: 'Bunch(10)',
    packRate: 260,
    qty: 1300,
    conversionFactor: 10,
    oplUom: 'Bunch(10)',
    bunching: 'X10',
  });
  assert.equal(units.capPerBox, 26);
  assert.equal(units.unitLabel, 'bunches');
  assert.equal(units.orderTotal, 130);
  assert.equal(units.orderTotal / units.capPerBox, 5); // 5 boxes
});

test('BRIGITTE BARDOT — a Stems line on the same order still divides', () => {
  const units = resolveTargetUnits({
    uom: 'Stems',
    packRate: 210,
    qty: 840,
    conversionFactor: 1,
    oplUom: 'Stems',
    bunching: 'X10',
  });
  assert.equal(units.capPerBox, 21);
  assert.equal(units.unitLabel, 'bunches');
  assert.equal(units.orderTotal / units.capPerBox, 4); // 4 boxes
});

test('MIXED BUNCH SIZES — Bunch(10) and Bunch(9) in one box counts STEMS', () => {
  // BOX-OPL-2026-05502-1. No single number of stems means "a bunch" here, so no
  // bunch target could be honest.
  const units = resolveTargetUnits({
    uom: 'Bunch(10)',
    packRate: 260,
    qty: 1040,
    conversionFactor: 10,
    oplUom: 'Bunch(10)',
    bunching: 'X10',
    mixedBunchSizes: true,
  });
  assert.equal(units.unitLabel, 'stems');
  assert.equal(units.capPerBox, 260);
  assert.equal(units.orderTotal, 1040);
  assert.equal(units.basis, 'unresolved');
});

test('a bunch is not always 10 — X7 and X9 orders resolve on their own size', () => {
  // SAL-ORD-2026-02184 is X7, SAL-ORD-2026-02164 is X9. The size comes from the
  // order, never from a constant.
  const x7 = resolveTargetUnits({
    uom: 'Stems', packRate: 210, qty: 2016, conversionFactor: 1, oplUom: 'Stems', bunching: 'X7',
  });
  assert.equal(x7.capPerBox, 30);
  assert.equal(x7.stemsPerBunch, 7);

  const x9 = resolveTargetUnits({
    uom: 'Stems', packRate: 288, qty: 1728, conversionFactor: 1, oplUom: 'Stems', bunching: 'X9',
  });
  assert.equal(x9.capPerBox, 32);
  assert.equal(x9.stemsPerBunch, 9);
});
