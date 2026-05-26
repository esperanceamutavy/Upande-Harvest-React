// Only these Stock Entry types are surfaced in the Kikwetu mobile app.
// Case-sensitive match against Stock Entry Type's `name` field in Frappe.
// If a 6th type ever needs to appear, add it here — both the dropdown
// and the dashboard list pick it up automatically.
export const ALLOWED_STOCK_ENTRY_TYPES: readonly string[] = Object.freeze([
  'Harvesting',
  'Receiving',
  'Grading',
  'Harvesting Reject',
  'Grading Rejects',
  'Discard',
  'Packing',
]);
