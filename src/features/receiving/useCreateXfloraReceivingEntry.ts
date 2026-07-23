import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type {
  XfloraReceivingPayload,
  XfloraReceivingResult,
} from '../../types/xflora';

// Port of api_service.dart:createXfloraReceivingEntry (lines 2269-2299).
// POST /api/method/receiving_entry with the exact body keys below. bunch_size /
// number_of_bunches are null unless bunched; custom_receiving_batch_id is null in
// single mode. The contract carries no farm/warehouse.
async function createReceivingEntry({
  bucketId,
  batchId,
  isBunched,
  bunchSize,
  quantity,
}: XfloraReceivingPayload): Promise<XfloraReceivingResult> {
  const res = await apiClient.post<{ message?: string | { message?: string } }>(
    '/api/method/receiving_entry',
    {
      bucket_id: bucketId,
      custom_receiving_batch_id: batchId,
      is_bunched: isBunched,
      bunch_size: bunchSize,
      number_of_bunches: quantity,
    },
  );
  const raw = res.data?.message;
  const message =
    typeof raw === 'string'
      ? raw
      : (raw && typeof raw === 'object' && typeof raw.message === 'string' ? raw.message : null)
        ?? 'Created entry successfully';
  return { message };
}

export function useCreateXfloraReceivingEntry() {
  return useMutation({ mutationFn: createReceivingEntry });
}
