// Which `custom_customer_code` applies, and what to show for it.
//
// THERE IS NO PARSING HERE ANY MORE. `custom_customer_code` is a LINK to the
// Customer Code doctype: the stored value is a record NAME and the code that
// goes on the box is that record's `code` field. Live data has them diverging
// outright —
//
//   name "Dutch Flower Group (DFG)-TFC  BY AIR"  ->  code "TFC  ED3442-FT"
//
// so the old split-the-name approach could not have produced the right answer
// by any rule. It is a lookup. That also retires the "Azalea-Adnan flowers -
// JED" ambiguity and the last-hyphen question with it: the code is a stored
// value, not a substring.
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
 * Which reference applies: the LINE's, else the HEADER's.
 *
 * An empty string counts as absent. Frappe stores an unset Data/Link field as
 * `""` rather than null, so `??` alone would latch onto the blank — which is
 * exactly what SAL-ORD-2026-01624's header holds.
 */
export function resolveCustomerCodeRef(lineRef: unknown, headerRef: unknown): string | null {
    return text(lineRef) ?? text(headerRef);
}

/**
 * Build the display shape from the stored reference and its looked-up record.
 *
 * `code` is returned EXACTLY as stored — live values carry double spaces
 * ("TFC  ED3442-FT") and internal hyphens ("TFC-IS0086-FT"), and collapsing
 * either would print something that is not on the record.
 *
 * A missing record, or one whose `code` is blank, falls back to the reference
 * itself: the stored value is still more useful to a packer than a blank row.
 */
export function toCustomerCodeRef(
    ref: string,
    record?: { code?: unknown; customer?: unknown } | null,
): { ref: string; code: string; customer: string | null } {
    const stored = ref.trim();
    // NOT text(): only the ends are trimmed, never the inside.
    const code = record?.code != null && String(record.code).trim().length > 0
        ? String(record.code).trim()
        : stored;
    return { ref: stored, code, customer: text(record?.customer) };
}
