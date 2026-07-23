import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import type { BucketQRCode } from '../../types/stock';

// Port of api_service.dart:fetchKikwetuBucketById (line 359)
// filters on the 'id' field (not 'name') — confirmed from Flutter source
async function checkBucket(bucketId: string): Promise<BucketQRCode[]> {
  const res = await apiClient.get<{ data: BucketQRCode[] }>('/api/resource/Bucket QR Code', {
    params: {
      filters: JSON.stringify([['Bucket QR Code', 'id', '=', bucketId]]),
      fields: JSON.stringify(['name', 'custom_status', 'last_stock_entry']),
    },
  });
  return res.data.data;
}

export function useBucketCheck() {
  return useMutation({ mutationFn: checkBucket });
}
