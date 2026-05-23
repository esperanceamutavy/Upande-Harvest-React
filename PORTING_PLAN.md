# kikwetu-harvest-rn — Porting Plan

> Source: `~/projects/kikwetu-harvest-flutter` (Upande Harvest v2.0.0)
> Scope: Kikwetu client only for v1. Multi-tenant architecture preserved.
> Status legend: ⬜ not started · 🟨 in progress · ✅ done · ⏸️ deferred

---

## Phase 0 — Foundation

✅ **0.1** Demo content removed (`src/components`, `src/hooks`, `src/constants`, `src/global.css`, `src/app/explore.tsx`)
✅ **0.2** Planning docs in place (`AGENTS.md`, `STACK.md`, `PORTING_PLAN.md`, `RECON.md`)
✅ **0.3** Install stack deps: zustand, @tanstack/react-query, axios, react-hook-form, zod, @hookform/resolvers, @react-native-async-storage/async-storage, expo-secure-store, expo-camera, expo-av, expo-haptics, react-native-webview, @sentry/react-native (note: @expo-google-fonts/inter replaced by @tamagui/font-inter in 0.4)
✅ **0.4** Install Tamagui (`@tamagui/config`, `tamagui`, plus the expo-router config) and configure theme tokens with Kikwetu colors (#44433e, #699dcd, #48773E, #F4F4F6)
✅ **0.5** `src/lib/storage.ts` — wrappers for AsyncStorage + SecureStore
✅ **0.6** `src/lib/api.ts` — axios instance with auth header interceptor and error normalization (Frappe error shape → typed `ApiError`)
✅ **0.7** `src/lib/audio.ts` — expo-av singleton player, plus copy `beep.mp3`, `submit.mp3`, `error.mp3` from `~/projects/kikwetu-harvest-flutter/assets/`
✅ **0.8** `src/lib/haptics.ts` — expo-haptics wrappers (heavy = warning, light = scan)
✅ **0.9** `src/lib/clients.ts`, `src/lib/instanceMapper.ts`, `src/features/station/useClient.ts` hook
✅ **0.10** Zustand stores: `src/stores/auth.ts`, `src/stores/client.ts`, `src/stores/station.ts`
✅ **0.11** Auth gate in `src/app/_layout.tsx` (redirect to login if no API key in SecureStore)
⬜ **0.12** Sentry init — new RN project, DSN in `.env`, `.env.example` committed
⬜ **0.13** Update `README.md` (how to run, env setup, link to STACK.md and PORTING_PLAN.md)

**Phase 0 acceptance:** App launches, shows login screen when no creds, navigates to a blank dashboard when creds present. No features yet, but the shell works on both iOS and Android via Expo Go.

---

## Phase 1 — Auth

⬜ **1.1** `src/app/(auth)/login.tsx` — login form: URL, email, password. Pre-fill URL and email from AsyncStorage (`instanceurl_backup`, `email_backup`)
⬜ **1.2** URL normalization: try `https://` first with a HEAD check (5s timeout), fall back to `http://`. Match Flutter `auth_repository.dart:12-43` behavior.
⬜ **1.3** Login flow: POST `/api/method/login` → cookie in transient memory → POST `frappe.core.doctype.user.user.generate_keys` → store api_key + api_secret in SecureStore → discard cookie
⬜ **1.4** Show client name on login screen once URL is entered (via `instanceMapper`)
⬜ **1.5** Auth gate reads SecureStore on app launch, hydrates Zustand auth store
⬜ **1.6** Logout: clear SecureStore (except `email_backup`, `instanceurl_backup` in AsyncStorage)
⬜ **1.7** Logo on login screen — copy `upande_logo.png` from Flutter assets

**Phase 1 acceptance:** Can log in to a Kikwetu Frappe instance, app remembers credentials across restart, logout works, wrong password shows error. No cookie is ever persisted.

**Implementation note:** Frappe's `generate_keys` rotates the secret if a key already exists. Document this in `src/features/auth/README.md`. Acceptable trade-off because this app is the only consumer of the per-worker API key.

---

## Phase 2 — App shell

⬜ **2.1** `src/app/(app)/_layout.tsx` — drawer or tab layout
⬜ **2.2** Dashboard route — fetch `GET /api/resource/Stock Entry?fields=["*"]&limit=1000&order_by=creation desc` via TanStack Query
⬜ **2.3** Filter by stock entry type — dropdown driven by `GET /api/resource/Stock Entry Type?fields=["name"]&limit=1000`
⬜ **2.4** Filter by date range
⬜ **2.5** Pull-to-refresh + empty state + error state
⬜ **2.6** Drawer menu — list of Kikwetu workflows (placeholder routes filled in Phase 4)
⬜ **2.7** ERP Desk webview screen — `react-native-webview` loading `{instanceurl}/app/home` with `Authorization` header injection

**Phase 2 acceptance:** Real Kikwetu stock entries visible, list refreshes, drawer navigates to placeholder screens.

---

## Phase 3 — Configure Station

⬜ **3.1** Farm dropdown — `GET /api/resource/Farm?fields=["*"]&limit=1000`
⬜ **3.2** Warehouse dropdown — `GET /api/resource/Warehouse?...&filters=[["disabled","=","0"]]`
⬜ **3.3** Kikwetu-specific filtering logic — port from `configure_user_farm_screen.dart:299` (Main / EX-LEWA logic)
⬜ **3.4** Persist `userStation` JSON to AsyncStorage
⬜ **3.5** `useStation()` hook for downstream screens

**Phase 3 acceptance:** User selects farm + greenhouse, save persists across restarts, downstream screens read this and pre-populate.

---

## Phase 4 — Kikwetu workflows (in order)

### 4.1 ⬜ Harvesting — template-setter (every later workflow copies its pattern)
Form: variety, section, harvester (auto from section), stem length, qty. Camera scan for bucket QR. Validate bucket via `GET /api/resource/Bucket QR Code?filters=...`. Submit via `POST /api/resource/Stock Entry`. Audio: submit.mp3 success, error.mp3 fail. Haptics: heavy on warning. Day-of-week symbol (`@!?#+*/`).

**Acceptance:** A harvester can complete a real harvesting entry on the Kikwetu staging instance using only the RN app.

### 4.2 ⬜ Receiving — introduces HID scanner support
Camera scan OR HID scan (hidden focused TextInput watching for JSON ending in `}`). Validate bucket "In Use" state. Submit via `POST /api/method/createReceivingStockEntry`.

**Acceptance:** Receiving works with both phone camera AND the HID hardware scanner.

### 4.3 ⬜ Grading + Grading Test (two screens, shared component)
Two-scan: grader badge QR → bunch label QR. Validate bunch not already graded via `GET /api/resource/Stock Entry?filters=[["custom_bunch_id","=","..."]]`. Submit via `POST /api/method/createGradingStockEntry` (or `...Test`).

**Acceptance:** Both grading flows work; double-scan prevention works.

### 4.4 ⬜ Rejects (no scanner)
Fetch reasons + varieties via `POST /api/method/getRejectReasonsWithVarieties`. Multi-row form. Submit via `POST /api/method/createRejectEntry`.

**Acceptance:** Supervisor can submit multi-line reject entry.

### 4.5 ⬜ Discards
Discard reason dropdown (Lack of market / Disease). Scan bunch QR. Validate not packed/discarded. Submit via `POST /api/method/createDiscardEntry`.

**Acceptance:** Discards rejected for already-packed bunches.

### 4.6 ⬜ Packing (most complex)
Scan pick-list QR (URL format) → load pick list + farm pack list. Local tally per `variety|UOM|stemLength`. Scan bunch QR → validate → add to tally. Submit via `POST /api/method/createOrUpdateFarmPackList`. Port the compound-key state logic from `kikwetu_packing_stock_entry.dart:173-380` carefully.

**Acceptance:** Pick list loads, scanning increments correct row, submit creates farm pack list in Frappe.

### 4.7 ⬜ Dispatch
Typeahead for open truck manifests via `GET /api/method/getOpenTruckLoadingManifest`. Scan box label QR → `POST /api/method/loadTruck`.

**Acceptance:** Dispatch staff can load boxes against a manifest.

---

## Phase 5 — Supervisor reports

⬜ **5.1** Harvesting report — `GET /api/method/get_harvesting_summary?from_date=&to_date=&warehouse=`
⬜ **5.2** Receiving report — `GET /api/method/get_receiving_summary?from_date=&to_date=&farm=`
⬜ **5.3** Display — read-only tables, filters only

---

## Phase 6 — Polish & Stock Entry Detail

⬜ **6.1** Stock Entry detail screen — `GET /api/resource/Stock Entry/{id}`
⬜ **6.2** QR display on detail (no Bluetooth print — v1.1)
⬜ **6.3** ERP Desk webview polish
⬜ **6.4** Error handling pass — every API call has a user-visible error state
⬜ **6.5** Loading states pass
⬜ **6.6** Empty states pass

---

## Phase 7 — Multi-tenant stubs

⬜ **7.1** Stub screens for Kaitet/Mona/Xflora workflows — "Not yet ported" placeholders
⬜ **7.2** Drawer respects client identity — Kikwetu users don't see Kaitet's Unified Check-In, etc.

---

## Phase 8 — Build & release

⬜ **8.1** EAS Build profile for `kikwetu` variant
⬜ **8.2** EAS Update channel for OTA
⬜ **8.3** App icon & splash (use `upande_logo.png` for now)
⬜ **8.4** Play Store internal track upload
⬜ **8.5** Pilot test with one Kikwetu user

---

## Deferred to v1.1

⏸️ Bluetooth thermal printing (requires dev build)
⏸️ Kaitet, Mona, Xflora full workflow ports (after Kikwetu is stable)

---

## Deferred to v2 (or never)

⏸️ Pagination beyond `limit=1000`
⏸️ Offline mode (Flutter doesn't have it either)
⏸️ Per-client logos