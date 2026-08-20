// Receiving Out contract — read off the live `Receiving Out API` Server Script
// (api_method: receiving_out_entry). Flow: Issue → Receiving Out → Grading.
//
// A grader "checks out" a bucket for grading. The script enforces one open
// bucket per grader and offers a switch/keep decision when they already hold a
// different one.

/** `confirm` values the script recognises. Absent/empty means "ask me". */
export type ReceivingOutConfirm = 'reject' | 'cancel';

export interface ReceivingOutPayload {
  grader: string;
  /** Sent RAW as scanned. Bucket ids are not uniform — both `BUCKET-1849` and
   *  `Coldroom Bucket - 2880` occur, and the script also unwraps a JSON scan.
   *  Resolution is the server's job; do not pre-parse it. */
  bucketId: string;
  farm: string;
  /** `'reject'` closes the prior bucket as Replaced and opens the new one.
   *  `'cancel'` keeps the prior bucket and does nothing. */
  confirm?: ReceivingOutConfirm;
}

/** Which of the four HTTP-200 shapes came back. */
export type ReceivingOutOutcome =
  /** Grader re-scanned the bucket they already hold. Idempotent. */
  | 'already-open'
  /** Grader holds a DIFFERENT bucket — the switch/keep decision. */
  | 'needs-confirmation'
  /** They chose to keep the prior bucket. */
  | 'cancelled'
  /** A new Receiving Out was opened. */
  | 'opened';

export interface ReceivingOutResult {
  outcome: ReceivingOutOutcome;
  message: string;

  // ── present on already-open / cancelled / opened ──────────────────────────
  receivingOut: string | null;
  bucketId: string | null;
  variety: string | null;
  remainingQty: number | null;
  /** Only on `opened`, and only when the packhouse transfer is enabled. */
  transferStockEntry: string | null;

  // ── present on needs-confirmation ─────────────────────────────────────────
  priorReceivingOut: string | null;
  priorBucketId: string | null;
  priorVariety: string | null;
  priorRemainingQty: number | null;
  /** The bucket the grader just scanned, echoed back. */
  requestedBucketId: string | null;
}
