// Dispatch Session contract.
//
// Source: upande_harvest/upande_harvest/doctype/dispatch_session/dispatch_session.py
// on the live site — app methods, not Server Scripts. That matters for errors:
// `frappe.throw` returns HTTP 417 with the standard `_server_messages`
// envelope, which `extractFrappeError` already handles. NOT the flat 500 +
// `error` shape mobile_grading_entry uses, so no special casing here.
//
// Flow: latch truck + driver, scan boxes, close. A Delivery Note is created and
// SUBMITTED automatically the moment an order's last box is scanned.

export interface OpenSessionResult {
    session: string;
    /**
     * True when an open session for this truck and day already existed. Two
     * people scanning one truck share a manifest, so `driverName` comes back as
     * the ORIGINAL driver — not whatever was typed this time.
     */
    reused: boolean;
    driverName: string | null;
    message: string;
}

/** `loaded` on the first scan of a box; `already_loaded` on a re-scan. */
export type ScanStatus = 'loaded' | 'already_loaded';

export interface ScanBoxResult {
    status: ScanStatus;
    boxLabel: string;
    /**
     * The session the box is on. On `already_loaded` this is the session that
     * ALREADY HOLDS IT, which may be a different truck — the server looks it up
     * from Dispatch Session Box rather than assuming the current one. Comparing
     * it against the active session is the difference between "you scanned that
     * twice" and "that box belongs on another lorry".
     */
    onSession: string | null;
    salesOrder: string | null;
    customer: string | null;
    /**
     * Progress across the WHOLE order, not this session — "3 of 11" tells a
     * loader how much of the order is still to come, including boxes another
     * truck may take.
     */
    boxesLoaded: number;
    boxesTotal: number;
    message: string;
}

export interface RemoveBoxResult {
    boxesOnSession: number;
}

/**
 * THE MOMENT STOCK MOVES. Closing is what raises the paperwork: one Delivery
 * Note per Sales Order, covering exactly the boxes this session carried, each
 * created AND SUBMITTED.
 *
 * An order shipping across two trucks therefore produces TWO Delivery Notes,
 * one per session — and that is intended. Each describes a real departure, and
 * ERPNext accumulates `per_delivered` across them. Before 2026-08-26 the note
 * was raised by the scan that completed an order, so a split order's first
 * truck left with no document behind it at all.
 */
export interface CloseSessionResult {
    totalBoxes: number;
    ordersCompleted: number;
    deliveryNotes: string[];
    /**
     * Orders whose note could not be created or submitted. WARN, not error:
     * the boxes went out either way. Only the paperwork needs a human.
     */
    deliveryNoteErrors: string[];
}

/** A box row already on the session, as returned by `get_session`. */
export interface SessionBox {
    boxLabel: string;
    salesOrder: string | null;
    customer: string | null;
    scannedAt: string | null;
}

export interface SessionState {
    session: string;
    truckReg: string | null;
    driverName: string | null;
    status: string | null;
    totalBoxes: number;
    boxes: SessionBox[];
    deliveryNotes: string[];
}

// ── Manifest ───────────────────────────────────────────────────────────────
// What is expected on the truck, with the count falling as boxes are scanned.
//
// Customer and consignee are resolved from the SALES ORDER, not the Box Label:
// Box Label.consignee is only set by the sync hook, so older labels have none.

export interface ManifestOrder {
    salesOrder: string;
    totalBoxes: number;
    loadedBoxes: number;
}

export interface ManifestCustomer {
    customer: string;
    consignee: string | null;
    totalBoxes: number;
    loadedBoxes: number;
    remainingBoxes: number;
    orders: ManifestOrder[];
}

export interface Manifest {
    deliveryDate: string | null;
    /**
     * ALREADY SORTED by `remaining_boxes` descending — whoever still has boxes
     * outstanding is at the top. Not re-sorted client-side.
     *
     * A customer at zero remaining STAYS in the list and reads as complete.
     * Dropping them would shrink the manifest as work finishes, which is
     * exactly when a loader wants confirmation rather than a vanishing row.
     */
    customers: ManifestCustomer[];
    totals: { totalBoxes: number; loadedBoxes: number; remainingBoxes: number };
}
