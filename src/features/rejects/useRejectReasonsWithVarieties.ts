import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { RejectReasonsResponse } from '../../types/reject';

async function fetchRejectReasonsWithVarieties(greenhouse: string): Promise<RejectReasonsResponse> {
  const res = await apiClient.post<{ message: RejectReasonsResponse }>(
    '/api/method/getRejectReasonsWithVarieties',
    { greenhouse_name: greenhouse },
  );
  return res.data.message;
}

export function useRejectReasonsWithVarieties(greenhouse: string | undefined) {
  return useQuery({
    queryKey: ['reject-reasons-with-varieties', greenhouse],
    queryFn: () => fetchRejectReasonsWithVarieties(greenhouse!),
    enabled: Boolean(greenhouse),
    staleTime: 1000 * 60 * 30, // 30 min — reject reasons + varieties rarely change
  });
}
