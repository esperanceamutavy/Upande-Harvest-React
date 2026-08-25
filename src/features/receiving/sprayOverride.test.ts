// The server rejects an override above the standard rate, and rejects zero or
// negative. These pin the client to the same bounds so a doomed value never
// posts. Every Spray Rose currently carries a standard of 90.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { standardRate, validateOverride } from './sprayOverride.ts';

test('accepts a count at or below the standard', () => {
    assert.deepEqual(validateOverride('10', 90), { ok: true, qty: 10 });
    assert.deepEqual(validateOverride('30', 90), { ok: true, qty: 30 });
    assert.deepEqual(validateOverride('50', 90), { ok: true, qty: 50 });
    // The boundary is inclusive — the standard itself is a legal override.
    assert.deepEqual(validateOverride('90', 90), { ok: true, qty: 90 });
});

test('rejects above the standard, naming the limit', () => {
    const r = validateOverride('91', 90);
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /above the standard 90/);
    assert.match((r as { reason: string }).reason, /90 or fewer/);
});

test('rejects zero and negative', () => {
    assert.equal(validateOverride('0', 90).ok, false);
    assert.equal(validateOverride('-5', 90).ok, false);
});

test('rejects empty and non-numeric rather than coercing', () => {
    assert.equal(validateOverride('', 90).ok, false);
    assert.equal(validateOverride('   ', 90).ok, false);
    // "12a" must not quietly become 12.
    assert.equal(validateOverride('12a', 90).ok, false);
    assert.equal(validateOverride('1.5', 90).ok, false);
});

test('with no standard known, only the positive check applies', () => {
    assert.deepEqual(validateOverride('500', null), { ok: true, qty: 500 });
    assert.equal(validateOverride('0', null).ok, false);
});

test('standardRate prefers the unbunched rate', () => {
    assert.equal(standardRate(90, 120), 90);
    assert.equal(standardRate(null, 120), 120);
    assert.equal(standardRate(0, 120), 120);
    assert.equal(standardRate(null, null), null);
    assert.equal(standardRate(undefined, undefined), null);
});
