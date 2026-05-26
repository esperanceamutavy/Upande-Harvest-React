import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { PickListWithFarmPackListResponse } from '../../types/packing';

async function fetchPickListWithFarmPackList(
  pickListId: string,
): Promise<PickListWithFarmPackListResponse> {
  const res = await apiClient.get<{ data: PickListWithFarmPackListResponse }>(
    '/api/method/get_pick_list_with_farm_pack_list',
    { params: { pick_list_id: pickListId } },
  );
  return res.data.data;
}

export function useFetchPickListWithFarmPackList() {
  return useMutation({ mutationFn: fetchPickListWithFarmPackList });
}
