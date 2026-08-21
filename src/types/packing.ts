// Packing contract — confirmed against the live Server Script and live OPL
// documents on xflora.upande.com. RESTYLE_PLAN.md §8.3.
//
// One write endpoint: createOrUpdateFarmPackList. There is no box lifecycle,
// no capacity check server-side, and no OPL list endpoint.

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
  /** The per-box cap. A string on the wire; identical across an OPL's rows.
   *  Named "packrate" upstream — see the unit caveat on `totalUnits`. */
  packRate: string | null;
}

/** Date window for the OPL picker. */
export type OplDateFilter = 'today' | 'yesterday' | 'week' | 'all';

/** One row in the OPL picker — the list query's projection, no children. */
export interface OplListItem {
  name: string;
  customer: string | null;
  salesOrder: string | null;
  /** `custom_total_stems`. Not reliably stems — see `OrderPickList.totalUnits`. */
  totalUnits: string | null;
  boxType: string | null;
  dateCreated: string | null;
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
  /** The line's uom, e.g. `Bunch(10)` or `Stems`. */
  uom: string;
  conversionFactor: number;
  /** `stock_qty` — the order in stems. Display only. */
  stockQty: number;
  /** `qty` converted to bunches. The order target. */
  targetBunches: number;
  /** `custom_packrate` converted to bunches. The per-box cap. */
  capBunches: number;
  /** `custom_number_of_boxes`, taken directly. The M in "Box N of M". */
  boxCount: number;
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
