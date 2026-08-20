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
  /** Bunches, and CAN BE FRACTIONAL (e.g. 8.5). Never used for box maths. */
  qty: number;
  /** Stems per box. A string on the wire; identical across an OPL's rows. */
  packRate: string | null;
}

/** Date window for the OPL picker. */
export type OplDateFilter = 'today' | 'yesterday' | 'week' | 'all';

/** One row in the OPL picker — the list query's projection, no children. */
export interface OplListItem {
  name: string;
  customer: string | null;
  salesOrder: string | null;
  totalStems: string | null;
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
  /** Header field, string on the wire. Numerator of the box count. */
  totalStems: string | null;
  isMixedBox: boolean;
  rows: OplRow[];
}

/** Derived session parameters — everything Rules 1 and 3 need, computed once. */
export interface PackingSession {
  opl: OrderPickList;
  /** `int(custom_packrate)` — the per-box stem cap. */
  capPerBox: number;
  /** `int(custom_total_stems) / capPerBox`, rounded up. The M in "Box N of M". */
  boxCount: number;
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
}

export interface PackBunchResult {
  status: string;
  message: string;
  docname: string | null;
  /** Populated only on batch submissions; we always send one bunch. */
  alreadyPacked: string[];
  newlyPacked: number | null;
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
}
