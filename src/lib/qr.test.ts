// Run with: npm test   (node:test + Node's native TypeScript type stripping —
// no test-runner dependency is added to the project).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractScannedId } from './qr.ts';

test('unwraps the exact live payload that shipped raw to the server', () => {
  // Regression guard. Packing sent this verbatim as the bunch id and the server
  // replied: Bunch {"bunch_id":"BUNCH-38203"} not found
  assert.equal(extractScannedId('{"bunch_id":"BUNCH-38203"}'), 'BUNCH-38203');
});

test('unwraps each recognised key', () => {
  assert.equal(extractScannedId('{"bunch_id":"BUNCH-1"}'), 'BUNCH-1');
  assert.equal(extractScannedId('{"coldroom_bucket":"Coldroom Bucket - 2880"}'), 'Coldroom Bucket - 2880');
  assert.equal(extractScannedId('{"bucket_id":"BUCKET-1849"}'), 'BUCKET-1849');
  assert.equal(extractScannedId('{"id":"X-1"}'), 'X-1');
  assert.equal(extractScannedId('{"employee_id":"411"}'), '411');
});

test('keeps the grader badge keys working', () => {
  // Not in the canonical key list, but grading and receiving-out latch on these.
  assert.equal(extractScannedId('{"employee":"869"}'), '869');
  assert.equal(extractScannedId('{"grader":"411"}'), '411');
});

test('first present key wins, in declared order', () => {
  assert.equal(extractScannedId('{"bunch_id":"BUNCH-9","bucket_id":"BUCKET-9"}'), 'BUNCH-9');
});

test('falls back to the :" split when the JSON will not parse', () => {
  assert.equal(extractScannedId('{"bunch_id":"BUNCH-38203"'), 'BUNCH-38203');
  assert.equal(extractScannedId('{"bunch_id":"BUNCH-38203}'), 'BUNCH-38203');
});

test('passes a bare id through untouched', () => {
  assert.equal(extractScannedId('BUNCH-38203'), 'BUNCH-38203');
  assert.equal(extractScannedId('  BUNCH-38203  '), 'BUNCH-38203');
  assert.equal(extractScannedId('Coldroom Bucket - 2880'), 'Coldroom Bucket - 2880');
});

test('empty input yields null rather than an empty id', () => {
  assert.equal(extractScannedId(''), null);
  assert.equal(extractScannedId('   '), null);
});

test('handles the legacy coldroom label where the id is the KEY', () => {
  // {"<id>":"bucket"} — old printed labels still in circulation.
  assert.equal(extractScannedId('{"BUCKET-1849":"bucket"}'), 'BUCKET-1849');
  assert.equal(extractScannedId('{"Coldroom Bucket - 2880":"bucket"}'), 'Coldroom Bucket - 2880');
});

test('a named key beats the legacy key-is-the-id rule', () => {
  assert.equal(extractScannedId('{"bucket_id":"BUCKET-9","BUCKET-8":"bucket"}'), 'BUCKET-9');
});

test('an object with no recognised key is not mistaken for an id', () => {
  // Better to send the blob and get a clean "not found" than to invent an id.
  assert.equal(extractScannedId('{"unrelated":"x"}'), '{"unrelated":"x"}');
});

// --- Box Label scans (dispatch) --------------------------------------------
// Box Label QRs encode a desk URL: `_attach_qr` in dispatch_session.py renders
// /app/box-label/<name> so a scan resolves to the BOX, not its pack list.

test('a Box Label desk URL yields the box name', () => {
    assert.equal(
        extractScannedId('https://xflora.upande.com/app/box-label/BOX-OPL-2026-00158-1'),
        'BOX-OPL-2026-00158-1',
    );
    // Site-relative, and with a trailing slash.
    assert.equal(extractScannedId('/app/box-label/BOX-OPL-2026-00158-2'), 'BOX-OPL-2026-00158-2');
    assert.equal(extractScannedId('/app/box-label/BOX-OPL-2026-00158-3/'), 'BOX-OPL-2026-00158-3');
});

test('desk URLs are percent-decoded — naming series can contain a slash-free escape', () => {
    assert.equal(extractScannedId('/app/box-label/BOX%20OPL-1'), 'BOX OPL-1');
});

test('the URL rule does NOT fire on JSON that merely contains a path', () => {
    // Anchored at both ends: a JSON blob must still go down the JSON path.
    assert.equal(extractScannedId('{"box_label":"/app/box-label/BOX-1"}'), '/app/box-label/BOX-1');
    assert.equal(extractScannedId('{"bunch_id":"BUNCH-38203"}'), 'BUNCH-38203');
});

test('box_label and box_id are recognised JSON keys', () => {
    assert.equal(extractScannedId('{"box_label":"BOX-OPL-2026-00158-1"}'), 'BOX-OPL-2026-00158-1');
    assert.equal(extractScannedId('{"box_id":"BOX-OPL-2026-00158-1"}'), 'BOX-OPL-2026-00158-1');
});

test('a bare Box Label name passes through untouched', () => {
    assert.equal(extractScannedId('BOX-OPL-2026-00158-1'), 'BOX-OPL-2026-00158-1');
});
