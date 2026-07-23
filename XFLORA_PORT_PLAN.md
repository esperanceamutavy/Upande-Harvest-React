# Xflora Port Plan

> Reconnaissance + porting plan for the standalone **xflora-rn** app. No code changes yet.
> Source of truth for behavior: the Flutter reference at `~/projects/kikwetu-harvest-flutter` (read-only).
> This app is **single-instance (Xflora only)**. Auth is **session-cookie (`sid`)** and already correct — do **not** add any API-key / `generate_keys` step.
>
> **v1 scope decision (locked):** v1 ships **5** drawer workflows — Receiving, Rejects (=Discard), Bucket Transfer, Shelving, Issuing — each backed by a Flutter reference. **Grading, Packing, and Staging are excluded from v1 entirely** (no drawer items, no stub screens, no routes). They are **v2 candidates** to be spec'd against the live backend flows and shipped later as OTA updates. The drawer is kept **data-driven** (see §3) so adding a v2 workflow is config + one screen, with no rework.

---

## 0. Key findings & discrepancies (read first)

These surfaced during recon and change the plan. Several need a product/backend decision before the affected screens can be built — see **§6 Open decisions**.

1. **Only 5 of the 8 drawer items have a Flutter Xflora implementation.** Dedicated `xflora_*` widgets exist for Receiving, Shelving, Bucket Transfer, Issue-from-coldstore, and Discard. There are **no** `xflora_grading`, `xflora_packing`, `xflora_rejects`, or `xflora_staging` widgets. In `entry_list_view.dart` the Grading / Packing / Staging tiles have **no `title == "Xflora"` branch at all** — for Xflora they are dead/no-op tiles (tapping just closes the drawer). **Decision:** Grading, Packing, and Staging are **out of v1** — they have no reference to port and would be net-new mobile features. They are deferred to **v2** (§6) and do not appear in the v1 drawer at all.

2. **"Rejects" in the live drawer ≠ a rejects widget; it maps to the Discard flow.** The authoritative v4.0.0 drawer lists **Rejects** but *not* **Discards**. The Flutter code has the reverse: a **Discards** tile that (for Xflora) routes to `XfloraDiscardStockEntry`, and a **Rejects** tile that is a no-op for Xflora. The only "remove a bucket" workflow Xflora actually implements is the coldroom-bucket discard (scan `coldroom_bucket` → `createDiscardEntry`, with an age/`bucket_too_young` guard). **Working interpretation: the drawer's "Rejects" item = the Xflora discard flow.** Confirm the label with the user (§6).

3. **Instance host — confirmed `xflora.upande.com`.** `src/lib/config.ts` correctly locks `INSTANCE_HOST = 'xflora.upande.com'` (`normalizeUrl()` prepends `https://`). The Flutter `InstanceMapper`'s `https://xflora.fsn.frappe.cloud` entry is a **known bug** — that hostname fails DNS on mobile networks; the live instance is served at `xflora.upande.com`. No change needed to `config.ts`.

4. **`src/lib/clients.ts` is stale and dormant.** Its Xflora feature matrix (`receiving+discards+shelving+issuing`) is wrong vs. the authoritative 8-item drawer, and `useClientStore.setClient` is **never called** anywhere — the whole multi-client abstraction is unused. Since this app is single-instance, strip it (§3).

5. **STACK.md auth section is stale.** It still describes token/`generate_keys` auth. The actual codebase (`src/lib/api.ts`) uses session-cookie (`Cookie: sid=...`), which is correct per this task. Leave the running code alone; STACK.md's "Auth pattern" and "Multi-tenancy abstraction" sections should be updated as part of this port (doc-only).

6. **Live backend confirms the active Stock Entry Types** (queried via MCP, 184,935 stock entries, active today): `Receiving`, `Shelving`, `Grading`, `Grading Rejects`, `Intake Rejects`, `Field Reject`, `Packing`, `Harvesting`, `Quarantine`, `Discard`, `Bucket Transfer` (plus generic ERPNext types we exclude). This drives `allowedTypes.ts` (§4). Note: **Issuing and Staging produce no `Stock Entry`** of their own type — Issuing acts on Sales Order Items; Staging (if built) uses `createStagingEntry`.

---

## 1. Global API conventions (all Xflora endpoints)

