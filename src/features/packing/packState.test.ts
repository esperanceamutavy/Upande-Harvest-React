import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPackList, NOT_STARTED, startedFirst } from './packState.ts';

// Pinned to the live report:
//
//   OPL-2026-06186  delivery 2026-09-27  FPL-2026-00859 docstatus 0
//   OPL-2026-06283  delivery 2026-09-27  no Farm Pack List
//
// Both are due. 06186 was invisible to the packers who were midway through it,
// because a draft pack list classified as its own 'in_progress' status.

test('THE LIVE CASE: a draft pack list is still To pack', () => {
    const c = classifyPackList(0);
    assert.equal(c.status, 'to_pack', 'OPL-2026-06186 must sit with the work still to do');
    assert.ok(c.started, 'and must be marked as begun');
});

test('no pack list is To pack, untouched', () => {
    assert.deepEqual(NOT_STARTED, { status: 'to_pack', started: false });
});

test('only a SUBMITTED pack list is Packed', () => {
    assert.deepEqual(classifyPackList(1), { status: 'packed', started: false });
});

test('docstatus arrives as a string over REST', () => {
    assert.deepEqual(classifyPackList('1'), { status: 'packed', started: false });
    assert.deepEqual(classifyPackList('0'), { status: 'to_pack', started: true });
});

test('nothing classifies as an empty tab — every case lands on to_pack or packed', () => {
    for (const ds of [0, 1, '0', '1', null, undefined]) {
        assert.ok(['to_pack', 'packed'].includes(classifyPackList(ds).status));
    }
});

test('a part-packed row is never Packed until the last box closes', () => {
    // 3 of 10 boxes, pack list still open.
    assert.equal(classifyPackList(0).status, 'to_pack');
});

// ── startedFirst ───────────────────────────────────────────────────────────

const row = (name: string, started: boolean) => ({ name, started });

test('part-packed rows lift to the top', () => {
    const out = startedFirst([
        row('OPL-2026-06283', false),
        row('OPL-2026-06186', true),
        row('OPL-2026-06290', false),
    ]);
    assert.deepEqual(out.map((r) => r.name), ['OPL-2026-06186', 'OPL-2026-06283', 'OPL-2026-06290']);
});

test('the untouched rows keep their query order', () => {
    const out = startedFirst([row('a', false), row('b', false), row('c', false)]);
    assert.deepEqual(out.map((r) => r.name), ['a', 'b', 'c']);
});

test('several part-packed rows keep their order among themselves', () => {
    const out = startedFirst([row('a', false), row('b', true), row('c', true)]);
    assert.deepEqual(out.map((r) => r.name), ['b', 'c', 'a']);
});

test('the input is not mutated', () => {
    const input = [row('a', false), row('b', true)];
    startedFirst(input);
    assert.deepEqual(input.map((r) => r.name), ['a', 'b']);
});

// ── the segments ───────────────────────────────────────────────────────────
//
// "In progress" came back by request: packers want to see what is part-done.
// It is a VIEW over "To pack", not a third classification — a started pick list
// stays in both, so nobody browsing "To pack" loses it again.

import { matchesSegment } from './packState.ts';

const toPack = { status: 'to_pack' as const, started: false };
const started = { status: 'to_pack' as const, started: true };
const packed = { status: 'packed' as const, started: false };

test('an untouched pick list is only under To pack', () => {
    assert.ok(matchesSegment(toPack, 'to_pack'));
    assert.ok(!matchesSegment(toPack, 'in_progress'));
    assert.ok(!matchesSegment(toPack, 'packed'));
});

test('THE POINT: a part-packed pick list is under BOTH To pack and In progress', () => {
    assert.ok(matchesSegment(started, 'to_pack'), 'OPL-2026-06186 must stay findable here');
    assert.ok(matchesSegment(started, 'in_progress'), 'and be visible as part-done');
    assert.ok(!matchesSegment(started, 'packed'));
});

test('a submitted pick list is only under Packed', () => {
    assert.ok(matchesSegment(packed, 'packed'));
    assert.ok(!matchesSegment(packed, 'to_pack'));
    assert.ok(!matchesSegment(packed, 'in_progress'));
});

test('In progress never shows finished work, whatever started says', () => {
    // Defensive: classifyPackList never produces this, but the segment must not
    // depend on that holding.
    assert.ok(!matchesSegment({ status: 'packed', started: true }, 'in_progress'));
});

test('every row lands in at least one segment', () => {
    for (const row of [toPack, started, packed]) {
        const hits = (['to_pack', 'in_progress', 'packed'] as const)
            .filter((seg) => matchesSegment(row, seg));
        assert.ok(hits.length >= 1, `${JSON.stringify(row)} fell through every segment`);
    }
});
