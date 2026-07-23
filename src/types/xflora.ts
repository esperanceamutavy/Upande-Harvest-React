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
  /** Partial-bucket override: stems to record instead of the full bucket qty.
   *  Only sent (non-null) when the partial-bucket toggle is on. Mutually exclusive
   *  with bunched. The server enforces the ceiling and throws on violation. */
  overrideQty: number | null;
}

export interface XfloraReceivingResult {
  message: string;
  /** True when the server applied the partial override. */
  overrideApplied: boolean;
  /** Stems actually recorded (present when override_applied). */
  qty: number | null;
}

/** Issuing (Issue from Coldstore). Three calls: list orders → list an order's packing
 *  items → issue a scanned bucket. Ported from xflora_ready_sale_order_items.dart. */
export interface XfloraReadySaleOrderItem {
  variety: string;
  bucket: string;
  stemLength: string;
  shelf: string;
  saleOrderItem: string;
  mixed: number;
  downgradeTo: string | null;
  qty: string;
  team: string;
  /** From `custom_issued`. Also flipped optimistically on a 200/409 issue. */
  isIssued: boolean;
  oplName: string;
}

export interface XfloraIssuePayload {
  bucketId: string;
  saleOrderItem: string;
  oplName: string;
}

export interface XfloraIssueResult {
  message: string;
}

/** Shelving — POST /api/method/shelving_entry { farm, shelf_id, bucket_id }.
 *  Sequential dual scan: shelf QR (`shelf` key) then bucket QR (`coldroom_bucket` key).
 *  `farm` comes from the configured farm (useFarm), not the scan. */
export interface XfloraShelvingPayload {
  farm: string;
  shelfId: string;
  bucketId: string;
}

export interface XfloraShelvingResult {
  message: string;
}

/** Discard ("Rejects" in the drawer) — POST /api/method/createDiscardEntry { bucket_id }.
 *  The scanned QR carries the id under the `coldroom_bucket` key. The endpoint returns
 *  HTTP 200 for both success and business failures (e.g. an under-age bucket); branch on
 *  `status` / `reason`, not the HTTP code. Ported from xflora_discard_response.dart. */
export interface XfloraDiscardPayload {
  bucketId: string;
  ageDays: number | null;
  variety: string | null;
  stems: number | null;
  discardEntry: string | null;
}

export interface XfloraDiscardResponse {
  /** "success" on success; any other value is a failure. */
  status: string;
  /** e.g. "bucket_too_young" — drives the blocking dialog. */
  reason: string | null;
  message: string;
  payload: XfloraDiscardPayload | null;
}