- **Transport:** Frappe RPC — `POST` (JSON body) or `GET` (query params) to `{instanceUrl}/api/method/<method>`. Base URL is injected per-request by the axios interceptor in `src/lib/api.ts` from `useAuthStore.instanceUrl`.
- **Auth:** session cookie only — interceptor sets `config.headers.Cookie = \`sid=${sid}\``. 401 → auto-logout; 403 → surfaced as a normal per-endpoint error (not logout).
- **Response envelope:** RPC methods return under `res.data.message` (occasionally `res.data.data`). Existing hooks already normalize this; follow the same pattern.
- **Errors:** `parseFrappeError` / `extractFrappeError` in `api.ts` already unwrap `_server_messages`. Reuse for all new hooks.
- **QR payloads are JSON strings.** HID scanner input is detected by "trimmed text that is valid JSON ending in `}`"; a camera path (`BarcodeScannerOverlay`) feeds the same parser. This dual-input pattern already exists in `kikwetu/receiving.tsx` and is the template for every Xflora scan screen.

### Endpoint reference (verbatim from `api_service.dart`)

| Workflow | Method | Verb | Path (`/api/method/…`) | Body keys |
|---|---|---|---|---|
| Receiving | `createXfloraReceivingEntry` | POST | `receiving_entry` | `bucket_id`, `custom_receiving_batch_id`, `is_bunched`, `bunch_size`, `number_of_bunches` |
| Shelving | `createXfloraShelvingEntry` | POST | `shelving_entry` | `farm`, `shelf_id`, `bucket_id` |
| Bucket Transfer | `transferXfloraBucket` | POST | `transfer_bucket` | `source_bucket_id`, `destination_bucket_id` |
| Rejects (=Discard) | `createXfloraDiscardEntry` | POST | `createDiscardEntry` | `bucket_id` |
| Issuing — list orders | `fetchXfloraReadySaleOrderItems` | GET | `getReadySaleOrderItems` | — |
| Issuing — order items | `fetchXfloraReadySaleOrderItemsData` | POST | `getReadySaleOrderItemsData` | `custom_order_name` |
| Issuing — issue bucket | `issueFromColdstore` | POST | `issueBucketToSaleOrderItem` | `bucket`, `sale_order_item`, `opl_name` |
| Staging (Kaitet ref only) | `createKaitetStagingEntry` | POST | `createStagingEntry` | `box_label` |
| (helper) batch by bucket | `getBatchByBucket` | POST | `getBatchByBucket` | `bucket_id` |
| (helper) bucket status | `getBucketStatus` | POST | `getBucketStatus` | `bucket_id` |
| (helper) greenhouse by bucket | `fetchGreenhouseByBucketId` | GET | `fetch_greenhouse_by_bucket_id?bucket_id=` | — (query) |

> ⚠️ The Xflora `receiving_entry` endpoint (Xflora) is **different** from the RN app's current `createReceivingStockEntry` (Kikwetu). Do not reuse the Kikwetu receiving hook body as-is.

---

## 2. Screen-by-screen plan (v1 = 5 drawer items)

The 5 v1 workflows below all have a Flutter Xflora reference. Grading / Packing / Staging are **not** in v1 — see §6 (v2 candidates). Each entry lists: Flutter source · API contract · scan flow · RN starting point.

### 2.1 Receiving  ✅ has Flutter reference
- **Flutter:** `xflora/xflora_receiving_entry.dart` → `XfloraReceivingStockEntry`.
- **API:** `POST /api/method/receiving_entry` with `{ bucket_id, custom_receiving_batch_id, is_bunched, bunch_size, number_of_bunches }`.
- **Scan flow:** **single scan.** Scan bucket QR → JSON → extract `bucket_id`. Continuous-scan loop (field auto-clears + refocuses after each submit). Two toggles above the field:
  - **Batch Receiving** — generates an 8-char random uppercase `batchId` (sent as `custom_receiving_batch_id`); persists across scans until toggled off.
  - **Is Bunched** — reveals a bunch-size chip picker `[5,7,9,10,13]` (`bunch_size`) + a numeric **Quantity** field (`number_of_bunches`). Both required before a scan is accepted when bunched; preserved between scans.
  - When not bunched, `bunch_size`/`number_of_bunches` are `null`.
