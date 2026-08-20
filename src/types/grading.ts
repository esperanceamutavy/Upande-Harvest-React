// Grading contract — taken from the live Xflora app
// (teddy5456/Upande-Harvest-React, src/services/api.ts). RESTYLE_PLAN.md §8.2.
//
// Online-only, core flow only. No sqlite, no sync queue, no stem pool, no
// bouquet grading, no bucket balance, no rejects.

/** `upande_harvest.api.get_grader_open_bucket` → which bucket a grader holds.
 *  `open: false` means no open Receiving Out — in the grading flow that is an
 *  error state, not a no-op (legacy api.ts:951-953). */
export interface GraderOpenBucket {
  open: boolean;
  receivingOut: string | null;
  bucketId: string | null;
  variety: string | null;
  initialQty: number | null;
  remainingQty: number | null;
  openedAt: string | null;
}

/** Request body for `mobile_grading_entry`.
 *
 *  `bunchSize` / `stemLength` / `variety` are deliberately absent: the server
 *  reads them off the `Bunch QR Code` record, so the client sends empty
 *  strings and lets the server resolve. See the note in useSubmitGrading. */
export interface GradingPayload {
  bunchId: string;
  grader: string;
  bucketId: string;
  farm: string;
}

/** Response from `mobile_grading_entry`. The server echoes back what it
 *  resolved, which is what the screen renders as confirmation. */
export interface GradingResult {
  message: string;
  stockEntry: string | null;
  variety: string | null;
  stemLength: string | null;
  qty: number | null;
}

/** Which grading slot a scanned QR belongs to. */
export type GradingQrType = 'bunch' | 'grader' | 'bucket' | 'unknown';
