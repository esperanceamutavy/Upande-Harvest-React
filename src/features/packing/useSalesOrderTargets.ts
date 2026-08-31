import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { resolveCustomerCodeRef, toCustomerCodeRef } from './customerCodeRef';
import { orderLengthFromItemCode } from './lengths';
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

/** Trimmed string, or null for anything empty — so callers can omit the row. */
function _text(value: unknown): string | null {
    const text = value != null ? String(value).trim() : '';
    return text.length > 0 ? text : null;
}


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

  // A mix puts SEVERAL lines on ONE OPL, so collect them all. Straight boxes
  // can too (OPL-2026-03432 has three Madam Red lines at different lengths),
  // which is why the branch below keys on custom_mixed_box, not on count.
  const oplRows = items.filter(
    (r) => r.custom_opl != null && String(r.custom_opl) === oplName,
  );
  const rows = oplRows.length > 0 ? oplRows : items.length === 1 ? [items[0]] : [];

  if (rows.length === 0)
    throw new Error(`No Sales Order line on ${salesOrder} points at ${oplName}`);

  // Identity fields come off the first line — order-level in practice, and
  // identical across a mix group.
  const row = rows[0];
  const isMixed = rows.some((r) => Number(r.custom_mixed_box ?? 0) === 1);

  // `custom_customer_code` is a LINK: the stored value is a Customer Code record
  // NAME and the code that goes on the box is that record's `code`. They diverge
  // in live data, so this is a lookup, not a parse — see customerCodeRef.ts.
  // One extra read, and only when the order actually carries a reference.
  const codeRefName = resolveCustomerCodeRef(
    row.custom_customer_code,
    doc.custom_customer_code,
  );
  let codeRef = null;
  if (codeRefName) {
    let record: Record<string, unknown> | null = null;
    try {
      const cc = await apiClient.get<{ data?: Record<string, unknown> }>(
        `/api/resource/${encodeURIComponent('Customer Code')}/${encodeURIComponent(codeRefName)}`,
      );
      record = cc.data?.data ?? null;
    } catch {
      // A missing or unreadable record must not fail the whole session: the
      // fallback renders the stored reference, which is still informative.
      record = null;
    }
    codeRef = toCustomerCodeRef(codeRefName, record);
  }

  const uom = String(row.uom ?? '');
  const conversionFactor = Number(row.conversion_factor ?? 0) || 1;
  const soIsBunchUom = /^\s*bunch\s*\(/i.test(uom);

  // Mixed box: the cap is the SUM across the mix group. custom_packrate is 0
  // on mixed lines and must stay so - it means "whole box" and no single line
  // knows that number. Writing a per-variety figure there closed a box at
  // 10 of 20 stems and reported it fully packed. custom_packrate_mixed_box is
  // always STEMS, so divide into the line's uom before resolveTargetUnits,
  // whose contract is that packRate and qty arrive in the SO line's uom.
  let packRate: number;
  let qty: number;

  if (isMixed) {
    const stemsPerBox = rows.reduce(
      (sum, r) => sum + Number(r.custom_packrate_mixed_box ?? 0),
      0,
    );
    packRate = soIsBunchUom ? stemsPerBox / conversionFactor : stemsPerBox;
    qty = rows.reduce((sum, r) => sum + Number(r.qty ?? 0), 0);
  } else {
    packRate = Number(row.custom_packrate ?? 0);
    qty = Number(row.qty ?? 0);
  }

  // A mix spans lines, so take the largest rather than the first.
  const boxCount = rows.reduce(
    (max, r) => Math.max(max, Number(r.custom_number_of_boxes ?? 0)),
    0,
  );

  if (!(packRate > 0)) {
    throw new Error(
      isMixed
        ? `Mixed box lines for ${oplName} have no packrate - check custom_packrate_mixed_box on the Sales Order`
        : `Sales Order line for ${oplName} has no pack rate`,
    );
  }

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
    // The SO line has no length field; the item_code suffix is the source.
    orderLength: orderLengthFromItemCode(_text(row.item_code)),
    // LINE first, HEADER as fallback, then RESOLVED through Customer Code —
    // the stored value is a record NAME, not the code. See customerCodeRef.ts.
    customerCode: codeRef,
    // LINE first — the header's custom_truck_details is the wrong source and
    // is only consulted for older orders that predate the line field.
    truck: _text(row.custom_truck) ?? _text(doc.custom_truck_details),
    barcode: _text(row.custom_barcode),
    consignee: _text(doc.custom_consignee),
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
