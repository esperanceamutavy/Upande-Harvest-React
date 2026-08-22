import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { groupRowsByBox } from './boxProgress';
import type { BoxProgress } from './resume';

// What has already been packed against an OPL, so a session RESUMES rather than
// restarting. Two calls: find the Farm Pack List for the OPL, then read its rows.
//
// Per-box state MUST come from `pack_list_item`, not the header's `total_stems`:
// the header is a sum across every box and cannot say which box is still open.

export interface ExistingPack {
    /** The Farm Pack List, or null when nothing has been packed yet. */
    fplName: string | null;
    /** Box number → what it already holds. Keyed on the row's `bucket_id`. */
    perBox: Map<number, BoxProgress>;
}

async function findFarmPackList(oplName: string): Promise<string | null> {
    const res = await apiClient.get<{ data?: Record<string, unknown>[] }>(
        `/api/resource/${encodeURIComponent('Farm Pack List')}`,
        {
            params: {
                fields: JSON.stringify(['name']),
                filters: JSON.stringify([
                    ['order_pick_list', '=', oplName],
                    ['docstatus', '!=', 2],
                ]),
                limit_page_length: 1,
            },
        },
    );
    const rows = res.data?.data ?? [];
    return rows.length > 0 && rows[0].name != null ? String(rows[0].name) : null;
}

async function fetchExistingPack(oplName: string): Promise<ExistingPack> {
    const fplName = await findFarmPackList(oplName);
    if (!fplName) return { fplName: null, perBox: new Map() };

    const res = await apiClient.get<{ data?: Record<string, unknown> }>(
        `/api/resource/${encodeURIComponent('Farm Pack List')}/${encodeURIComponent(fplName)}`,
    );
    const rows = Array.isArray(res.data?.data?.pack_list_item)
        ? (res.data!.data!.pack_list_item as Record<string, unknown>[])
        : [];

    return { fplName, perBox: groupRowsByBox(rows) };
}
export function useExistingPack() {
    return useMutation({ mutationFn: fetchExistingPack });
}
