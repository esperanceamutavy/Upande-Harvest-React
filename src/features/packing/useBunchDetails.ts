import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { BunchDetails } from '../../types/packing';

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

/** The server's own paren rule. `"Bunch(10)"` → 10. */
export function parseStemsPerBunch(bunchUom: string): number | null {
  const open = bunchUom.indexOf('(');
  const close = bunchUom.indexOf(')', open + 1);
  if (open < 0 || close < 0) return null;
  const n = Number.parseInt(bunchUom.slice(open + 1, close), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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

async function resolveVariantParent(itemCode: string): Promise<string> {
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

async function fetchBunchDetails(bunchId: string): Promise<BunchDetails> {
  const bunch = await getValue('Bunch QR Code', bunchId, [
    'item_code',
    'bunch_size',
    'stem_length',
    'farm',
  ]);
  if (!bunch) throw new Error(`Bunch ${bunchId} not found`);

  const itemCode = String(bunch.item_code ?? '');
  const bunchUom = String(bunch.bunch_size ?? '');
  const stemLength = String(bunch.stem_length ?? '');

  if (!itemCode || !bunchUom || !stemLength) {
    throw new Error(`Bunch ${bunchId} is missing variety, size or stem length`);
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

  return { bunchId, itemCode, variantParent, bunchUom, stemLength, farm, stemsPerBunch };
}

export function useBunchDetails() {
  return useMutation({ mutationFn: fetchBunchDetails });
}