- **Success/failure:** snackbar + submit/error sound + 100ms vibrate on scan.
- **RN start point:** **clone `kikwetu/receiving.tsx`** (already has HID+camera dual input, JSON parse, `bucket_id` extraction, continuous-scan reset). Replace the hook with a new `useCreateXfloraReceivingEntry` and add the two toggles + chip picker. Drop the Kikwetu "bucket check / greenhouse lookup" branches (not used by Xflora receiving).
- **Verdict:** closest-existing screen; mostly additive UI work.

### 2.2 Rejects (= coldroom bucket Discard)  ✅ has Flutter reference (as "Discard")
- **Flutter:** `xflora/xflora_discard_entry.dart` → `XfloraDiscardStockEntry`.
- **API:** `POST /api/method/createDiscardEntry` with `{ bucket_id }`. **Response** parsed as `XfloraDiscardResponse` (`data.status`, `data.reason`, `data.message`, `data.payload{ bucket_id, age_days, variety, stems, discard_entry }`).
- **Scan flow:** **single scan.** Scan bucket QR → JSON → extract **`coldroom_bucket`** (note: this key, not `bucket_id`) → `createDiscardEntry`.
- **Special behavior:** on success shows a result **dialog** (bucket id, variety, stems, "N DAYS OLD") that auto-dismisses after 2.5s + submit sound. On failure with `reason == "bucket_too_young"` shows a **blocking error dialog** ("Cannot Discard: Too Young") with the payload + error sound + 400ms vibrate. Any other failure → snackbar.
- **RN start point:** **clone `kikwetu/discards.tsx`** for skeleton (single-scan, station guard, sounds/haptics), but the logic differs: no reason radios, no client-side bunch validation — this is scan→submit→dialog. New hook `useCreateXfloraDiscardEntry` returning the typed payload; new result-dialog component (or reuse a modal primitive).
- **Verdict:** new hook + new result dialog; skeleton reused.

### 2.3 Bucket Transfer  ✅ has Flutter reference
- **Flutter:** `xflora/xflora_bucket_transfer.dart` → `XfloraBucketTransfer`.
- **API:** `POST /api/method/transfer_bucket` with `{ source_bucket_id, destination_bucket_id }`.
- **Scan flow:** **dual scan, sequential + auto-submit.** Scan Source first (accepts either `bucket_id` or `coldroom_bucket` key) → auto-focus Destination → scan Destination → **auto-submits** once both are filled. Resets to Source on success.
- **RN start point:** **built new**, but small. Two scan cards + arrow. Closest pattern for the "two sequential scan slots" is `kikwetu/grading.tsx` (`ScanSlot` + `maybeSubmit`), though grading is order-independent; here Source must precede Destination. New hook `useXfloraBucketTransfer`.
- **Verdict:** small, self-contained; good early win.

### 2.4 Shelving  ✅ has Flutter reference
- **Flutter:** `xflora/xflora_shelving_entry.dart` → `XfloraShelvingEntry(userFarm)`.
- **API:** `POST /api/method/shelving_entry` with `{ farm, shelf_id, bucket_id }`. `farm` comes from the configured station (`station.farm`), **not** scanned.
- **Scan flow:** **dual scan, sequential.** Scan **Shelf** QR (extract `shelf` key) → auto-focus Bucket → scan **Bucket** QR (extract **`coldroom_bucket`** key) → auto-submits `{ farm, shelf_id, bucket_id }`. 500ms debouncer on each field to absorb HID keystrokes. On success clears only the bucket field and refocuses it (shelf persists for batch shelving onto one shelf). "Clear Form" button resets both.
- **RN start point:** **built new**; reuse the sequential dual-scan pattern from Bucket Transfer (build that first). Needs `farm.farm` from `useFarm()` (§5.2); redirect to `/configure` if no farm is set. New hook `useCreateXfloraShelvingEntry`.
- **Verdict:** new, but shares the dual-scan harness with Bucket Transfer.

