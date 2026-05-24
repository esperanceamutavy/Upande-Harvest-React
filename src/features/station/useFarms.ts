import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { Farm } from '../../types/stock';

async function fetchFarms(): Promise<Farm[]> {
  const res = await apiClient.get<{ data: Farm[] }>('/api/resource/Farm', {
    params: {
      fields: JSON.stringify(['name']),
      limit: 1000,
    },
  });
  return res.data.data;
}

export function useFarms() {
  return useQuery({
    queryKey: ['farms'],
    queryFn: fetchFarms,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
