// Worker activity — `upande_harvest.api.get_worker_stats`.
//
// Returns a FLAT LIST, one entry per worker, already sorted by combined total
// descending. An app method, so the list arrives under `message`.
//
// The shelving figure uses the same rule as the SHELVED tile — MAX(stem_qty)
// per bucket per day, attributed to whoever shelved it last — so the column
// sums exactly to the tile. It did not before: taking the last row's stem_qty
// instead came out 44,491 against the tile's 45,551 on one day.

export interface WorkerStat {
    /** User id, e.g. gilbert@xflora.com. */
    worker: string;
    /** Full name, falling back to the local part of the address. */
    workerName: string;
    receiving: number;
    bucketTransfer: number;
    shelving: number;
    grading: number;
    /** Client-side sum of the four. */
    total: number;
}
