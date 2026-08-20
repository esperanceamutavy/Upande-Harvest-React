// Grading contract — taken from the live Xflora app
// (teddy5456/Upande-Harvest-React, src/services/api.ts). RESTYLE_PLAN.md §8.2.
//
// ONE call: mobile_grading_entry. There is no pre-flight.
// `upande_harvest.api.get_grader_open_bucket` does NOT exist on
// xflora.upande.com — `upande_harvest.api` carries dashboard functions only,
// and the short-form endpoints are Server Scripts.
//
// There is also no bucket to resolve: the script never reads `bucket_id` and
// never looks at Receiving Out. It resolves the bunch off `Bunch QR Code` and
// moves stock between two hardcoded warehouses.
//
// Online-only, core flow only. No sqlite, no sync queue, no stem pool, no
// bouquet grading, no bucket balance, no rejects.

/** Request body for `mobile_grading_entry`.
 *
 *  The wire payload carries five more fields, all sent empty by the hook:
 *  `bunch_size` / `stem_length` / `variety` / `qty`, which the server reads off
 *  the `Bunch QR Code` record, and `bucket_id`, which the script never reads at
 *  all. See useSubmitGrading. */
export interface GradingPayload {
  bunchId: string;
  grader: string;
  farm: string;
}

/** Response from `mobile_grading_entry`.
 *
 *  FLAT envelope: `message` / `stock_entry` / `qty` / `variety` are top-level
 *  siblings on the response, and `message` is a plain string. There is no
 *  nested `message` object to unwrap.
 *
 *  No `stem_length` — the script does not return it, so this type does not
 *  carry it rather than surfacing a permanently-null field. */
export interface GradingResult {
  message: string;
  stockEntry: string | null;
  variety: string | null;
  qty: number | null;
}

/** Outcome of one bunch scan.
 *
 *  `duplicate` is split out from `error` because re-scanning an already-graded
 *  bunch is the failure a grader will actually hit — it is a "you already did
 *  this", not a fault, and reads as a warning rather than a hard error. */
export type GradingEntryStatus = 'success' | 'duplicate' | 'error';

/** One row in the on-screen entries log. Failures are logged too: a rejected
 *  scan is the grader's signal to re-scan, and it is easy to miss if the only
 *  trace is a Notice that the next scan overwrites. */
export interface GradingEntry {
  id: string;
  bunchId: string;
  grader: string;
  status: GradingEntryStatus;
  /** Server-resolved on success; null otherwise. */
  variety: string | null;
  qty: number | null;
  /** Error text on failure; the server's confirmation on success. */
  message: string;
  /** Local wall-clock, display only. */
  time: string;
}

/** Which grading slot a scanned QR belongs to. */
export type GradingQrType = 'bunch' | 'grader' | 'bucket' | 'unknown';
