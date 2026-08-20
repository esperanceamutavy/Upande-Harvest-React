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
// Five fields are sent deliberately empty, matching production's shape:
//   bucket_id  — INERT. The script never reads it; there is no bucket
//                resolution and no Receiving Out lookup anywhere in it, and the
//                warehouses are hardcoded (XFL Receiving Coldstore  - XFL →
//                XFL Graded Sold - XFL). Sent only to match the legacy payload.
//   bunch_size, stem_length, variety, qty
//              — the server reads these off the Bunch QR Code record. Production
//                removed the client-side pre-fetch as "a redundant 150-300ms
//                round-trip per scan" (GradeScreen.tsx:284-287), which in the
//                app's fastest-repeating flow is the difference that matters.
// The response echoes back the resolved variety and qty, which is the only
// source for them, so it drives the entries log.
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
    // FLAT envelope. The Server Script sets `message`, `stock_entry`, `qty` and
    // `variety` as top-level siblings on frappe.response, and `message` is a
    // plain string ("Grading entry submitted successfully") — NOT a nested
    // object. Unwrapping `body.message ?? body` therefore resolves to that
    // string and every field reads back undefined; that was a real defect.
    // Read the top level directly.
    //
    // `stem_length` is not returned at all, so GradingResult does not carry it.
    //
    // `bucket_remaining_stems` is deliberately not read either — production
    // documents it as unreliable on re-used buckets, since it sums every harvest
    // and every bunch the bucket has ever seen with no cycle window and so
    // floors at 0 (GradeScreen.tsx:310-316).
    const body = (res.data ?? {}) as Record<string, unknown>;

    return {
      message: typeof body.message === 'string' ? body.message : 'Bunch graded',
      stockEntry: body.stock_entry != null ? String(body.stock_entry) : null,
      variety: body.variety != null ? String(body.variety) : null,
      qty: body.qty != null ? Number(body.qty) : null,
    };
  });
}

export function useSubmitGrading() {
  return useMutation({ mutationFn: submitGrading });
}
