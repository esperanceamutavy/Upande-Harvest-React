import { apiClient } from '../../lib/api';
import type { BunchRecipe, GradedComponent } from '../../types/grading';

export { componentLabel, gradedHeadline } from './gradedLabel';

// A BOUQUET IS ONE BUNCH OF SEVERAL VARIETIES, and grading has been naming only
// the first of them.
//
// ── WHY A SEPARATE READ ────────────────────────────────────────────────────
//
// `mobile_grading_entry` resolves the bunch server-side, but it reads only
// `item_code, stem_length, bunch_size, farm` off `Bunch QR Code` and returns
// `variety = bunch.item_code`. It never looks at `custom_mixed_bunch` and never
// touches the components table — so the recipe simply is not in the response,
// and the Bunch QR Code doctype's own field description says why: *"item_code
// names the first variety only."*
//
// BUNCH-289162 is the worked case. Bunch(20), item_code Good Times-35CM,
// components Good Times-35CM 7 + Albatross-35CM 7 + Brinessa-35CM 6 = 20. The
// response says "Good Times, 20", so a grader reading the confirmation is told
// about a third of what is in their hand.
//
// ── WHY IT RUNS ALONGSIDE THE SUBMIT, NOT BEFORE IT ────────────────────────
//
// §8.2 deliberately removed a pre-flight read from this screen: it cost 150-300ms
// on EVERY scan of the app's fastest-repeating flow, to fetch fields the server
// reads for itself. Re-introducing a blocking pre-fetch would undo that.
//
// So this read is issued CONCURRENTLY with the grading post and the two are
// awaited together. It costs nothing unless it outlasts a write that inserts,
// submits and commits a Stock Entry — which it will not.
//
// ── AND IT NEVER FAILS A GRADE ─────────────────────────────────────────────
//
// The bunch is graded either way; the recipe is a display concern. Every failure
// path returns null, and the confirmation falls back to naming the variety
// exactly as it did before.
//
// Note this reads NO `variant_of`, unlike packing's useBunchDetails. Grading
// matches against nothing, so the template relation is irrelevant here and the
// per-component lookups it would cost are not paid.

/** `frappe.client.get_value` — same shape the rest of the app uses. */
async function getValue(
    doctype: string,
    name: string,
    fieldname: string[],
): Promise<Record<string, unknown> | null> {
    const res = await apiClient.post<{ message?: Record<string, unknown> }>(
        '/api/method/frappe.client.get_value',
        { doctype, filters: { name }, fieldname },
    );
    const m = res.data?.message;
    return m && Object.keys(m).length > 0 ? m : null;
}

/**
 * The recipe rows of a bouquet.
 *
 * Child doctype, so `parent=Bunch QR Code` is REQUIRED on the request — Frappe
 * answers PermissionError without it even when the parent is readable. Same
 * rule as Pick List Item in useOplList and Bunch Component in useBunchDetails.
 */
async function fetchComponents(bunchId: string): Promise<GradedComponent[]> {
    const res = await apiClient.get<{ data?: Record<string, unknown>[] }>(
        `/api/resource/${encodeURIComponent('Bunch Component')}`,
        {
            params: {
                fields: JSON.stringify(['variety', 'stems', 'stem_length']),
                filters: JSON.stringify([['parent', '=', bunchId]]),
                parent: 'Bunch QR Code',
                limit_page_length: 0,
            },
        },
    );

    const out: GradedComponent[] = [];
    for (const r of res.data?.data ?? []) {
        const variety = String(r.variety ?? '').trim();
        if (!variety) continue;
        out.push({
            variety,
            stems: Number(r.stems ?? 0) || 0,
            stemLength: String(r.stem_length ?? '').trim() || null,
        });
    }
    return out;
}

/**
 * Read a scanned bunch's recipe. Returns null on ANY failure — a grade must
 * never be lost to a display lookup.
 */
export async function fetchBunchRecipe(bunchId: string): Promise<BunchRecipe | null> {
    try {
        const bunch = await getValue('Bunch QR Code', bunchId, [
            'bunch_size',
            'custom_mixed_bunch',
            'custom_bunch_name',
        ]);
        if (!bunch) return null;

        const isMixedBunch = Number(bunch.custom_mixed_bunch ?? 0) === 1;
        const bunchUom =
            bunch.bunch_size != null && String(bunch.bunch_size).trim().length > 0
                ? String(bunch.bunch_size).trim()
                : null;
        const bunchName =
            bunch.custom_bunch_name != null && String(bunch.custom_bunch_name).trim().length > 0
                ? String(bunch.custom_bunch_name).trim()
                : null;

        // Only a bouquet has a recipe; a mono bunch would return an empty table.
        const components = isMixedBunch ? await fetchComponents(bunchId) : [];

        return { isMixedBunch, bunchUom, bunchName, components };
    } catch {
        return null;
    }
}
