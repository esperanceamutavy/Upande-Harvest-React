import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { Warehouse } from '../../types/stock';

async function fetchWarehouses(): Promise<Warehouse[]> {
  const res = await apiClient.get<{ data: Warehouse[] }>('/api/resource/Warehouse', {
    params: {
      fields: JSON.stringify(['name']),
      filters: JSON.stringify([['disabled', '=', '0']]),
      limit: 5000,
    },
  });
  // Port of configure_user_farm_screen.dart:70-79: keep only greenhouse-named warehouses
  return res.data.data.filter(
    (w) => w.name.startsWith('GHSE') || w.name.includes('GH'),
  );
}

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: fetchWarehouses,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
