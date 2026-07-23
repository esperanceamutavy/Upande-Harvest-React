/** Stock Entry fields returned by the dashboard list query.
 *  Frappe field name: total_amount (confirmed from Flutter stock_entry.dart:53).
 *  Add fields here only as screens need them — do not fetch * from the API. */
export interface StockEntry {
  name: string;
  stock_entry_type: string;
  posting_date: string;
  docstatus: number;
  total_amount: number | null;
  // Present when fetched individually or via *
  custom_farm?: string;
  custom_greenhouse?: string;
  custom_bunch_id?: string;
  custom_bucket_id?: string;
}

/** Farm doctype. `name` is the doc id (sent to the API); `farm_name` is the display label
 *  (Data field, confirmed via live Xflora schema). See XFLORA_PORT_PLAN.md §5.2. */
export interface Farm {
  name: string;
  farm_name?: string;
}
