// Stock Entry types surfaced on the Xflora dashboard (read-only history filter).
// Case-sensitive match against Stock Entry Type's `name` field in Frappe.
// Sourced from the live Xflora instance (xflora.upande.com) — see XFLORA_PORT_PLAN.md §5.1.
//
// NOTE: this list is the dashboard *history* filter, independent of the drawer
// *workflows*. It intentionally includes types with no v1 create-screen (Grading,
// Packing, reject types) so existing records still show. See XFLORA_PORT_PLAN.md §6.
//
// "Shelving" is intentionally EXCLUDED: the shelving_entry flow creates no Stock Entry —
// it writes Shelf Item / Shelf Item Log records and updates the Coldroom Bucket QR Code doc
// (verified on live Xflora). A "Shelving" filter could never match a Stock Entry. See §5.2.
export const ALLOWED_STOCK_ENTRY_TYPES: readonly string[] = Object.freeze([
  'Receiving',
  'Bucket Transfer',
  'Grading',
  'Grading Rejects',
  'Intake Rejects',
  'Field Reject',
  'Packing',
  'Discard',
  'Quarantine',
]);
