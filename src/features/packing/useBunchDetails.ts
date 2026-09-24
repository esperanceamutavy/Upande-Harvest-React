import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { parseStemsPerBunch } from './targets';
import type { BunchComponent, BunchDetails } from '../../types/packing';

// Resolves a scanned bunch id into everything the payload and Rule 3 need.
//
// Two reads, because the OPL and the bunch record identify a variety
// differently (§8.3):
//   1. Bunch QR Code → item_code (the VARIANT, e.g. "Monza-50CM"),
//      bunch_size (→ bunch_uom, e.g. "Bunch(10)"), stem_length
//   2. Item.variant_of for that item_code → the TEMPLATE (e.g. "Monza"),
//      which is what an OPL row's item_code holds
//
// The variant lookup is cached per item_code for the app's lifetime: a packing
// session scans one variety over and over, so this is one extra call per
// distinct variety, not per scan.
//
// Deliberately NOT derived by string parsing. The server resolves the same
// relation with `variant_of` precisely so it survives variants that do not
// follow a `Name-NNCM` convention, and the client must match that.

const variantParentCache = new Map<string, string>();

/**
 * Drop every cached variant→template relation. Keyed by `item_code`, a Frappe doc
 * name, so the keys collide across sites while the values do not — see the same
 * note on `clearBucketItemCache`. Called from `resetTenantState`.
 */
export function clearVariantParentCache(): void {
  variantParentCache.clear();
}

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
 * An item code's TEMPLATE, via `Item.variant_of` — cached per code for the app's
 * lifetime.
 *
 * Exported because substitute matching needs the same relation on both sides:
 * the table may hold a variant where the bunch holds a template, or the reverse,
 * and a string compare would reject valid scans. Deliberately NOT re-derived by
 * parsing a length suffix — the server resolves this relation with `variant_of`
 * precisely so it survives variants that do not follow a `Name-NNCM` convention,
 * and the client must match that.
 */
export async function resolveVariantParent(itemCode: string): Promise<string> {
  const cached = variantParentCache.get(itemCode);
  if (cached) return cached;

  let parent = itemCode;
  try {
    const item = await getValue('Item', itemCode, ['variant_of']);
    if (item?.variant_of != null && String(item.variant_of).length > 0) {
      parent = String(item.variant_of);
    }
  } catch {
    // A failed variant lookup must not block the scan. Falling back to the
    // variant code itself means Rule 3 may reject a bunch it would otherwise
    // accept — a false rejection, which is the safe direction.
  }
  variantParentCache.set(itemCode, parent);
  return parent;
}

/** The recipe rows of a bouquet, resolved to their template varieties.
 *
 *  Child doctype, so `parent=Bunch QR Code` is REQUIRED on the request — Frappe
 *  answers PermissionError without it even when the parent is readable. Same
 *  rule as Pick List Item in useOplList.
 */
async function fetchComponents(bunchId: string): Promise<BunchComponent[]> {
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
  const rows = res.data?.data ?? [];

  const out: BunchComponent[] = [];
  for (const r of rows) {
    const variety = String(r.variety ?? '').trim();
    if (!variety) continue;
    out.push({
      variety,
      variantParent: await resolveVariantParent(variety),
      stems: Number(r.stems ?? 0) || 0,
      stemLength: String(r.stem_length ?? '').trim(),
    });
  }
  return out;
}

async function fetchBunchDetails(bunchId: string): Promise<BunchDetails> {
  const bunch = await getValue('Bunch QR Code', bunchId, [
    'item_code',
    'bunch_size',
    'stem_length',
    'farm',
    'custom_mixed_bunch',
    'custom_bunch_name',
  ]);
  if (!bunch) throw new Error(`Bunch ${bunchId} not found`);

  const itemCode = String(bunch.item_code ?? '');
  const bunchUom = String(bunch.bunch_size ?? '');
  const isMixedBunch = Number(bunch.custom_mixed_bunch ?? 0) === 1;
  const bunchName =
    bunch.custom_bunch_name != null && String(bunch.custom_bunch_name).trim().length > 0
      ? String(bunch.custom_bunch_name).trim()
      : null;

  // A BOUQUET'S LENGTH LIVES ON ITS COMPONENTS, not always on the header.
  // Falling back to the first component keeps a label usable when only the
  // recipe rows carry a length.
  const components = isMixedBunch ? await fetchComponents(bunchId) : [];
  const headerLength = String(bunch.stem_length ?? '').trim();
  const stemLength = headerLength || (components.length > 0 ? components[0].stemLength : '');

  if (!itemCode || !bunchUom || !stemLength) {
    throw new Error(`Bunch ${bunchId} is missing variety, size or stem length`);
  }

  if (isMixedBunch && components.length === 0) {
    // Refusing beats packing a bouquet whose recipe nobody can see.
    throw new Error(`Bunch ${bunchId} is a mixed bunch but carries no recipe`);
  }

  const stemsPerBunch = parseStemsPerBunch(bunchUom);
  if (stemsPerBunch == null) {
    // The server throws the same way on this, so refuse locally and save a
    // round-trip: "Invalid bunch size format for UOM '<uom>'".
    throw new Error(`Bunch ${bunchId} has an unparseable size "${bunchUom}"`);
  }

  const variantParent = await resolveVariantParent(itemCode);

  // The payload's custom_farm comes from here, not from the app's configured
  // farm and not from the OPL (whose own `farm` is null on live documents).
  const farm = bunch.farm != null && String(bunch.farm).length > 0 ? String(bunch.farm) : null;

  return {
    bunchId,
    itemCode,
    variantParent,
    bunchUom,
    stemLength,
    farm,
    stemsPerBunch,
    isMixedBunch,
    bunchName,
    components,
  };
}

export function useBunchDetails() {
  return useMutation({ mutationFn: fetchBunchDetails });
}
