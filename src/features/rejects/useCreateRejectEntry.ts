import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { RejectPayload, RejectResponse } from '../../types/reject';

async function createRejectEntry(payload: RejectPayload): Promise<RejectResponse> {
  const res = await apiClient.post<{ message: RejectResponse }>(
    '/api/method/createRejectEntry',
    payload,
  );
  return res.data.message;
}

export function useCreateRejectEntry() {
  return useMutation({ mutationFn: createRejectEntry });
}
