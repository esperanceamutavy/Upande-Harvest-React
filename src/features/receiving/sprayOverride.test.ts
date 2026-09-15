// The server rejects an override above the standard rate, and rejects zero or
// negative. These pin the client to the same bounds so a doomed value never
// posts.
//
// Every live Spray Rose carries `custom_bucket_rate` 120 and no unbunched rate,
// so 120 is the usual standard; the one exception is Pavlova-40CM, whose
// unbunched rate of 100 lowers its ceiling (checked 2026-09-15). The 90s below
// are kept as an arbitrary standard — the bounds are what is under test, not
// any particular variety.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { quickPicks, standardRate, validateOverride } from './sprayOverride.ts';

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

// ── quick picks ───────────────────────────────────────────────────────────

test('QUICK PICKS — the normal 120 bucket offers all four', () => {
    assert.deepEqual(quickPicks(120), [30, 60, 90, 120]);
});

test('QUICK PICKS — every one offered is accepted by validateOverride', () => {
    // The point of the filter: no button on screen can fail when pressed.
    for (const standard of [120, 100, 90, 60, 45, 30]) {
        for (const n of quickPicks(standard)) {
            assert.equal(
                validateOverride(String(n), standard).ok,
                true,
                `${n} should be legal at standard ${standard}`,
            );
        }
    }
});

test('QUICK PICKS — Pavlova-40CM, whose unbunched rate is 100, drops the 120', () => {
    assert.deepEqual(quickPicks(100), [30, 60, 90]);
});

test('QUICK PICKS — a low standard can leave a single pick, or none', () => {
    assert.deepEqual(quickPicks(45), [30]);
    // Nothing to tap; the typed field is the only way in, which is correct.
    assert.deepEqual(quickPicks(20), []);
});

test('QUICK PICKS — with no standard known, nothing can be ruled out', () => {
    assert.deepEqual(quickPicks(null), [30, 60, 90, 120]);
    assert.deepEqual(quickPicks(0), [30, 60, 90, 120]);
});

test('standardRate prefers the unbunched rate', () => {
    assert.equal(standardRate(90, 120), 90);
    assert.equal(standardRate(null, 120), 120);
    assert.equal(standardRate(0, 120), 120);
    assert.equal(standardRate(null, null), null);
    assert.equal(standardRate(undefined, undefined), null);
});
