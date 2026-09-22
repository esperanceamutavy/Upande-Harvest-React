import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { readableServerMessage, stripHtml } from './frappeMessage.ts';

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
