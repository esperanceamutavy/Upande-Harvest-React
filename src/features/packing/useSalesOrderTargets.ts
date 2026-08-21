import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { resolveTargetUnits } from './targets';
import type { SalesOrderTargets } from '../../types/packing';

// GET /api/resource/Sales Order/<name> — the SOURCE OF TRUTH for what a box
// should hold.
//
// WHY NOT THE OPL: the allocator is broken. OPL-2026-02953 allocated 0.8
// bunches against an order for 8, so `Pick List Item.qty` and the header's
// `custom_total_stems` cannot be trusted as targets. See RESTYLE_PLAN.md §8.3.
//
// ── UNITS. This is where a live blocker came from, so read carefully. ───────
//
// `custom_packrate` and `qty` are expressed IN THE SO LINE'S UOM, and that uom
// is NOT always bunches:
//
//   SAL-ORD-2026-01493  uom Bunch(10)  packrate 4    qty 8     → already bunches
//   SAL-ORD-2026-01494  uom Stems      packrate 200  qty 1200  → stems
//
// On the Stems order the cap is 200 STEMS = 20 bunches. Rendering 200 with a
// "bunches" label meant the cap was never reached and the box could not close.
//
// `conversion_factor` does NOT rescue this: on a Stems line it is 1, not the
// bunch size. The bunch size has to come from somewhere else entirely.

async function fetchSalesOrderTargets({
  salesOrder,
  oplName,
  oplUom,
}: {
  salesOrder: string;
  oplName: string;
  /** The OPL row's uom — first choice for resolving bunch size. */
  oplUom: string;
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

  if (!row) throw new Error(`No Sales Order line on ${salesOrder} points at ${oplName}`);

  const uom = String(row.uom ?? '');
  const conversionFactor = Number(row.conversion_factor ?? 0) || 1;
  const qty = Number(row.qty ?? 0);
  const packRate = Number(row.custom_packrate ?? 0);
  const boxCount = Number(row.custom_number_of_boxes ?? 0);

  if (!(packRate > 0)) throw new Error(`Sales Order line for ${oplName} has no pack rate`);

  // Unit resolution lives in targets.ts so it can be tested without a network
  // call — see targets.test.ts, pinned against both live orders.
  const units = resolveTargetUnits({
    uom,
    packRate,
    qty,
    conversionFactor,
    oplUom,
    bunching: doc.custom_bunching != null ? String(doc.custom_bunching) : '',
  });

  return {
    salesOrder,
    itemCode: row.item_code != null ? String(row.item_code) : null,
    uom,
    conversionFactor,
    stockQty: Number(row.stock_qty ?? 0),
    stemsPerBunch: units.stemsPerBunch,
    unitLabel: units.unitLabel,
    capPerBox: units.capPerBox,
    orderTotal: units.orderTotal,
    // Used directly rather than derived — it is already correct on the SO and
    // taking it avoids inventing a rounding rule for the trailing box.
    boxCount: boxCount > 0 ? boxCount : 1,
  };
}

export function useSalesOrderTargets() {
  return useMutation({ mutationFn: fetchSalesOrderTargets });
}
