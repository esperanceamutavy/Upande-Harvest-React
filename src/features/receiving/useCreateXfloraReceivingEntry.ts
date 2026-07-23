import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type {
  XfloraReceivingPayload,
  XfloraReceivingResult,
} from '../../types/xflora';

// Port of api_service.dart:createXfloraReceivingEntry (lines 2269-2299), plus the
// partial-bucket override. POST /api/method/receiving_entry. bunch_size/number_of_bunches
// are null unless bunched; custom_receiving_batch_id is null in single mode; override_qty
// is only included when set (partial mode). The contract carries no farm/warehouse.
// Success may return { message, override_applied, qty }; the server throws (→ error pill)
// when a partial override exceeds the bucket ceiling.
type ReceivingBody = {
  message?: string | { message?: string; override_applied?: unknown; qty?: unknown };
  override_applied?: unknown;
  qty?: unknown;
};

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

async function createReceivingEntry({
  bucketId,
  batchId,
  isBunched,
  bunchSize,
  quantity,
  overrideQty,
}: XfloraReceivingPayload): Promise<XfloraReceivingResult> {
  const res = await apiClient.post<ReceivingBody>('/api/method/receiving_entry', {
    bucket_id: bucketId,
    custom_receiving_batch_id: batchId,
    is_bunched: isBunched,
    bunch_size: bunchSize,
    number_of_bunches: quantity,
    ...(overrideQty != null && { override_qty: overrideQty }),
  });

  const body = res.data ?? {};
  const raw = body.message;
  const obj = raw && typeof raw === 'object' ? raw : null;

  const message =
    typeof raw === 'string'
      ? raw
      : (obj && typeof obj.message === 'string' ? obj.message : null) ?? 'Created entry successfully';
  const overrideApplied = (obj?.override_applied ?? body.override_applied) === true;
  const qty = toNum(obj?.qty ?? body.qty);

  return { message, overrideApplied, qty };
}

export function useCreateXfloraReceivingEntry() {
  return useMutation({ mutationFn: createReceivingEntry });
}
