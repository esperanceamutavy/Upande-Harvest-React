// The customer code that goes on the box.
//
// Two sources, and live data uses both. `custom_customer_code` on the Sales
// Order ITEM is the per-line code and the one that belongs on the box, so it
// wins. The Sales Order HEADER field of the same name is the fallback.
//
// Neither is reliably populated:
//   SAL-ORD-2026-01624  all three lines set, header blank
//   SAL-ORD-2026-01578  one line of four set
// so reading only the line left most picker rows with no code at all.
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier.

/** Trimmed, or null when absent or blank. */
function text(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
}

/**
 * LINE first, then HEADER. An empty string counts as absent — Frappe stores an
 * unset Data field as `""`, not null, so `??` alone would latch onto the blank.
 */
export function resolveCustomerCode(lineCode: unknown, headerCode: unknown): string | null {
    return text(lineCode) ?? text(headerCode);
}

/**
 * Split `"<customer>-<code>"` into its parts by STRIPPING THE CUSTOMER PREFIX.
 *
 * `"Dutch Flower Group (DFG)-TGW FT ROSE GRANDE"` → code
 * `"TGW FT ROSE GRANDE"`, customer `"Dutch Flower Group (DFG)"`.
 *
 * Splitting on the last hyphen was wrong whenever the CODE itself contained one:
 * `"Azalea-Adnan flowers - JED"` yielded `"JED"` when the code is
 * `"Adnan flowers - JED"`. The customer is already known — the Sales Order is
 * fetched for targets anyway — so it is used to find the boundary instead of
 * guessing at it.
 *
 * Three cases, in order:
 *   1. the value starts with `customer + "-"` → the remainder is the code
 *   2. otherwise → last-hyphen split, since some codes carry no prefix
 *   3. no hyphen at all → the whole string is the code, with no caption
 *
 * The prefix is matched case-insensitively and around trimmed whitespace, but
 * the CODE IS RETURNED EXACTLY AS STORED — no case or inner-spacing
 * normalisation. Both parts may contain spaces, and the customer may contain
 * hyphens and parentheses, all of which case 1 handles by construction.
 */
export function splitCustomerCode(
    raw: string,
    customer?: string | null,
): { code: string; customer: string | null } {
    const value = raw.trim();

    // Case 1 — strip the known customer prefix.
    const known = (customer ?? '').trim();
    if (known) {
        const prefix = `${known}-`;
        if (value.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
            const code = value.slice(prefix.length).trim();
            // A prefix with nothing after it is not a split worth making.
            if (code) return { code, customer: value.slice(0, known.length).trim() || null };
        }
    }

    // Case 3 — nothing to split on.
    const at = value.lastIndexOf('-');
    if (at < 0) return { code: value, customer: null };

    // Case 2 — no usable prefix, so fall back to the last hyphen.
    const head = value.slice(0, at).trim();
    const tail = value.slice(at + 1).trim();
    if (!tail) return { code: value, customer: null };

    return { code: tail, customer: head || null };
}
