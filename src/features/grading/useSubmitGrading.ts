import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { serializeByKey } from '../../lib/serializeByKey';
import type { GradingPayload, GradingResult } from '../../types/grading';

// POST /api/method/mobile_grading_entry
// Source: Upande-Harvest-React api.ts:446 (payload) and :460 (serialization).
//
// SERIALIZED — see RESTYLE_PLAN.md §8.1. Every submission goes through the
// 'grading' key so a fast second scan cannot overtake the first. React Query
// would otherwise run these in parallel and corrupt bucket state.
//
// bunch_size / stem_length / variety are sent EMPTY and qty as 0 on purpose.
// The server's Mobile Grading Entry API reads them off the Bunch QR Code
// record itself, so pre-fetching them client-side is a redundant 150-300ms
// round-trip on every scan. Production removed that pre-fetch deliberately —
// see the comment at Upande-Harvest-React GradeScreen.tsx:284-287. The server
// echoes back what it resolved, which is what we render as confirmation.
async function submitGrading({
  bunchId,
  grader,
  bucketId,
  farm,
}: GradingPayload): Promise<GradingResult> {
  return serializeByKey('grading', async () => {
    const res = await apiClient.post<{ message?: Record<string, unknown> } | Record<string, unknown>>(
      '/api/method/mobile_grading_entry',
      {
        bunch_id: bunchId,
        grader,
        bucket_id: bucketId,
        farm,
        bunch_size: '',
        stem_length: '',
        variety: '',
        qty: 0,
      },
    );

    const body = res.data as { message?: Record<string, unknown> };
    const m = (body?.message ?? res.data ?? {}) as Record<string, unknown>;

    return {
      message: m.message != null ? String(m.message) : 'Bunch graded',
      stockEntry: m.stock_entry != null ? String(m.stock_entry) : null,
      variety: m.variety != null ? String(m.variety) : null,
      stemLength: m.stem_length != null ? String(m.stem_length) : null,
      qty: m.qty != null ? Number(m.qty) : null,
    };
  });
}

export function useSubmitGrading() {
  return useMutation({ mutationFn: submitGrading });
}
