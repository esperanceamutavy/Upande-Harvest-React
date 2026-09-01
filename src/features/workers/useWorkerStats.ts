import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { rangeFor, type FlowRange } from '../greenhouse/dateRange';
import type { WorkerStat } from '../../types/workers';

// An app method (dotted path), so the payload is under `message` — unlike the
// Server Scripts elsewhere in this app, which write top-level keys.

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

function toWorker(row: unknown): WorkerStat {
    const r = (row ?? {}) as Record<string, unknown>;
    const receiving = num(r.receiving);
    const bucketTransfer = num(r.bucket_transfer);
    const shelving = num(r.shelving);
    const grading = num(r.grading);
    const worker = String(r.worker ?? '');
    return {
        worker,
        workerName: String(r.worker_name ?? '').trim() || worker.split('@')[0] || '—',
        receiving,
        bucketTransfer,
        shelving,
        grading,
        total: receiving + bucketTransfer + shelving + grading,
    };
}

async function fetchWorkerStats(range: FlowRange): Promise<WorkerStat[]> {
    const [from, to] = rangeFor(range);
    const res = await apiClient.post<{ message?: unknown }>(
        '/api/method/upande_harvest.api.get_worker_stats',
        { from_date: from, to_date: to },
    );
    const rows = Array.isArray(res.data?.message) ? res.data.message : [];
    return (rows as unknown[]).map(toWorker);
}

export function useWorkerStats(range: FlowRange) {
    return useQuery({
        queryKey: ['worker-stats', range],
        queryFn: () => fetchWorkerStats(range),
    });
}
