import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { XfloraIssuePayload, XfloraIssueResult } from '../../types/xflora';

// Call C — POST /api/method/issueBucketToSaleOrderItem { bucket, sale_order_item, opl_name }.
// Ported from api_service.dart:1180 + onIssueFromColdstore. 200 → success message; any non-2xx
// (notably 409 "already issued") throws an ApiError via the interceptor — the caller inspects
// `.status` to branch (409 → flip the row + "already issued" pill).
async function issueFromColdstore({
  bucketId,
  saleOrderItem,
  oplName,
}: XfloraIssuePayload): Promise<XfloraIssueResult> {
  const res = await apiClient.post<{ message?: string | { message?: string } }>(
    '/api/method/issueBucketToSaleOrderItem',
    { bucket: bucketId, sale_order_item: saleOrderItem, opl_name: oplName },
  );
  const raw = res.data?.message;
  const message =
    typeof raw === 'string'
      ? raw
      : (raw && typeof raw === 'object' && typeof raw.message === 'string' ? raw.message : null)
        ?? 'Bucket issued successfully!';
  return { message };
}

export function useIssueFromColdstore() {
  return useMutation({ mutationFn: issueFromColdstore });
}
