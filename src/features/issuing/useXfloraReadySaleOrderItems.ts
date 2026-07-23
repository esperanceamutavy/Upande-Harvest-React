import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { XfloraReadySaleOrderItem } from '../../types/xflora';

// Call B — POST /api/method/getReadySaleOrderItemsData { custom_order_name } → the packing
// list for one order. A mutation (not a query) because it is triggered on order-select and
// the result is held in local screen state that we mutate optimistically after an issue.
// Ported from api_service.dart:1364 + XfloraPackingListResponse / XfloraReadySaleOrderItem.
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

async function fetchOrderItems(orderName: string): Promise<XfloraReadySaleOrderItem[]> {
  const res = await apiClient.post<Record<string, unknown>>(
    '/api/method/getReadySaleOrderItemsData',
    { custom_order_name: orderName },
  );
  const body = res.data ?? {};
  const msg = (body.message && typeof body.message === 'object' ? body.message : null) as
    | Record<string, unknown>
    | null;

  let path: 'top-level' | 'message' | 'empty';
  let list: unknown[];
  if (Array.isArray(body.packing_list)) {
    list = body.packing_list;
    path = 'top-level';
  } else if (msg && Array.isArray(msg.packing_list)) {
    list = msg.packing_list;
    path = 'message';
  } else {
    list = [];
    path = 'empty';
  }
  console.log(`[issuing] getReadySaleOrderItemsData envelope: ${path} (${list.length} items)`);
  return list.map(parseItem);
}

export function useXfloraReadySaleOrderItems() {
  return useMutation({ mutationFn: fetchOrderItems });
}
