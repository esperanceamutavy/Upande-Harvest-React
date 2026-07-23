import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';

// Xflora Dashboard stats for today (online-only). Three symmetric Frappe calls,
// combined with allSettled so one failing/lagging endpoint doesn't blank the board —
// each tile independently falls back to null ("—") on error.
// Contracts — all { from_date,to_date } -> message.total_stems (identical envelope):
//   - get_receiving_dashboard_data  (Received)         [sibling being created server-side]
//   - get_shelving_dashboard_data   (Shelved)          [confirmed live]
//   - get_bucket_transfer_stats     (Bucket Transfer)  [confirmed live]
//   - get_grading_stats             (Graded)           [live] -> also message.total_entries
// Grading is a dashboard stat only — it is NOT a drawer/tab workflow.
// See DESIGN_PORT_PLAN.md §4.

export interface DashboardStats {
  receivedStems: number | null;
  shelvedStems: number | null;
  bucketTransferStems: number | null;
  gradedStems: number | null;
  gradedEntries: number | null;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

async function postMessage(method: string, body: object): Promise<Record<string, unknown> | null> {
  const res = await apiClient.post<{ message?: unknown }>(`/api/method/${method}`, body);
  const m = res.data?.message;
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : null;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const today = todayISO();
  const range = { from_date: today, to_date: today };

  const [received, shelved, transfer, graded] = await Promise.allSettled([
    postMessage('get_receiving_dashboard_data', range),
    postMessage('get_shelving_dashboard_data', range),
    postMessage('get_bucket_transfer_stats', range),
    postMessage('get_grading_stats', range),
  ]);

  // If every call failed, surface an error so the screen shows retry.
  if (
    received.status === 'rejected' &&
    shelved.status === 'rejected' &&
    transfer.status === 'rejected' &&
    graded.status === 'rejected'
  ) {
    throw received.reason;
  }

  // All share the same envelope: message.total_stems (grading adds total_entries).
  // A rejected/lagging call leaves that tile at null → "—".
  const field = (r: PromiseSettledResult<Record<string, unknown> | null>, key: string): number | null =>
    r.status === 'fulfilled' && r.value ? num(r.value[key]) : null;

  return {
    receivedStems: field(received, 'total_stems'),
    shelvedStems: field(shelved, 'total_stems'),
    bucketTransferStems: field(transfer, 'total_stems'),
    gradedStems: field(graded, 'total_stems'),
    gradedEntries: field(graded, 'total_entries'),
  };
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['xflora-dashboard', todayISO()],
    queryFn: fetchDashboardStats,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
