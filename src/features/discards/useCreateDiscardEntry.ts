import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { DiscardPayload, DiscardResponse } from '../../types/discard';

async function createDiscardEntry(payload: DiscardPayload): Promise<DiscardResponse> {
  const res = await apiClient.post<{ message: DiscardResponse }>(
    '/api/method/createDiscardEntry',
    payload,
  );
  return res.data.message;
}

export function useCreateDiscardEntry() {
  return useMutation({ mutationFn: createDiscardEntry });
}