### 2.5 Issuing (Issue from Coldstore)  ✅ has Flutter reference — most complex
- **Flutter:** `xflora/xflora_issue_from_coldstore.dart` → `XfloraIssueFromColdstore`. Models: `xflora_ready_sale_order_items.dart`.
- **API (three calls):**
  1. On mount: `GET /api/method/getReadySaleOrderItems` → `{ orders: string[], message }` (list of Sale Order names for a type-ahead).
  2. On order select: `POST /api/method/getReadySaleOrderItemsData` `{ custom_order_name }` → `{ packing_list: XfloraReadySaleOrderItem[], message }`. Item shape: `variety, bucket, stem_length, shelf, sales_order_item, mixed, downgrade_to?, qty, team, custom_issued, opl_name`.
  3. On bucket scan: `POST /api/method/issueBucketToSaleOrderItem` `{ bucket, sale_order_item, opl_name }`.
- **Scan flow:** select order (type-ahead) → app renders the order's packing-list cards (issued rows greyed with "Issued" badge) → **single scan** of bucket QR (extract `coldroom_bucket`) → match scanned bucket against the loaded packing list (case-insensitive on `bucket`) → if matched and has `sales_order_item`, call issue with that item's `sales_order_item` + `opl_name`. Errors if bucket not allocated to the order or no sale-order-item. Order must be selected before scanning is allowed.
- **RN start point:** **built new** — this is the heaviest screen. No close existing analog; `kikwetu/packing.tsx` is the nearest for "load a list, match scans against it, render row states." Needs: a type-ahead component (none exists — `Picker` is a plain select; build or add one), three hooks (`useXfloraReadySaleOrders`, `useXfloraReadySaleOrderItems`, `useIssueFromColdstore`), and the packing-list card UI.
- **Verdict:** new + a new type-ahead primitive; schedule last among the reference-backed screens.

> **Grading, Packing, Staging — not in v1.** They have no Flutter Xflora reference and are deferred to v2. See §6 for the v2 candidate notes (what's known so far and what must be spec'd). They are omitted from the v1 drawer, routes, and build order below.

---

## 3. Proposed route structure (flat, single-instance)

Replace the `kikwetu/` folder with flat routes under `src/app/(app)/`. The dashboard, configure, ERP desk, and stock-entry detail stay. **Only the 5 v1 workflows get routes** — no grading/packing/staging files are created in v1 (adding one in v2 = drop a screen file + one drawer-config line).

```
src/app/(app)/
  _layout.tsx            # unchanged (Stack, headerShown:false)
  index.tsx              # dashboard (entry list) — update allowedTypes
  configure.tsx          # station (farm + warehouse) setup — keep
  erp-desk.tsx           # keep (Phase 6)
  receiving.tsx          # 2.1  ✅ v1
  rejects.tsx            # 2.2  ✅ v1 (coldroom discard flow; confirm label)
  bucket-transfer.tsx    # 2.3  ✅ v1
  shelving.tsx           # 2.4  ✅ v1
  issuing.tsx            # 2.5  ✅ v1
  stock-entry/[id].tsx   # keep (detail view)
  # grading.tsx / packing.tsx / staging.tsx — v2 only, not created in v1
```

Delete after port: `src/app/(app)/kikwetu/*` (all 11 files), plus the report screens (`harvesting-report`, `receiving-report`, `grading-test`) unless a report is in Xflora scope (not in the drawer — drop for v1).

**Feature-folder mirror** under `src/features/` (per STACK.md convention): create `receiving/`, `shelving/`, `bucket-transfer/`, `issuing/`, `discard/` (rename existing `discards/`). Remove Kikwetu-only folders (`grading/`, `packing/`, `rejects/`, and the harvest hooks) once their screens are gone — keep only what the 5 v1 screens import.

### Data-driven drawer (so v2 items are config-only)

Replace `KIKWETU_ITEMS` in `AppDrawer.tsx` with a single **config array** — the drawer just `.map()`s over it, so adding a v2 workflow later is one new line + one screen file, no component rework. Keep the model minimal (an `enabled`/`minVersion` flag is optional; simplest is to just list the shipped items):

```ts
// src/features/navigation/drawerItems.ts (new — single source of truth for the drawer)
export interface DrawerItem { label: string; icon: LucideIcon; route: string; }

export const WORKFLOW_ITEMS: DrawerItem[] = [
  { label: 'Receiving',       icon: PackagePlus,    route: '/receiving' },
  { label: 'Rejects',         icon: XCircle,        route: '/rejects' },        // = coldroom discard flow
  { label: 'Bucket Transfer', icon: ArrowLeftRight, route: '/bucket-transfer' },
  { label: 'Shelving',        icon: LayoutGrid,     route: '/shelving' },
  { label: 'Issuing',         icon: PackageCheck,   route: '/issuing' },
  // v2 (ship via OTA once spec'd — see §6):
  // { label: 'Grading', icon: Hexagon, route: '/grading' },
  // { label: 'Packing', icon: Box,     route: '/packing' },
  // { label: 'Staging', icon: Boxes,   route: '/staging' },
];
```

