import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { readableServerMessage, stripHtml, diagnoseErrorBody } from './frappeMessage.ts';

test('the real NegativeStockError a grader was shown', () => {
    // Verbatim from production, 22 Sep 2026, Grading screen.
    const raw =
        '<strong>7.0</strong> units of <a href="/desk/item/MADAM%20CERISE-40CM" ' +
        'style="font-weight: bold;">Item MADAM CERISE-40CM</a> needed in ' +
        '<a href="/desk/warehouse/XFL%20Receiving%20Coldstore%20%20-%20XFL" ' +
        'style="font-weight: bold;">Warehouse XFL Receiving Coldstore  - XFL</a> ' +
        'to complete this transaction.';

    assert.equal(
        stripHtml(raw),
        '7.0 units of Item MADAM CERISE-40CM needed in ' +
            'Warehouse XFL Receiving Coldstore - XFL to complete this transaction.',
    );
});

test('no tag survives', () => {
    assert.equal(stripHtml('<div class="x"><b>Bold</b> text</div>'), 'Bold text');
    assert.equal(stripHtml('<span style="color:red">Red</span>'), 'Red');
});

test('breaks become spaces rather than running words together', () => {
    assert.equal(stripHtml('line one<br>line two'), 'line one line two');
    assert.equal(stripHtml('<p>one</p><p>two</p>'), 'one two');
    assert.equal(stripHtml('a<br/>b'), 'a b');
});

test('entities decode', () => {
    assert.equal(stripHtml('Tom &amp; Jerry'), 'Tom & Jerry');
    assert.equal(stripHtml('5 &gt; 3'), '5 > 3');
    assert.equal(stripHtml('It&#39;s here'), "It's here");
    assert.equal(stripHtml('a&nbsp;b'), 'a b');
});

test('an escaped tag in the original text is not mistaken for markup', () => {
    // Tags are stripped BEFORE entities decode, so this stays literal.
    assert.equal(stripHtml('use &lt;b&gt; for bold'), 'use <b> for bold');
});

test('plain text is returned unchanged', () => {
    assert.equal(stripHtml('Bunch BUNCH-228854 not found'), 'Bunch BUNCH-228854 not found');
});

test('empty and whitespace-only input', () => {
    assert.equal(stripHtml(''), '');
    assert.equal(stripHtml('   '), '');
    assert.equal(stripHtml('<p> </p>'), '');
});

test('readableServerMessage prefers the first message with real content', () => {
    assert.equal(
        readableServerMessage(['<strong>Real</strong>'], ['fallback']),
        'Real',
    );
    // A message that is nothing but markup must not win over a usable fallback.
    assert.equal(readableServerMessage(['<p></p>'], ['fallback']), 'fallback');
    assert.equal(readableServerMessage([], [undefined, 'second']), 'second');
    assert.equal(readableServerMessage([], []), 'Unknown error');
});


// ── diagnoseErrorBody ───────────────────────────────────────────────────────
//
// The picker failed with "Request failed with status code 400" and nothing else.
// Every request reconstructed by hand returned 200, so the failing one could not
// be identified from the message. These pin what now reaches the Notice.

test('a 400 naming a rejected field is surfaced', () => {
    const body = {
        exc_type: 'ValidationError',
        exception: 'frappe.exceptions.ValidationError: Unknown column custom_bunch_grp',
    };
    const out = diagnoseErrorBody(400, body);
    assert.ok(out);
    assert.ok(out.includes('ValidationError'));
    assert.ok(out.includes('custom_bunch_grp'), 'the rejected field must survive');
});

test('the LAST traceback line is taken — it names the error', () => {
    const body = {
        exc: JSON.stringify([
            'Traceback (most recent call last):\n  File "frappe/api.py", line 1\nfrappe.exceptions.PermissionError: Not permitted for Sales Order Substitute',
        ]),
    };
    const out = diagnoseErrorBody(400, body);
    assert.ok(out);
    assert.ok(out.includes('PermissionError'));
    assert.ok(out.includes('Sales Order Substitute'));
    assert.ok(!out.includes('Traceback (most recent'), 'the noise is dropped');
});

test('HTML in the body is stripped, as everywhere else', () => {
    const out = diagnoseErrorBody(400, { exception: 'Bad <a href="/app/x">link</a> filter' });
    assert.ok(out);
    assert.ok(!out.includes('<a href'));
    assert.ok(out.includes('link'));
});

test('an unrecognised body is dumped rather than discarded', () => {
    const out = diagnoseErrorBody(400, { some_new_key: 'unexpected' });
    assert.ok(out);
    assert.ok(out.includes('some_new_key'));
});

test('a 5xx is left alone — the normal path already handles it', () => {
    assert.equal(diagnoseErrorBody(500, { exc_type: 'ServerError' }), null);
});

test('an empty body adds nothing', () => {
    assert.equal(diagnoseErrorBody(400, {}), null);
    assert.equal(diagnoseErrorBody(400, null), null);
    assert.equal(diagnoseErrorBody(400, ''), null);
});

test('a long traceback is capped so it cannot fill the screen', () => {
    const out = diagnoseErrorBody(400, { exception: 'x'.repeat(2000) });
    assert.ok(out);
    assert.ok(out.length <= 400, `capped, got ${out.length}`);
    assert.ok(out.endsWith('…'));
});

test('a plain-string body is surfaced too', () => {
    const out = diagnoseErrorBody(400, 'Illegal filter on custom_opl');
    assert.equal(out, 'Illegal filter on custom_opl');
});
