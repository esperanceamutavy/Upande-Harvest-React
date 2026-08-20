import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';

// POST /api/method/getBucketIssueInfo { bucket_id }
//
// Asks the server what a bucket's Pick List allocation actually is, across ALL
// open OPLs — not just the order currently selected on screen. That distinction
// is the whole point: the issuing screen's loaded packing list only knows about
// one order, so "not in this list" and "not allocated anywhere" look identical
// locally, and only the second makes the no-order fallback safe.
//
// The response discriminates by HTTP STATUS, and the body carries a `message`
// string plus a `data` object:
//   200 → data.status 'ok'            + opl_name, sales_order, sale_order_item, variety, shelf
//   404 → data.status 'not_allocated' — no Pick List row references this bucket
//   409 → data.status 'already_issued' + the same allocation fields
//   400 → bucket_id missing
//   500 → data.error
//
// Non-2xx means axios rejects and the interceptor normalises to an ApiError,
// which DROPS `data` but preserves `status`. So the caller branches on the
// status code, which is sufficient — see BucketAllocation below.

export type BucketAllocationStatus = 'ok' | 'not_allocated' | 'already_issued' | 'unknown';

export interface BucketAllocation {
  status: BucketAllocationStatus;
  bucketId: string;
  oplName: string | null;
  salesOrder: string | null;
  saleOrderItem: string | null;
  variety: string | null;
  shelf: string | null;
  /** Server-supplied text. Present on every branch. */
  message: string;
}

function emptyAllocation(status: BucketAllocationStatus, bucketId: string, message: string) {
  return {
    status,
    bucketId,
    oplName: null,
    salesOrder: null,
    saleOrderItem: null,
    variety: null,
    shelf: null,
    message,
  } satisfies BucketAllocation;
}

async function fetchBucketIssueInfo(bucketId: string): Promise<BucketAllocation> {
  try {
    const res = await apiClient.post<Record<string, unknown>>(
      '/api/method/getBucketIssueInfo',
      { bucket_id: bucketId },
    );
    const body = (res.data ?? {}) as Record<string, unknown>;
    const d = (body.data ?? {}) as Record<string, unknown>;
    return {
      status: 'ok',
      bucketId: d.bucket_id != null ? String(d.bucket_id) : bucketId,
      oplName: d.opl_name != null ? String(d.opl_name) : null,
      salesOrder: d.sales_order != null ? String(d.sales_order) : null,
      saleOrderItem: d.sale_order_item != null ? String(d.sale_order_item) : null,
      variety: d.variety != null ? String(d.variety) : null,
      shelf: d.shelf != null ? String(d.shelf) : null,
      message: body.message != null ? String(body.message) : 'ok',
    };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const message = err.message ?? 'Bucket lookup failed';

    // 404 and 409 are informational outcomes, not transport failures — they are
    // resolved into a value rather than rethrown, so the screen branches on one
    // shape instead of splitting between a result and a catch.
    if (err.status === 404) return emptyAllocation('not_allocated', bucketId, message);
    if (err.status === 409) return emptyAllocation('already_issued', bucketId, message);
    throw e;
  }
}

export function useBucketIssueInfo() {
  return useMutation({ mutationFn: fetchBucketIssueInfo });
}
