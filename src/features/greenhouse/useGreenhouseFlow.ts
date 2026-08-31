import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { apiClient, extractFrappeError } from '../../lib/api';
import { rangeFor, type FlowRange } from './dateRange';
import type {
    GreenhouseFlow,
    GreenhouseFlowRow,
    GreenhouseFlowTotals,
} from '../../types/greenhouse';

// `get_greenhouse_flow` is a Server Script writing into `frappe.response`, so
// the keys are TOP LEVEL rather than under `message`. A failure is HTTP 500
// carrying `error` — not a Frappe throw, so there is no `_server_messages`
// envelope for `extractFrappeError` to unwrap on its own.

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string | null =>
    v != null && String(v).trim().length > 0 ? String(v).trim() : null;

function toRow(r: Record<string, unknown>): GreenhouseFlowRow {
    return {
        greenhouse: String(r.greenhouse ?? '—'),
        receivedStems: num(r.received_stems),
        transferredStems: num(r.transferred_stems),
        shelvedStems: num(r.shelved_stems),
        gapStems: num(r.gap_stems),
        receivedBuckets: num(r.received_buckets),
        transferredBuckets: num(r.transferred_buckets),
        shelvedBuckets: num(r.shelved_buckets),
    };
}

function toTotals(t: unknown): GreenhouseFlowTotals {
    const o = (t ?? {}) as Record<string, unknown>;
    return {
        receivedStems: num(o.received_stems),
        transferredStems: num(o.transferred_stems),
        shelvedStems: num(o.shelved_stems),
        gapStems: num(o.gap_stems),
    };
}

/** Reads the 500's `error` key first; `extractFrappeError` never sees one. */
export function extractFlowError(e: unknown): string {
    if (isAxiosError(e)) {
        const body = e.response?.data as Record<string, unknown> | undefined;
        const direct = body?.error;
        if (direct != null && String(direct).trim()) return String(direct).trim();
    }
    return extractFrappeError(e);
}

async function fetchFlow(range: FlowRange): Promise<GreenhouseFlow> {
    const [from, to] = rangeFor(range);

    const res = await apiClient.post<Record<string, unknown>>(
        '/api/method/get_greenhouse_flow',
        { from_date: from, to_date: to },
    );

    const body = res.data ?? {};
    const rows = Array.isArray(body.greenhouses) ? body.greenhouses : [];

    return {
        fromDate: str(body.from_date) ?? from,
        toDate: str(body.to_date) ?? to,
        // NOT re-sorted: the server already orders by gap descending, worst
        // first, and that is the order the screen is meant to read in.
        greenhouses: (rows as Record<string, unknown>[]).map(toRow),
        totals: toTotals(body.totals),
    };
}

export function useGreenhouseFlow(range: FlowRange) {
    return useQuery({
        queryKey: ['greenhouse-flow', range],
        queryFn: () => fetchFlow(range),
    });
}
