import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { serializeByKey } from '../../lib/serializeByKey';
import type {
    CloseSessionResult,
    OpenSessionResult,
    RemoveBoxResult,
    ScanBoxResult,
    ScanStatus,
    SessionBox,
    SessionState,
} from '../../types/dispatch';

// Dispatch Session endpoints. All five are app methods on
// `upande_harvest.upande_harvest.doctype.dispatch_session.dispatch_session`.
//
// A whitelisted Python function returns its value under `message`, so every
// reader below goes through `payload()`. It accepts `data` and the bare body
// too, because this backend has used all three envelopes across four endpoints
// and defending costs nothing.

const METHOD = 'upande_harvest.upande_harvest.doctype.dispatch_session.dispatch_session';

function payload(body: unknown): Record<string, unknown> {
    const b = (body ?? {}) as Record<string, unknown>;
    const inner = b.message ?? b.data ?? b;
    return (inner && typeof inner === 'object' ? inner : {}) as Record<string, unknown>;
}

const str = (v: unknown): string | null =>
    v != null && String(v).trim().length > 0 ? String(v).trim() : null;

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

function strList(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x)).filter((x) => x.length > 0);
    // `delivery_notes` is stored as a newline-joined Text field on the doctype,
    // so a raw read of the document yields a string rather than a list.
    if (typeof v === 'string') return v.split('\n').map((s) => s.trim()).filter(Boolean);
    return [];
}

async function call(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await apiClient.post<unknown>(`/api/method/${METHOD}.${name}`, body);
    return payload(res.data);
}

async function openSession(p: {
    truckReg: string;
    driverName: string;
}): Promise<OpenSessionResult> {
    const m = await call('open_session', {
        truck_reg: p.truckReg,
        driver_name: p.driverName,
    });
    return {
        session: String(m.session ?? ''),
        reused: m.reused === true,
        driverName: str(m.driver_name),
        message: typeof m.message === 'string' ? m.message : 'Session open',
    };
}

// SERIALIZED under 'dispatch'. scan_box reads the box, writes `loaded`, appends
// a session row and then evaluates order completion from a fresh count — two
// concurrent scans of the last two boxes could both see the order incomplete
// and neither would raise the Delivery Note. A distinct key from 'packing' and
// 'grading' so the flows do not block each other.
async function scanBox(p: { session: string; boxLabel: string }): Promise<ScanBoxResult> {
    return serializeByKey('dispatch', async () => {
        const m = await call('scan_box', { session: p.session, box_label: p.boxLabel });
        const status: ScanStatus = m.status === 'already_loaded' ? 'already_loaded' : 'loaded';
        return {
            status,
            boxLabel: str(m.box_label) ?? p.boxLabel,
            onSession: str(m.session),
            salesOrder: str(m.sales_order),
            customer: str(m.customer),
            boxesLoaded: num(m.boxes_loaded),
            boxesTotal: num(m.boxes_total),
            orderComplete: m.order_complete === true,
            deliveryNote: str(m.delivery_note),
            deliveryNoteError: str(m.delivery_note_error),
            message: typeof m.message === 'string' ? m.message : 'Box scanned',
        };
    });
}

async function removeBox(p: { session: string; boxLabel: string }): Promise<RemoveBoxResult> {
    return serializeByKey('dispatch', async () => {
        const m = await call('remove_box', { session: p.session, box_label: p.boxLabel });
        return { boxesOnSession: num(m.boxes_on_session) };
    });
}

async function closeSession(session: string): Promise<CloseSessionResult> {
    const m = await call('close_session', { session });
    return {
        totalBoxes: num(m.total_boxes),
        ordersCompleted: num(m.orders_completed),
        deliveryNotes: strList(m.delivery_notes),
    };
}

function toBox(row: unknown): SessionBox {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
        boxLabel: String(r.box_label ?? ''),
        salesOrder: str(r.sales_order),
        customer: str(r.customer),
        scannedAt: str(r.scanned_at),
    };
}

async function getSession(session: string): Promise<SessionState> {
    const m = await call('get_session', { session });
    const rows = Array.isArray(m.boxes) ? m.boxes : [];
    return {
        session: String(m.session ?? m.name ?? session),
        truckReg: str(m.truck_reg),
        driverName: str(m.driver_name),
        status: str(m.status),
        totalBoxes: num(m.total_boxes),
        // Newest first, matching the on-screen log.
        boxes: rows.map(toBox).filter((b) => b.boxLabel.length > 0).reverse(),
        deliveryNotes: strList(m.delivery_notes),
    };
}

export const useOpenSession = () => useMutation({ mutationFn: openSession });
export const useScanBox = () => useMutation({ mutationFn: scanBox });
export const useRemoveBox = () => useMutation({ mutationFn: removeBox });
export const useCloseSession = () => useMutation({ mutationFn: closeSession });
export const useGetSession = () => useMutation({ mutationFn: getSession });
