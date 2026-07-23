import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type {
  XfloraBucketTransferPayload,
  XfloraBucketTransferResult,
} from '../../types/xflora';

// Port of api_service.dart:transferXfloraBucket
// POST /api/method/transfer_bucket { source_bucket_id, destination_bucket_id }
// Flutter returns the raw response and does not parse it; success/failure is HTTP-status
// driven (errors surface via the axios interceptor → ApiError). We normalise the Frappe
// `message` envelope (string or {message}) to a display string.
async function transferBucket({
  sourceBucketId,
  destinationBucketId,
}: XfloraBucketTransferPayload): Promise<XfloraBucketTransferResult> {
  const res = await apiClient.post<{ message?: string | { message?: string } }>(
    '/api/method/transfer_bucket',
    { source_bucket_id: sourceBucketId, destination_bucket_id: destinationBucketId },
  );
  const raw = res.data?.message;
  const message =
    typeof raw === 'string'
      ? raw
      : (raw && typeof raw === 'object' && typeof raw.message === 'string' ? raw.message : null)
        ?? 'Bucket transferred successfully';
  return { message };
}

export function useXfloraBucketTransfer() {
  return useMutation({ mutationFn: transferBucket });
}
