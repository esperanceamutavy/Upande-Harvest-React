# Kikwetu Harvest Flutter — Comprehensive Reconnaissance Report
> Generated 2026-05-22 for React Native + Expo port of the Kikwetu client (v1.0 scope only)

---

## 1. App Purpose & Users

**App name in pubspec:** `upandeharvest` (version 2.0.0+0, display name "Upande Harvest", `lib/main.dart` line 1–70).

**What it does:** A farm operations data-capture app for cut-flower farms in Kenya. Farm workers and supervisors use it to record every step in the flower supply chain: harvesting → receiving → grading → packing → dispatch, plus side workflows for rejects, discards, shelving, quality checks and agriculture tasks. All data is persisted in a Frappe/ERPNext backend.

**User roles implied by the UI:**
- **Field workers** (harvesters) — use Harvesting entry; scan bucket QR codes in the field.
- **Receiving/grading staff** — scan bunches at the post-harvest receiving station.
- **Graders/packers** — use Grading and Packing screens, scan bunch QR codes.
- **Supervisors** — access the Harvesting Report and Receiving Report screens (drill-down dashboards, `kikwetu_harvesting_report.dart`, `kikwetu_receiving_report.dart`).
- **Dispatch/logistics staff** — KikwetuDispatch screen, scan box labels against truck manifests.
- **Gate staff (Kaitet only)** — Unified Check-In, visitor management, tractor gate entry.

**Core daily workflow for Kikwetu:**
1. Harvester fills a bucket of stems in greenhouse → scans bucket QR → submits Harvesting entry.
2. Bucket moves to post-harvest → receiving staff scans bucket → submits Receiving entry.
3. Grader scans their own QR badge, then scans bunch label QR → system validates → creates Grading entry.
4. Packer scans order pick-list QR (URL-style), then scans bunch QR labels → packs against the pick list.
5. Discards/Rejects can be recorded at any stage.
6. Dispatch staff selects truck manifest, scans box label QR → records dispatch.

---

## 2. Multi-Tenant Architecture Deep-Dive

### Login and URL resolution flow

1. **Login screen** (`lib/features/auth/presentation/screens/login_screen.dart`, line 122–147): user types a bare URL (e.g. `kikwetu.upande.com`), email, password.
2. `AuthRepository.login()` (`lib/features/auth/data/auth_repository.dart`, line 12–43): tries `https://` first with a 5-second HEAD check; falls back to `http://`. The working full URL is written to SharedPreferences key `"instanceurl"` at line 40.
3. On HTTP 200 from Frappe's `/api/method/login`, the `set-cookie` header is parsed for the `sid=<value>` (`auth_bloc.dart` line 34). The raw full cookie string is stored under key `"cookie"` (line 41).
4. `HomeDashboad` → `EntryListView` is shown on next app launch if `cookie` is non-empty (`main.dart` line 23–24).

### Client identifier resolution

`lib/core/util/instance_mapper.dart` (18 lines) is a pure static lookup map: `URL → "Kikwetu" | "Kaitet" | "Demo" | "Mona" | "Xflora"`. No enum, just strings. Called as `InstanceMapper.getTitleByUrl(instanceUrl)`.

Registered URLs:
| URL | Client |
|-----|--------|
| `https://kikwetu.upande.com` | Kikwetu |
| `https://kikwetu-production.jh.frappe.cloud` | Kikwetu |
| `https://kaitet-group.upande.com` | Kaitet |
| `https://kaitet-group.c.frappe.cloud` | Kaitet |
| `https://upande-kaitet-group-staging.frappe.cloud` | Kaitet |
| `https://upande-insights.frappe.cloud` | Demo |
| `http://81.17.101.149:8082` | Kaitet |
| `http://192.168.43.97:8001` | Kaitet |
| `https://mona-flowers-staging.upande.com` | Mona |
| `https://xflora.fsn.frappe.cloud` | Xflora |

### SharedPreferences keys relevant to multi-tenancy

| Key | Set at | Used at |
|-----|--------|---------|
| `instanceurl` | `auth_repository.dart:40` | everywhere in `ApiService` |
| `cookie` | `auth_bloc.dart:41` | every API call header |
| `fullname` | `auth_bloc.dart:43` | `EntryListView` drawer |
| `email` | `auth_bloc.dart:48` | (stored only) |
| `email_backup` | `auth_bloc.dart:45` | pre-fill login field on next open |
| `instanceurl_backup` | `auth_bloc.dart:46` | pre-fill URL field on next open |
| `userStation` | `configure_user_farm_screen.dart:262` | `EntryListView` farm/greenhouse display |

### Every client-name comparison in the codebase

All comparisons are in two files only:

**`lib/core/screens/configure_user_farm_screen.dart`** (lines 33–311):
- Line 35: `title == "Xflora"` — hide greenhouse station field for Xflora
- Line 296: `title == "Kaitet" || title == "Demo"` — filter stations by farm prefix
- Line 299: `title == "Kikwetu"` — filter by Main/EX-LEWA logic
- Line 307: `title == "Mona"` — filter stations by farm prefix

**`lib/core/screens/entry_list_view.dart`** (lines 242–742):
- Line 242: `!= "Xflora"` — show Harvesting menu item
- Lines 267/273/279: Kikwetu / Kaitet|Demo / Mona harvesting screens
- Lines 310/313/317/320: Kikwetu / Kaitet|Demo / Mona / Xflora receiving screens
- Line 332: `"Kaitet"` → show "Quality", else "Rejects" (menu label)
- Lines 348/354: Kikwetu reject / Kaitet quality screens
- Lines 362/381: Xflora bucket transfer
- Lines 387–391, 416/420/423: Shelving (Kaitet|Demo|Mona|Xflora)
- Lines 430/431: Bucket Requests (Kaitet|Demo)
- Lines 463–465, 490/493: Issuing (Kaitet|Demo|Xflora)
- Lines 521/524: Grading (Kikwetu / Kaitet|Demo)
- Lines 553/557: Packing (Kikwetu / Kaitet|Demo)
- Lines 586/614: Staging/Loading (Kaitet|Demo)
- Lines 642/645: Dispatch (Kikwetu / Kaitet|Demo)
- Lines 668/681/684: Discards (Kikwetu / Kaitet / Xflora)
- Lines 706/707: Checkin (Kaitet only)
- Lines 713–715: Agriculture (Kaitet|Demo)

No client comparisons exist outside these two files.

