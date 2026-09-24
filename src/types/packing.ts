import type { PackrateBasis } from '../features/packing/packrate.ts';

import type { ResumeState } from '../features/packing/resume';
import type { PackMode } from '../features/packing/mixGroup';
import type { PermittedSubstitute } from '../features/packing/substitutes.ts';

// Packing contract — confirmed against the live Server Script and live OPL
// documents on xflora.upande.com. RESTYLE_PLAN.md §8.3.
//
// One write endpoint: createOrUpdateFarmPackList. There is no box lifecycle,
// no capacity check server-side, and no OPL list endpoint.

/**
 * A resolved `custom_customer_code`.
 *
 * The field is a LINK to the Customer Code doctype, so the value stored on the
 * Sales Order is a record NAME, and the code that goes on the box is that
 * record's `code` field. The two DIVERGE in live data:
 *
 *   name "Dutch Flower Group (DFG)-TFC  BY AIR"  ->  code "TFC  ED3442-FT"
 *
 * No amount of string splitting on the name could produce that, which is why
 * this is a lookup and not a parse.
 */
export interface CustomerCodeRef {
  /** The stored Link value — the Customer Code record name. */
  ref: string;
  /**
   * `Customer Code.code`, rendered EXACTLY as stored: live codes contain double
   * spaces ("TFC  ED3442-FT") and internal hyphens ("TFC-IS0086-FT"), and
   * neither is collapsed. Falls back to `ref` when the record is missing or its
   * code is blank — showing the stored value beats showing nothing.
   */
  code: string;
  /** `Customer Code.customer`. Null when the record could not be read. */
  customer: string | null;
}

/** One `Pick List Item` row on an OPL (`item_locations`).
 *
 *  `item_code` here is the Item **TEMPLATE** (e.g. `Monza`), while a
 *  `Bunch QR Code` stores the **VARIANT** (e.g. `Monza-50CM`). Rule 3 bridges
 *  the two via `Item.variant_of` — never by string parsing. */
export interface OplRow {
  itemCode: string;
  stemLength: string;
  uom: string;
  warehouse: string | null;
  shelf: string | null;
  /** Bunches, and CAN BE FRACTIONAL (e.g. 8.5, 0.8). Never used for box maths. */
  qty: number;
}

/** Packing progress, the picker's second filter dimension. */
export type PackStatus = 'to_pack' | 'in_progress' | 'packed';

/** Delivery-date window for the OPL picker.
 *
 *  `packing_today` filters on `delivery_date = TOMORROW`, and that is correct:
 *  packers pack today for tomorrow's flight, so the day's work is the next
 *  day's deliveries. The member is named for the WORK, not the flight, because
 *  the segment is labelled "Today" for the same reason. */
export type OplDateFilter = 'packing_today' | 'yesterday' | 'week' | 'all';

/** One row in the OPL picker — the list query's projection, no children. */
export interface OplListItem {
  name: string;
  customer: string | null;
  salesOrder: string | null;
  /** `custom_total_stems`. Not reliably stems — see `OrderPickList.totalUnits`. */
  totalUnits: string | null;
  boxType: string | null;
  /** The Sales Order's `delivery_date`. This is what the picker filters on, so
   *  it is shown on every row. Null only if the SO lookup came back without one. */
  deliveryDate: string | null;

  // ── Packer-facing identity. What goes on the box, which is what a packer
  // recognises on the floor — the customer name often means little to them.
  /** `custom_customer_code` from the SO LINE matched on `custom_opl`, falling
   *  back to the header, then RESOLVED through the Customer Code doctype. */
  customerCode: CustomerCodeRef | null;
  /** `custom_consignee` from the Sales Order header. */
  consignee: string | null;

  // ── Packing status. A Farm Pack List is submitted only when its LAST box
  // closes, so docstatus alone is authoritative: 1 = fully packed, 0 = started
  // but incomplete, absent = not begun. Never inferred from box counts.
  packStatus: PackStatus;
  /** Boxes that have anything in them. 0 when no pack list exists. */
  boxesPacked: number;
  /** `custom_number_of_boxes` from the SO line. 0 when unknown. */
  boxesTotal: number;

  // ── Contents summary, so a packer can tell OPLs apart without opening each ──
  /** Distinct varieties on the pick list. */
  varieties: string[];
  /** Distinct stem lengths on the OPL — the ALLOCATION, used only as a display
   *  fallback. Prefer `orderLength`. */
  lengths: string[];
  /** The ORDER's length, from the SO line's `item_code` suffix. */
  orderLength: string | null;
  /** Total bunches across every row. */
  bunches: number;
}

