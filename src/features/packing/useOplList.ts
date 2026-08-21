import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import type { OplListItem, OplListResult, OplDateFilter } from '../../types/packing';

// The OPL picker's source. There is no `list_open_opls_for_packing` endpoint on
// this site, so the doctypes are queried directly.
//
// NOTE THE SPELLING: "Order Pick LIst", capital I. That typo is the real
// doctype name and must be reproduced verbatim in the URL.
//
// FILTERS ON THE SALES ORDER'S delivery_date, not the OPL's date_created — the
// packer cares when the flowers fly, not when the pick list was generated. An
// OPL has no delivery date of its own, only a `sales_order` link, so this is
// two calls: resolve the due Sales Orders first, then the OPLs pointing at them.
const OPL_DOCTYPE = 'Order Pick LIst';
const SO_DOCTYPE = 'Sales Order';

const LIST_FIELDS = [
  'name',
  'customer',
  'sales_order',
  'custom_total_stems',
  'custom_box_type',
  'custom_is_mixed_box_pick_list',
];

/** Local-calendar YYYY-MM-DD. Deliberately not `toISOString`, which would shift
 *  the date across midnight for any timezone east of UTC — including EAT. */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday as the first day of the week. */
function startOfWeek(): Date {
  const d = new Date();
  const dow = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

/** Inclusive `[from, to]` on `delivery_date`, or null for "all time". */
function deliveryWindow(range: OplDateFilter): [string, string] | null {
  switch (range) {
    case 'today':
      // TWO DAYS on purpose: packers pack today for tomorrow's flight, so an
      // order due tomorrow is what is actually on the bench now.
      return [localDate(new Date()), localDate(shiftDays(1))];
    case 'yesterday': {
      const y = localDate(shiftDays(-1));
      return [y, y];
    }
    case 'week': {
      const from = startOfWeek();
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return [localDate(from), localDate(to)];
    }
    case 'all':
      return null;
  }
}

type Filter = [string, string, unknown];

async function getResource(
  doctype: string,
  fields: string[],
  filters: Filter[],
  orderBy?: string,
): Promise<Record<string, unknown>[]> {
  const res = await apiClient.get<{ data?: Record<string, unknown>[] }>(
    `/api/resource/${encodeURIComponent(doctype)}`,
    {
      params: {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        ...(orderBy ? { order_by: orderBy } : {}),
        limit_page_length: 0,
      },
    },
  );
  return res.data?.data ?? [];
}

/** Step 1 — Sales Orders due in the window, with their delivery dates. */
async function dueSalesOrders(window: [string, string]): Promise<Map<string, string>> {
  const rows = await getResource(
    SO_DOCTYPE,
    ['name', 'delivery_date'],
    [
      ['delivery_date', 'between', window],
      ['docstatus', '=', 1],
    ],
  );
  const byName = new Map<string, string>();
  for (const r of rows) {
    if (r.name != null) byName.set(String(r.name), r.delivery_date != null ? String(r.delivery_date) : '');
  }
  return byName;
}

function toItem(r: Record<string, unknown>, deliveryDate: string | null): OplListItem {
  return {
    name: String(r.name ?? ''),
    customer: r.customer != null ? String(r.customer) : null,
    salesOrder: r.sales_order != null ? String(r.sales_order) : null,
    totalUnits: r.custom_total_stems != null ? String(r.custom_total_stems) : null,
    boxType: r.custom_box_type != null ? String(r.custom_box_type) : null,
    deliveryDate,
  };
}

async function fetchOplList(range: OplDateFilter): Promise<OplListResult> {
  // Mixed-box OPLs are excluded at the query, not filtered in the UI: mix is
  // deferred, and offering one would strand a packer mid-box (§8.3).
  const baseFilters: Filter[] = [['custom_is_mixed_box_pick_list', '=', 0]];
  const window = deliveryWindow(range);

  // ── All time: skip step 1 entirely ──────────────────────────────────────
  // Building an `in` list of every Sales Order would blow up the URL, so the
  // OPLs are queried unfiltered and their delivery dates back-filled after.
  if (!window) {
    const rows = await getResource(OPL_DOCTYPE, LIST_FIELDS, baseFilters, 'creation desc');
    const soNames = [...new Set(rows.map((r) => String(r.sales_order ?? '')).filter(Boolean))];

    let dates = new Map<string, string>();
    if (soNames.length > 0) {
      const soRows = await getResource(SO_DOCTYPE, ['name', 'delivery_date'], [
        ['name', 'in', soNames],
      ]);
      dates = new Map(
        soRows.map((r) => [
          String(r.name ?? ''),
          r.delivery_date != null ? String(r.delivery_date) : '',
        ]),
      );
    }

    return {
      items: rows.map((r) => toItem(r, dates.get(String(r.sales_order ?? '')) ?? null)),
      notice: null,
    };
  }

  // ── Windowed: Sales Orders first, then their OPLs ───────────────────────
  const due = await dueSalesOrders(window);

  // SHORT-CIRCUIT. An empty `in` list is not a no-op filter — Frappe would
  // ignore it and return every OPL ever created, which is the opposite of what
  // was asked for.
  if (due.size === 0) {
    return { items: [], notice: 'No orders due in this window.' };
  }

  const rows = await getResource(
    OPL_DOCTYPE,
    LIST_FIELDS,
    [...baseFilters, ['sales_order', 'in', [...due.keys()]]],
    'creation desc',
  );

  return {
    items: rows.map((r) => toItem(r, due.get(String(r.sales_order ?? '')) ?? null)),
    notice: null,
  };
}

export function useOplList(range: OplDateFilter) {
  return useQuery({
    queryKey: ['opl-list', range],
    queryFn: () => fetchOplList(range),
  });
}
