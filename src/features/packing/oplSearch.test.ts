// Search over the OPL picker's loaded rows.
//
// The cases that matter are the live ones: double-spaced customer codes, a
// packer typing the middle of a code off paper, and a term that appears in two
// different customers.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { filterOpls, matchesOplSearch, normalise, type SearchableOpl } from './oplSearch.ts';

function row(over: Partial<SearchableOpl> = {}): SearchableOpl {
    return {
        name: 'OPL-2026-04659',
        customer: 'Dutch Flower Group (DFG)',
        salesOrder: 'SAL-ORD-2026-01921',
        consignee: 'TGW Flower 01',
        customerCode: { code: 'TFC  ED3442-FT' },
        varieties: ['Sovereign', 'Madam Red'],
        lengths: ['60CM'],
        orderLength: '60CM',
        ...over,
    };
}

test('NORMALISE — collapses runs of whitespace and lowercases', () => {
    assert.equal(normalise('TFC  ED3442-FT'), 'tfc ed3442-ft');
    assert.equal(normalise('  spaced   out  '), 'spaced out');
    assert.equal(normalise(null), '');
});

test('DOUBLE SPACE — one typed space finds a two-space stored code', () => {
    // The pinning case. Live codes carry a double space that no packer types.
    assert.ok(matchesOplSearch(row(), 'TFC ED3442'));
});

test('SUBSTRING — the middle of a code is enough', () => {
    assert.ok(matchesOplSearch(row(), '3442'));
});

test('CASE — matching ignores it', () => {
    assert.ok(matchesOplSearch(row(), 'tfc'));
    assert.ok(matchesOplSearch(row(), 'MADAM'));
});

test('FIELDS — consignee, customer, OPL name, SO name, variety, length', () => {
    assert.ok(matchesOplSearch(row(), 'TGW Flower'), 'consignee');
    assert.ok(matchesOplSearch(row(), 'Dutch Flower'), 'customer');
    assert.ok(matchesOplSearch(row(), '04659'), 'OPL name');
    assert.ok(matchesOplSearch(row(), '01921'), 'sales order');
    assert.ok(matchesOplSearch(row(), 'sovereign'), 'variety');
    assert.ok(matchesOplSearch(row(), '60cm'), 'length');
});

test('NO CROSS-FIELD MATCH — a term may not straddle two fields', () => {
    // consignee "AB" beside customer "CD" must not be found by "abcd".
    const r = row({ consignee: 'AB', customer: 'CD', customerCode: null, name: 'X', salesOrder: null, varieties: [], lengths: [], orderLength: null });
    assert.equal(matchesOplSearch(r, 'abcd'), false);
});

test('BLANK — an empty or whitespace term matches everything', () => {
    assert.ok(matchesOplSearch(row(), ''));
    assert.ok(matchesOplSearch(row(), '   '));
});

test('MISSING VALUES — a row with nulls does not throw and does not match', () => {
    const bare = row({
        customer: null,
        salesOrder: null,
        consignee: null,
        customerCode: null,
        varieties: [],
        lengths: [],
        orderLength: null,
    });
    assert.equal(matchesOplSearch(bare, 'anything'), false);
    assert.ok(matchesOplSearch(bare, '04659'), 'still matches on name');
});

test('FILTER — narrows the list and preserves order; blank restores it', () => {
    const a = row({ name: 'OPL-1', consignee: 'TGW Flower 01' });
    const b = row({ name: 'OPL-2', consignee: 'Fresh From Source (TGW)', customerCode: null });
    const c = row({ name: 'OPL-3', consignee: 'Somebody Else', customerCode: null });

    // "TGW" spans two different consignees — both must come back, in order.
    const hits = filterOpls([a, b, c], 'TGW');
    assert.deepEqual(hits.map((r) => r.name), ['OPL-1', 'OPL-2']);

    assert.equal(filterOpls([a, b, c], '').length, 3);
    assert.equal(filterOpls([a, b, c], 'nothing-matches').length, 0);
});