export interface OplListResult {
  items: OplListItem[];
  /** Set when the delivery window matched no Sales Orders at all — distinct
   *  from "orders exist but none have a pick list". */
  notice: string | null;
}

/** An OPL loaded for a packing session. */
export interface OrderPickList {
  name: string;
  salesOrder: string | null;
  customer: string | null;
  /** Null on live documents. The payload's farm comes from the BUNCH instead. */
  farm: string | null;
  boxType: string | null;
  /**
   * `custom_total_stems` — the numerator of the box count. String on the wire.
   *
   * ⚠️ THE FIELD NAME LIES. It is NOT reliably stems: `OPL-2026-02953` carries
   * "8" for an 80-stem order, because the allocator ignores `conversion_factor`
   * and writes bunches. Rule 1's arithmetic survives (the cap and the total
   * share whatever unit was used, so `total / cap` is still the box count), but
   * NEVER label this "stems" in the UI. See RESTYLE_PLAN.md §8.3.
   */
  totalUnits: string | null;
  isMixedBox: boolean;
  rows: OplRow[];
}

/**
 * Targets read from the SALES ORDER line, not the OPL.
 *
 * The OPL allocator is broken (§8.3), so its quantities cannot be trusted. The
 * SO is the source of truth for what a box should hold; the OPL is still the
 * source for shelf, warehouse and the payload's `custom_order_pick_list`.
 */
export interface SalesOrderTargets {
  salesOrder: string;
  itemCode: string | null;
  /** The SO line's uom, e.g. `Bunch(10)` or `Stems`. */
  uom: string;
  conversionFactor: number;
  /** `stock_qty` — the order in stems. Display only. */
  stockQty: number;

  /** `custom_customer_code` from the matched SO LINE, falling back to the
   *  header, then RESOLVED through the Customer Code doctype. */
  customerCode: CustomerCodeRef | null;
  /** The ORDER's stem length, from `item_code`'s suffix ("Brinessa-50CM" ->
   *  "50CM"). Longer stems are cut down to this during packing, so it is the
   *  headline length and the floor for Rule 3 — not the OPL's allocation. */
  orderLength: string | null;
  /** Truck, RESOLVED: the SO LINE's `custom_truck` ("GWD"), falling back to the
   *  header's `custom_truck_details` only when the line is empty, since older
   *  orders carry it there. One value, so the card can never show two rows. */
  truck: string | null;
  /** `custom_barcode` from the SO line. Often empty. */
  barcode: string | null;
  /** `custom_consignee` — Sales Order header. Box Label carries it too. */
  consignee: string | null;

  /**
   * Stems per bunch, resolved in order: the OPL row's `Bunch(N)` uom, then the
   * Sales Order's `custom_bunching` (`"X10"` → 10). **Null when neither is
   * available** — in which case the session counts in STEMS and nothing may be
   * labelled "bunches".
   */
  stemsPerBunch: number | null;

  /** Which rule in `packrate.ts` decided the unit — `integrality` and
   *  `stems-uom` are arithmetic, `plausibility` is a heuristic, and `inexact` /
   *  `unresolved` mean the count fell back to honest stems. */
  basis: PackrateBasis;

  /** What `capPerBox` and `orderTotal` are counted in. NEVER say "bunches"
   *  unless `stemsPerBunch` actually resolved. */
  unitLabel: 'bunches' | 'stems';
  /** The per-box cap, in `unitLabel`. */
  capPerBox: number;
  /** The order target, in `unitLabel`. */
  orderTotal: number;
  /** `custom_number_of_boxes`, taken directly. The M in "Box N of M". */
  boxCount: number;

  /**
   * How this pick list's line set was resolved — `straight` matched on
   * `custom_opl`, the other two matched on the GROUP because the allocator does
   * not write `custom_opl` to every line of a mix. See mixGroup.ts.
   */
  packMode: PackMode;

  /**
   * Every Sales Order line in the group, in order.
   *
   * The screen LISTS these for a mix, and Rule 3 matches VARIETY against them.
   * `item_locations` can do neither job on a mix: a variety the allocator never
   * reached has no row there, so it would be invisible and unscannable — which
   * is the bug this set exists to fix.
   *
   * `variety` is the TEMPLATE, `itemCode` the variant as written on the line.
   * Match on `variety`; a 60CM bunch is valid against a 40CM line and only the
   * templates agree.
   */
  groupLines: { itemCode: string | null; variety: string | null; orderLength: string | null }[];

