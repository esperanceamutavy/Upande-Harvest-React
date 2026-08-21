import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { XfloraReadySaleOrderItem } from '../../types/xflora';

// POST /api/method/getReadySaleOrderItemsData { custom_order_name }
//
// ⚠️ `custom_order_name` IS AN ORDER PICK LIST NAME, NOT A SALES ORDER NAME.
// The script matches it against submitted `Order Pick LIst` names; a
// `SAL-ORD-…` never matches, and the call comes back with an empty
// `packing_list` and the message "No submitted Order Pick List found with order
// name: …". That mismatch is what broke By-order mode.
//
// A Sales Order has ONE OPL PER LINE, so this resolves the SO's lines to their
// distinct `custom_opl` values and fans out, merging the results. The screen
// still passes a Sales Order name — the resolution is hidden here.
//
// Response is FLAT: `packing_list` and `message` are top-level siblings, and
// `message` is set on EVERY path including success ("Found N unissued items…").
// So it is not an error flag; it is only meaningful when the list is empty.

interface DataResponse {
  list: unknown[];
  message: string | null;
}

export interface ReadyOrderItems {
  items: XfloraReadySaleOrderItem[];
  /** Server explanation, surfaced only when nothing came back. Never null in
   *  that case if the server said anything — an empty list with no reason is
   *  exactly what made this fail silently before. */
  notice: string | null;
}

function parseItem(raw: unknown): XfloraReadySaleOrderItem {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    variety: o.variety != null ? String(o.variety) : '',
    bucket: o.bucket != null ? String(o.bucket) : '',
    stemLength: o.stem_length != null ? String(o.stem_length) : '',
    shelf: o.shelf != null ? String(o.shelf) : '',
    saleOrderItem: o.sales_order_item != null ? String(o.sales_order_item) : '',
    mixed: typeof o.mixed === 'number' ? o.mixed : 0,
    downgradeTo: o.downgrade_to != null ? String(o.downgrade_to) : null,
    qty: o.qty != null ? String(o.qty) : '',
    team: o.team != null ? String(o.team) : 'Unassigned',
    isIssued: o.custom_issued === true || o.custom_issued === 1,
    oplName: o.opl_name != null ? String(o.opl_name) : '',
  };
}

/** One call, for one OPL name. */
async function fetchForOpl(oplName: string): Promise<DataResponse> {
  const res = await apiClient.post<Record<string, unknown>>(
    '/api/method/getReadySaleOrderItemsData',
    { custom_order_name: oplName },
  );
  const body = res.data ?? {};
  const msg = (body.message && typeof body.message === 'object' ? body.message : null) as
    | Record<string, unknown>
    | null;

  const list = Array.isArray(body.packing_list)
    ? body.packing_list
    : msg && Array.isArray(msg.packing_list)
      ? msg.packing_list
      : [];

  return {
    list,
    message: typeof body.message === 'string' ? body.message : null,
  };
}

/** Resolve a Sales Order to the distinct OPLs its lines point at. */
async function oplsForSalesOrder(salesOrder: string): Promise<string[]> {
  const res = await apiClient.get<{ data?: Record<string, unknown> }>(
    `/api/resource/${encodeURIComponent('Sales Order')}/${encodeURIComponent(salesOrder)}`,
  );
  const items = Array.isArray(res.data?.data?.items)
    ? (res.data!.data!.items as Record<string, unknown>[])
    : [];

  const seen = new Set<string>();
  for (const row of items) {
    const opl = row.custom_opl != null ? String(row.custom_opl).trim() : '';
    if (opl) seen.add(opl);
  }
  return [...seen];
}

async function fetchOrderItems(salesOrder: string): Promise<ReadyOrderItems> {
  const opls = await oplsForSalesOrder(salesOrder);
  if (opls.length === 0) {
    return {
      items: [],
      notice: `${salesOrder} has no pick list on any of its lines, so there is nothing to issue against.`,
    };
  }

  // One OPL per line, so a multi-line order needs every one of them merged.
  const results = await Promise.all(opls.map(fetchForOpl));
  const items = results.flatMap((r) => r.list).map(parseItem);

  if (items.length > 0) return { items, notice: null };

  // Nothing came back. Surface whatever the server said rather than rendering
  // an empty list — the messages here include real failures, e.g. "Error
  // generating packing list: …" from the script's outer except.
  const reasons = [...new Set(results.map((r) => r.message).filter(Boolean) as string[])];
  return {
    items: [],
    notice:
      reasons.length > 0
        ? reasons.join(' · ')
        : `No unissued items on ${opls.join(', ')}.`,
  };
}

export function useXfloraReadySaleOrderItems() {
  return useMutation({ mutationFn: fetchOrderItems });
}
