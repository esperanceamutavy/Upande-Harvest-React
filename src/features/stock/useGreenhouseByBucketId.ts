import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';

// Port of api_service.dart:fetchGreenhouseByBucketId
// GET /api/method/fetch_greenhouse_by_bucket_id?bucket_id=<id>
// TODO: verify exact response shape at runtime — Frappe method endpoints wrap returns in `message`.
// Flutter BLoC uses state.greenhouse[last].customGreenHouse (list, last item = most recent harvest).
// Assumed shape: { message: Array<{ custom_greenhouse: string }> }
async function fetchGreenhouseByBucketId({ bucketId }: { bucketId: string }): Promise<{ greenhouse: string | null }> {
  const res = await apiClient.get<{ message: Array<{ custom_greenhouse: string }> }>(
    '/api/method/fetch_greenhouse_by_bucket_id',
    { params: { bucket_id: bucketId } },
  );
  const items = res.data.message ?? [];
  const last = items[items.length - 1];
  return { greenhouse: last?.custom_greenhouse ?? null };
}

export function useGreenhouseByBucketId() {
  return useMutation({ mutationFn: fetchGreenhouseByBucketId });
}
