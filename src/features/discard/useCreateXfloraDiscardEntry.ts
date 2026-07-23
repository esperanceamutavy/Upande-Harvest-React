import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { XfloraDiscardPayload, XfloraDiscardResponse } from '../../types/xflora';

// Port of api_service.dart:createXfloraDiscardEntry (lines 2077-2100) + XfloraDiscardResponse.
// POST /api/method/createDiscardEntry { bucket_id }. Returns HTTP 200 for both success and
// business failures; the caller branches on `status`/`reason`. Body shape mirrors the Flutter
// parser: fields live either at top level or under `data` (`json['data'] ?? json`).
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function parsePayload(p: unknown): XfloraDiscardPayload | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  return {
    bucketId: o.bucket_id != null ? String(o.bucket_id) : '',
    ageDays: toNum(o.age_days),
    variety: o.variety != null ? String(o.variety) : null,
    stems: toNum(o.stems),
    discardEntry: o.discard_entry != null ? String(o.discard_entry) : null,
  };
}

async function createDiscardEntry(bucketId: string): Promise<XfloraDiscardResponse> {
  const res = await apiClient.post<Record<string, unknown>>(
    '/api/method/createDiscardEntry',
    { bucket_id: bucketId },
  );
  const body = res.data;
  const d = (body && typeof body === 'object' && body.data && typeof body.data === 'object'
    ? (body.data as Record<string, unknown>)
    : body) as Record<string, unknown>;
  return {
    status: typeof d?.status === 'string' ? d.status : 'failed',
    reason: typeof d?.reason === 'string' ? d.reason : null,
    message: typeof d?.message === 'string' ? d.message : '',
    payload: parsePayload(d?.payload),
  };
}

export function useCreateXfloraDiscardEntry() {
  return useMutation({ mutationFn: createDiscardEntry });
}
