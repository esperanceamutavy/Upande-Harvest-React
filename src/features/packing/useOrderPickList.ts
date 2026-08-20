import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { parseStemsPerBunch } from './useBunchDetails';
import type { OrderPickList, OplRow, PackingSession } from '../../types/packing';

// POST /api/method/frappe.client.get { doctype: 'Order Pick LIst', name }
//
// NOTE THE DOCTYPE SPELLING: "Order Pick LIst", capital I. That typo is the
// actual doctype name on the site — see RESTYLE_PLAN.md §8.3.
//
// Detail fetch for an OPL chosen in the picker (see useOplList). One call gives
// the header plus all `item_locations` rows, which is everything a session
// needs — no Sales Order round-trip.
const OPL_DOCTYPE = 'Order Pick LIst';

function toRow(r: Record<string, unknown>): OplRow {
  return {
    itemCode: String(r.item_code ?? ''),
    stemLength: String(r.custom_stem_length ?? ''),
    uom: String(r.uom ?? ''),
    warehouse: r.warehouse != null ? String(r.warehouse) : null,
    shelf: r.custom_shelf != null ? String(r.custom_shelf) : null,
    qty: Number(r.qty ?? 0),
    packRate: r.custom_packrate != null ? String(r.custom_packrate) : null,
  };
}

async function fetchOrderPickList(name: string): Promise<OrderPickList> {
  const res = await apiClient.post<{ message?: Record<string, unknown> }>(
    '/api/method/frappe.client.get',
    { doctype: OPL_DOCTYPE, name },
  );
  const doc = res.data?.message;
  if (!doc) throw new Error(`Order Pick List ${name} not found`);

  const rows = Array.isArray(doc.item_locations)
    ? (doc.item_locations as Record<string, unknown>[]).map(toRow)
    : [];

  return {
    name: String(doc.name ?? name),
    salesOrder: doc.sales_order != null ? String(doc.sales_order) : null,
    customer: doc.customer != null ? String(doc.customer) : null,
    // Null on every live OPL inspected — the payload's farm comes from the
    // scanned BUNCH instead.
    farm: doc.farm != null ? String(doc.farm) : null,
    boxType: doc.custom_box_type != null ? String(doc.custom_box_type) : null,
    totalUnits: doc.custom_total_stems != null ? String(doc.custom_total_stems) : null,
    isMixedBox: Boolean(doc.custom_is_mixed_box_pick_list),
    rows,
  };
}

export function useOrderPickList() {
  return useMutation({ mutationFn: fetchOrderPickList });
}

/**
 * Rule 1's two bounds, both off the OPL (§8.3):
 *   capPerBox = int(custom_packrate)                      — on every row, identical
 *   boxCount  = int(custom_total_stems) / capPerBox       — header / cap
 *
 * Both arrive as STRINGS, so they are parsed rather than divided directly.
 * `custom_total_stems` is used rather than summing `qty`, because `qty` is in
 * BUNCHES and can be fractional — deriving a total from it invites float error
 * at the cap boundary.
 *
 * ⚠️ Both values are in the OPL's OWN unit, which is not reliably stems despite
 * the field name (§8.3). The division is safe because they share that unit; the
 * UI must not call the result stems.
 *
 * Returns null when the OPL cannot support a session (no rows, no pack rate, or
 * a pack rate of zero), so the screen can refuse it up front rather than on the
 * first scan.
 */
export function deriveSession(opl: OrderPickList): PackingSession | null {
  const first = opl.rows[0];
  if (!first) return null;

  const capPerBox = Number.parseInt(first.packRate ?? '', 10);
  if (!Number.isFinite(capPerBox) || capPerBox <= 0) return null;

  const totalUnits = Number.parseInt(opl.totalUnits ?? '', 10);
  if (!Number.isFinite(totalUnits) || totalUnits <= 0) return null;

  // Ceil: a trailing partial box is still a box that gets packed.
  const boxCount = Math.max(1, Math.ceil(totalUnits / capPerBox));

  // ── Display conversion. Bunch size varies per OPL — Bunch(10) and Bunch(12)
  // are both live — so it is read off the row's uom, never assumed.
  //
  // The same divisor works whatever unit the OPL used, because Rule 1's
  // increment is ALSO stemsPerBunch: the bunches a box admits is exactly
  // cap / stemsPerBunch by construction, so the display mirrors what the app
  // will actually allow rather than what the OPL claims. On a malformed OPL
  // (§8.3, allocator defect) this collapses toward 1, which is the same
  // tenth-of-the-order symptom already recorded — honest, not hidden.
  const stemsPerBunch = parseStemsPerBunch(first.uom);
  const capBunches = stemsPerBunch ? Math.max(1, Math.round(capPerBox / stemsPerBunch)) : null;
  const totalBunches = stemsPerBunch ? Math.max(1, Math.round(totalUnits / stemsPerBunch)) : null;

  return { opl, capPerBox, boxCount, stemsPerBunch, capBunches, totalBunches };
}
