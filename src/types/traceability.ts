// Traceability contract — the `get_traceability_history` Server Script on Xflora.
//
// Unlike the Dispatch endpoints (app methods returning under `message`), this is
// a Server Script writing straight into `frappe.response`, so every key sits at
// the TOP LEVEL of the body.
//
// It answers HTTP 200 for a ref it cannot find, with `exists: false`. A real
// failure is HTTP 400 carrying `{ error }` — NOT a Frappe throw, so there is no
// `_server_messages` envelope to unwrap.

/** A Stock Entry in a bunch's or bucket's history. */
export interface StockEvent {
    stockEntry: string | null;
    event: string | null;
    eventTime: string | null;
    gradedBy: string | null;
    gradedByName: string | null;
    qty: number | null;
    fromWarehouse: string | null;
    toWarehouse: string | null;
}

/** A `box_item` row — what is physically inside a box. */
export interface BoxContent {
    variety: string | null;
    qty: number | null;
    uom: string | null;
    length: string | null;
}

export interface BunchCurrent {
    itemCode: string | null;
    farm: string | null;
    bunchSize: string | null;
    stemLength: string | null;
}

export interface BucketCurrent {
    itemCode: string | null;
    greenhouse: string | null;
    status: string | null;
}

export interface BoxCurrent {
    boxNumber: number | null;
    orderPickList: string | null;
    customer: string | null;
    consignee: string | null;
    length: string | null;
    packRate: number | null;
    boxTotalCount: number | null;
    farmPackList: string | null;
    packedAt: string | null;
    /**
     * Usually a raw email: only a handful of Employees have `user_id` set, so
     * the script's Employee lookup falls back to the User most of the time.
     * Rendered as-is — guessing at a display name would be inventing data.
     */
    packedBy: string | null;
    totalStems: number | null;
    /**
     * NOT rounded by the server — a Bunch(7) box holding 25 stems returns
     * 3.5714285714285716. Format for display; never round the stored value.
     */
    bunches: number | null;
}

/**
 * Discriminated on `kind` so the screen cannot render a box with a bunch's
 * fields, and cannot forget a case.
 */
export type TraceResult =
    | { exists: false; refId: string; message: string }
    | { exists: true; kind: 'bunch'; refId: string; current: BunchCurrent; events: StockEvent[] }
    | { exists: true; kind: 'bucket'; refId: string; current: BucketCurrent; events: StockEvent[] }
    | { exists: true; kind: 'box'; refId: string; current: BoxCurrent; events: BoxContent[] };
