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

/** Farm doctype. name === farm_name due to autoname "format:{farm_name}" — confirmed from Frappe schema. */
export interface Farm {
  name: string;
}

/** Warehouse doctype — only name is needed for station configuration. */
export interface Warehouse {
  name: string;
}

/** Stem Length doctype (harvesting form picker). */
export interface StemLength {
  length: string;
}

/** Variety child row on a Warehouse (greenhouse) document. */
export interface Variety {
  variety: string;
}

/** Section child row on a Warehouse (greenhouse) document.
 *  employee_name is the API field name — maps to Dart model's `employee` property. */
export interface Section {
  section_name: string;
  from_bed: number;
  to_bed: number;
  employee_name: string | null;
}

/** Warehouse document with greenhouse-specific child tables — returned by GET /api/resource/Warehouse/{name}. */
export interface GreenhouseData {
  name: string;
  custom_varieties_grown: Variety[];
  custom_sections: Section[];
}

/** Bucket QR Code doctype — used to validate bucket state before submitting a harvest entry. */
export interface BucketQRCode {
  name: string;
  custom_status: string;
  last_stock_entry: string | null;
}
