import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { GradingPayload } from '../../types/grading';

// Note: Flutter's KikwetuGradingStockEntry submits with farm: "" (gradingFarm
// declared but never assigned — likely a latent bug). We pass station.farm
// instead. If the backend ignores this field, harmless. If it uses it, we've
// fixed a Flutter bug.
async function createGradingEntry(payload: GradingPayload): Promise<void> {
  await apiClient.post('/api/method/createGradingStockEntry', payload);
}

export function useCreateGradingEntry() {
  return useMutation({ mutationFn: createGradingEntry });
}
