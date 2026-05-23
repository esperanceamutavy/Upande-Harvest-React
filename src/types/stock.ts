/** Minimal Stock Entry fields returned by the dashboard list query */
export interface StockEntry {
  name: string;
  stock_entry_type: string;
  posting_date: string;
  posting_time: string;
  docstatus: number;
  company: string;
  creation: string;
  modified: string;
  custom_farm?: string;
  custom_greenhouse?: string;
  custom_bunch_id?: string;
  custom_bucket_id?: string;
}

/** Stock Entry Type doctype (name-only list for filter dropdown) */
export interface StockEntryType {
  name: string;
}
