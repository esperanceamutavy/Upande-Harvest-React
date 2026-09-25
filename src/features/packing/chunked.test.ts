import assert from 'node:assert/strict';
import test from 'node:test';

import { chunk, chunkedQuery, CHUNK_SIZE } from './chunked.ts';

// Pinned to the live failure.
//
// The picker's Sales Order Item query sent 46 Sales Order names AND 127 OPL
// names in one GET, producing a 4,465-character request line against Frappe's
// 4,094 limit:
//
//     Request Line is too large (4465 > 4094)
//
// surfaced as a bare "Request failed with status code 400". No deploy caused
// it and old builds fail too — the trigger is the day's order count.

const LIVE_ORDERS = 46;
const LIVE_OPLS = 127;

/** A Frappe docname, at the real length: SAL-ORD-2026-02334 / OPL-2026-05970. */
function names(n: number, prefix: string): string[] {
    return Array.from({ length: n }, (_, i) => `${prefix}-2026-${String(10000 + i).slice(1)}`);
}

/** What actually goes on the wire for one `in` filter. */
function requestLineLength(doctype: string, fields: string[], filters: unknown): number {
    const qs = new URLSearchParams({
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        limit_page_length: '0',
    }).toString();
    return `GET /api/resource/${encodeURIComponent(doctype)}?${qs} HTTP/1.1`.length;
}

test('chunk splits at the size and keeps every element, in order', () => {
    const items = names(LIVE_OPLS, 'OPL');
    const groups = chunk(items);
    assert.equal(groups.length, Math.ceil(LIVE_OPLS / CHUNK_SIZE));
    assert.deepEqual(groups.flat(), items, 'nothing lost, nothing reordered');
    assert.ok(groups.every((g) => g.length <= CHUNK_SIZE));
});

test('an empty list yields no groups', () => {
    assert.deepEqual(chunk([]), []);
});

test('a list shorter than one chunk is a single group', () => {
    assert.deepEqual(chunk(['a', 'b']), [['a', 'b']]);
});

test('chunk refuses a size that would never terminate', () => {
    assert.throws(() => chunk(['a'], 0));
});

// ── the reason this exists ──────────────────────────────────────────────────

test('THE LIVE FAILURE: both lists in one request line exceeds 4094', () => {
    const len = requestLineLength(
        'Sales Order Item',
        ['parent', 'custom_opl', 'custom_customer_code', 'custom_number_of_boxes', 'item_code'],
        [
            ['parent', 'in', names(LIVE_ORDERS, 'SAL-ORD')],
            ['custom_opl', 'in', names(LIVE_OPLS, 'OPL')],
        ],
    );
    assert.ok(len > 4094, `expected the old shape to blow the limit, got ${len}`);
});

test('dropping the redundant parent filter alone roughly halves it', () => {
    const both = requestLineLength(
        'Sales Order Item',
        ['parent', 'custom_opl', 'item_code'],
        [
            ['parent', 'in', names(LIVE_ORDERS, 'SAL-ORD')],
            ['custom_opl', 'in', names(LIVE_OPLS, 'OPL')],
        ],
    );
    const oplOnly = requestLineLength(
        'Sales Order Item',
        ['parent', 'custom_opl', 'item_code'],
        [['custom_opl', 'in', names(LIVE_OPLS, 'OPL')]],
    );
    assert.ok(oplOnly < both, 'the parent filter was pure overhead');
});

test('AND every chunked batch is comfortably under the limit', () => {
    for (const batch of chunk(names(LIVE_OPLS, 'OPL'))) {
        const len = requestLineLength(
            'Sales Order Item',
            ['parent', 'custom_opl', 'custom_customer_code', 'custom_number_of_boxes', 'item_code'],
            [['custom_opl', 'in', batch]],
        );
        assert.ok(len < 4094, `batch line ${len} must fit`);
        // Not merely fitting — leaving room for a longer doctype or field list.
        assert.ok(len < 2000, `batch line ${len} should have headroom, not scrape in`);
    }
});

test("today's 46 orders and 127 OPLs all fit once chunked", () => {
    assert.equal(chunk(names(LIVE_ORDERS, 'SAL-ORD')).length, 2);
    assert.equal(chunk(names(LIVE_OPLS, 'OPL')).length, 6);
});

// ── chunkedQuery ────────────────────────────────────────────────────────────

test('results are flattened in batch order', async () => {
    const seen: string[][] = [];
    const out = await chunkedQuery(
        names(LIVE_OPLS, 'OPL'),
        async (batch) => {
            seen.push(batch);
            return batch.map((n) => ({ name: n }));
        },
    );
    assert.equal(out.length, LIVE_OPLS);
    assert.equal(seen.length, 6);
    assert.deepEqual(out.map((r) => r.name), names(LIVE_OPLS, 'OPL'));
});

test('AN EMPTY LIST NEVER CALLS THE QUERY', async () => {
    let called = false;
    const out = await chunkedQuery([], async () => {
        called = true;
        return [1];
    });
    assert.deepEqual(out, []);
    assert.equal(called, false, 'an empty `in` filter is NO filter in Frappe — it would return the whole table');
});

test('batches run in parallel, not one after another', async () => {
    let inFlight = 0;
    let peak = 0;
    await chunkedQuery(names(LIVE_OPLS, 'OPL'), async (batch) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return batch;
    });
    assert.ok(peak > 1, `expected concurrent batches, peak was ${peak}`);
});

test('one failing batch rejects the whole query rather than returning a partial list', async () => {
    await assert.rejects(
        chunkedQuery(names(60, 'OPL'), async (batch) => {
            if (batch[0].endsWith('0025')) throw new Error('boom');
            return batch;
        }),
        /boom/,
        'a silent partial listing would hide OPLs from the packer',
    );
});
