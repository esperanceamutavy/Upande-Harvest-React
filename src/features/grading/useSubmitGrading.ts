import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { serializeByKey } from '../../lib/serializeByKey';
import type { GradingPayload, GradingResult } from '../../types/grading';

// POST /api/method/mobile_grading_entry
// Source: Upande-Harvest-React api.ts:446 (payload), GradeScreen.tsx:281-297
// (what production actually sends).
//
// This is the ONLY grading call. There is no pre-flight:
// `upande_harvest.api.get_grader_open_bucket` does not exist on
// xflora.upande.com, and the server resolves the bucket from the grader anyway.
//
// SERIALIZED — see RESTYLE_PLAN.md §8.1. Every submission goes through the
// 'grading' key so a fast second scan cannot overtake the first. React Query
// would otherwise run these in parallel and corrupt bucket state.
//
// Five fields are sent deliberately empty, matching production:
//   bucket_id  — the server resolves it from the grader's open Receiving Out
//   bunch_size, stem_length, variety, qty
//              — the server reads these off the Bunch QR Code record. Production
//                removed the client-side pre-fetch as "a redundant 150-300ms
//                round-trip per scan" (GradeScreen.tsx:284-287), which in the
//                app's fastest-repeating flow is the difference that matters.
// The response echoes back what the server resolved; that is the only source
// for variety / stem_length / qty, so it drives the entries log.
async function submitGrading({ bunchId, grader, farm }: GradingPayload): Promise<GradingResult> {
  return serializeByKey('grading', async () => {
    const res = await apiClient.post<{ message?: Record<string, unknown> } | Record<string, unknown>>(
      '/api/method/mobile_grading_entry',
      {
        bucket_id: '',
        bunch_id: bunchId,
        bunch_size: '',
        farm,
        grader,
        qty: 0,
        stem_length: '',
        variety: '',
      },
    );

    // The endpoint is inconsistent about the Frappe `message` envelope, so
    // unwrap defensively — the same `res.message ?? res` the legacy client uses.
    const body = res.data as { message?: Record<string, unknown> };
    const m = (body?.message ?? res.data ?? {}) as Record<string, unknown>;

    // `bucket_remaining_stems` is deliberately NOT read. Production documents it
    // as unreliable on re-used buckets: it sums every harvest and every bunch the
    // bucket has ever seen with no cycle window, so it floors at 0
    // (GradeScreen.tsx:310-316).
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
