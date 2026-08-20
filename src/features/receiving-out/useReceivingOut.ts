import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { serializeByKey } from '../../lib/serializeByKey';
import type {
  ReceivingOutOutcome,
  ReceivingOutPayload,
  ReceivingOutResult,
} from '../../types/receivingOut';

// POST /api/method/receiving_out_entry { grader, bucket_id, farm, confirm? }
//
// All three of grader / bucket_id / farm are required; the script throws on a
// missing one. `grader` is an Employee DOCNAME, which on this site is the
// payroll number (e.g. "411") — the same identifier grading uses, so the badge
// latch is reused unchanged.
//
// FLAT envelope, and FOUR distinct HTTP-200 shapes discriminated by boolean
// flags rather than a status field:
//   already_open: true       → re-scan of the bucket they hold (idempotent)
//   needs_confirmation: true → they hold a different bucket; prior_* describes it
//   cancelled: true          → they kept the prior bucket
//   (none of the above)      → a new Receiving Out was opened
//
// A bucket held by ANOTHER grader is a `frappe.throw` → HTTP 500, so it arrives
// through the normal error path and surfaces as a danger Notice.
//
// SERIALIZED under 'receiving-out': the script does a read-check-write against
// the one-open-bucket-per-grader lock, so two fast scans could both pass the
// check. Distinct key from 'grading' and 'packing' so the flows do not block
// each other.
async function submitReceivingOut(p: ReceivingOutPayload): Promise<ReceivingOutResult> {
  return serializeByKey('receiving-out', async () => {
    const res = await apiClient.post<Record<string, unknown>>(
      '/api/method/receiving_out_entry',
      {
        grader: p.grader,
        // Raw as scanned — the server resolves BUCKET-*, "Coldroom Bucket - *"
        // and JSON-wrapped forms itself.
        bucket_id: p.bucketId,
        farm: p.farm,
        ...(p.confirm ? { confirm: p.confirm } : {}),
      },
    );

    const b = (res.data ?? {}) as Record<string, unknown>;

    const outcome: ReceivingOutOutcome = b.needs_confirmation
      ? 'needs-confirmation'
      : b.already_open
        ? 'already-open'
        : b.cancelled
          ? 'cancelled'
          : 'opened';

    const str = (v: unknown) => (v != null ? String(v) : null);
    const num = (v: unknown) => (v != null ? Number(v) : null);

    return {
      outcome,
      message: typeof b.message === 'string' ? b.message : 'Receiving Out recorded',
      receivingOut: str(b.receiving_out),
      bucketId: str(b.bucket_id),
      variety: str(b.variety),
      remainingQty: num(b.remaining_qty),
      transferStockEntry: str(b.transfer_stock_entry),
      priorReceivingOut: str(b.prior_receiving_out),
      priorBucketId: str(b.prior_bucket_id),
      priorVariety: str(b.prior_variety),
      priorRemainingQty: num(b.prior_remaining_qty),
      requestedBucketId: str(b.requested_bucket_id),
    };
  });
}

export function useReceivingOut() {
  return useMutation({ mutationFn: submitReceivingOut });
}
