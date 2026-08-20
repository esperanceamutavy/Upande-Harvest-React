import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { GraderOpenBucket } from '../../types/grading';

// POST /api/method/upande_harvest.api.get_grader_open_bucket { grader }
// Source: Upande-Harvest-React api.ts:955.
//
// Pre-flight for the grading flow: resolves which bucket the scanned grader is
// currently holding. `open: false` means they have no open Receiving Out —
// the legacy client treats that as an error in grading (api.ts:951-953), so
// the screen surfaces "do Receiving Out first" rather than letting the bunch
// scan fail deeper in.
//
// A mutation rather than a query: it fires in response to a badge scan, not on
// mount, and the screen re-runs it after each submit to refresh remaining_qty.
async function fetchGraderOpenBucket(grader: string): Promise<GraderOpenBucket> {
  const res = await apiClient.post<{ message?: Record<string, unknown> } | Record<string, unknown>>(
    '/api/method/upande_harvest.api.get_grader_open_bucket',
    { grader },
  );

  // The endpoint is inconsistent about the Frappe `message` envelope, so the
  // legacy client unwraps defensively: `res.message ?? res`.
  const body = res.data as { message?: Record<string, unknown> };
  const m = (body?.message ?? res.data ?? {}) as Record<string, unknown>;

  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const str = (v: unknown): string | null => (v == null ? null : String(v));

  return {
    open: Boolean(m.open),
    receivingOut: str(m.receiving_out),
    bucketId: str(m.bucket_id),
    variety: str(m.variety),
    initialQty: num(m.initial_qty),
    remainingQty: num(m.remaining_qty),
    openedAt: str(m.opened_at),
  };
}

export function useGraderOpenBucket() {
  return useMutation({ mutationFn: fetchGraderOpenBucket });
}
