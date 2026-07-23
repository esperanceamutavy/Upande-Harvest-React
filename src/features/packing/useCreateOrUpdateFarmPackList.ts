import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type {
  CreateOrUpdateFarmPackListPayload,
  CreateOrUpdateFarmPackListResponse,
} from '../../types/packing';

async function createOrUpdateFarmPackList(
  payload: CreateOrUpdateFarmPackListPayload,
): Promise<CreateOrUpdateFarmPackListResponse> {
  const res = await apiClient.post<{ data: CreateOrUpdateFarmPackListResponse }>(
    '/api/method/createOrUpdateFarmPackList',
    payload,
  );
  return res.data.data;
}

export function useCreateOrUpdateFarmPackList() {
  return useMutation({ mutationFn: createOrUpdateFarmPackList });
}
