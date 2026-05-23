import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { StockEntry } from '../../types/stock';

// Narrow field list — only what the dashboard list renders.
// Flutter fetches fields=["*"] but that pulls child tables unnecessarily.
// Add fields here when new screens need them.
const FIELDS = ['name', 'posting_date', 'docstatus', 'stock_entry_type', 'total_amount'];

async function fetchStockEntries(): Promise<StockEntry[]> {
  const res = await apiClient.get<{ data: StockEntry[] }>('/api/resource/Stock Entry', {
    params: {
      fields: JSON.stringify(FIELDS),
      limit: 1000,
      order_by: 'creation desc',
    },
  });
  return res.data.data;
}

export function useStockEntries() {
  return useQuery({
    queryKey: ['stock-entries'],
    queryFn: fetchStockEntries,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
