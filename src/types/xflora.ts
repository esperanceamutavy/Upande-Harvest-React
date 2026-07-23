// Xflora-specific payload/response types. See XFLORA_PORT_PLAN.md §5.3.

/** Bucket Transfer — POST /api/method/transfer_bucket */
export interface XfloraBucketTransferPayload {
  sourceBucketId: string;
  destinationBucketId: string;
}

export interface XfloraBucketTransferResult {
  message: string;
}