`AppDrawer.tsx` imports `WORKFLOW_ITEMS` and renders it; `UTILITY_ITEMS` (Configure Farm, View ERP Desk) stays. No per-client gating needed (single instance). A v2 workflow ships as: add the screen file + uncomment its `WORKFLOW_ITEMS` line + OTA update.

---

## 4. clients.ts / stores/client.ts / useClient.ts — strip

Single-instance ⇒ the multi-client abstraction is dead weight (and currently unwired: `setClient` is never called).

- **Delete** `src/lib/clients.ts`, `src/stores/client.ts`, `src/features/station/useClient.ts`.
- **Grep and remove imports** of `useClient`, `useClientStore`, `ClientId`, `ClientConfig`, `CLIENT_REGISTRY`, `getClientConfig`. (Recon shows the only consumers are the dormant hook/store themselves; the drawer and screens don't gate on client today.)
- **Keep** `src/lib/config.ts` as the single lock point (`INSTANCE_HOST`, `CLIENT_DISPLAY_NAME`). Verify the host (§6).
- **Docs:** update STACK.md's "Multi-tenancy abstraction" and "Auth pattern" sections to reflect single-instance + cookie auth (doc-only; do not touch the working auth code).

---

## 5. Shared plumbing changes

### 5.1 Dashboard entry types — `allowedTypes.ts` + `useStockEntryTypes.ts`
`useStockEntryTypes` returns `ALLOWED_STOCK_ENTRY_TYPES` directly (no fetch) and `useStockEntries` filters the `Stock Entry` query by it. Replace the Kikwetu list with the **Xflora-active types** (confirmed live):

```ts
export const ALLOWED_STOCK_ENTRY_TYPES = Object.freeze([
  'Receiving',
  'Shelving',
  'Bucket Transfer',
  'Grading',
  'Grading Rejects',
  'Intake Rejects',
  'Field Reject',
  'Packing',
  'Discard',
  'Quarantine',
  // 'Harvesting',  // exists on Xflora but not a mobile drawer workflow — include only if the dashboard should show it
]);
```
No code change needed in `useStockEntryTypes.ts` (it just re-exports the array). The dashboard picker + list pick these up automatically. **Confirm the final list with the user** — some of these (Quarantine, Field Reject) may not belong on the mobile dashboard.

**Note — dashboard filter ≠ v1 workflows.** The dashboard is a read-only history view of Stock Entry records that already exist on the backend. It's fine (and probably desirable) to keep `Grading`, `Packing`, and the reject types in this filter list even though those *creation* workflows are v2 — users can still see those entries. So the allowlist above intentionally includes types with no v1 create-screen. This is independent of the drawer.

### 5.2 Farm config (farm-only — **done**)

Xflora has **no station/warehouse concept — only a farm**. This is confirmed by the Flutter reference: `configure_user_farm_screen.dart:173` hides the warehouse/greenhouse typeahead `if (!isXflora)`, and `saveStation()` persists only `{"userFarm": farm}` (greenhouse left empty). Warehouse selection + the Kikwetu `GHSE`/`GH` and `Main`/`EX-LEWA` filters were Kikwetu-only and have been **removed**.

**What each v1 flow actually reads from config** (from the API contracts, §1):

| Flow | Config value in request body |
|---|---|
| Receiving (`receiving_entry`) | none |
| Rejects/Discard (`createDiscardEntry`) | none |
| Bucket Transfer (`transfer_bucket`) | none |
| Issuing (`issueBucketToSaleOrderItem`) | none |
| **Shelving** (`shelving_entry`) | **`farm`** (Farm doc `name`) |

So **only Shelving consumes config** — the single `farm` field. Everything is aligned to exactly that.

Refactor completed:
- **`src/stores/farm.ts`** (`useFarmStore`) replaces `stores/station.ts`. State: `farm: UserFarm | null`, `UserFarm = { farm, farmName }`. `farm` = Farm doc `name` (the value shelving sends); `farmName` = `farm_name` (display only).
- **`src/features/station/useFarm.ts`** (`useFarm()`) replaces `useStation.ts`. **`useWarehouses.ts` deleted** (Xflora has no warehouses).
- **`configure.tsx`** is farm-only: a Farm `Picker` (label `farm_name`, value `name`) + Save. No warehouse field, no filtering.
- **`useFarms.ts`** now fetches `['name','farm_name']` (Farm schema confirmed on live Xflora: `name` + `farm_name` Data field; 5 farms: Main, Sonjami Spring Fields, Africa Blooms, BloomValley, Xpressions Flora).
- **Storage key** `USER_STATION`→`USER_FARM` (`'userFarm'`); root `_layout.tsx` hydration validates `{ farm, farmName }`.
- **Guard:** only Shelving needs a farm. Receiving/Rejects/Bucket-Transfer/Issuing must **not** hard-gate on farm config (unlike Kikwetu, which gated every screen). Bucket Transfer (built) does not gate. Shelving will redirect to `/configure` if no farm is set.

### 5.3 Types
- Add `src/types/xflora.ts` (or extend `stock.ts`): `XfloraDiscardResponse`/`XfloraDiscardPayload` (see `xflora_discard_response.dart`), `XfloraReadySaleOrderItem` + list/response wrappers (see `xflora_ready_sale_order_items.dart`), and receiving/shelving/transfer payload types.
- Existing `types/discard.ts` is Kikwetu-shaped (`bunchId`, `discardReason`) — do not reuse for Xflora discard; Xflora discard is `bucket_id`-only with an age-based response.

### 5.4 Reusable primitives (already present — reuse as-is)
`BarcodeScannerOverlay` (camera QR), `AppBar`/`Field`/`Picker`/`Pill`/`Button`, `extractFrappeError`, `playSubmit`/`playError` (audio), `haptics`, the HID-JSON-scan input pattern, and the `useStation()` guard + station footer. **Gap:** no type-ahead component (Issuing needs one) — build a small `Autocomplete` primitive or add suggestions to `Field`.

---

## 6. v2 candidates & remaining verifications

### v2 candidates — deferred, ship via OTA once spec'd against the live backend
None have a Flutter reference; each needs a product UX + confirmed backend endpoint before building. Adding one = new screen file + uncomment its `WORKFLOW_ITEMS` line (§3) + OTA. What's known so far:

- **Staging** — cheapest to bring back. The codebase's only staging method is `createKaitetStagingEntry` → `POST /api/method/createStagingEntry` `{ box_label }`. If Xflora whitelists this method, a **single-scan** screen (scan box-label QR → post `{ box_label }`) mirrors the Kaitet pattern. **Verify:** does the method exist on Xflora, and what does the `box_label` QR contain? Note there is no `Staging` Stock Entry Type on Xflora, so confirm what document it creates.
- **Grading** — `Grading` + `Grading Rejects` Stock Entry Types are actively created on Xflora, so a grading flow exists on the backend (desktop/other tool), but **no mobile endpoint is identified** and Xflora's coldroom/bucket model differs from Kikwetu's bunch-based `grader3`. Needs a backend endpoint + UX spec.
- **Packing** — `Packing` type is active on Xflora. Kikwetu packing (`createOrUpdateFarmPackList`, farm pack list, OPL URL) is Kikwetu-specific and almost certainly not Xflora's flow. Needs a backend endpoint + UX spec.

### Remaining verifications (do during Phase 0 plumbing — don't block v1)
1. **Rejects vs Discards label** *(non-blocking — build proceeds).* Working assumption: the drawer's "Rejects" = the coldroom-bucket discard flow (`createDiscardEntry`, `coldroom_bucket`, age guard). Pending a one-line confirmation from the Xflora team; if they expect a *distinct* rejects workflow (backend has `Intake Rejects` / `Field Reject` / `Grading Rejects` types), that becomes a separate v2 item.
2. **Dashboard type list.** Confirm the `ALLOWED_STOCK_ENTRY_TYPES` set in §5.1 (esp. whether Quarantine / Field Reject / Harvesting belong on the mobile dashboard).
   *(Farm/warehouse config is resolved — Xflora is farm-only; see §5.2.)*

---

## 7. Build order (simplest → hardest) & "device-verified" criteria

v1 = the 5 reference-backed screens, simplest first. Each screen: new feature-folder hook(s) → screen → add to `WORKFLOW_ITEMS` → device test. Grading/Packing/Staging are v2 (§6) and not in this build order.

**Progress:** ⬜ not started · 🟨 code complete, awaiting device verification · ✅ device-verified

| # | Screen | Status | Why this order / "Device-verified" means |
|---|---|---|---|
| 0 | **Plumbing** | 🟨 | `clients.ts`/`client.ts`/`useClient.ts` removed; `allowedTypes.ts` = live Xflora set; data-driven drawer (`src/features/navigation/drawerItems.ts`) wired into `AppDrawer`; **farm-only config** — `stores/farm.ts` + `useFarm()` replace the station store, `useWarehouses` deleted, `configure.tsx` is a farm picker (§5.2); 6 dead Kikwetu workflow screens removed; `tsc` clean. **Verify on device:** login against `xflora.upande.com`, configure a farm, dashboard lists Xflora entry types, drawer routes resolve. |
| 1 | **Bucket Transfer** | 🟨 | Smallest, self-contained; establishes the sequential dual-scan harness. Files: `app/(app)/bucket-transfer.tsx` + `features/bucket-transfer/useXfloraBucketTransfer.ts` + `types/xflora.ts`. **Verify on device:** scan two real bucket QRs → `transfer_bucket` succeeds → a `Bucket Transfer` Stock Entry appears on the dashboard/desk; error path (same source/dest, bad QR) shows a pill + error sound. |
| 2 | **Receiving** | clone of existing RN receiving; adds toggles | Scan a real bucket QR (single, batch, and bunched modes) → `receiving_entry` succeeds → `Receiving` entry appears. Batch id persists across scans; bunched requires size+qty. Continuous-scan loop refocuses. |
| 3 | **Rejects (Discard)** | single-scan + result dialog | Scan a coldroom bucket → success dialog shows variety/stems/age and auto-dismisses; a `Discard` entry is created. A too-young bucket → blocking "Too Young" dialog, no entry created. |
| 4 | **Shelving** | reuses dual-scan harness; needs station.farm | Configure station first. Scan shelf QR then bucket QR → `shelving_entry` succeeds with correct `farm`; shelf persists for batch shelving; bucket field refocuses. |
| 5 | **Issuing** | heaviest; needs type-ahead + 3 calls | Orders load into type-ahead; selecting an order renders its packing list (issued rows greyed); scanning an allocated bucket issues it (`issueBucketToSaleOrderItem`) and the row flips to "Issued"; scanning an unallocated bucket errors. |

> Device-verified (all screens): tested on a **physical Android** device (STACK.md primary target) with a **real HID scanner** *and* the camera fallback, against the **live Xflora** instance, confirming the resulting document exists in Frappe — not just a success toast. Sounds/haptics fire on success/error. Continuous-scan screens refocus without manual taps.

---

## 8. Reference file index

**Flutter (read-only):**
- Widgets: `lib/features/stock/presentation/widgets/xflora/{xflora_receiving_entry, xflora_shelving_entry, xflora_bucket_transfer, xflora_issue_from_coldstore, xflora_discard_entry}.dart`
- Repo: `lib/features/stock/data/xflora_stock_repository.dart`
- Models: `lib/features/stock/data/model/xflora/{xflora_discard_response, xflora_ready_sale_order_items}.dart`
- API: `lib/core/data/api/api_service.dart` (methods per §1 table)
- Routing/mapping: `lib/core/screens/entry_list_view.dart`, `lib/core/util/instance_mapper.dart` (Xflora → `https://xflora.fsn.frappe.cloud`)

**RN closest starting points:**
- Receiving → `src/app/(app)/kikwetu/receiving.tsx` (+ dual-input scan pattern)
- Discard/Rejects → `src/app/(app)/kikwetu/discards.tsx` (skeleton only)
- Dual-scan → `src/app/(app)/kikwetu/grading.tsx` (`ScanSlot`/`maybeSubmit`)
- List-match-scan → `src/app/(app)/kikwetu/packing.tsx`
- HTTP/hook pattern → `src/lib/api.ts` + any `src/features/**/useCreate*.ts`
