import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ROLL_HOUR,
    localDate,
    packingDay,
    packingDayPlus,
    startOfPackingWeek,
} from './packingDay.ts';

// The shift runs past midnight. Every case below is a real moment on that
// shift, and the packing day must not change underneath it.

const at = (y: number, m: number, d: number, h: number, min = 0) =>
    new Date(y, m - 1, d, h, min);

test('the roll hour is 06:00', () => {
    assert.equal(ROLL_HOUR, 6);
});

test('before the roll, the packing day is still yesterday', () => {
    assert.equal(localDate(packingDay(at(2026, 9, 30, 0, 1))), '2026-09-29');
    assert.equal(localDate(packingDay(at(2026, 9, 30, 1, 0))), '2026-09-29');
    assert.equal(localDate(packingDay(at(2026, 9, 30, 5, 59))), '2026-09-29');
});

test('at the roll hour exactly, the new day begins', () => {
    assert.equal(localDate(packingDay(at(2026, 9, 30, 6, 0))), '2026-09-30');
});

test('after the roll, the packing day is the calendar day', () => {
    assert.equal(localDate(packingDay(at(2026, 9, 30, 9, 0))), '2026-09-30');
    assert.equal(localDate(packingDay(at(2026, 9, 30, 23, 59))), '2026-09-30');
});

test('THE SEAM: 23:59 and 00:01 are the SAME packing day', () => {
    const before = localDate(packingDay(at(2026, 9, 29, 23, 59)));
    const after = localDate(packingDay(at(2026, 9, 30, 0, 1)));
    assert.equal(before, after, 'the shift must not change day underneath the packers');
    assert.equal(before, '2026-09-29');
});

// ── the picker's windows ───────────────────────────────────────────────────

test('THE LIVE CHECK: at 01:00 on 30 Sep, "Today" lists deliveries of 30 Sep', () => {
    // "Today" is delivery_date = the packing day + 1.
    assert.equal(packingDayPlus(1, at(2026, 9, 30, 1, 0)), '2026-09-30');
});

test('at 23:59 on 29 Sep, "Today" lists the same deliveries', () => {
    assert.equal(packingDayPlus(1, at(2026, 9, 29, 23, 59)), '2026-09-30');
});

test('after the roll it moves on', () => {
    assert.equal(packingDayPlus(1, at(2026, 9, 30, 7, 0)), '2026-10-01');
});

test('"Yesterday" is the packing day minus one', () => {
    assert.equal(packingDayPlus(-1, at(2026, 9, 30, 1, 0)), '2026-09-28');
    assert.equal(packingDayPlus(-1, at(2026, 9, 30, 9, 0)), '2026-09-29');
});

// ── boundaries the naive version gets wrong ────────────────────────────────

test('crossing a month boundary', () => {
    assert.equal(localDate(packingDay(at(2026, 10, 1, 2, 0))), '2026-09-30');
    assert.equal(packingDayPlus(1, at(2026, 10, 1, 2, 0)), '2026-10-01');
});

test('crossing a year boundary', () => {
    assert.equal(localDate(packingDay(at(2027, 1, 1, 3, 0))), '2026-12-31');
});

test('a leap day', () => {
    assert.equal(localDate(packingDay(at(2028, 3, 1, 2, 0))), '2028-02-29');
});

// ── the week ───────────────────────────────────────────────────────────────

test('the week starts Monday, and follows the PACKING day', () => {
    // Monday 28 Sep 2026 at 02:00 is still Sunday's packing day, so the week
    // is the one that began Monday 21 Sep.
    assert.equal(localDate(startOfPackingWeek(at(2026, 9, 28, 2, 0))), '2026-09-21');
    // The same Monday at 09:00 is in the new week.
    assert.equal(localDate(startOfPackingWeek(at(2026, 9, 28, 9, 0))), '2026-09-28');
});

test('Sunday belongs to the week that started the previous Monday', () => {
    assert.equal(localDate(startOfPackingWeek(at(2026, 10, 4, 9, 0))), '2026-09-28');
});

test('localDate never drifts to UTC', () => {
    // toISOString would report the previous day for any evening moment in a
    // positive-offset timezone. This is local by construction.
    assert.equal(localDate(new Date(2026, 8, 30, 23, 30)), '2026-09-30');
});
