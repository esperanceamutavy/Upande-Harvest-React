import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { StockEntryType } from '../../types/stock';

// Matches the allowlist in Flutter entry_list_view.dart:940-945
const ALLOWED_TYPES = new Set(['Harvesting', 'Receiving', 'Grading', 'Packing']);

async function fetchStockEntryTypes(): Promise<string[]> {
  const res = await apiClient.get<{ data: StockEntryType[] }>('/api/resource/Stock Entry Type', {
    params: {
      fields: JSON.stringify(['name']),
      limit: 1000,
    },
  });
  return res.data.data
    .map((t) => t.name)
    .filter((name) => ALLOWED_TYPES.has(name));
}

export function useStockEntryTypes() {
  return useQuery({
    queryKey: ['stock-entry-types'],
    queryFn: fetchStockEntryTypes,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
