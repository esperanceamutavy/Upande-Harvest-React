import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type {
  XfloraShelvingPayload,
  XfloraShelvingResult,
} from '../../types/xflora';

// Port of api_service.dart:createXfloraShelvingEntry (lines 2301-2327).
// POST /api/method/shelving_entry { farm, shelf_id, bucket_id }. The bloc treats HTTP 200
// as success (message = jsonResponse['message']); non-200 is a failure whose message the
// axios interceptor surfaces via ApiError → extractFrappeError.
async function createShelvingEntry({
  farm,
  shelfId,
  bucketId,
}: XfloraShelvingPayload): Promise<XfloraShelvingResult> {
  const res = await apiClient.post<{ message?: string | { message?: string } }>(
    '/api/method/shelving_entry',
    { farm, shelf_id: shelfId, bucket_id: bucketId },
  );
  const raw = res.data?.message;
  const message =
    typeof raw === 'string'
      ? raw
      : (raw && typeof raw === 'object' && typeof raw.message === 'string' ? raw.message : null)
        ?? 'Bucket shelved successfully';
  return { message };
}

export function useCreateXfloraShelvingEntry() {
  return useMutation({ mutationFn: createShelvingEntry });
}
