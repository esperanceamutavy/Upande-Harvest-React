import { useQuery } from '@tanstack/react-query';

import { chunkedQuery } from './chunked.ts';
import { classifyPackList, NOT_STARTED } from './packState.ts';
import { apiClient } from '../../lib/api';
import { groupRowsByBox } from './boxProgress';
import { resolveCustomerCodeRef, toCustomerCodeRef } from './customerCodeRef';
import { orderLengthFromItemCode } from './lengths';
import type {
  CustomerCodeRef,
  OplListItem,
  OplListResult,
  OplDateFilter,
  PackStatus,
} from '../../types/packing';

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
  // Selected so the chunked listing can be re-sorted after the merge. Each
  // batch comes back sorted within itself; without this the merged order would
  // be batch order, which is arbitrary.
  'creation',
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
    case 'packing_today': {
      // delivery_date = TOMORROW. Labelled "Today" because that is the work:
      // packing runs a day ahead of the flight, so an order due today was
      // dispatched already and has no business on the bench. On the 21st this
      // shows deliveries dated the 22nd.
      const due = localDate(shiftDays(1));
      return [due, due];
    }
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
  extraParams?: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const res = await apiClient.get<{ data?: Record<string, unknown>[] }>(
    `/api/resource/${encodeURIComponent(doctype)}`,
    {
      params: {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        ...(orderBy ? { order_by: orderBy } : {}),
        limit_page_length: 0,
        ...extraParams,
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

interface Contents {
  varieties: string[];
  lengths: string[];
  bunches: number;
}

/** Contents for every listed OPL in ONE query.
 *
 *  Not one fetch per OPL document: a "This week" range is routinely dozens of
 *  pick lists, and OPL-2026-02962 alone carries 92 rows. Rows are collapsed to
 *  distinct varieties and lengths, since one OPL commonly repeats the same
 *  variety at the same length many times over.
 *
 *  Bunches come from each row's own `qty`, rounded, matching what the item
 *  lines already render. NOT from `custom_total_stems`, which is unreliable
 *  while the allocator bug stands (§8.3).
 */
async function fetchContents(oplNames: string[]): Promise<Map<string, Contents>> {
  const byOpl = new Map<string, Contents>();
  if (oplNames.length === 0) return byOpl;

  // `parent=Order Pick LIst` is REQUIRED. Pick List Item is a child doctype
  // (istable=1), and Frappe refuses /api/resource queries against child tables
  // unless the request names the parent — it answers PermissionError even when
  // the user can read the parent perfectly well. Not a role problem.
  //
  // Note the capital I in "Order Pick LIst": that typo is the real doctype name
  // and the query fails without it.
  const rows = await chunkedQuery(oplNames, (batch) =>
    getResource(
      'Pick List Item',
      ['parent', 'item_code', 'custom_stem_length', 'qty'],
      [['parent', 'in', batch]],
      undefined,
      { parent: 'Order Pick LIst' },
    ),
  );

  const seenVariety = new Map<string, Set<string>>();
  const seenLength = new Map<string, Set<string>>();

  for (const r of rows) {
    const parent = String(r.parent ?? '');
    if (!parent) continue;

    const entry = byOpl.get(parent) ?? { varieties: [], lengths: [], bunches: 0 };
    const varieties = seenVariety.get(parent) ?? new Set<string>();
    const lengths = seenLength.get(parent) ?? new Set<string>();

    const variety = r.item_code != null ? String(r.item_code).trim() : '';
    const length = r.custom_stem_length != null ? String(r.custom_stem_length).trim() : '';
    if (variety) varieties.add(variety);
    if (length) lengths.add(length);

    entry.bunches += Math.round(Number(r.qty ?? 0) || 0);

    byOpl.set(parent, entry);
    seenVariety.set(parent, varieties);
    seenLength.set(parent, lengths);
  }

  for (const [parent, entry] of byOpl) {
    entry.varieties = [...(seenVariety.get(parent) ?? [])].sort();
    entry.lengths = [...(seenLength.get(parent) ?? [])].sort();
  }

  return byOpl;
}

interface PackState {
  status: PackStatus;
  started: boolean;
  boxesPacked: number;
}

/** Packing status for every listed OPL, in BULK.
 *
 *  A Farm Pack List is submitted only when its LAST box closes, so `docstatus`
 *  is authoritative on its own — 1 is fully packed, anything else is
 *  unfinished. Completeness is NEVER inferred from box counts or `total_stems`.
 *
 *  A DRAFT PACK LIST IS STILL "TO PACK". It used to classify as its own
 *  'in_progress' status, which put a part-packed pick list on a tab the packer
 *  was not looking at: OPL-2026-06186 was started on the 25th and the packers
 *  could not find it on the 26th. Unfinished work stays in one place, and
 *  `started` carries the "someone has begun this" signal separately.
 */
async function fetchPackState(oplNames: string[]): Promise<Map<string, PackState>> {
  const byOpl = new Map<string, PackState>();
  if (oplNames.length === 0) return byOpl;

  const lists = await chunkedQuery(oplNames, (batch) =>
    getResource(
      'Farm Pack List',
      ['name', 'order_pick_list', 'docstatus'],
      [
        ['order_pick_list', 'in', batch],
        ['docstatus', '!=', 2],
      ],
    ),
  );
  if (lists.length === 0) return byOpl;

  const oplByFpl = new Map<string, string>();
  for (const r of lists) {
    const fpl = String(r.name ?? '');
    const opl = String(r.order_pick_list ?? '');
    if (!fpl || !opl) continue;
    oplByFpl.set(fpl, opl);
    byOpl.set(opl, { ...classifyPackList(r.docstatus), boxesPacked: 0 });
  }

  // Rows for every pack list at once. Child doctype, so the parent is declared.
  const rows = await chunkedQuery([...oplByFpl.keys()], (batch) =>
    getResource(
      'Dispatch Form Item',
      ['parent', 'bucket_id', 'bunch_qty', 'bunch_uom'],
      [['parent', 'in', batch]],
      undefined,
      { parent: 'Farm Pack List' },
    ),
  );

  const rowsByFpl = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const fpl = String(r.parent ?? '');
    if (!fpl) continue;
    const list = rowsByFpl.get(fpl) ?? [];
    list.push(r);
    rowsByFpl.set(fpl, list);
  }

  for (const [fpl, fplRows] of rowsByFpl) {
    const opl = oplByFpl.get(fpl);
    const state = opl ? byOpl.get(opl) : undefined;
    // Same grouping the resume path uses, so "boxes started" means one thing.
    if (state) state.boxesPacked = groupRowsByBox(fplRows).size;
  }

  return byOpl;
}

interface Identity {
  /** Keyed by Sales Order name. */
  consigneeBySo: Map<string, string>;
  /** Keyed by OPL name — the SO line carries `custom_opl`. */
  codeByOpl: Map<string, string>;
  /** `custom_number_of_boxes`, keyed by OPL name. */
  boxesByOpl: Map<string, number>;
  /** The order's own length, keyed by OPL name. */
  lengthByOpl: Map<string, string>;
  /** HEADER customer code REFERENCE, keyed by Sales Order — the line's fallback. */
  codeBySo: Map<string, string>;
  /** Customer Code records, keyed by record name. One bulk query, never per row. */
  codeRecords: Map<string, { code: unknown; customer: unknown }>;
}

/** Packer-facing identity for every listed OPL, in BULK — never per OPL.
 *
 *  Two queries rather than one, because the fields live on two doctypes:
 *  `custom_consignee` is header-only, and `custom_customer_code` exists on BOTH
 *  the header and the child lines. The line is the code that goes on the box, so
 *  it wins; the header is the fallback and rides along on the query that was
 *  already fetching the consignee. Still one round-trip each across the whole
 *  listing, never per OPL.
 */
async function fetchIdentity(soNames: string[], oplNames: string[]): Promise<Identity> {
  const consigneeBySo = new Map<string, string>();
  const codeByOpl = new Map<string, string>();
  const boxesByOpl = new Map<string, number>();
  const lengthByOpl = new Map<string, string>();
  const codeBySo = new Map<string, string>();
  const codeRecords = new Map<string, { code: unknown; customer: unknown }>();
  if (soNames.length === 0) {
    return { consigneeBySo, codeByOpl, boxesByOpl, lengthByOpl, codeBySo, codeRecords };
  }

  const [headers, lines] = await Promise.all([
    chunkedQuery(soNames, (batch) =>
      getResource(
        SO_DOCTYPE,
        ['name', 'custom_consignee', 'custom_customer_code'],
        [['name', 'in', batch]],
      ),
    ),
    // Sales Order Item is a CHILD doctype, so the parent must be declared or
    // Frappe answers PermissionError — same rule as Pick List Item below.
    //
    // THE parent FILTER IS GONE, DELIBERATELY. It was redundant: every OPL in
    // oplNames came from these very Sales Orders, so custom_opl alone selects
    // the same rows. Sending both put 46 order names AND 127 OPL names in one
    // request line — 4,465 characters against a 4,094 limit — and dropping it
    // halves the line before chunking even applies.
    chunkedQuery(oplNames, (batch) =>
      getResource(
        'Sales Order Item',
        ['parent', 'custom_opl', 'custom_customer_code', 'custom_number_of_boxes', 'item_code'],
        [['custom_opl', 'in', batch]],
        undefined,
        { parent: SO_DOCTYPE },
      ),
    ),
  ]);

  for (const r of headers) {
    const name = String(r.name ?? '');
    const consignee = r.custom_consignee != null ? String(r.custom_consignee).trim() : '';
    if (name && consignee) consigneeBySo.set(name, consignee);
    const headerCode =
      r.custom_customer_code != null ? String(r.custom_customer_code).trim() : '';
    if (name && headerCode) codeBySo.set(name, headerCode);
  }

  for (const r of lines) {
    const opl = r.custom_opl != null ? String(r.custom_opl).trim() : '';
    if (!opl) continue;
    const code = r.custom_customer_code != null ? String(r.custom_customer_code).trim() : '';
    if (code) codeByOpl.set(opl, code);
    const boxes = Number(r.custom_number_of_boxes ?? 0) || 0;
    if (boxes > 0) boxesByOpl.set(opl, boxes);
    const length = orderLengthFromItemCode(
      r.item_code != null ? String(r.item_code) : null,
    );
    if (length) lengthByOpl.set(opl, length);
  }

  // THIRD query: resolve every distinct Customer Code reference in the listing
  // in ONE go. `custom_customer_code` is a Link, so the code that goes on the
  // box lives on the linked record — see customerCodeRef.ts. Keyed on the
  // distinct names, so this is one round-trip regardless of row count.
  const refNames = Array.from(
    new Set([...codeByOpl.values(), ...codeBySo.values()].filter((v) => v.length > 0)),
  );
  if (refNames.length > 0) {
    const records = await chunkedQuery(refNames, (batch) =>
      getResource('Customer Code', ['name', 'code', 'customer'], [['name', 'in', batch]]),
    );
    for (const r of records) {
      const name = String(r.name ?? '');
      if (name) codeRecords.set(name, { code: r.code, customer: r.customer });
    }
  }

  return { consigneeBySo, codeByOpl, boxesByOpl, lengthByOpl, codeBySo, codeRecords };
}

/** The row's resolved customer code, or null when it has no reference at all. */
function resolveCustomerCodeRefFor(
  r: Record<string, unknown>,
  identity: Identity,
): CustomerCodeRef | null {
  const ref = resolveCustomerCodeRef(
    identity.codeByOpl.get(String(r.name ?? '')),
    identity.codeBySo.get(String(r.sales_order ?? '')),
  );
  if (!ref) return null;
  return toCustomerCodeRef(ref, identity.codeRecords.get(ref) ?? null);
}

function toItem(
  r: Record<string, unknown>,
  deliveryDate: string | null,
  contents: Contents | undefined,
  identity: Identity,
  packState: Map<string, PackState>,
): OplListItem {
  return {
    name: String(r.name ?? ''),
    customer: r.customer != null ? String(r.customer) : null,
    salesOrder: r.sales_order != null ? String(r.sales_order) : null,
    totalUnits: r.custom_total_stems != null ? String(r.custom_total_stems) : null,
    boxType: r.custom_box_type != null ? String(r.custom_box_type) : null,
    deliveryDate,
    varieties: contents?.varieties ?? [],
    lengths: contents?.lengths ?? [],
    bunches: contents?.bunches ?? 0,
    // LINE first, HEADER as fallback, then RESOLVED through Customer Code.
    customerCode: resolveCustomerCodeRefFor(r, identity),
    consignee: identity.consigneeBySo.get(String(r.sales_order ?? '')) ?? null,
    // No pack list at all means nothing has been started.
    packStatus: packState.get(String(r.name ?? ''))?.status ?? NOT_STARTED.status,
    started: packState.get(String(r.name ?? ''))?.started ?? NOT_STARTED.started,
    boxesPacked: packState.get(String(r.name ?? ''))?.boxesPacked ?? 0,
    boxesTotal: identity.boxesByOpl.get(String(r.name ?? '')) ?? 0,
    orderLength: identity.lengthByOpl.get(String(r.name ?? '')) ?? null,
  };
}

async function fetchOplList(range: OplDateFilter): Promise<OplListResult> {
  // Mixed-box OPLs are INCLUDED. A mix now arrives as one pick list whose rows
  // share a custom_box_id, so a packer still gets a whole box rather than being
  // stranded mid-box — the concern that kept them out (§8.3).
  const baseFilters: Filter[] = [];
  const window = deliveryWindow(range);

  // ── All time: skip step 1 entirely ──────────────────────────────────────
  // Building an `in` list of every Sales Order would blow up the URL, so the
  // OPLs are queried unfiltered and their delivery dates back-filled after.
  if (!window) {
    const rows = await getResource(OPL_DOCTYPE, LIST_FIELDS, baseFilters, 'creation desc');
    const soNames = [...new Set(rows.map((r) => String(r.sales_order ?? '')).filter(Boolean))];

    let dates = new Map<string, string>();
    if (soNames.length > 0) {
      const soRows = await chunkedQuery(soNames, (batch) =>
        getResource(SO_DOCTYPE, ['name', 'delivery_date'], [['name', 'in', batch]]),
      );
      dates = new Map(
        soRows.map((r) => [
          String(r.name ?? ''),
          r.delivery_date != null ? String(r.delivery_date) : '',
        ]),
      );
    }

    const names = rows.map((r) => String(r.name ?? '')).filter(Boolean);
    const [contents, identity, packState] = await Promise.all([
      fetchContents(names),
      fetchIdentity(soNames, names),
      fetchPackState(names),
    ]);
    return {
      items: rows.map((r) =>
        toItem(
          r,
          dates.get(String(r.sales_order ?? '')) ?? null,
          contents.get(String(r.name ?? '')),
          identity,
          packState,
        ),
      ),
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

  // Chunked like the rest: `due` is every Sales Order in the window, so this
  // list grows with the day. Ordering is reapplied after the merge, since each
  // batch is only sorted within itself.
  const rows = await chunkedQuery([...due.keys()], (batch) =>
    getResource(
      OPL_DOCTYPE,
      LIST_FIELDS,
      [...baseFilters, ['sales_order', 'in', batch]],
      'creation desc',
    ),
  );
  rows.sort((a, b) => String(b.creation ?? '').localeCompare(String(a.creation ?? '')));

  const names = rows.map((r) => String(r.name ?? '')).filter(Boolean);
  const [contents, identity, packState] = await Promise.all([
    fetchContents(names),
    fetchIdentity([...due.keys()], names),
    fetchPackState(names),
  ]);

  return {
    items: rows.map((r) =>
      toItem(
        r,
        due.get(String(r.sales_order ?? '')) ?? null,
        contents.get(String(r.name ?? '')),
        identity,
        packState,
      ),
    ),
    notice: null,
  };
}

export function useOplList(range: OplDateFilter) {
  return useQuery({
    queryKey: ['opl-list', range],
    queryFn: () => fetchOplList(range),
  });
}
