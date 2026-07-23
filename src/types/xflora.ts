// Xflora-specific payload/response types. See XFLORA_PORT_PLAN.md §5.3.

/** Bucket Transfer — POST /api/method/transfer_bucket */
export interface XfloraBucketTransferPayload {
  sourceBucketId: string;
  destinationBucketId: string;
}

export interface XfloraBucketTransferResult {
  message: string;
}

/** Receiving — POST /api/method/receiving_entry. No farm/warehouse in the contract. */
export interface XfloraReceivingPayload {
  bucketId: string;
  /** Batch mode: a generated id shared across scans; null in single mode. */
  batchId: string | null;
  isBunched: boolean;
  /** Only sent (non-null) when bunched. */
  bunchSize: number | null;
  /** Number of bunches — only sent (non-null) when bunched. */
  quantity: number | null;
}

export interface XfloraReceivingResult {
  message: string;
}
