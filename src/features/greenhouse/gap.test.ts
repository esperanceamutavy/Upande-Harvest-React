// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatFlow, formatGap } from './gap.ts';
import { localDate, rangeFor } from './dateRange.ts';

test('a positive gap is stems not yet shelved', () => {
    assert.deepEqual(formatGap(900), { text: '900 short', tone: 'short' });
    assert.deepEqual(formatGap(12500), { text: '12,500 short', tone: 'short' });
});

test('A NEGATIVE GAP IS NORMAL — no minus sign, not an error tone', () => {
    // Live values from one day: buckets received before the window, shelved in
    // it. This must never read as a fault.
    assert.deepEqual(formatGap(-80), { text: '80 over', tone: 'over' });
    assert.deepEqual(formatGap(-140), { text: '140 over', tone: 'over' });
    assert.deepEqual(formatGap(-240), { text: '240 over', tone: 'over' });
    // The tone is 'over', never 'short' — the screen colours 'over' muted.
    assert.notEqual(formatGap(-240).tone, 'short');
    assert.ok(!formatGap(-240).text.includes('-'));
});

test('zero is the target state and says so', () => {
    assert.deepEqual(formatGap(0), { text: 'level', tone: 'level' });
});

test('missing or non-finite renders a dash, never NaN', () => {
    assert.equal(formatGap(null).text, '—');
    assert.equal(formatGap(undefined).text, '—');
    assert.equal(formatGap(Number.NaN).text, '—');
});

test('the flow line carries STEMS ONLY, never bucket counts', () => {
    // A5 has 21 received buckets against 38 transferred, because a bucket can
    // move more than once. Those numbers must not appear on this line.
    const line = formatFlow(2020, 1120, 1120);
    assert.equal(line, '2,020 received · 1,120 transferred · 1,120 shelved');
    assert.ok(!line.includes('21'));
    assert.ok(!line.includes('38'));
    assert.ok(!line.includes('bucket'));
});

// --- date windows ----------------------------------------------------------

test('today is a single day', () => {
    const now = new Date(2026, 7, 31); // 31 Aug 2026, a Monday
    assert.deepEqual(rangeFor('today', now), ['2026-08-31', '2026-08-31']);
});

test('yesterday is a single day and crosses the month boundary', () => {
    assert.deepEqual(rangeFor('yesterday', new Date(2026, 7, 31)), ['2026-08-30', '2026-08-30']);
    assert.deepEqual(rangeFor('yesterday', new Date(2026, 8, 1)), ['2026-08-31', '2026-08-31']);
});

test('the week is Monday to Sunday and always contains today', () => {
    // Monday
    assert.deepEqual(rangeFor('week', new Date(2026, 7, 31)), ['2026-08-31', '2026-09-06']);
    // Wednesday of the same week
    assert.deepEqual(rangeFor('week', new Date(2026, 8, 2)), ['2026-08-31', '2026-09-06']);
    // SUNDAY must belong to the week that STARTED on Monday, not the next one.
    assert.deepEqual(rangeFor('week', new Date(2026, 8, 6)), ['2026-08-31', '2026-09-06']);
});

test('dates use the LOCAL calendar, not UTC', () => {
    // Late evening east of UTC would roll forward a day under toISOString().
    const late = new Date(2026, 7, 31, 23, 30);
    assert.equal(localDate(late), '2026-08-31');
    assert.deepEqual(rangeFor('today', late), ['2026-08-31', '2026-08-31']);
});
