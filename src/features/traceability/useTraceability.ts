import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { apiClient, extractFrappeError } from '../../lib/api';
import type {
    BoxContent,
    BoxCurrent,
    BucketCurrent,
    BunchCurrent,
    StockEvent,
    TraceResult,
} from '../../types/traceability';

// `get_traceability_history` is a SERVER SCRIPT, not an app method, so it writes
// straight into `frappe.response` and every key is TOP LEVEL — no `message`
// envelope. Two consequences the readers below depend on:
//
//   1. A ref it cannot find is HTTP 200 with `exists: false`. That is a normal
//      answer, not an error, and must not surface as a failure.
//   2. A real failure is HTTP 400 carrying `{ error }`. It is NOT a Frappe
//      throw, so there is no `_server_messages` to unwrap and
//      `extractFrappeError` alone would fall back to a generic message.

const str = (v: unknown): string | null =>
    v != null && String(v).trim().length > 0 ? String(v).trim() : null;

const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

function rows(v: unknown): Record<string, unknown>[] {
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function toStockEvent(r: Record<string, unknown>): StockEvent {
    return {
        stockEntry: str(r.stock_entry),
        event: str(r.event),
        eventTime: str(r.event_time),
        gradedBy: str(r.graded_by),
        gradedByName: str(r.graded_by_name),
        qty: num(r.qty),
        fromWarehouse: str(r.from_warehouse),
        toWarehouse: str(r.to_warehouse),
    };
}

function toBoxContent(r: Record<string, unknown>): BoxContent {
    return {
        variety: str(r.variety),
        qty: num(r.qty),
        uom: str(r.uom),
        length: str(r.length),
    };
}

/**
 * The `{ error }` body on a 400. Checked BEFORE `extractFrappeError`, which
 * looks for the `_server_messages` envelope this endpoint never produces.
 */
function extractTraceError(e: unknown): string {
    if (isAxiosError(e)) {
        const body = e.response?.data as Record<string, unknown> | undefined;
        const direct = body?.error;
        if (direct != null && String(direct).trim()) return String(direct).trim();
    }
    return extractFrappeError(e);
}

async function lookup(refId: string): Promise<TraceResult> {
    const res = await apiClient.post<Record<string, unknown>>(
        '/api/method/get_traceability_history',
        { ref_id: refId },
    );

    const body = res.data ?? {};
    const resolvedRef = str(body.ref_id) ?? refId;

    if (body.exists !== true) {
        return {
            exists: false,
            refId: resolvedRef,
            message: str(body.message) ?? `${resolvedRef} not found.`,
        };
    }

    const current = (body.current ?? {}) as Record<string, unknown>;
    const kind = str(body.kind);

    if (kind === 'box') {
        const box: BoxCurrent = {
            boxNumber: num(current.box_number),
            orderPickList: str(current.order_pick_list),
            customer: str(current.customer),
            consignee: str(current.consignee),
            length: str(current.length),
            packRate: num(current.pack_rate),
            boxTotalCount: num(current.box_total_count),
            farmPackList: str(current.farm_pack_list),
            packedAt: str(current.packed_at),
            packedBy: str(current.packed_by),
            totalStems: num(current.total_stems),
            bunches: num(current.bunches),
        };
        return {
            exists: true,
            kind: 'box',
            refId: resolvedRef,
            current: box,
            events: rows(body.events).map(toBoxContent),
        };
    }

    if (kind === 'bucket') {
        const bucket: BucketCurrent = {
            itemCode: str(current.item_code),
            greenhouse: str(current.greenhouse),
            status: str(current.status),
        };
        return {
            exists: true,
            kind: 'bucket',
            refId: resolvedRef,
            current: bucket,
            events: rows(body.events).map(toStockEvent),
        };
    }

    // Default to bunch: it is the only remaining kind the script emits, and a
    // future one would still render as a history rather than blanking.
    const bunch: BunchCurrent = {
        itemCode: str(current.item_code),
        farm: str(current.farm),
        bunchSize: str(current.bunch_size),
        stemLength: str(current.stem_length),
    };
    return {
        exists: true,
        kind: 'bunch',
        refId: resolvedRef,
        current: bunch,
        events: rows(body.events).map(toStockEvent),
    };
}

export function useTraceability() {
    return useMutation({ mutationFn: lookup });
}

export { extractTraceError };
