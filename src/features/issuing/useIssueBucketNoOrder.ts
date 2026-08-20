import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';

// POST /api/method/issue_bucket_no_order { bucket_id }
//
// The fallback for a bucket with no Pick List allocation. Xflora's shelving is
// unreliable, so an unallocated bucket is common and would otherwise block the
// packer entirely.
//
// It removes the bucket's Shelf Item rows, marks a Pick List Item issued if one
// happens to exist, and returns a flat envelope — the same shape as
// mobile_grading_entry, so `extractFrappeError` handles its failures unchanged
// (HTTP 500 with the text in `message` and an `error` key).
//
// NATURALLY IDEMPOTENT: a re-scan finds no shelf rows left and is a no-op. That
// is worth knowing but is not a licence to call it twice — it permanently drops
// the bucket→order link, which is why the screen gates it behind an explicit
// confirmation rather than firing it automatically on a 404.

export interface IssueNoOrderResult {
  message: string;
  bucketId: string | null;
  stockEntry: string | null;
  issuedTo: string | null;
  removedFromShelf: number | null;
  /** True when a Pick List row existed after all and was marked issued. */
  wasAllocated: boolean;
}

async function issueBucketNoOrder(bucketId: string): Promise<IssueNoOrderResult> {
  const res = await apiClient.post<Record<string, unknown>>(
    '/api/method/issue_bucket_no_order',
    { bucket_id: bucketId },
  );
  // Flat envelope: top-level siblings, `message` a plain string.
  const body = (res.data ?? {}) as Record<string, unknown>;

  return {
    message: typeof body.message === 'string' ? body.message : 'Bucket issued without an order',
    bucketId: body.bucket_id != null ? String(body.bucket_id) : null,
    stockEntry: body.stock_entry != null ? String(body.stock_entry) : null,
    issuedTo: body.issued_to != null ? String(body.issued_to) : null,
    removedFromShelf: body.removed_from_shelf != null ? Number(body.removed_from_shelf) : null,
    wasAllocated: Boolean(body.was_allocated),
  };
}

export function useIssueBucketNoOrder() {
  return useMutation({ mutationFn: issueBucketNoOrder });
}
