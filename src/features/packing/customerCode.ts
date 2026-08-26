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
 * Split `"<customer>-<code>"` into its parts, on the LAST hyphen.
 *
 * `"Dutch Flower Group (DFG)-TGW FT ROSE GRANDE"` → code
 * `"TGW FT ROSE GRANDE"`, customer `"Dutch Flower Group (DFG)"`.
 *
 * BOTH parts can contain spaces, and the customer part can contain hyphens and
 * brackets — which is why the split is on the last hyphen and not the first,
 * and why nothing here strips or normalises whitespace inside the parts.
 *
 * A value with no hyphen, or a trailing hyphen with nothing after it, is
 * returned whole as the code: better to show the raw string than to invent a
 * split that was not there.
 */
export function splitCustomerCode(raw: string): { code: string; customer: string | null } {
    const at = raw.lastIndexOf('-');
    if (at < 0) return { code: raw.trim(), customer: null };

    const customer = raw.slice(0, at).trim();
    const code = raw.slice(at + 1).trim();
    if (!code) return { code: raw.trim(), customer: null };

    return { code, customer: customer || null };
}
