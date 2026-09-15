// Stem-count override for unbunched Spray Roses.
//
// `receiving_entry` already accepts `override_qty` on the unbunched branch and
// applies it in place of the item's bucket rate — this only makes the prompt
// automatic instead of something the packer must remember to tick.
//
// The server rejects an override above the standard rate, and rejects zero or
// negative. The same bounds are enforced here so a doomed value is never
// posted, and the packer is told plainly rather than watching a scan fail.
//
// No relative imports: loaded directly by `node --test`, which is plain ESM and
// cannot resolve an extensionless specifier.

export type OverrideVerdict =
    | { ok: true; qty: number }
    | { ok: false; reason: string };

/**
 * Validate a typed stem count against the item's standard rate.
 *
 * `standard` is `custom_unbunched_bucket_rate`, falling back to
 * `custom_bucket_rate`. Every Spray Rose currently carries 90.
 */
export function validateOverride(raw: string, standard: number | null): OverrideVerdict {
    const text = raw.trim();
    if (!text) return { ok: false, reason: 'Enter a stem count.' };

    // Reject anything that is not purely digits — "12a" would otherwise parse
    // to 12 and post a number the packer did not type.
    if (!/^\d+$/.test(text)) return { ok: false, reason: 'Stem count must be a whole number.' };

    const qty = Number.parseInt(text, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
        return { ok: false, reason: 'Stem count must be more than zero.' };
    }

    if (standard != null && standard > 0 && qty > standard) {
        return {
            ok: false,
            reason: `${qty} is above the standard ${standard}. The server will reject it — enter ${standard} or fewer.`,
        };
    }

    return { ok: true, qty };
}

/**
 * The one-tap counts on the stem prompt.
 *
 * Quarters of a 120-stem bucket, which is what every Spray Rose carries as its
 * `custom_bucket_rate` (verified across all 275 live records, 2026-09-15). 120
 * itself is included because a full unbunched bucket is a real delivery and sits
 * exactly ON the ceiling, which validateOverride accepts.
 *
 * Anything else — the 38-stem bucket — is typed into the field beside them.
 */
export const QUICK_PICKS = [30, 60, 90, 120] as const;

/**
 * The quick picks that this item can actually accept.
 *
 * A button the server is going to refuse should never be on screen. Most
 * varieties take all four, but Pavlova-40CM carries an unbunched rate of 100
 * and so drops the 120. With no standard known nothing can be ruled out, and
 * validateOverride has no ceiling to enforce either, so all four stay.
 */
export function quickPicks(standard: number | null): number[] {
    if (standard == null || standard <= 0) return [...QUICK_PICKS];
    return QUICK_PICKS.filter((n) => n <= standard);
}

/** The standard rate for an item: unbunched rate first, then the bucket rate. */
export function standardRate(
    unbunchedRate: number | null | undefined,
    bucketRate: number | null | undefined,
): number | null {
    if (unbunchedRate != null && unbunchedRate > 0) return unbunchedRate;
    if (bucketRate != null && bucketRate > 0) return bucketRate;
    return null;
}
