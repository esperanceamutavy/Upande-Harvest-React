import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { OplListItem, OplDateFilter } from '../../types/packing';

// GET /api/resource/Order Pick LIst — the OPL picker's source.
//
// There is no `list_open_opls_for_packing` endpoint on this site, so the
// doctype is queried directly. NOTE THE SPELLING: "Order Pick LIst", capital I.
// That typo is the real doctype name and must be reproduced verbatim in the URL.
const OPL_DOCTYPE = 'Order Pick LIst';

const LIST_FIELDS = [
  'name',
  'customer',
  'sales_order',
  'custom_total_stems',
  'custom_box_type',
  'date_created',
  'custom_is_mixed_box_pick_list',
];

/** Local-calendar YYYY-MM-DD. Deliberately not `toISOString`, which would shift
 *  the date across midnight for any timezone east of UTC — including EAT. */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Monday as the first day of the week. */
function startOfWeek(): Date {
  const d = new Date();
  const dow = d.getDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return d;
}

type Filter = [string, string, string | number];

function dateFilters(range: OplDateFilter): Filter[] {
  switch (range) {
    case 'today':
      return [['date_created', '=', localDate(new Date())]];
    case 'yesterday':
      return [['date_created', '=', localDate(daysAgo(1))]];
    case 'week':
      return [['date_created', '>=', localDate(startOfWeek())]];
    case 'all':
      return [];
  }
}

async function fetchOplList(range: OplDateFilter): Promise<OplListItem[]> {
  const filters: Filter[] = [
    // Mixed-box OPLs are excluded at the query, not filtered in the UI: mix is
    // deferred, and offering one would strand a packer mid-box (§8.3).
    ['custom_is_mixed_box_pick_list', '=', 0],
    ...dateFilters(range),
  ];

  const res = await apiClient.get<{ data?: Record<string, unknown>[] }>(
    `/api/resource/${encodeURIComponent(OPL_DOCTYPE)}`,
    {
      params: {
        fields: JSON.stringify(LIST_FIELDS),
        filters: JSON.stringify(filters),
        order_by: 'creation desc',
        limit_page_length: 100,
      },
    },
  );

  const rows = res.data?.data ?? [];
  return rows.map((r) => ({
    name: String(r.name ?? ''),
    customer: r.customer != null ? String(r.customer) : null,
    salesOrder: r.sales_order != null ? String(r.sales_order) : null,
    totalUnits: r.custom_total_stems != null ? String(r.custom_total_stems) : null,
    boxType: r.custom_box_type != null ? String(r.custom_box_type) : null,
    dateCreated: r.date_created != null ? String(r.date_created) : null,
  }));
}

export function useOplList(range: OplDateFilter) {
  return useQuery({
    queryKey: ['opl-list', range],
    queryFn: () => fetchOplList(range),
  });
}
