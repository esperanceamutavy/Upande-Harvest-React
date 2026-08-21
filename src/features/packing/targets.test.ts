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
    { unitLabel: 'bunches', capPerBox: 20, orderTotal: 120, stemsPerBunch: 10 },
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
    { unitLabel: 'bunches', capPerBox: 20, orderTotal: 120, stemsPerBunch: 10 },
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
    { unitLabel: 'stems', capPerBox: 200, orderTotal: 1200, stemsPerBunch: null },
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
    { unitLabel: 'bunches', capPerBox: 4, orderTotal: 8, stemsPerBunch: 10 },
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
