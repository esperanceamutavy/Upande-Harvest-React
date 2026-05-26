import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { BunchEntry, FetchBunchEntriesResponse } from '../../types/discard';

interface FetchArgs {
  bunchId: string;
  action: string;  // "discard" for this screen; reusable for packing later
}

async function fetchStockEntryByBunch({ bunchId, action }: FetchArgs): Promise<BunchEntry[]> {
  const res = await apiClient.post<FetchBunchEntriesResponse>(
    '/api/method/fetchStockEntryByBunch',
    { custom_bunch_id: bunchId, action },
  );
  return res.data.message ?? [];
}

export function useFetchStockEntryByBunch() {
  return useMutation({ mutationFn: fetchStockEntryByBunch });
}