---

## 3. Kikwetu-Specific Feature Inventory

### 3.1 KikwetuHarvestingStockEntry
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_harvesting_stock_entry.dart`
**Purpose:** Farm worker fills variety, section (maps to harvester employee ID), stem length, quantity, scans bucket QR; validates bucket availability then posts a Stock Entry of type "Harvesting".
**API endpoints called:**
- `GET /api/resource/Warehouse/{greenhouse}` → fetches greenhouse data (varieties, sections) via `GetKikwetuWarehouseData` event
- `GET /api/resource/Stem Length?fields=["length"]` → via `GetStemLengthsEvent`
- `GET /api/resource/Bucket QR Code?filters=...` → validates bucket via `GetKikwetuBucketById`
- `POST /api/resource/Stock Entry` → body shape: `{stock_entry_type, custom_breeder, custom_grower, custom_harvester, custom_block__bed_number, custom_greenhouse, custom_farm, custom_stem_length, custom_bunch_id, order_pick_list, items:[{item_code, qty, s_warehouse, t_warehouse, uom, ...}], custom_stock_uom, custom_bucket_id, to_warehouse, company, custom_business_unit}` (`api_service.dart:44–80`)
**BLoCs consumed:** `StockBloc` — `GetKikwetuWarehouseData`, `GetStemLengthsEvent`, `GetKikwetuBucketById`, `AddMaterialReceiptEvent`
**Native features:** Camera barcode scanning via `BarcodeScanner`; audio feedback (`submit.mp3`, `error.mp3`); vibration on warning.
**Shows daily harvesting symbol** — day-of-week mapped to `@!?#+*/` characters displayed to harvester.

### 3.2 KikwetuReceivingStockEntry
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_receiving_stock_entry.dart`
**Purpose:** Scan-and-go: worker scans bucket QR at receiving station; validates bucket is "In Use" then creates a Receiving stock entry automatically.
**API endpoints called:**
- `GET /api/resource/Bucket QR Code?filters=...` → validate bucket (`GetKikwetuBucketById`)
- `GET /api/method/fetch_greenhouse_by_bucket_id?bucket_id=X` → optional: fetch last greenhouse (`GetGreenhouseByBucketId`)
- `POST /api/method/createReceivingStockEntry` → body: `{"bucket_id": "..."}` (`api_service.dart:1050–1073`)
**BLoCs consumed:** `StockBloc` — `GetKikwetuBucketById`, `GetGreenhouseByBucketId`, `CreateKikwetuReceivingEntry`
**Native features:** Camera/HID-mode barcode scanner (listens on TextField for JSON ending with `}`); audio feedback.
**Note:** Supports hardware barcode scanners via `_handleScannerInput()` listener that detects complete JSON strings in the text field.

### 3.3 KikwetuGradingStockEntry
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_grading_stock_entry.dart`
**Purpose:** Grader scans their own QR badge, then scans bunch QR to record grading. Validates bunch has not been graded already. Links to a "Grading 2" variant (test mode).
**API endpoints called:**
- `GET /api/resource/Stock Entry?filters=[["Stock Entry","custom_bunch_id","=","..."]]&fields=[...]` → validate bunch via `GetKikwetuEntryByBunch`
- `POST /api/method/createGradingStockEntry` → body: `{farm, stock_entry_type, graded_by, stem_length, bunch_size, bunch_id, variety, qty}` (`api_service.dart:908–948`)
**BLoCs consumed:** `StockBloc` — `GetKikwetuEntryByBunch`, `CreateKikwetuGradingEntry`
**Native features:** Camera barcode scanner; audio; vibration. QR data contains `grader` key for grader badge, `bunch_id`/`variety`/`bunch_size`/`stem_length` for bunch label.

### 3.4 KikwetuGradingStockEntryTest
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_grading_stock_entry_test.dart`
**Purpose:** Simplified grading variant — only needs farm, stock_entry_type, bunch_id (no stem/variety params). Presumably for testing or a second workflow variant.
**API endpoints called:**
- `GET /api/resource/Stock Entry?...` → `GetKikwetuEntryByBunchTest`
- `POST /api/method/createGradingStockEntryTest` → body: `{farm, stock_entry_type, bunch_id}` (`api_service.dart:950–978`)

### 3.5 KikwetuPackingStockEntry
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_packing_stock_entry.dart`
**Purpose:** Packer first scans an Order Pick List QR (URL format containing `order-pick-list`), loads the pick list table, then scans bunch QR labels one by one. Tracks required vs. scanned vs. packed counts per variety/stem-length/UOM combo. On submission calls createOrUpdateFarmPackList.
**API endpoints called:**
- `GET /api/method/get_pick_list_with_farm_pack_list?pick_list_id=X` → `GetKikwetuOrderPickListWithFarmPackList`
- `GET /api/resource/Stock Entry?filters=[["custom_bunch_id","=","..."]]` → `GetKikwetuEntryByBunch`
- `POST /api/method/createOrUpdateFarmPackList` → body: `{custom_farm, custom_customer, custom_sales_order, custom_order_pick_list, items:[{item_code, bunch_uom, bunch_quantity, source_warehouse, sales_order_id, customer_id, custom_number_of_stems, stem_length, box_id, bunch_id}]}` (`api_service.dart:520–553`)
**BLoCs consumed:** `StockBloc` — `GetKikwetuOrderPickListWithFarmPackList`, `GetKikwetuEntryByBunch`, `CreateOrUpdateKikwetuFarmPackList`
**Native features:** Camera barcode scanner; audio; vibration. No Bluetooth.

### 3.6 KikwetuDispatch
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_dispatch.dart`
**Purpose:** Dispatch staff selects open truck-loading manifest from a typeahead, then scans box label QR codes to record dispatch. Each box QR contains `{box_number, order_pick_list, customer, po_no, date, farm_pack_list}`.
**API endpoints called:**
- `GET /api/method/getOpenTruckLoadingManifest` → `GetOpenTruckLoadingManifests` (`api_service.dart:802–822`)
- `POST /api/method/loadTruck` → body: `{manifest_entry_name, box_number, order_pick_list_id, customer_id, sale_order_id, farm_pack_list_id, date}` (`api_service.dart:763–800`)
**BLoCs consumed:** `StockBloc` — `GetOpenTruckLoadingManifests`, `UpdateTruckLoadingManifest`
**Native features:** Camera barcode scanner; vibration.

### 3.7 KikwetuDiscardStockEntry
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_discards_stock_entry.dart`
**Purpose:** Worker selects discard reason (Lack of market / Disease), scans bunch QR, validates not yet packed or already discarded, then creates discard entry.
**API endpoints called:**
- `GET /api/resource/Stock Entry?filters=[["custom_bunch_id","=","..."]]` → `GetKikwetuEntryByBunch`
- `POST /api/method/createDiscardEntry` → body: `{userFarm, bunchId, discardReason}` (`api_service.dart:1210–1238`)
**BLoCs consumed:** `StockBloc` — `GetKikwetuEntryByBunch`, `CreateKikwetuDiscardEntry`
**Native features:** Camera barcode scanner; audio; vibration.

