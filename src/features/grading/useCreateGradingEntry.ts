import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { GradingPayload, GradingResponse } from '../../types/grading';

// Server contract is documented in grader3 Server Script on Kikwetu Frappe.
// Expects exactly: { farm, variety, stem_length, grader, bunch_id }
// Returns 200 on success, 429 on lockout (100-second cooldown per bunch),
// 500 with extractable error message on validation failures.
async function createGradingEntry(payload: GradingPayload): Promise<GradingResponse> {
  const res = await apiClient.post<{ message: GradingResponse } | GradingResponse>(
    '/api/method/grader3',
    payload,
  );
  // Frappe sometimes wraps responses in {message: ...}, sometimes returns flat.
  // Normalize both shapes.
  const body: any = res.data;
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'object') {
    return body.message as GradingResponse;
  }
  return body as GradingResponse;
}

export function useCreateGradingEntry() {
  return useMutation({ mutationFn: createGradingEntry });
}
