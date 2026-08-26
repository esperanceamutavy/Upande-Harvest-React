// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    findGradingEvent,
    formatBunches,
    formatTimestamp,
    graderLabel,
} from './format.ts';

const ev = (event: string, extra: Partial<{
    eventTime: string | null;
    gradedBy: string | null;
    gradedByName: string | null;
}> = {}) => ({
    event,
    eventTime: extra.eventTime ?? null,
    gradedBy: extra.gradedBy ?? null,
    gradedByName: extra.gradedByName ?? null,
});

test('bunch counts format to one decimal without changing the value', () => {
    // The live shape: Bunch(7) holding 25 stems.
    assert.equal(formatBunches(3.5714285714285716), '3.6');
    assert.equal(formatBunches(8.333333333333334), '8.3');
});

test('whole counts do not gain a decimal', () => {
    assert.equal(formatBunches(13), '13');
    assert.equal(formatBunches(2), '2');
    assert.equal(formatBunches(0), '0');
});

test('a missing or non-finite count renders as a dash, never NaN', () => {
    assert.equal(formatBunches(null), '—');
    assert.equal(formatBunches(undefined), '—');
    assert.equal(formatBunches(Number.NaN), '—');
    assert.equal(formatBunches(Number.POSITIVE_INFINITY), '—');
});

test('the Grading event is picked out of a mixed history', () => {
    const events = [
        ev('Receiving'),
        ev('Grading', { gradedByName: 'Silas Kiplagat', eventTime: '2026-08-20 09:14:00' }),
        ev('Shelving'),
    ];
    const found = findGradingEvent(events);
    assert.equal(found?.event, 'Grading');
    assert.equal(graderLabel(found), 'Silas Kiplagat');
});

test('grading match is case-insensitive and substring-tolerant', () => {
    assert.equal(findGradingEvent([ev('grading')])?.event, 'grading');
    assert.equal(findGradingEvent([ev('Re-Grading')])?.event, 'Re-Grading');
});

test('the FIRST grading event wins — a correction does not rewrite when it was graded', () => {
    const events = [
        ev('Grading', { gradedByName: 'First' }),
        ev('Grading', { gradedByName: 'Second' }),
    ];
    assert.equal(graderLabel(findGradingEvent(events)), 'First');
});

test('no grading event yields null rather than a wrong row', () => {
    assert.equal(findGradingEvent([ev('Receiving'), ev('Shelving')]), null);
    assert.equal(findGradingEvent([]), null);
    assert.equal(graderLabel(null), null);
});

test('grader falls back to the raw id when no Employee name resolved', () => {
    assert.equal(graderLabel(ev('Grading', { gradedBy: '2531' })), '2531');
    assert.equal(graderLabel(ev('Grading', { gradedBy: '2531', gradedByName: 'Eugene' })), 'Eugene');
    // Whitespace-only must not beat the id.
    assert.equal(graderLabel(ev('Grading', { gradedBy: '2531', gradedByName: '  ' })), '2531');
    assert.equal(graderLabel(ev('Grading')), null);
});

test('timestamps render readably', () => {
    assert.equal(formatTimestamp('2026-08-26 00:45:44.648120'), '26 Aug 2026, 00:45');
    assert.equal(formatTimestamp('2026-02-19 23:33:25'), '19 Feb 2026, 23:33');
    // Date only.
    assert.equal(formatTimestamp('2026-08-26'), '26 Aug 2026');
});

test('an unparseable timestamp is shown raw, not blanked', () => {
    // A raw value on screen beats hiding one behind a dash.
    assert.equal(formatTimestamp('whenever'), 'whenever');
    assert.equal(formatTimestamp('2026-99-01 00:00:00'), '2026-99-01 00:00:00');
    assert.equal(formatTimestamp(null), '—');
    assert.equal(formatTimestamp(''), '—');
});
