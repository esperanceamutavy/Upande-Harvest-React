import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { resolveCustomerCodeRef, toCustomerCodeRef } from './customerCodeRef';
import { orderLengthFromItemCode } from './lengths';
import { mixedStemsPerBox, resolveGroupLines } from './mixGroup';
import { scopeToOrder } from './substitutes.ts';
import type { ResolvedSubstituteRow } from './substitutes.ts';
import { resolveVariantParent } from './useBunchDetails';
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
  mixedBunchSizes = false,
}: {
  salesOrder: string;
  oplName: string;
  /** The OPL row's uom — first choice for resolving bunch size. */
  oplUom: string;
  /** True when the OPL's rows state more than one distinct Bunch(N) size. */
  mixedBunchSizes?: boolean;
}): Promise<SalesOrderTargets> {
  const res = await apiClient.get<{ data?: Record<string, unknown> }>(
    `/api/resource/${encodeURIComponent('Sales Order')}/${encodeURIComponent(salesOrder)}`,
  );
  const doc = res.data?.data;
  if (!doc) throw new Error(`Sales Order ${salesOrder} not found`);

  const items = Array.isArray(doc.items) ? (doc.items as Record<string, unknown>[]) : [];
  if (items.length === 0) throw new Error(`Sales Order ${salesOrder} has no line items`);

  // A mix puts SEVERAL lines on ONE OPL, so collect them all — and for a mix the
  // set CANNOT be read off custom_opl, because the allocator does not write it
  // to every line. Nine of Milele's ten lines carry OPL-2026-05334 and
  // FUSCHIANA-40CM carries null; matching on the link drops it silently. The
  // group is the real membership. See mixGroup.ts.
  //
  // Straight boxes still match on custom_opl, including the several-lines case
  // (OPL-2026-03432 has three Madam Red lines at different lengths).
  const resolved = resolveGroupLines(items, oplName);

  // BOTH OF THESE ARE ALLOCATOR FAULTS, surfaced rather than silently absorbed.
  // Packing recovers, but the link is still missing and someone should fix it.
  if (resolved.ambiguous) {
    console.warn(
      `[packing] ${oplName}: no Sales Order line carries this OPL, and ${salesOrder} ` +
        `holds more than one group — REFUSING to guess which. Falling back to the ` +
        `linked lines, which is empty, so the screen will show the allocation only.`,
    );
  } else if (resolved.viaOrder) {
    console.warn(
      `[packing] ${oplName}: no Sales Order line carries this OPL. Group resolved ` +
        `from ${salesOrder} instead (${resolved.groupField} ${resolved.groupValue}, ` +
        `${resolved.rows.length} lines). The allocator did not write custom_opl.`,
    );
  }
  const rows =
    resolved.rows.length > 0 ? resolved.rows : items.length === 1 ? [items[0]] : [];

  if (rows.length === 0)
    throw new Error(`No Sales Order line on ${salesOrder} points at ${oplName}`);

  // Identity fields come off the first line — order-level in practice, and
  // identical across a mix group.
  const row = rows[0];
  const isMixed = resolved.mode !== 'straight';

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
    // Summed across the GROUP, not across the linked lines — that difference is
    // the whole fix. Milele reads 500 (10 x 50) where the link-based set read
    // 450, because FUSCHIANA's 50 was being dropped with its row.
    const stemsPerBox = mixedStemsPerBox(rows);
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

  // EVERY item code goes through variant_of, on both sides of the substitute
  // comparison. The table's columns are Links to Item and nothing guarantees
  // which level they hold; a string compare — or stripping a "-40CM" suffix —
  // rejects valid scans and breaks outright on a variety not named Name-NNCM.
  // resolveVariantParent is the same cached lookup useBunchDetails uses for
  // scanned bunches, so a session pays one call per distinct variety, not one
  // per scan. See substitutes.ts.
  const groupLines = await Promise.all(
    rows.map(async (r) => {
      const code = _text(r.item_code);
      return {
        itemCode: code,
        variety: code ? await resolveVariantParent(code) : null,
        orderLength: orderLengthFromItemCode(code),
      };
    }),
  );

  const substituteRows = Array.isArray(doc.custom_substitutes)
    ? (doc.custom_substitutes as Record<string, unknown>[])
    : [];
  const resolvedSubstitutes: ResolvedSubstituteRow[] = [];
  for (const sub of substituteRows) {
    const forItem = _text(sub.for_item);
    const variety = _text(sub.variety);
    if (!forItem || !variety) continue;
    resolvedSubstitutes.push({
      forItem,
      forTemplate: await resolveVariantParent(forItem),
      forLength: orderLengthFromItemCode(forItem),
      variety,
      varietyTemplate: await resolveVariantParent(variety),
      notes: _text(sub.notes),
    });
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
    mixedBunchSizes,
  });

  // The plausibility branch is a HEURISTIC, so every line that lands on it is
  // announced. Production logs are how we learn which orders are ambiguous —
  // waiting for a packer to report a wrong box is the alternative, and by then
  // the box is packed.
  if (units.basis === 'plausibility') {
    console.warn(
      `[packing] pack rate unit resolved by PLAUSIBILITY, not arithmetic — ` +
        `${salesOrder} line ${row.item_code != null ? String(row.item_code) : '?'} ` +
        `(opl ${oplName}, uom "${uom}", packrate ${packRate}): ` +
        `reading it as ${units.capPerBox} ${units.unitLabel} per box`,
    );
  }
  if (units.basis === 'inexact' || units.basis === 'unresolved') {
    console.warn(
      `[packing] pack rate could not be expressed in bunches — ` +
        `${salesOrder} line ${row.item_code != null ? String(row.item_code) : '?'} ` +
        `(opl ${oplName}, basis ${units.basis}): counting STEMS`,
    );
  }

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
    basis: units.basis,
    // Used directly rather than derived — it is already correct on the SO and
    // taking it avoids inventing a rounding rule for the trailing box.
    boxCount: boxCount > 0 ? boxCount : 1,
    packMode: resolved.mode,
    // Every variety in the group, for the screen to LIST and for Rule 3 to match
    // against. `item_locations` cannot serve either job on a mix: an unallocated
    // variety has no row there, so it would be invisible and unscannable.
    //
    // `variety` is the TEMPLATE. Lines carry the variant ("FUSCHIANA-40CM"); a
    // legitimate 60CM bunch resolves to the template "FUSCHIANA" and would fail
    // a variant-to-variant string match. Length is Rule 3's own comparison.
    groupLines,
    // custom_substitutes rides along on the Sales Order read this function
    // already makes — no extra fetch for the table itself. Scoped to the lines
    // of THIS pick list, since one order routinely spans several.
    substitutes: scopeToOrder(resolvedSubstitutes, groupLines.map((l) => l.variety)),
  };
}

export function useSalesOrderTargets() {
  return useMutation({ mutationFn: fetchSalesOrderTargets });
}
