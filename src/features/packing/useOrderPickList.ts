import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { OrderPickList, OplRow } from '../../types/packing';

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
