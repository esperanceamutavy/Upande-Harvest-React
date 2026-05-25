import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { BunchEntry } from '../../types/grading';

// Port of api_service.dart:entryByBunch
// Checks whether a bunch has already been graded (or packed) by looking up
// Stock Entry rows filtered by custom_bunch_id. Returns the raw list; caller
// inspects custom_scanned_grading on data[0].
async function entryByBunch({ bunchId }: { bunchId: string }): Promise<BunchEntry[]> {
  const filters = encodeURIComponent(
    JSON.stringify([['Stock Entry', 'custom_bunch_id', '=', bunchId]]),
  );
  const fields = encodeURIComponent(
    JSON.stringify([
      'name',
      'custom_scanned_grading',
      'custom_scanned_packing',
      'custom_greenhouse',
      'stock_entry_type',
      'custom_graded_by',
      'custom_bunch_id',
    ]),
  );
  const res = await apiClient.get<{ data: BunchEntry[] }>(
    `/api/resource/Stock Entry?filters=${filters}&fields=${fields}`,
  );
  return res.data.data;
}

export function useEntryByBunch() {
  return useMutation({ mutationFn: entryByBunch });
}