  /**
   * Varieties this order permits in place of one of its own lines, already
   * scoped to lines on THIS pick list.
   *
   * Rule 3 widens to accept them; nothing else changes. A substitute consumes
   * the line it stands in for, so the cap, box count and order total are
   * untouched. Empty on an order that permits none, which is the common case
   * and takes exactly the path it always did.
   */
  substitutes: PermittedSubstitute[];
}

/**
 * Everything a packing session needs, resolved once on OPL selection.
 *
 * EVERYTHING IS COUNTED IN BUNCHES — the cap, the target and the running
 * totals. That is both what a packer thinks in and what the SO gives us
 * directly, so there is no unit ambiguity left to carry: one scan is one bunch.
 */
export interface PackingSession {
  /** Shelf, warehouse, item rows, and the id sent as `custom_order_pick_list`. */
  opl: OrderPickList;
  targets: SalesOrderTargets;
  /** Where the session resumed from — see features/packing/resume.ts. */
  resume: ResumeState;
}

/**
 * One variety inside a MIXED BUNCH (bouquet).
 *
 * A bouquet is a single bunch built from several varieties — 4 Madam Red +
 * 3 Athena + 3 Limassol Spray as one Bunch(10). The label carries the whole
 * recipe in `Bunch QR Code.components`, and `item_code` names only the FIRST
 * of them, so anything that needs to know what is physically in the bunch must
 * read these rows rather than the header.
 */
export interface BunchComponent {
  /** The VARIANT, e.g. "Madam Red-40CM". */
  variety: string;
  /** `Item.variant_of` for `variety` — what an OPL row's item_code holds. */
  variantParent: string;
  /** Stems of this variety in ONE bouquet. */
  stems: number;
  stemLength: string;
}

/** A bunch resolved from its QR, ready to validate and submit. */
export interface BunchDetails {
  bunchId: string;
  /** The variant code, e.g. `Monza-50CM`. */
  itemCode: string;
  /** `Item.variant_of` for `itemCode`, or `itemCode` when it is not a variant. */
  variantParent: string;
  /** `Bunch QR Code.bunch_size`, e.g. `Bunch(10)`. Sent as `bunch_uom`. */
  bunchUom: string;
  stemLength: string;
  /** `Bunch QR Code.farm` — this is the payload's `custom_farm`, NOT the app's
   *  configured farm. The OPL's own `farm` field is null on live documents. */
  farm: string | null;
  /** Parsed out of `bunchUom` with the server's own paren rule. */
  stemsPerBunch: number;

  // ── Mixed bunch (bouquet) ─────────────────────────────────────────────────
  /** `custom_mixed_bunch`. When true, `itemCode` names only the first of
   *  several varieties and `components` is the truth. */
  isMixedBunch: boolean;
  /** `custom_bunch_name`, e.g. "Pretty Pastell". Null on a mono bunch. */
  bunchName: string | null;
  /** The recipe. Empty on a mono bunch. */
  components: BunchComponent[];
}

export interface PackBunchPayload {
  salesOrder: string;
  customer: string | null;
  /** From the scanned bunch's own `farm` field. */
  farm: string | null;
  orderPickList: string;
  bunchId: string;
  itemCode: string;
  bunchUom: string;
  stemLength: string;
  boxId: number;
  /** Set on the scan that fills a box: asks the server to render its label. */
  closeBox?: boolean;
  /** The box being closed. Sent only alongside `closeBox`. */
  closeBoxNumber?: number;
}

export interface PackBunchResult {
  status: string;
  message: string;
  docname: string | null;
  /** Populated only on batch submissions; we always send one bunch. */
  alreadyPacked: string[];
  newlyPacked: number | null;

  // ── Present only on a close_box request ──────────────────────────────────
  /** The Box Label document name. */
  boxLabel: string | null;
  /** `file_url` of the rendered PDF — relative to the instance. */
  boxLabelPdf: string | null;
  /** Set INSTEAD of the pdf when the render failed. The pack itself still
   *  succeeded, so this is a warning, never a failed scan. */
  boxLabelPdfError: string | null;
}

/** Why a scan was refused, so the screen can pick a tone and a message. */
export type PackRejection =
  | 'duplicate-in-session'
  | 'already-packed'
  | 'ungraded'
  | 'variety-mismatch'
  | 'length-mismatch'
  | 'order-complete'
  | 'bad-uom'
  | 'error';

export interface PackEntry {
  id: string;
  bunchId: string;
  boxId: number | null;
  status: 'packed' | 'rejected';
  rejection: PackRejection | null;
  detail: string;
  time: string;
  /** Box label PDF for the box this scan closed. Kept on the row so it stays
   *  reachable after the next scan clears the Notice. */
  pdfUrl?: string | null;
}