### 3.8 KikwetuRejectStockEntry
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_reject_stock_entry.dart`
**Purpose:** Supervisor-oriented form: select variety, reject type (Harvesting/Grading), then search and add reject reasons with quantities. Data comes from server-side method.
**API endpoints called:**
- `POST /api/method/getRejectReasonsWithVarieties` → body: `{greenhouse_name: "..."}` → returns reject reasons + variety list (`api_service.dart:592–614`)
- `POST /api/method/createRejectEntry` → body: `{customFarm, greenhouse, rejectType, variety, rejects:[{reason, quantity}]}` (`api_service.dart:824–858`)
**BLoCs consumed:** `StockBloc` — `GetRejectReasonsWithVarieties`, `AddRejectEntry`
**Native features:** None (no barcode scanning). Audio; vibration on warning.

### 3.9 KikwetuHarvestingReport
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_harvesting_report.dart`
**Purpose:** Supervisor summary view — select greenhouse, date range, fetch harvest report with per-variety breakdown.
**API endpoints called:**
- `GET /api/method/get_harvesting_summary?from_date=...&to_date=...&warehouse=...` → `GetGreenHouseSupervisorSummary` (`api_service.dart:711–735`)
**BLoCs consumed:** `StockBloc` — `GetGreenHouseSupervisorSummary`, `GetWarehousesEvent`

### 3.10 KikwetuReceivingReport
**File:** `lib/features/stock/presentation/widgets/kikwetu/kikwetu_receiving_report.dart`
**Purpose:** Supervisor summary view — select farm, date range, fetch receiving summary.
**API endpoints called:**
- `GET /api/method/get_receiving_summary?from_date=...&to_date=...&farm=...` → `GetReceivingSupervisorSummary` (`api_service.dart:737–762`)
**BLoCs consumed:** `StockBloc` — `GetReceivingSupervisorSummary`

### 3.11 CustomQRWidget
**File:** `lib/features/stock/presentation/widgets/kikwetu/custom_qr.dart`
**Purpose:** Renders a QR code (using `qr_flutter`) via a `CustomPainter`; also exposes a `getImage()` static method that renders QR off-screen for Bluetooth thermal printing in `StockEntryDetailsScreen`.
**Native features:** Used in `stockentry_details_screen2.dart` for Bluetooth printing (v1.1 scope).

---

## 4. Shared Feature Inventory

### 4.1 LoginScreen
**File:** `lib/features/auth/presentation/screens/login_screen.dart`
**Purpose:** Single login form for all clients — URL, email, password fields; pre-fills from `email_backup`/`instanceurl_backup`; submits `LoginEvent` to `AuthBloc`.
**API endpoints:**
- `POST /api/method/login` → form body `{usr, pwd}` (`api_service.dart:22–33`)
**BLoCs:** `AuthBloc`

### 4.2 EntryListView (main dashboard + navigation drawer)
**File:** `lib/core/screens/entry_list_view.dart`
**Purpose:** Shows list of recent Stock Entries filtered by type and date range; left-drawer menu for all workflow navigation; client branching happens here.
**API endpoints:**
- `GET /api/resource/Stock Entry?fields=["*"]&limit=1000&order_by=creation%20desc` → `GetStockEntriesEvent`
- `GET /api/resource/Stock Entry Type?fields=["name"]&limit=1000` → `GetStockEntryTypeEvent`
**BLoCs:** `StockEntryBloc`, `StockBloc`, `AuthBloc`

### 4.3 ConfigureUserFarmScreen
**File:** `lib/core/screens/configure_user_farm_screen.dart`
**Purpose:** User selects farm and greenhouse/station. Saves JSON `{userFarm, userGreenhouse}` to SharedPreferences key `"userStation"`. Client-specific station filtering logic is here.
**API endpoints:**
- `GET /api/resource/Farm?fields=["*"]&limit=1000` → `GetFarmsEvent`
- `GET /api/resource/Warehouse?fields=["*"]&filters=[["disabled","=","0"]]&limit=5000` → `GetWarehousesEvent`
**BLoCs:** `StockBloc`

### 4.4 StockEntryDetailsScreen
**File:** `lib/features/stock/presentation/screens/stockentry_details_screen2.dart`
**Purpose:** Displays details of a Stock Entry; shows QR code; has Bluetooth thermal printer support (v1.1 scope — `flutter_blue_plus`).
**API endpoints:**
- `GET /api/resource/Stock Entry/{entryID}?fields=["*"]` → `GetStockEntryDetails`
**BLoCs:** `StockEntryBloc`
**Native features:** Bluetooth (`flutter_blue_plus`), permissions (`permission_handler` — bluetoothScan, bluetoothConnect, location, nearbyWifiDevices), QR generation (`custom_qr.dart`).

### 4.5 BarcodeScanner
**File:** `lib/features/barcode/presentation/screens/barcode_scanner.dart`
**Purpose:** Shared camera QR/barcode scanning screen using `native_barcode_scanner` package. Returns scanned string to caller. Plays `beep.mp3` on scan.
**Native features:** Camera; audio. Uses `BarcodeScannerWidget` from `native_barcode_scanner`.

### 4.6 AppWebView (ERP Desk)
**File:** `lib/core/screens/inappwebview.dart`
**Purpose:** Embedded WebView loading `{instanceurl}/app/home` so users can access the full Frappe ERP from within the app.
**Native features:** `flutter_inappwebview`, `url_launcher`.

### 4.7 HomeDashboad
**File:** `lib/core/screens/home_dashboad.dart`
**Purpose:** Thin wrapper that just renders `EntryListView` with a background image. Previously had bottom navigation (commented out).

