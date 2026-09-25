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


/** Cap a diagnostic so a traceback cannot fill the screen. */
function truncate(text: string, max = 400): string {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * The LAST line of a Frappe traceback, which is the one that names the error.
 *
 * `exc` arrives JSON-encoded: a list whose single element is the whole
 * traceback. Anything unparseable is treated as a plain string rather than
 * discarded — a malformed body is exactly when this is most needed.
 */
function lastTracebackLine(exc: unknown): string {
    if (typeof exc !== 'string' || exc.trim().length === 0) return '';
    let text = exc;
    try {
        const parsed: unknown = JSON.parse(exc);
        if (Array.isArray(parsed) && parsed.length > 0) text = String(parsed[0] ?? '');
        else if (typeof parsed === 'string') text = parsed;
    } catch {
        // not JSON — use it as-is
    }
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.length > 0 ? lines[lines.length - 1] : '';
}

/**
 * WHAT FRAPPE ACTUALLY SAID, for a 4xx that carries no `_server_messages`.
 *
 * Frappe answers a rejected filter or an unknown fieldname with a 400 whose body
 * holds `exc_type` / `exception` / `exc` but NO `_server_messages`, so the
 * normal path falls through to axios's "Request failed with status code 400" —
 * which names neither the request nor the reason. That string cost a production
 * morning: every request reconstructed by hand returned 200, because the failing
 * one could not be identified from the message.
 *
 * So for 4xx-without-server-messages, the body is surfaced verbatim. It is ugly
 * on purpose: an unreadable exception a packer can photograph beats a tidy
 * sentence that says nothing.
 *
 * Returns null when there is nothing worth adding — a 5xx, or a body already
 * covered by the normal path.
 */
export function diagnoseErrorBody(status: number, body: unknown): string | null {
    if (status < 400 || status >= 500) return null;

    if (typeof body === 'string') {
        const t = body.trim();
        return t.length > 0 ? truncate(t) : null;
    }
    if (!body || typeof body !== 'object') return null;

    const b = body as Record<string, unknown>;
    const bits: string[] = [];

    const excType = typeof b.exc_type === 'string' ? b.exc_type.trim() : '';
    if (excType) bits.push(excType);

    const exception = typeof b.exception === 'string' ? b.exception.trim() : '';
    if (exception) bits.push(stripHtml(exception));

    const line = lastTracebackLine(b.exc);
    if (line && !bits.some((x) => x.includes(line))) bits.push(stripHtml(line));

    if (bits.length === 0) {
        // Nothing named the error. Dump what there is rather than nothing —
        // an unexpected shape is still evidence.
        try {
            const dump = JSON.stringify(b);
            return dump && dump !== '{}' ? truncate(dump) : null;
        } catch {
            return null;
        }
    }
    return truncate(bits.join(' — '));
}
