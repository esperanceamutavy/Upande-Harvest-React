import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';

// Call A — GET /api/method/getReadySaleOrderItems → the list of ready Sale Order names
// for the type-ahead. Ported from api_service.dart:1341 + XfloraReadySaleOrderListResponse.
// Envelope: parse top-level `orders` first (proven production shape), then `message.orders`
// as a defensive fallback; log which path was taken so we can confirm on first device run.
async function fetchReadyOrders(): Promise<string[]> {
  const res = await apiClient.get<Record<string, unknown>>('/api/method/getReadySaleOrderItems');
  const body = res.data ?? {};
  const msg = (body.message && typeof body.message === 'object' ? body.message : null) as
    | Record<string, unknown>
    | null;

  let path: 'top-level' | 'message' | 'empty';
  let orders: unknown[];
  if (Array.isArray(body.orders)) {
    orders = body.orders;
    path = 'top-level';
  } else if (msg && Array.isArray(msg.orders)) {
    orders = msg.orders;
    path = 'message';
  } else {
    orders = [];
    path = 'empty';
  }
  console.log(`[issuing] getReadySaleOrderItems envelope: ${path} (${orders.length} orders)`);
  return orders.map(String);
}

export function useXfloraReadySaleOrders() {
  return useQuery({
    queryKey: ['xflora-ready-orders'],
    queryFn: fetchReadyOrders,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