### 4.8 GradingBottomDialog
**File:** `lib/core/screens/gradingbottomdialog.dart`
**Purpose:** Appears to be a shared dialog for grading workflows (exact usage not traced; not imported in currently active entry screens).

### 4.9 BluetoothDevicesMenu
**File:** `lib/core/screens/bluetooth_devices_menu.dart`
**Purpose:** Screen for listing and connecting to Bluetooth thermal printers (v1.1 scope).

### 4.10 BarcodeErrorView / BarcodeLabelView
**Files:** `lib/features/barcode/presentation/screens/barcode_error_view.dart`, `barcode_label_view.dart`
**Purpose:** Error and label display screens for barcode workflows (exact usage not traced in Kikwetu screens).

---

## 5. Other-Client Widgets Catalogue

### Kaitet widgets (`lib/features/stock/presentation/widgets/kaitet/`)
| File | Description |
|------|-------------|
| `kaitet_agriculture.dart` | Production projection, field rejects, revised forecast entry for Kaitet agriculture supervisors |
| `kaitet_discard_entry.dart` | Scan bucket QR to create a discard entry (bucket-centric, unlike Kikwetu's bunch-centric) |
| `kaitet_dispatch_entry.dart` | Scan truck and box-label QR to dispatch flowers (uses truck list from `fetchDispatchTrucks`) |
| `kaitet_grading_stock_entry.dart` | Scan bucket → scan bunch QR → record grading entry with rose type and source warehouse |
| `kaitet_harvesting_stock_entry.dart` | Scan bucket QR to create harvest entry with stem length, item code, cut stage |
| `kaitet_issue_from_coldstore.dart` | Issue buckets from coldstore to sales order items (pick-list based) |
| `kaitet_loading_entry.dart` | Load trolleys into trucks for dispatch |
| `kaitet_packing_stock_entry.dart` | Packing based on open pick-lists; scan bucket QR against pick list |
| `kaitet_production_projection.dart` | View and edit weekly production projections per greenhouse/variety |
| `kaitet_quality_page.dart` | Quality check: scan bucket, record solution levels, quality parameters with photos, submit batch quality or release from quarantine |
| `kaitet_receiving_stock_entry.dart` | Scan bucket QR with optional batch ID to receive flowers from farm |
| `kaitet_sales_allocation_list.dart` | View allocated buckets / bucket requests for dispatch planning |
| `kaitet_shelving_entry.dart` | Scan shelf ID and bucket QR to record cold-store shelving |
| `kaitet_staging_entry.dart` | Scan box label to record staging before dispatch |
| `kaitet_unified_checkin.dart` | Gate security: search visitor/staff/contractor appointments, check in/out with transport mode, walk-in creation, daily summary |

### Mona widgets (`lib/features/stock/presentation/widgets/mona/`)
| File | Description |
|------|-------------|
| `mona_harvesting_stock_entry.dart` | Kaitet-style harvest: scan bucket, select section, harvester, item code, quantity |
| `mona_receiving_in_stock_entry.dart` | Scan bucket to create a "Receiving In" stock entry |
| `mona_shelving_entry.dart` | Scan shelf + bucket to shelve; uses `shelving_entry` endpoint |

### Xflora widgets (`lib/features/stock/presentation/widgets/xflora/`)
| File | Description |
|------|-------------|
| `xflora_bucket_transfer.dart` | Scan source + destination bucket QR to transfer contents between buckets |
| `xflora_discard_entry.dart` | Scan bucket to discard (bucket-centric discard) |
| `xflora_issue_from_coldstore.dart` | Issue buckets from coldstore similar to Kaitet |
| `xflora_receiving_entry.dart` | Scan bucket with optional batch, bunched flag, bunch size, quantity |
| `xflora_shelving_entry.dart` | Scan shelf + bucket to shelve |

---

## 6. Core Layer Breakdown

### lib/core/data/api/api_service.dart
**HTTP client:** `package:http` (not Dio). All requests are raw `http.get`, `http.post`, `http.put`. No interceptors, no retry logic.

**Auth pattern:** Cookie-based. After login, the raw `Set-Cookie` header value (e.g. `sid=abc123; Path=/; HttpOnly, system-user=yes; ...`) is stored verbatim as `"cookie"` in SharedPreferences. Every subsequent request sets `headers["Cookie"] = cookies` before the call. The `headers` map is a mutable instance variable on `ApiService` — **shared across all requests on the same instance** (potential race condition for concurrent requests).

**Request body encoding:**
- Form-encoded for `/api/method/login` (uses default `http.post` body)
- JSON-encoded (`jsonEncode`) for all other POST/PUT, with `Content-Type: application/json`
- GET requests use query string params, manually URI-encoded

**Base URL:** Read from `SharedPrefsHelper.prefs.getString("instanceurl")` at the start of every method call.

**No Dio.** No request interceptors. No centralized error handling. Errors throw `AuthenticationException`, `BadResponseException`, `LoginException`.

### lib/core/data/shared_prefs/shared_preferences.dart
A static singleton `SharedPrefsHelper` initialised in `main()`. All keys (see Section 9).

### lib/core/theme.dart
```dart
primaryColor = const Color(0xff44433e)      // Dark charcoal
secondaryAccent = const Color(0xff699dcd)   // Steel blue
onSecondary = const Color(0xff48773E)       // Dark green
scaffoldBackgroundColor = const Color(0xffF4F4F6) // Near-white
```
**Font:** `google_fonts` package, `GoogleFonts.inter()` as `fontFamily`.
**ElevatedButton:** Full-width (`Size.fromHeight(54)`), charcoal background, white text, 12px radius.
**InputDecoration:** All inputs filled with `Colors.grey[50]`, 8px radius, 14px label, `OutlineInputBorder` with `Color(0xffD9D9D9)`.

### lib/core/util/

| File | Purpose |
|------|---------|
| `instance_mapper.dart` | URL-to-client-name static map (described in §2) |
| `navigate.dart` | Extension methods on `BuildContext`: `openScreen(widget)` returns a `Future<T>` via `Navigator.push`, `pushAndRemoveUntil(widget)` |
| `date_formatter.dart` | `DateFormatter.formatDate(DateTime)` — formats to locale-friendly string |
| `greeting.dart` | `Greeting.getGreeting()` — returns "Good morning/afternoon/evening" based on time |
| `logger.dart` | Imports `path_provider` but main usage is via the `logger` package's `Logger()` class |
| `printingutil.dart` | Bluetooth thermal printing utility (v1.1 scope) |
| `uh_bluetooth_manager.dart` | Manages `flutter_blue_plus` BLE device scanning and connection (v1.1 scope) |

### lib/core/widgets/

| File | Description |
|------|-------------|
| `cicular_loader.dart` | `Loader` widget — a `CircularProgressIndicator` wrapped in a `SizedBox(width:16, height:16, strokeWidth:2)`. Used inline in labels while loading. |

### Audio playback
**Package:** `audioplayers: ^6.4.0`
**Assets:** `assets/beep.mp3`, `assets/error.mp3`, `assets/submit.mp3`
**Pattern:** `AudioPlayer().play(AssetSource('beep.mp3'))` — a new `AudioPlayer` instance is created per play call (no reuse/disposal).
**Where triggered:**
- `beep.mp3`: `BarcodeScanner` (`barcode_scanner.dart:45`) — on every successful scan
- `submit.mp3`: all workflow screens — on `'Success'` snackbar type (e.g. `kikwetu_harvesting_stock_entry.dart:73`, `kikwetu_receiving_stock_entry.dart:137`, etc.)
- `error.mp3`: all workflow screens — on `'Error'` snackbar type

### Vibration
**Package:** `vibration: ^2.0.1`
**Pattern:** `Vibration.vibrate(duration: 200)` — 200ms single pulse.
**Where triggered:**
- Login screen: `login_screen.dart:286` — on form validation failure
- `configure_user_farm_screen.dart:280` — on form validation failure (save station)
- All workflow screens (harvesting, receiving, grading, packing, discards, dispatch, rejects): on `'Warning'` type snackbar (e.g. `kikwetu_harvesting_stock_entry.dart:82`, etc.)
- Kaitet dispatch: `kaitet_dispatch_entry.dart` and Kikwetu dispatch on bad scan

---

## 7. API Layer

### Base URL
Stored in SharedPreferences key `"instanceurl"` after login. Read at call time by every method in `ApiService` via `SharedPrefsHelper.prefs.getString("instanceurl")`.

### Auth pattern
Session cookie — NOT token auth. The raw `Set-Cookie` header from the login response is stored and replayed. Header: `Cookie: <raw-cookie-string>`.

No `Authorization: token <key>:<secret>` header is used anywhere in this app. Cookie sessions only.

### Full endpoint catalogue for Kikwetu v1

#### Auth
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/method/login` | form: `{usr, pwd}` | Login; response cookie used for all subsequent calls |

#### Stock entry lifecycle
| Method | Path | Body / Params | Purpose |
|--------|------|--------------|---------|
| GET | `/api/resource/Stock Entry?fields=["*"]&limit=1000&order_by=creation%20desc` | — | List all stock entries (dashboard) |
| GET | `/api/resource/Stock Entry/{entryID}?fields=["*"]` | — | Fetch single stock entry detail |
| POST | `/api/resource/Stock Entry` | JSON: `{stock_entry_type, custom_breeder, custom_grower, custom_harvester, custom_block__bed_number, custom_greenhouse, custom_farm, custom_graded_by, custom_stem_length, custom_bunched_by, custom_bunch_id, custom_scanned_grading, order_pick_list, items:[...], custom_stock_uom, custom_bucket_id, custom_received_bucket_id, company, to_warehouse, custom_business_unit}` | Create Harvesting stock entry (direct Frappe resource endpoint) |
| GET | `/api/resource/Stock Entry Type?fields=["name"]&limit=1000` | — | List entry types for filter dropdown |

#### Bucket operations (Kikwetu-specific)
| Method | Path | Body / Params | Purpose |
|--------|------|--------------|---------|
| GET | `/api/resource/Bucket QR Code?filters=[["Bucket QR Code","id","=","..."]]&fields=["name","custom_status","last_stock_entry"]` | — | Validate bucket before harvesting |
| GET | `/api/resource/Stock Entry?filters=[["Stock Entry","custom_bunch_id","=","..."]]&fields=[name, custom_scanned_grading, custom_scanned_packing, custom_greenhouse, stock_entry_type, custom_graded_by, custom_bunch_id]` | — | Look up stock entry by bunch ID |
| GET | `/api/method/fetch_greenhouse_by_bucket_id?bucket_id={id}` | — | Optional: find last greenhouse for a bucket |

#### Receiving
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/method/createReceivingStockEntry` | JSON: `{"bucket_id": "..."}` | Create receiving entry from scanned bucket |

#### Grading
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/method/createGradingStockEntry` | JSON: `{farm, stock_entry_type, graded_by, stem_length, bunch_size, bunch_id, variety, qty}` | Create Kikwetu grading entry |
| POST | `/api/method/createGradingStockEntryTest` | JSON: `{farm, stock_entry_type, bunch_id}` | Test/simplified grading variant |

#### Packing
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | `/api/method/get_pick_list_with_farm_pack_list?pick_list_id={id}` | — | Fetch order pick list + existing farm pack list |
| POST | `/api/method/createOrUpdateFarmPackList` | JSON: `{custom_farm, custom_customer, custom_sales_order, custom_order_pick_list, items:[{item_code, bunch_uom, bunch_quantity, source_warehouse, sales_order_id, customer_id, custom_number_of_stems, stem_length, box_id, bunch_id}]}` | Create/update farm pack list (packing) |

#### Dispatch
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | `/api/method/getOpenTruckLoadingManifest` | — | List open truck loading manifests |
| POST | `/api/method/loadTruck` | JSON: `{manifest_entry_name, box_number, order_pick_list_id, customer_id, sale_order_id, farm_pack_list_id, date}` | Record box dispatch against manifest |

#### Discards
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/method/createDiscardEntry` | JSON: `{userFarm, bunchId, discardReason}` | Create discard entry for a bunch |

#### Rejects
| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/method/getRejectReasonsWithVarieties` | JSON: `{greenhouse_name: "..."}` | Fetch reject reason options + varieties for a greenhouse |
| POST | `/api/method/createRejectEntry` | JSON: `{customFarm, greenhouse, rejectType, variety, rejects:[{reason, quantity}]}` | Submit reject entry |

#### Supervisor reports (Kikwetu)
| Method | Path | Params | Purpose |
|--------|------|--------|---------|
| GET | `/api/method/get_harvesting_summary` | `?from_date=&to_date=&warehouse=` | Harvesting report by greenhouse |
| GET | `/api/method/get_receiving_summary` | `?from_date=&to_date=&farm=` | Receiving report by farm |

#### Reference data
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/resource/Farm?fields=["*"]&limit=1000` | List farms |
| GET | `/api/resource/Warehouse?fields=["*"]&filters=[["disabled","=","0"]]&limit=5000` | List warehouses |
| GET | `/api/resource/Warehouse/{greenhouse}` | Fetch single greenhouse data (varieties + sections) |
| GET | `/api/resource/Employee?fields=["name","first_name","last_name","employee_number"]&limit=4000` | List employees |
| GET | `/api/resource/Stem Length?fields=["length"]` | List stem lengths |
| GET | `/api/resource/Item?fields=["*"]&or_filters=[["item_group","=","PREMIUM GARDEN ROSES"],...["item_group","=","Roses"]]&limit=5000` | List item codes (rose varieties) |
| GET | `/api/resource/UOM?filters=[["UOM","name","like","%bunch%"]]` | List bunch sizes |
| GET | `/api/resource/Breeders?fields=["name"]&limit=1000` | List breeders |
| GET | `/api/resource/Sales Order/{name}` | Fetch single sales order |
| POST | `/api/method/erpnext.stock.utils.scan_barcode` | `{search_value: "..."}` | Look up item by barcode |

#### Quirks to note
- All `/api/method/` endpoints are custom server scripts, not standard Frappe CRUD.
- `/api/resource/` endpoints use standard Frappe REST with `fields` and `filters` as URL-encoded JSON arrays.
- Pagination: `limit=1000` or `limit=5000` is used everywhere — no cursor/page-based pagination implemented.
- The `headers` dict is a mutable instance variable on `ApiService` that is mutated before each call — not thread-safe. In React Native, avoid the same pattern.
- Login returns cookies in `Set-Cookie` response header; the raw cookie string is replayed, not a Bearer token.
- Quality entries include base64-encoded photos embedded in the JSON body (`api_service.dart:1975–1991`).

---

## 8. State Management Map

### StockBloc
**File:** `lib/features/stock/presentation/bloc/stock_bloc.dart`
**Scope:** Global (provided at app root in `main.dart`).
**Classification:** Shared across all clients (but individual events are client-specific).

**Events relevant to Kikwetu v1 only:**
`AddMaterialReceiptEvent`, `GetKikwetuBucketById`, `GetKikwetuEntryByBunch`, `GetKikwetuEntryByBunchTest`, `GetKikwetuOrderPickListWithFarmPackList`, `CreateOrUpdateKikwetuFarmPackList`, `GetRejectReasonsWithVarieties`, `GetKikwetuWarehouseData`, `AddRejectEntry`, `CreateKikwetuDiscardEntry`, `CreateKikwetuGradingEntry`, `CreateKikwetuGradingEntryTest`, `CreateKikwetuReceivingEntry`

**Events shared by multiple clients:**
`GetWarehousesEvent`, `GetFarmsEvent`, `GetStockEntryTypeEvent`, `GetStemLengthsEvent`, `GetGreenhouseByBucketId`, `GetGreenHouseSupervisorSummary`, `GetReceivingSupervisorSummary`, `GetOpenTruckLoadingManifests`, `UpdateTruckLoadingManifest`

**Events for Kaitet/Demo only:**
`CreateKaitetHarvestingEntry`, `CreateKaitetReceivingEntry`, `CreateKaitetGradingEntry`, `CreateKaitetDispatchEntry`, `CreateKaitetShelvingEntry`, `GetKaitetEntryByBunch`, `GetKaitetOrderPickListWithFarmPackList`, `CreateOrUpdateKaitetFarmPackList`, `GetKaitetReentryTime`, `GetReadySaleOrderItems`, `GetReadySaleOrderItemsData`, `GetSalesAllocations`, `IssueFromColdstore`, `LoadInTruck`, `GetPickLists`, `CreateKaitetDiscardEntry`, `FetchKaitetDispatchTrucks`, `FetchKaitetQualityParameters`, `FetchBatchByBucket`, `SubmitBatchQuality`, `ReleaseFromQuarantine`, `SubmitQuarantineActions`, `SaveTrolleyData`, `GetSavedTrolleys`, `LoadTrolleyInTruck`, `CreateKaitetStagingEntry`, `GetLoadingData`, `CreateLoadingEntry`, `SearchVisitorAppointment`, `SearchStaffEmployee`, `SearchContractorContract`, `SubmitUnifiedCheckIn`, `CreateQualityEntry`, `FetchDailySummary`, `SearchEmployees`, `ConfirmGateCheckIn`, `ConfirmGateCheckOut`, `CreateWalkInAppointment`, `SendToSecretary`, `FetchAppointmentWorkflowState`, `FetchWorkTicketForGate`, `RecordVehicleGateEntry`, `RecordVehicleGateExit`, `SubmitFieldReject`, `FetchProductionProjection`, `UpdateRevisedForecast`

**Events for Mona only:**
`CreateMonaHarvestingEntry`, `CreateMonaReceivingInEntry`, `GetMonaWarehouseData`, `CreateMonaShelvingEntry`

**Events for Xflora only:**
`CreateXfloraReceivingEntry`, `CreateXfloraShelvingEntry`, `XfloraBucketTransferEvent`, `CreateXfloraDiscardEntry`, `GetXfloraReadySaleOrderItems`, `GetXfloraReadySaleOrderItemsData`, `XfloraIssueFromColdstore`

**Screens consuming StockBloc:**
`EntryListView`, `ConfigureUserFarmScreen`, and all per-client workflow screens.

---

### StockEntryBloc
**File:** `lib/features/stock/presentation/bloc/stockentry_bloc.dart`
**Scope:** Global (provided at app root).
**Classification:** Shared.
**Events:** `GetStockEntriesEvent`, `GetStockEntryDetails`
**States:** `StockEntryInitial`, `StockEntryLoading`, `StockEntrySuccess(stockEntries)`, `StockEntryFailure(error)`, `GetStockEntryDetailSuccess(stockEntryResponse)`
**Screens:** `EntryListView` (entry list), `StockEntryDetailsScreen` (detail)

---

### AuthBloc
**File:** `lib/features/auth/presentation/bloc/auth_bloc.dart`
**Scope:** Scoped to `LoginScreen` only (created in `BlocProvider` inside `LoginScreen`).
**Classification:** Shared.
**Events:** `LoginEvent(email, password, url)`, `LogoutEvent`
**States:** `AuthInitial`, `AuthLoading`, `AuthSuccess(loginResponse)`, `AuthFailure(error)`, `AuthLoggedOut`
**Screens:** `LoginScreen`, `EntryListView` (LogoutEvent dispatch only)

---

## 9. Native/Platform Feature Usage

### mobile_scanner / native_barcode_scanner
- **Package used in production:** `native_barcode_scanner: ^1.0.12` (NOT `mobile_scanner`) — `lib/features/barcode/presentation/screens/barcode_scanner.dart:4`
- `mobile_scanner: ^6.0.2` is still in `pubspec.yaml` but not imported in any active file.
- Scan returns a raw string (QR value). All Kikwetu QR codes are JSON strings with keys: `bucket_id`, `bunch_id`/`variety`/`bunch_size`/`stem_length`, `grader`, `order-pick-list` URL, `box_number`/`order_pick_list`/`customer`/`po_no`/`date`/`farm_pack_list`.
- The receiving screen also supports HID-mode hardware scanners: it listens on a `TextEditingController` for complete JSON strings (ending with `}`).
- **Critical for RN port:** This is the core UX differentiator. The scan is initiated by tapping a camera icon (pushes BarcodeScanner screen). Camera opens, scans, pops with string result.

### qr_flutter + barcode_widget
- `qr_flutter: ^4.1.0` used in `custom_qr.dart` (line 62) — renders QR codes for Bluetooth printing in `StockEntryDetailsScreen`.
- `barcode_widget: ^2.0.4` is in pubspec but not found in any active Kikwetu v1 screen. Likely used for barcode (non-QR) display.
- `barcode: ^2.2.8` similarly appears unused in Kikwetu v1.

### screenshot
- `screenshot: ^3.0.0` is in pubspec. Grep found no direct usage in the Kikwetu workflow screens (only in `stockentry_details_screen2.dart`). Part of thermal printing workflow (v1.1).

### path_provider
- `path_provider: ^2.1.5` — imported only in `lib/core/util/logger.dart`. Not used in Kikwetu v1 workflow screens.

### flutter_inappwebview
- `flutter_inappwebview: ^6.1.5` — used in `lib/core/screens/inappwebview.dart`.
- Loads `{instanceurl}/app/home` as the ERP desk view. Accessible from the navigation drawer ("View ERP Desk").
- **Port consideration:** Expo's `expo-web-browser` or `react-native-webview` can replace this.

### permission_handler
- `permission_handler: ^11.3.1` — only used in `stockentry_details_screen2.dart` (lines 57–74) for Bluetooth permissions: `bluetoothScan`, `bluetoothConnect`, `location`, `nearbyWifiDevices`.
- Camera permissions are handled transparently by `native_barcode_scanner` package.
- **Kikwetu v1:** Relevant only for Bluetooth (v1.1). Camera permissions handled by scanner package.

### url_launcher
- `url_launcher: ^6.3.1` — used in `inappwebview.dart` to launch non-http URIs from within the WebView.

### vibration
- `vibration: ^2.0.1` — `Vibration.vibrate(duration: 200)` — 200ms single pulse everywhere.
- Triggered on: form validation failures, warning-type snackbars (invalid QR, business rule violations).

### shared_preferences — complete key list
| Key | Type | Set where | Value |
|-----|------|-----------|-------|
| `"cookie"` | String | `auth_bloc.dart:41` | Raw `Set-Cookie` header value |
| `"fullname"` | String | `auth_bloc.dart:43` | Logged-in user's display name |
| `"email"` | String | `auth_bloc.dart:48` | Login email |
| `"email_backup"` | String | `auth_bloc.dart:45` | Email persisted across logouts |
| `"instanceurl"` | String | `auth_repository.dart:40` | Full URL e.g. `https://kikwetu.upande.com` |
| `"instanceurl_backup"` | String | `auth_bloc.dart:46` | URL persisted across logouts |
| `"userStation"` | String | `configure_user_farm_screen.dart:262` | JSON `{"userFarm": "...", "userGreenhouse": "..."}` |

Cleared on logout: all except `"email_backup"` and `"instanceurl_backup"` (`shared_preferences.dart:16`).

### Sentry
- **DSN hardcoded** in `lib/main.dart`, line 29–30:
  `'https://6351abec02043c9b667a72903117963e@o4509231707914240.ingest.de.sentry.io/4509231711649872'`
- Initialised via `SentryFlutter.init()` wrapping the entire app.
- `sendDefaultPii = false`.
- No explicit `Sentry.captureException()` calls found in the codebase — errors propagate naturally through the SentryWidget wrapper.

### Logo and assets
- `assets/upande_logo.png` — the only logo. Used in `login_screen.dart:259` as "Powered by:" graphic.
- `assets/home_bg.png` — background image used on login screen, home dashboard, configure screen.
- `pubspec.yaml:86` — `icons_launcher` uses `assets/upande_logo.png` for Android/iOS app icon.
- No per-client logo; no runtime logo fetching. All clients see the same Upande logo.

---

## 10. Risk-Ranked Port Plan (Kikwetu v1 Only)

1. **QR scanning UX with hardware scanner support** — `BarcodeScanner` uses `native_barcode_scanner` which is a native plugin with no Expo-Go-compatible equivalent; the HID-mode input (listening on `TextController` for JSON) has no exact React Native parallel and must be re-engineered with a text input that auto-submits when valid JSON is detected.

2. **Session cookie auth** — Frappe returns a `Set-Cookie` header; React Native's `fetch` does not automatically handle cookies. A cookie jar library (e.g. `react-native-cookies`) or manual header extraction and storage is required, replicating the regex `sid=([^;]+)` logic from `auth_bloc.dart:34`.

3. **Single monolithic StockBloc with 60+ events** — The entire app state is in one BLoC that is initialised once at app root; migrating to Zustand/Jotai requires splitting into multiple focused stores (auth, kikwetu-harvesting, kikwetu-receiving, etc.) and redesigning the reactive listener pattern (`BlocListener`) into hook-based subscriptions.

4. **Mutable shared `headers` map in ApiService** — `ApiService` uses a single mutable `headers` instance variable mutated before every HTTP call (`api_service.dart:15`). Under concurrent requests this is unsafe. In RN, build a clean HTTP client that injects auth headers per-request.

5. **Audio playback on scan/submit/error** — `audioplayers` plays `beep.mp3`, `submit.mp3`, `error.mp3` as local assets. In Expo, `expo-av` can handle this but requires careful asset bundling and avoiding the Flutter anti-pattern of creating a new player instance per play.

6. **Packing screen pick-list table** — The packing table tracks a compound key (`variety|UOM|stemLength`) with both "scanned" and "packed" counters in local widget state. The logic is complex (see `kikwetu_packing_stock_entry.dart:173–380`) and must be faithfully reproduced in React state.

7. **Multi-tenant URL mapping** — The `InstanceMapper` is a simple object but all downstream branching uses raw string comparisons scattered across two files. In RN this should be a typed enum/constant and the routing logic centralised (recommended: a `useClientConfig()` hook).

8. **`flutter_inappwebview` for ERP desk** — `react-native-webview` is the standard replacement but the cookie session must also be injected into the WebView for the ERP to recognise the user as logged in.

9. **Frappe `/api/resource/` field-filter query syntax** — The GET requests pass `fields` and `filters` as URL-encoded JSON arrays, e.g. `?fields=["name","custom_status"]&filters=[["Bucket QR Code","id","=","ABC"]]`. This is not standard REST and must be reproduced exactly in the RN HTTP client.

10. **`upgrader` (in-app update check)** — `upgrader: ^11.3.1` wraps the root widget in `UpgradeAlert`. There is no direct Expo equivalent; OTA updates can be handled via `expo-updates`, but Play Store / App Store version checks require a separate approach.

---

## 11. Suggested Porting Order

1. **Auth flow** — Login screen → POST `/api/method/login` → cookie extraction and storage → redirect to dashboard. Validates the cookie-based auth approach end-to-end on a real device before building any features.

2. **Dashboard (EntryListView)** — Fetch and display stock entries list (`GET /api/resource/Stock Entry`), date filter, type filter. Establishes the app shell (navigation drawer/tab bar), confirms auth is working for GET requests.

3. **Configure Station screen** — Fetch farms and warehouses, save `userStation` to AsyncStorage. Required by harvesting and grading; validates reference data endpoints.

4. **Harvesting entry** — Fetch greenhouse data (`GET /api/resource/Warehouse/{gh}`) → render form → validate bucket QR → POST `/api/resource/Stock Entry`. This is the highest-frequency workflow; validates QR scanning integration end-to-end.

5. **Receiving entry** — Single-scan workflow (scan QR → validate → POST `/api/method/createReceivingStockEntry`). Validates both camera-scan and HID-scanner modes.

6. **Grading entry** — Two-scan sequence (grader badge + bunch label). Validates the bunch-lookup pattern (`GET /api/resource/Stock Entry?filters=...`) and the `createGradingStockEntry` endpoint.

7. **Rejects entry** — Form-based (no scanner); validates reference data loading (`getRejectReasonsWithVarieties`) and multi-item submission.

8. **Discards entry** — Single-scan with pre-selection toggle; validates `createDiscardEntry` and bunch state machine.

9. **Packing entry** — Most complex; requires pick-list load + multi-bunch scanning + local tally. Build last among data-entry screens.

10. **Dispatch** — Requires open manifests and box-label scan; validates `loadTruck` endpoint.

11. **Supervisor reports** (Harvesting Report, Receiving Report) — Data display only; low risk, can be deferred.

12. **Stock Entry Detail + ERP WebView** — Detail screen is low effort; WebView requires cookie injection investigation.

---

## 12. Open Questions for Esperance

1. **Cookie vs. token auth** — The app uses Frappe session cookies, not `Authorization: token <key>:<secret>`. Is there an API token option enabled on the Kikwetu Frappe instance? Token auth would be simpler to implement in React Native than cookie management. `lib/features/auth/data/auth_repository.dart` and `lib/core/data/api/api_service.dart` have no token logic at all.

2. **HID barcode scanner support** — `kikwetu_receiving_stock_entry.dart` listens on a `TextController` for complete JSON strings from a hardware Bluetooth/USB scanner. Is HID scanner hardware used in Kikwetu's receiving station? If yes, the RN port must implement equivalent text-field polling, which requires understanding the exact scanner hardware model.

3. **`native_barcode_scanner` vs `mobile_scanner`** — `pubspec.yaml` lists both, but only `native_barcode_scanner` is actively imported. Was `mobile_scanner` intentionally removed from use? Which one should be targeted for the RN port (the camera-based scanner)?

4. **`custom_bucket_id` vs `custom_received_bucket_id`** — `api_service.dart:57–58` sets both fields to the same bucket ID in the `addMaterialReceipt` call. Is this intentional or a copy-paste? The Frappe doctype has two separate custom fields?

5. **`sourceWarehouse` hardcoded** — `kikwetu_packing_stock_entry.dart:716`: `sourceWarehouse: 'Goods sold - KF'` is hardcoded. Is this warehouse name consistent across Kikwetu environments (production + staging)?

6. **Grading 2 / `createGradingStockEntryTest`** — `KikwetuGradingStockEntryTest` sends to `/api/method/createGradingStockEntryTest`. Is this endpoint live in production, or is it a development tool? Should v1 of the port include it?

7. **`company` field in harvesting POST** — `api_service.dart:68`: `"company": entry?.company` — where is `StockEntry.company` set? It is not in the `KikwetuHarvestingStockEntry` form fields. Is it always empty/null, or should it be set from the Frappe instance?

8. **`custom_business_unit` field** — Similarly, `api_service.dart:69`: `"custom_business_unit": entry?.businessUnit` — not set in the harvesting form. Always null? Is it expected to be null for Kikwetu?

9. **Pagination** — All list endpoints use `limit=1000` or `limit=5000`. Is this sufficient for Kikwetu's data volume in production, or is pagination needed in the RN port?

10. **Sentry DSN** — The Sentry DSN is hardcoded in `main.dart:30`. Should the RN port use the same Sentry project, a new one, or should DSN be environment-variable-driven?

11. **`beep.mp3` licensing** — The sound assets (`beep.mp3`, `submit.mp3`, `error.mp3`) are bundled in `assets/`. Are these freely licensed for use in the RN port, or do they need to be re-sourced?

12. **Frappe version** — The custom server-side methods (`createReceivingStockEntry`, `createGradingStockEntry`, etc.) are not standard Frappe APIs. Are they in a custom ERPNext app? If so, is the same app deployed on the RN test instance?
