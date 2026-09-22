// Frappe sends its user-facing messages as HTML. We render plain text.
//
// `_server_messages` carries whatever `frappe.throw` was given, and ERPNext's
// own throws are full of markup — NegativeStockError alone ships two <a href>
// tags pointing at /desk URLs, plus <strong> and inline styles. Handed to a
// <Text> element that renders exactly what it is given, a grader on the
// packhouse floor reads:
//
//   <strong>7.0</strong> units of <a href="/desk/item/MADAM%20CERISE-40CM"
//   style="font-weight: bold;">Item MADAM CERISE-40CM</a> needed in ...
//
// rather than "7.0 units of Item MADAM CERISE-40CM needed in Warehouse ...".
//
// This is not specific to one screen. Every server error in the app arrives
// through parseFrappeError, so stripping here fixes all of them at once.
//
// Deliberately no imports: loaded directly by `node --test`, which is plain
// ESM and cannot resolve an extensionless specifier.

/** Entities Frappe actually emits. Not a general-purpose HTML decoder. */
const ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
};

/**
 * Turn one Frappe server message into something a person can read aloud.
 *
 * Order matters. Tags go before entities, so an escaped `&lt;b&gt;` in the
 * original text survives as literal `<b>` rather than being stripped as
 * though it were markup the server sent.
 */
export function stripHtml(input: string): string {
    if (!input) return '';

    let out = input;

    // Block-level breaks become spaces, so "a<br>b" does not read as "ab".
    out = out.replace(/<\s*br\s*\/?\s*>/gi, ' ');
    out = out.replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, ' ');

    // Drop anything that would render as markup rather than as words.
    out = out.replace(/<[^>]*>/g, '');

    for (const [entity, char] of Object.entries(ENTITIES)) {
        out = out.split(entity).join(char);
    }
    // Numeric entities, e.g. &#8217;
    out = out.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

    // Frappe indents its HTML, so collapsing runs is what removes the ragged
    // gaps left behind once the tags are gone.
    out = out.replace(/\s+/g, ' ').trim();

    return out;
}

/**
 * Pick the message to show from a Frappe error payload.
 *
 * `_server_messages` wins when present because it is what `frappe.throw` was
 * actually given; `exception` is the raw Python repr and is the last resort.
 */
export function readableServerMessage(
    serverMessages: string[],
    fallbacks: (string | undefined)[],
): string {
    for (const candidate of [...serverMessages, ...fallbacks]) {
        const text = stripHtml(candidate ?? '');
        if (text) return text;
    }
    return 'Unknown error';
}
