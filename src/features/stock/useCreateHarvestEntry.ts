import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';

export interface HarvestEntryPayload {
  farm: string;
  greenhouse: string;
  section: string;
  harvester: string;
  bucket_id: string;
  item_code: string;
  quantity: number;
  // TODO: verify at runtime whether Kikwetu's createHarvestEntry endpoint uses stem_length.
  // Flutter's Kikwetu body (api_service.dart:2157) does NOT include stem_length (contrast with
  // Kaitet at line 985 which does). Remove if confirmed unused on device test.
  stem_length: string;
}

async function createHarvestEntry(payload: HarvestEntryPayload): Promise<void> {
  await apiClient.post('/api/method/createHarvestEntry', payload);
}

export function useCreateHarvestEntry() {
  return useMutation({ mutationFn: createHarvestEntry });
}
