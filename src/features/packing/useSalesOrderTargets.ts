import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { SalesOrderTargets } from '../../types/packing';

// GET /api/resource/Sales Order/<name> — the SOURCE OF TRUTH for what a box
// should hold.
//
// WHY NOT THE OPL: the allocator is broken. OPL-2026-02953 allocated 0.8
// bunches against an order for 8, so `Pick List Item.qty` and the header's
// `custom_total_stems` cannot be trusted as targets — a session driven off them
// caps out at a fraction of the real order. See RESTYLE_PLAN.md §8.3.
//
// The OPL is still used for shelf, warehouse and the payload's
// `custom_order_pick_list`. Only the TARGETS move here.
//
// `custom_packrate` is expressed IN THE SO LINE'S UOM — verified across two
// live orders: `Bunch(10)` with packrate 4 means four bunches; `Stems` with
// packrate 140 means 140 stems. So it is converted with `conversion_factor`
// only when the line is in stems.

/** Convert a value in the line's uom to bunches. */
function toBunches(value: number, uom: string, conversionFactor: number): number {
  // A `Bunch(n)` line is already counted in bunches. Anything else — `Stems` in
  // practice — is a stem count that divides down by the conversion factor.
  if (/^\s*bunch\s*\(/i.test(uom)) return value;
  if (conversionFactor > 0) return value / conversionFactor;
  return value;
}

async function fetchSalesOrderTargets({
  salesOrder,
  oplName,
}: {
  salesOrder: string;
  oplName: string;
}): Promise<SalesOrderTargets> {
  const res = await apiClient.get<{ data?: Record<string, unknown> }>(
    `/api/resource/${encodeURIComponent('Sales Order')}/${encodeURIComponent(salesOrder)}`,
  );
  const doc = res.data?.data;
  if (!doc) throw new Error(`Sales Order ${salesOrder} not found`);

  const items = Array.isArray(doc.items) ? (doc.items as Record<string, unknown>[]) : [];
  if (items.length === 0) throw new Error(`Sales Order ${salesOrder} has no line items`);

  // Each SO line carries its own OPL, so the line is matched on custom_opl.
  // Falling back to the sole line keeps single-line orders working if that
  // field is ever unset.
  const row =
    items.find((r) => r.custom_opl != null && String(r.custom_opl) === oplName) ??
    (items.length === 1 ? items[0] : undefined);

  if (!row) {
    throw new Error(`No Sales Order line on ${salesOrder} points at ${oplName}`);
  }

  const uom = String(row.uom ?? '');
  const conversionFactor = Number(row.conversion_factor ?? 0);
  const qty = Number(row.qty ?? 0);
  const packRate = Number(row.custom_packrate ?? 0);
  const boxCount = Number(row.custom_number_of_boxes ?? 0);

  if (!(packRate > 0)) {
    throw new Error(`Sales Order line for ${oplName} has no pack rate`);
  }

  return {
    salesOrder,
    itemCode: row.item_code != null ? String(row.item_code) : null,
    uom,
    conversionFactor,
    stockQty: Number(row.stock_qty ?? 0),
    // Rounded: a target is a whole number of bunches to a packer, and a
    // fractional one only ever comes from bad data upstream.
    targetBunches: Math.max(1, Math.round(toBunches(qty, uom, conversionFactor))),
    capBunches: Math.max(1, Math.round(toBunches(packRate, uom, conversionFactor))),
    // Used directly rather than derived — it is already correct on the SO and
    // taking it avoids inventing a rounding rule for the trailing box.
    boxCount: boxCount > 0 ? boxCount : 1,
  };
}

export function useSalesOrderTargets() {
  return useMutation({ mutationFn: fetchSalesOrderTargets });
}
