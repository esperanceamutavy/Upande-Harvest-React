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

// --- The split: strip the CUSTOMER PREFIX, not the last hyphen ---------------

test('THE CASE THAT DROVE THIS — the code keeps its own hyphen', () => {
    // Last-hyphen splitting gave "JED". The code is "Adnan flowers - JED".
    assert.deepEqual(splitCustomerCode('Azalea-Adnan flowers - JED', 'Azalea'), {
        code: 'Adnan flowers - JED',
        customer: 'Azalea',
    });
});

test('parentheses in the customer name are handled by construction', () => {
    assert.deepEqual(
        splitCustomerCode(
            'Dutch Flower Group (DFG)-TGW FT ROSE GRANDE',
            'Dutch Flower Group (DFG)',
        ),
        { code: 'TGW FT ROSE GRANDE', customer: 'Dutch Flower Group (DFG)' },
    );
});

test('a hyphenated customer name is stripped whole', () => {
    assert.deepEqual(splitCustomerCode('Fresh-From-Source-TGW 02', 'Fresh-From-Source'), {
        code: 'TGW 02',
        customer: 'Fresh-From-Source',
    });
});

test('the prefix matches case-insensitively, but the CODE is returned as stored', () => {
    const { code, customer } = splitCustomerCode('AZALEA-Adnan Flowers - JED', 'azalea');
    // Casing and inner spacing of the code are untouched.
    assert.equal(code, 'Adnan Flowers - JED');
    // The caption comes from the value as stored, not from the argument.
    assert.equal(customer, 'AZALEA');
});

test('surrounding whitespace on either side does not defeat the prefix', () => {
    assert.equal(splitCustomerCode('  Azalea-Adnan flowers - JED  ', ' Azalea ').code,
        'Adnan flowers - JED');
});

test('NO PREFIX — falls back to the last-hyphen split', () => {
    // Some codes may not carry the customer prefix at all.
    assert.deepEqual(splitCustomerCode('Gulf Flowers-KAT', 'Azalea'), {
        code: 'KAT',
        customer: 'Gulf Flowers',
    });
    // No customer known at all: same fallback.
    assert.deepEqual(splitCustomerCode('Flora Holland-BLUME 2000'), {
        code: 'BLUME 2000',
        customer: 'Flora Holland',
    });
    assert.deepEqual(splitCustomerCode('Flora Holland-BLUME 2000', null), {
        code: 'BLUME 2000',
        customer: 'Flora Holland',
    });
});

test('NO HYPHEN — the whole string is the code, with no caption', () => {
    assert.deepEqual(splitCustomerCode('TGWFT', 'Azalea'), { code: 'TGWFT', customer: null });
    assert.deepEqual(splitCustomerCode('TGW FLOWER 02'), {
        code: 'TGW FLOWER 02',
        customer: null,
    });
});

test('a prefix with nothing after it is not a split worth making', () => {
    assert.deepEqual(splitCustomerCode('Azalea-', 'Azalea'), { code: 'Azalea-', customer: null });
    assert.deepEqual(splitCustomerCode('DFG- ', 'DFG'), { code: 'DFG-', customer: null });
});

test('a customer that merely PREFIXES the value without a hyphen does not match', () => {
    // "Azalea Ltd-CODE" must not be stripped by customer "Azalea": the boundary
    // is `customer + "-"`, so this falls through to the last-hyphen split.
    assert.deepEqual(splitCustomerCode('Azalea Ltd-CODE', 'Azalea'), {
        code: 'CODE',
        customer: 'Azalea Ltd',
    });
});

test('live header codes still split correctly under the new rule', () => {
    assert.equal(splitCustomerCode('Flora Holland-BLUME 2000', 'Flora Holland').code,
        'BLUME 2000');
    assert.equal(splitCustomerCode('APH-APH N', 'APH').code, 'APH N');
    assert.equal(splitCustomerCode('Zami-ALDI 4.5+', 'Zami').code, 'ALDI 4.5+');
    assert.equal(splitCustomerCode('Azalea-BLOOMAX', 'Azalea').code, 'BLOOMAX');
    // Nested customer names: the prefix wins over the last hyphen.
    assert.deepEqual(
        splitCustomerCode('Dutch Flower Group (DFG)-TFC -AH3522', 'Dutch Flower Group (DFG)'),
        { code: 'TFC -AH3522', customer: 'Dutch Flower Group (DFG)' },
    );
});

test('end to end — resolve then split, header-sourced', () => {
    const raw = resolveCustomerCode('', 'Dutch Flower Group (DFG)-TGW FT ROSE GRANDE');
    assert.ok(raw);
    assert.equal(splitCustomerCode(raw, 'Dutch Flower Group (DFG)').code, 'TGW FT ROSE GRANDE');
});
