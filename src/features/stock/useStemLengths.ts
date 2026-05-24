import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { StemLength } from '../../types/stock';

async function fetchStemLengths(): Promise<StemLength[]> {
  const res = await apiClient.get<{ data: StemLength[] }>('/api/resource/Stem Length', {
    params: {
      fields: JSON.stringify(['length']),
      limit: 1000,
    },
  });
  return res.data.data;
}

export function useStemLengths() {
  return useQuery({
    queryKey: ['stem-lengths'],
    queryFn: fetchStemLengths,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
