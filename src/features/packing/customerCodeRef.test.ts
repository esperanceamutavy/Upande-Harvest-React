// Pinned against live Customer Code records.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveCustomerCodeRef, toCustomerCodeRef } from './customerCodeRef.ts';

test('the LINE reference wins over the header', () => {
    assert.equal(
        resolveCustomerCodeRef('Dutch Flower Group (DFG)-TFC  BY AIR', 'OTHER-REF'),
        'Dutch Flower Group (DFG)-TFC  BY AIR',
    );
});

test('SAL-ORD-2026-01624 — header is a BLANK STRING, not null', () => {
    // Frappe stores an unset field as "", so `??` alone would return the blank.
    assert.equal(resolveCustomerCodeRef('DFG-TGW Flower 01', ''), 'DFG-TGW Flower 01');
});

test('a blank line falls back to the header', () => {
    assert.equal(resolveCustomerCodeRef('', 'DFG-TGW Flower 01'), 'DFG-TGW Flower 01');
    assert.equal(resolveCustomerCodeRef(null, 'DFG-TGW Flower 01'), 'DFG-TGW Flower 01');
    assert.equal(resolveCustomerCodeRef('   ', 'DFG-TGW Flower 01'), 'DFG-TGW Flower 01');
});

test('both absent yields null, so the caller omits the row', () => {
    assert.equal(resolveCustomerCodeRef('', ''), null);
    assert.equal(resolveCustomerCodeRef(null, undefined), null);
});

test('THE CASE THAT KILLED PARSING — name and code diverge entirely', () => {
    // OPL-2026-03432. No split of the NAME yields this code.
    const out = toCustomerCodeRef('Dutch Flower Group (DFG)-TFC  BY AIR', {
        code: 'TFC  ED3442-FT',
        customer: 'Dutch Flower Group (DFG)',
    });
    assert.equal(out.code, 'TFC  ED3442-FT');
    assert.equal(out.customer, 'Dutch Flower Group (DFG)');
    assert.equal(out.ref, 'Dutch Flower Group (DFG)-TFC  BY AIR');
});

test('the double space inside a code is PRESERVED, not collapsed', () => {
    assert.equal(toCustomerCodeRef('x', { code: 'TFC  ED3442-FT' }).code, 'TFC  ED3442-FT');
    // Ends are trimmed; the inside is untouched.
    assert.equal(toCustomerCodeRef('x', { code: '  TFC  ED3442-FT  ' }).code, 'TFC  ED3442-FT');
});

test('codes containing hyphens survive — nothing splits them any more', () => {
    assert.equal(toCustomerCodeRef('x', { code: 'TFC-IS0086-FT' }).code, 'TFC-IS0086-FT');
    assert.equal(toCustomerCodeRef('x', { code: 'TFC -AH3522' }).code, 'TFC -AH3522');
});

test('OPL-2026-03465 / 03466 — name tail equals code, so these are unchanged', () => {
    for (const code of ['TGW Flower 01', 'TGW Flower 02']) {
        const out = toCustomerCodeRef(`Dutch Flower Group (DFG)-${code}`, {
            code,
            customer: 'Dutch Flower Group (DFG)',
        });
        assert.equal(out.code, code);
    }
});

test('a MISSING record falls back to the stored reference', () => {
    const out = toCustomerCodeRef('Dutch Flower Group (DFG)-TFC  BY AIR', null);
    assert.equal(out.code, 'Dutch Flower Group (DFG)-TFC  BY AIR');
    assert.equal(out.customer, null);
    assert.equal(out.ref, 'Dutch Flower Group (DFG)-TFC  BY AIR');
});

test('a record with a BLANK code falls back to the reference too', () => {
    assert.equal(toCustomerCodeRef('DFG-SOMETHING', { code: '' }).code, 'DFG-SOMETHING');
    assert.equal(toCustomerCodeRef('DFG-SOMETHING', { code: '   ' }).code, 'DFG-SOMETHING');
    assert.equal(toCustomerCodeRef('DFG-SOMETHING', {}).code, 'DFG-SOMETHING');
});

test('a record with a code but no customer still resolves the code', () => {
    const out = toCustomerCodeRef('DFG-X', { code: 'TGW Flower 01', customer: '' });
    assert.equal(out.code, 'TGW Flower 01');
    assert.equal(out.customer, null);
});
