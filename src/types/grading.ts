// Grading contract — taken from the live Xflora app
// (teddy5456/Upande-Harvest-React, src/services/api.ts). RESTYLE_PLAN.md §8.2.
//
// ONE call: mobile_grading_entry. There is no pre-flight.
// `upande_harvest.api.get_grader_open_bucket` does NOT exist on
// xflora.upande.com — `upande_harvest.api` carries dashboard functions only,
// and the short-form endpoints are Server Scripts. The server resolves the
// grader's open bucket itself, so the client never needs to.
//
// Online-only, core flow only. No sqlite, no sync queue, no stem pool, no
// bouquet grading, no bucket balance, no rejects.

/** Request body for `mobile_grading_entry`.
 *
 *  Everything the server can derive is omitted here and sent empty by the
 *  hook: `bucket_id` (resolved from the grader's open Receiving Out),
 *  `bunch_size` / `stem_length` / `variety` (read off the `Bunch QR Code`
 *  record) and `qty`. See useSubmitGrading for why. */
export interface GradingPayload {
  bunchId: string;
  grader: string;
  farm: string;
}

/** Response from `mobile_grading_entry`. The server echoes back what it
 *  resolved, which is the only source for variety / stem length / qty —
 *  the client has no way to know them before the write. */
export interface GradingResult {
  message: string;
  stockEntry: string | null;
  variety: string | null;
  stemLength: string | null;
  qty: number | null;
}

/** One row in the on-screen entries log. Failures are logged too: a rejected
 *  scan is the packer's signal to re-scan, and it is easy to miss if the only
 *  trace is a Notice that the next scan overwrites. */
export interface GradingEntry {
  id: string;
  bunchId: string;
  grader: string;
  status: 'success' | 'error';
  /** Server-resolved on success; null on failure. */
  variety: string | null;
  stemLength: string | null;
  qty: number | null;
  /** Error text on failure; the server's confirmation on success. */
  message: string;
  /** Local wall-clock, display only. */
  time: string;
}

/** Which grading slot a scanned QR belongs to. */
export type GradingQrType = 'bunch' | 'grader' | 'bucket' | 'unknown';
