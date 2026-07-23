import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { GreenhouseData } from '../../types/stock';

// Port of stock_bloc.dart fetchKikwetuGreenhouseData: GET /api/resource/Warehouse/{name}
// The Warehouse doc stores varieties and sections as child tables.
async function fetchGreenhouseData(name: string): Promise<GreenhouseData> {
  const res = await apiClient.get<{ data: GreenhouseData }>(
    `/api/resource/Warehouse/${encodeURIComponent(name)}`,
  );
  return res.data.data;
}

export function useGreenhouseData(name: string) {
  return useQuery({
    queryKey: ['greenhouse-data', name],
    queryFn: () => fetchGreenhouseData(name),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!name,
  });
}
