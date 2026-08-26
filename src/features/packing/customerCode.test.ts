// Pinned against live orders SAL-ORD-2026-01624 and SAL-ORD-2026-01578.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveCustomerCode, splitCustomerCode } from './customerCode.ts';

test('the LINE code wins over the header', () => {
    assert.equal(
        resolveCustomerCode('Dutch Flower Group (DFG)-TGW FT ROSE GRANDE', 'HEADER-CODE'),
        'Dutch Flower Group (DFG)-TGW FT ROSE GRANDE',
    );
});

test('SAL-ORD-2026-01624 — lines set, header BLANK STRING not null', () => {
    // Frappe stores an unset Data field as "", so `??` alone would latch onto
    // the blank and return it. This is the case that made the picker empty.
    assert.equal(
        resolveCustomerCode('Dutch Flower Group (DFG)-TGW FT ROSE GRANDE', ''),
        'Dutch Flower Group (DFG)-TGW FT ROSE GRANDE',
    );
});

test('a blank LINE falls back to the header', () => {
    assert.equal(resolveCustomerCode('', 'DFG-TGW FT'), 'DFG-TGW FT');
    assert.equal(resolveCustomerCode(null, 'DFG-TGW FT'), 'DFG-TGW FT');
    assert.equal(resolveCustomerCode(undefined, 'DFG-TGW FT'), 'DFG-TGW FT');
    // Whitespace-only is absent, not a value.
    assert.equal(resolveCustomerCode('   ', 'DFG-TGW FT'), 'DFG-TGW FT');
});

test('both empty yields null, so the caller can omit the row', () => {
    assert.equal(resolveCustomerCode('', ''), null);
    assert.equal(resolveCustomerCode(null, null), null);
    assert.equal(resolveCustomerCode(undefined, undefined), null);
    assert.equal(resolveCustomerCode('  ', ''), null);
});

test('THE LIVE CASE — codes contain spaces, split on the LAST hyphen', () => {
    const { code, customer } = splitCustomerCode('Dutch Flower Group (DFG)-TGW FT ROSE GRANDE');
    assert.equal(code, 'TGW FT ROSE GRANDE');
    assert.equal(customer, 'Dutch Flower Group (DFG)');
});

test('a hyphenated customer name does not break the split', () => {
    // Last hyphen wins, so the customer part keeps its own hyphens.
    const { code, customer } = splitCustomerCode('Fresh-From-Source-TGW FLOWER 02');
    assert.equal(code, 'TGW FLOWER 02');
    assert.equal(customer, 'Fresh-From-Source');
});

test('no hyphen returns the whole value as the code', () => {
    assert.deepEqual(splitCustomerCode('TGWFT'), { code: 'TGWFT', customer: null });
    assert.deepEqual(splitCustomerCode('TGW FLOWER 02'), { code: 'TGW FLOWER 02', customer: null });
});

test('a trailing hyphen keeps the raw value rather than inventing a split', () => {
    assert.deepEqual(splitCustomerCode('DFG-'), { code: 'DFG-', customer: null });
    assert.deepEqual(splitCustomerCode('DFG- '), { code: 'DFG-', customer: null });
});

test('surrounding whitespace is trimmed, inner spacing preserved', () => {
    const { code, customer } = splitCustomerCode('  DFG - TGW  FT ROSE  ');
    assert.equal(code, 'TGW  FT ROSE');
    assert.equal(customer, 'DFG');
});

test('end to end — resolve then split, header-sourced', () => {
    const raw = resolveCustomerCode('', 'Dutch Flower Group (DFG)-TGW FT ROSE GRANDE');
    assert.ok(raw);
    assert.equal(splitCustomerCode(raw).code, 'TGW FT ROSE GRANDE');
});

// --- Live HEADER codes -------------------------------------------------------
// 248 submitted Sales Orders carry a header code. These are real values, pinned
// so the split's behaviour on them is a recorded decision rather than a surprise.

test('live header codes split as expected', () => {
    assert.equal(splitCustomerCode('Flora Holland-BLUME 2000').code, 'BLUME 2000');
    assert.equal(splitCustomerCode('APH-APH N').code, 'APH N');
    assert.equal(splitCustomerCode('Zami-ALDI 4.5+').code, 'ALDI 4.5+');
    assert.equal(splitCustomerCode('Azalea-BLOOMAX').code, 'BLOOMAX');
});

test('a code containing " - " splits at the LAST hyphen — known, unchanged', () => {
    // "Azalea-Adnan flowers - JED" yields "JED", not "Adnan flowers - JED".
    // Arguably the customer is "Azalea" and the code is the rest, but the
    // last-hyphen rule is deliberate and shared with the box label, so this is
    // recorded rather than special-cased.
    assert.deepEqual(splitCustomerCode('Azalea-Adnan flowers - JED'), {
        code: 'JED',
        customer: 'Azalea-Adnan flowers',
    });
    assert.deepEqual(splitCustomerCode('Dutch Flower Group (DFG)-TFC -AH3522'), {
        code: 'AH3522',
        customer: 'Dutch Flower Group (DFG)-TFC',
    });
});
