/** Stock Entry fields returned by the dashboard list query.
 *  Frappe field name: total_amount (confirmed from Flutter stock_entry.dart:53).
 *  Add fields here only as screens need them — do not fetch * from the API. */
export interface StockEntry {
  name: string;
  stock_entry_type: string;
  posting_date: string;
  docstatus: number;
  total_amount: number | null;
  // Phase 4 workflow fields (present when fetched individually or via *)
  custom_farm?: string;
  custom_greenhouse?: string;
  custom_bunch_id?: string;
  custom_bucket_id?: string;
}

/** Stock Entry Type doctype (name-only list for filter dropdown) */
export interface StockEntryType {
  name: string;
}
