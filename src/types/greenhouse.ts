// Greenhouse flow — the `get_greenhouse_flow` Server Script on Xflora.
//
// The point of this endpoint is the GAP between stages, not the totals: how
// many stems were received and have not reached a shelf yet.
//
// It is a Server Script, so every key sits at the TOP LEVEL of the response —
// no `message` envelope. Errors are HTTP 500 carrying both `error` and
// `message`, set to the same string.

/** One greenhouse's three stages for the window. */
export interface GreenhouseFlowRow {
    greenhouse: string;
    receivedStems: number;
    transferredStems: number;
    shelvedStems: number;
    /**
     * `received_stems - shelved_stems`, computed server-side.
     * NEGATIVE IS NORMAL — stems received before the window, shelved inside it.
     */
    gapStems: number;
    /**
     * CONTEXT ONLY, never compared across stages. A bucket can move more than
     * once, so a greenhouse can legitimately show 21 received buckets against
     * 38 transferred. Stems are the comparable figure.
     */
    receivedBuckets: number;
    transferredBuckets: number;
    shelvedBuckets: number;
}

export interface GreenhouseFlowTotals {
    receivedStems: number;
    transferredStems: number;
    shelvedStems: number;
    gapStems: number;
}

export interface GreenhouseFlow {
    fromDate: string | null;
    toDate: string | null;
    /**
     * ALREADY SORTED by `gap_stems` descending — worst first. The client must
     * not re-sort; the server's order is the intended reading order.
     */
    greenhouses: GreenhouseFlowRow[];
    totals: GreenhouseFlowTotals;
}
