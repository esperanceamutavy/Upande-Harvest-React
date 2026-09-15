import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';

// GET /api/method/getReadySaleOrderItems → the Sale Orders that still have
// stock left to issue.
//
// Envelope: parse top-level `orders` first (proven production shape), then
// `message.orders` as a defensive fallback; log which path was taken so we can
// confirm on first device run.
//
// SALES ORDERS, NOT PICK LISTS, since today. The endpoint used to return Order
// Pick List names under a field labelled Sale Order — one order carries several,
// so the picker offered a choice between OPL-2026-05060 and OPL-2026-05061 with
// nothing to tell them apart.
//
// `order_details` rides alongside the names so the picker can show the customer
// and the CODE that goes on the box. A bare SAL-ORD-2026-02048 means nothing on
// the floor; "Dutch Flower Group · TGW FT ROSE GRANDE" does.

/** One selectable order. `name` is what the items lookup is called with. */
export interface ReadySaleOrder {
  name: string;
  customer: string | null;
  /** `Customer Code.code`, resolved. Rendered exactly as stored — live codes
   *  carry double spaces. Null when the order has no code at all. */
  customerCode: string | null;
  consignee: string | null;
  deliveryDate: string | null;
  /** Pick List Item rows on this order still waiting to be issued. */
  unissued: number;
  /** How many submitted pick lists the order carries. */
  pickLists: number;
}

const text = (v: unknown): string | null =>
  v != null && String(v).trim().length > 0 ? String(v).trim() : null;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function fetchReadyOrders(): Promise<ReadySaleOrder[]> {
  const res = await apiClient.get<Record<string, unknown>>('/api/method/getReadySaleOrderItems');
  const body = res.data ?? {};
  const msg = (body.message && typeof body.message === 'object' ? body.message : null) as
    | Record<string, unknown>
    | null;

  let path: 'top-level' | 'message' | 'empty';
  let orders: unknown[];
  let details: unknown[];

  if (Array.isArray(body.orders)) {
    orders = body.orders;
    details = Array.isArray(body.order_details) ? body.order_details : [];
    path = 'top-level';
  } else if (msg && Array.isArray(msg.orders)) {
    orders = msg.orders;
    details = Array.isArray(msg.order_details) ? msg.order_details : [];
    path = 'message';
  } else {
    orders = [];
    details = [];
    path = 'empty';
  }
  console.log(`[issuing] getReadySaleOrderItems envelope: ${path} (${orders.length} orders)`);

  // Keyed by name so a server that returns only `orders` still yields a usable
  // list — those rows just render with the order number and nothing else.
  const byName = new Map<string, Record<string, unknown>>();
  for (const d of details) {
    const row = (d ?? {}) as Record<string, unknown>;
    const key = text(row.sales_order);
    if (key) byName.set(key, row);
  }

  return orders.map((o) => {
    const name = String(o);
    const d = byName.get(name) ?? {};
    return {
      name,
      customer: text(d.customer),
      customerCode: text(d.customer_code),
      consignee: text(d.consignee),
      deliveryDate: text(d.delivery_date),
      unissued: num(d.unissued),
      pickLists: num(d.pick_lists),
    } satisfies ReadySaleOrder;
  });
}

export function useXfloraReadySaleOrders() {
  return useQuery({
    queryKey: ['xflora-ready-orders'],
    queryFn: fetchReadyOrders,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
