import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';

// Port of api_service.dart:createKikwetuReceivingEntry
// Body uses the Frappe doc .name (returned from bucket check), NOT the raw scanned QR bucket_id field.
async function createReceivingEntry({ bucketName }: { bucketName: string }): Promise<void> {
  await apiClient.post('/api/method/createReceivingStockEntry', { bucket_id: bucketName });
}

export function useCreateReceivingEntry() {
  return useMutation({ mutationFn: createReceivingEntry });
}
