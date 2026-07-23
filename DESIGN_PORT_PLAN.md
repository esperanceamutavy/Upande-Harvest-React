# Design Port Plan — adopting the v2 reference look + Dashboard into xflora-rn

> Reconnaissance + porting plan. **No code changes yet.**
> Reference (read-only): `~/projects/upande-harvest-v2-reference` — a newer Upande Harvest RN app built for **Mona Flowers** (`mona-flowers-staging.upande.com`), on **React Navigation + SDK 54**. We are on **expo-router + SDK 56**.
> **We adopt its visual design and port its Dashboard screen only** — not its flows, navigation, or offline architecture.
> **Hard constraint:** do not copy code that drags in React Navigation (`@react-navigation/*`, `NavigationContainer`, `useNavigation`, `createBottomTabNavigator`, `@react-navigation`'s `useFocusEffect`). Map those to expo-router equivalents.

---

## 0. Snapshot of what the reference is vs. what we take

| Area | Reference | We adopt? |
|---|---|---|
| Design tokens (`src/theme.ts`) | Neutral palette, DM Sans + Poppins, radii/shadow scale | ✅ yes — into `src/components/ui/theme.ts` |
| Dashboard (`src/screens/DashboardScreen.tsx`) | Bento stat tiles + greenhouse list + quick actions | ✅ port, remapped to Xflora (Received/Shelved/Issued) |
| Drawer/header (`DrawerContent.tsx`) | Modal slide-in drawer + header | ✅ our `AppDrawer` already matches — restyle only |
| Icons | `@expo/vector-icons` **Ionicons** | ⚠️ remap to **lucide-react-native** (our locked lib) |
| Navigation (React Navigation) | Bottom tabs + native stack | ❌ stay on expo-router |
| Offline layer (`src/database/*` = expo-sqlite) | Offline-first mirror + sync queue | ❌ online-only (§5) |
| Biometric unlock (`expo-local-authentication`) | Yes | ❌ not adopting |
| Support screenshot (`react-native-view-shot`) | Yes | ❌ not adopting |

---

## 1. Design tokens

### Where they live
Reference: **`src/theme.ts`** (single module, exports `colors`, `shelfColors`, `fontFamily`, `fontSize`, `typography`, `spacing`, `borderRadius`, `shadow`). The DashboardScreen also declares a **local `C = {...}` palette** of "bento" colors inline (hero/tile jewel tones) that are *not* in `theme.ts` — those matter for the stat tiles (§3).

Ours: **`src/components/ui/theme.ts`** (`colors`, `radii`, `spacing`, `typography`). No font family (system default today).

### Reference values

**Colors** (neutral / near-monochrome):
```
primary #171717   primaryMuted #F5F5F5
background #FAFAFA  surface #FFFFFF  surfaceAlt #F5F5F5
text #171717  textSecondary #525252  textMuted #A3A3A3  textOnPrimary #FFFFFF
success #22C55E  warning #F59E0B  error #EF4444
border #E5E5E5   overlay rgba(0,0,0,0.4)
```
**Bento tile palette** (inline in DashboardScreen `C`): `heroGreen #052E16`, `heroGreenAccent #0A4A22`, `tileBlue #0F2744`, `tileStone #1C1917`, `tileRed #3B0A0A`, `tileMint #ECFDF5`, `warmAmber #FFFBEB`, `tileGreen #F0FDF4`.

**Fonts** — DM Sans (body) + Poppins (headings):
```
fontFamily.regular  = DMSans_400Regular
fontFamily.medium   = DMSans_500Medium
fontFamily.semiBold = Poppins_600SemiBold
fontFamily.bold     = Poppins_700Bold
```
**fontSize**: xs 11, sm 13, md 15, lg 18, xl 22, xxl 28.
**typography**: h1(bold/28), h2(bold/22), h3(semiBold/18), body(regular/15), bodySmall(regular/13 sec), caption(medium/11 muted), label(semiBold/13), mono.
**spacing**: xs 4, sm 8, md 12, lg 16, xl 24, xxl 32 — **identical to ours**.
**borderRadius**: sm 6, md 10, lg 14, xl 20, full 9999.
**shadow.sm / .md**: soft low-opacity elevation objects.

### How fonts are loaded
`App.tsx` → `useFonts({ DMSans_400Regular, DMSans_500Medium, Poppins_600SemiBold, Poppins_700Bold })` from `@expo-google-fonts/dm-sans` + `@expo-google-fonts/poppins`, gates render on `fontsLoaded`. Weights are **separate font files**, referenced by exact family string (not `fontWeight`).

### Mapping onto `src/components/ui/theme.ts`

| Reference token | Value | Our token | Action |
|---|---|---|---|
| spacing.* | 4/8/12/16/24/32 | `spacing` | **identical — no change** |
| colors.text / primary | `#171717` | `colors.primary` (`#44433e`) | **Decision (see below)** — keep Xflora charcoal or adopt near-black |
| colors.background | `#FAFAFA` | `colors.bg` (`#F4F4F6`) | align to `#FAFAFA` |
| colors.surface | `#FFFFFF` | `colors.surface` | same |
| colors.textSecondary/textMuted | `#525252` / `#A3A3A3` | add `textSecondary`, remap `muted` | add tokens |
| colors.border | `#E5E5E5` | `colors.border` | lighten to `#E5E5E5` |
| success/warning/error | `#22C55E`/`#F59E0B`/`#EF4444` | `success`/`warning`/`error` | adopt reference (brighter) |
| borderRadius sm/md/lg/xl | 6/10/14/20 | `radii` (4/8/12) | **extend**: add `xl:20`, bump others to 6/10/14 |
| shadow.sm/.md | — | (none) | **add** `shadow` export |
| fontFamily.* (DM Sans/Poppins) | — | (none) | **add** `fontFamily`; thread into `typography` |
| fontSize scale | 11..28 | (implicit in typography) | **add** `fontSize` export |

**Decision to confirm — brand vs. reference palette.** The reference is deliberately monochrome (`#171717`) with colored bento tiles. Xflora's brand is charcoal `#44433e` + steel-blue accent `#699dcd`. Recommended: **adopt the reference's neutral structure, typography, radii and shadows, but keep Xflora's `accent #699dcd`** for interactive accents/links and pick 3 brand-tinted tile colors for the stat tiles (§3). Keep `primary` as a dark neutral (either `#171717` or Xflora `#44433e` — pick one and use consistently). Flagging because it changes every screen in the restyle pass.

---

## 2. Icons

**Reference system:** `@expo/vector-icons` → **Ionicons** everywhere (`Ionicons.glyphMap` typed names). No custom SVGs. No `react-native-svg` icon sets.

**Our system:** `lucide-react-native` (locked in STACK.md, already used in `drawerItems.ts` / `AppDrawer`). **Recommendation: do NOT add `@expo/vector-icons`** — remap the handful of Ionicons we need to lucide equivalents. (`@expo/vector-icons` would be a redundant second icon lib + font asset.)

### Reference icon inventory (drawer `NAV_ITEMS` + `TAB_ICONS`)
`home-outline, leaf-outline, download-outline, swap-horizontal-outline, scan-outline, clipboard-outline, cube-outline, archive-outline, cart-outline, send-outline, chatbubbles-outline, shield-checkmark-outline, grid-outline, cog-outline, analytics-outline, flower-outline`.

### Mapping to our five drawer items
| Our drawer item | Reference concept / Ionicon | lucide (current in `drawerItems.ts`) | Keep / change |
|---|---|---|---|
| Receiving | Receive · `download-outline` | `PackagePlus` | keep (or `Download` to match reference) |
| Rejects (Discard) | Quality · `shield-checkmark-outline` / discard | `XCircle` | keep (`Trash2` also fine) |
| Bucket Transfer | Transfer · `swap-horizontal-outline` | `ArrowLeftRight` | keep — **exact concept match** |
| Shelving | Shelve · `scan-outline` | `LayoutGrid` | keep (`ScanLine` closer to reference) |
| Issuing | Issuing · `cart-outline` | `PackageCheck` | keep (`ShoppingCart` matches reference) |

Dashboard quick-action / header icons to remap if we keep them: `home`→`Home`, `refresh-outline`→`RefreshCw`, `cloud-upload-outline`→(drop, sync is offline-only), `chevron-down/up`→`ChevronDown/Up`, `close`→`X`, `settings-outline`→`Settings`, `analytics-outline`→`BarChart3`. The drawer/header restyle keeps our existing lucide icons — only the visual treatment changes.

---

## 3. Component patterns

The Dashboard does **not** use the shared `StatCard.tsx` — that's a simpler light card used elsewhere. The Dashboard's stat blocks are inline **bento tiles**. Patterns to port:

### (a) Stat tile ("bento") — the stat cards
Inline in `DashboardScreen` styles: `hero` (radius 24, dark green, 52px number + chip + unit + decorative bubble/icon), `tile` (radius 20, dark jewel bg, 34px number, flex row of two), `rejectTile` (row, dark→red when active, with per-section breakdown), `miniTile` (radius 14, light tinted). Pattern = **rounded dark card, uppercase letter-spaced chip label, huge bold number, small muted unit.**
- **We have no equivalent** → new component **`src/components/ui/StatTile.tsx`** (`{ label, value, unit, tone }`). Three tones for the Xflora remap: Received / Shelved / Issued.

### (b) Card / section container
`folderCard` (surface, radius 20, 1px border, `overflow:hidden`) + `folderTab` (tiny uppercase letter-spaced label) — used for the greenhouse section and grading detail.
- New component **`src/components/ui/SectionCard.tsx`** (title + children). Replaces ad-hoc `View` wrappers; nothing in our `ui/` covers it today.

### (c) List row
`GreenhouseRow` (`ghRowCard`): left = name + "N varieties" + "· N rej"; right = `harvested → received` number pair + "% received"; a 3px proportion bar underneath; tap expands a per-variety breakdown with variance. This is the richest pattern.
- New component **`src/components/ui/StatRow.tsx`** (or `GreenhouseRow` renamed) + a tiny **`ProgressBar`**. For Xflora the row is re-tasked (§4) — the "harvested→received" semantics don't map; likely "received → shelved" or a coldroom/variety grouping.

### (d) Drawer + header
- **Drawer** (`DrawerContent.tsx`): `Modal` + `Animated` slide-in, avatar-initials header, nav list, footer actions, responsive width (80%, 240–320px). **Our `src/components/AppDrawer.tsx` already implements this exact pattern** (Modal + Animated slide + avatar + data-driven items + footer logout). → **Restyle only** (fonts, spacing, radii, colors); keep our `WORKFLOW_ITEMS` data source. Do **not** import the reference's `NAV_ITEMS` (it's Mona's flow list).
- **Dashboard header** (inline `Header`): date + "Hi, {firstName}" + Live/Offline pill + sync badge + refresh. Our current `index.tsx` header is a simpler greeting + hamburger. → Adopt the typographic treatment; **drop the Live/Offline pill and sync badge** (both are sqlite/sync-queue driven — §5).

### Which of our `ui/` components change
| Our component | Change |
|---|---|
| `theme.ts` | extend tokens (fonts, fontSize, shadow, radii.xl, textSecondary) |
| `AppBar` | restyle (Poppins title, new colors) — kept for workflow screens |
| `Button`, `Field`, `Picker`, `Pill` | restyle typography + radii; `Pill` can back the header status/badges |
| `AppDrawer` | restyle to reference look, keep data-driven items |
| **new:** `StatTile`, `SectionCard`, `StatRow`/`GreenhouseRow`, `ProgressBar` | created for the Dashboard |

---

## 4. Dashboard data source — critical section

### 4.1 What the reference Dashboard calls
The screen is **offline-first hybrid**: it first fills every value from the **local SQLite mirror** (`src/database/reports.ts`, `receiving.ts`, `actual_harvest.ts` — client-side SQL aggregation, "instant, offline-capable"), then **if `isConnected`** overlays authoritative **server-computed** values from three ERP calls (`src/services/api.ts`). All are `POST /api/method/<m>`, cookie+CSRF auth.

| # | Call (`api.ts`) | Endpoint | Params | Returns (used fields) | Computed |
|---|---|---|---|---|---|
| 1 | `fetchDashboardData` | `get_dashboard_data_full` → fallback `get_dashboard_data` | `{from_date,to_date}` | `quantities.harvesting`, `quantities.receiving` / `counts.receiving`, `greenhouse_data[]{greenhouse_name,greenhouse,total_stems,variety_count}`, `received_by_greenhouse[]{greenhouse,stems}`, `rejects_by_greenhouse[]{greenhouse,stems}`, `varieties_by_greenhouse[]{greenhouse,variety,stems}`, `variance_by_greenhouse_variety[]{greenhouse,variety,harvested,received,variance}`, `actual_harvest[]{greenhouse,variety,quantity}`, `rejects_total`, `rejects_by_section[]{section,total}` | **server** |
| 2 | `fetchGradingDashboard` | `get_grading_dashboard_data` | `{from_date,to_date}` | `GradingDashboardData{total_graded,grading_count,active_graders,rejection_rate}` | **server** |
| 3 | `fetchUnreceivedBuckets` | `get_unreceived_buckets` | `{greenhouse,variety,from_date,to_date}` | `UnreceivedBucketsResponse{greenhouse,variety,missing_count,missing_stems,missing_buckets[]{bucket_id,qty,posting_date,harvester}}` | **server** (drill-down modal, long-press a variety) |

**Stat cards map to:** hero = `quantities.harvesting` (field harvest — **hidden when `isXflora`**); RECEIVED tile = `quantities.receiving`/`counts.receiving`; GRADED tile = grading `total_graded`; REJECTS tile = `rejects_total` + `rejects_by_section`. **Greenhouse list** = merge of `greenhouse_data` (name, `variety_count`, harvested `total_stems`), `received_by_greenhouse` (received stems → drives "% received" = received/harvested), `rejects_by_greenhouse`, and the per-variety `variance_by_greenhouse_variety`.

So: **server-computed** on the live path (client SQLite only as offline fallback). All aggregation we care about is done in Frappe.

### 4.2 Matching Dashboard calls to `server-scripts/`
The repo ships **exactly one** script: **`server-scripts/get_greenhouse_breakdown.py`**. **None of the three endpoints the Dashboard actually calls (`get_dashboard_data_full`, `get_grading_dashboard_data`, `get_unreceived_buckets`) are included** — they live on Mona's instance only. `get_greenhouse_breakdown` is the **canonical reference for the greenhouse-card computation** (same doctypes/filters the full endpoint must use internally), so we summarize it as the template.

**`get_greenhouse_breakdown.py`** — Server Script, type **API**, method `get_greenhouse_breakdown`, guest **No**. `POST {from_date?, to_date?}` (default today) → `message: [{greenhouse, greenhouse_name, harvested_stems, received_stems, variety_count, varieties:[{item_code,stems}]}]`.
- **Harvested** — `tabStock Entry` (`stock_entry_type='Harvesting'`, `docstatus!=2`, `posting_date BETWEEN`, `custom_greenhouse != ''`) JOIN `tabStock Entry Detail` (SUM `qty`), LEFT JOIN `tabWarehouse` for `greenhouse_name`; GROUP BY greenhouse, item_code.
- **Received** — `tabStock Entry` (`stock_entry_type='Receiving'`, `docstatus=1`, `posting_date BETWEEN`) JOIN detail (SUM `qty`), LEFT JOIN a subquery mapping `custom_bucket_id → MAX(custom_greenhouse)` from Harvesting entries — i.e. **received stems get their greenhouse from the originating harvest bucket** (receiving entries don't carry greenhouse). GROUP BY greenhouse.
- **Merge** per greenhouse → harvested_stems, received_stems, varieties[], variety_count; sorted by harvested desc. Errors are logged and return 500.
- **Doctypes:** Stock Entry, Stock Entry Detail, Warehouse. **Filters:** stock_entry_type, docstatus, posting_date range, custom_greenhouse/custom_bucket_id.

### 4.3 What Xflora's backend would need (the takeaway)
These scripts **do not exist on Xflora** — they must be authored server-side (like the workflow endpoints were), and the mobile Dashboard depends on them. Because Xflora is **coldroom/bucket-based with no field-harvest flow**, the mapping changes:

- **Received today** — SUM stems over **Receiving** Stock Entries for the day. Xflora *does* create Receiving Stock Entries (verified: `MAT-STE-2026-185611`) → directly analogous to the reference's receiving aggregation.
- **Shelved today** — Xflora shelving writes **Shelf Item / Shelf Item Log** (verified: Shelf Item Log 43679), **not** a Stock Entry. So this stat must aggregate **Shelf Item Log** by day — a different doctype than any reference query.
- **Issued today** — from the `issue_bucket` path (Pick List Items picked / Bucket Allocations / Shelf Item clears). Needs a bespoke aggregation over whatever `issueBucketToSaleOrderItem` writes; **confirm the doctype during backend work.**
- **Greenhouse list** — harvest-vs-received per greenhouse is **Mona-specific** (field harvest). Xflora has no harvest flow, so this list likely **doesn't map**; options: drop it for v1, or replace with a **coldroom / variety / shelf breakdown** (e.g. received→shelved→issued per variety). **Backend + product decision.**

**Net:** one new Xflora endpoint (mirror of `get_dashboard_data_full`, Xflora-shaped) returning `{ received_today, shelved_today, issued_today, breakdown:[...] }`, plus an optional drill-down. The three reference endpoints are the interface template; `get_greenhouse_breakdown.py` is the SQL-pattern template.

### 4.4 UPDATE — live Xflora already has dashboard endpoints (verified from Server Script sources)
The precondition was **partly already met**. Reading the live Xflora Server Scripts revealed existing API methods; the OTA-2 build wires to these:
- **`get_shelving_dashboard_data`** `{from_date,to_date}` → `message.total_stems` = **Shelved stems today** (sums `Shelf Item.stem_qty` by `date_added`, `custom_status='Active'`) + `variety_distribution`, `age_distribution`, `shelf_utilization`, `greenhouse_distribution`. ✅ used.
- **`get_bucket_transfer_stats`** `{from_date,to_date}` → `message.total_stems` (+ `total_buckets`, `trend`), from Bucket Transfer Stock Entries. ✅ used.
- **`get_shelf_stem_summary`** → current on-shelf `{ bucket_count, total_stems, variety_count }` (no date filter). Available, not used in v1.
- **Received** → **`get_receiving_dashboard_data`** `{from_date,to_date}` → `message.total_stems` — a sibling of the shelving endpoint, **being created server-side to match it exactly.** The hook calls it directly (no field-probing); if it lags deployment the tile shows "—". (The opaque `get_dashboard_data` app method is no longer used.)
- **`getDashboardData`** (camelCase) → an **OPL fulfillment** view (`ready_count`, per-OPL `issuing_percentage`/`packing_percentage`, boxes) — *not* a daily stems total. **Issued-today stems does not exist** as an aggregate → **Issued dropped from v1.**
- `get_grading_dashboard_data` exists too (shelving-style grading detail, unused).
- **`get_grading_stats`** `{from_date,to_date}` → `message.{ total_stems, total_entries }` [live, added OTA 3] — powers the **Graded** stat tile. Grading remains a **stat only** — not a drawer/tab workflow.

**Decisions (user):** tiles = **Received + Shelved + Bucket Transfer** (Issued dropped); **no breakdown list** in v1 (tiles + quick actions only).

---

## 5. Native check

Confirmed against our `package.json`: we have `expo-font`, `expo-camera`, `expo-audio`, `lucide-react-native` — and we do **NOT** have `expo-sqlite`, `expo-local-authentication`, `react-native-view-shot`, `expo-network`, or `@expo/vector-icons`.

| Reference dep | Used by | Needed for design/Dashboard port? |
|---|---|---|
| **expo-sqlite** | `src/database/*` (offline mirror + sync queue); Dashboard's offline baseline (`getTodayHarvestStems`, `getReceivedByGreenhouse`, …) | **No — and must be avoided.** See flag below. |
| **expo-local-authentication** | `src/services/auth.ts` (biometric unlock, silent re-login) | No — not adopting. |
| **react-native-view-shot** | `src/components/SupportModal.tsx` (screenshot) | No — not adopting. |
| **expo-av** | `src/utils/feedback.ts` (scan sounds) | No — we already use `expo-audio`. |
| **@expo/vector-icons** | icons everywhere | No — remap to lucide (§2). |

**The components we're adopting are clean:** `theme.ts`, `StatCard`, `DrawerContent`, and the Dashboard's tile/card/row **style + markup** import none of sqlite/local-auth/view-shot. ✅

**⚠️ Flag — the Dashboard's data + live/offline behavior leans on SQLite.** `DashboardScreen` imports `../database/reports`, `../database/receiving`, `../database/actual_harvest` for the offline baseline, and its **Live/Offline pill + `pendingSync` badge** come from the sync-queue/network layer. **We port online-only:**
- Drop the SQLite baseline entirely; call the (future) Xflora dashboard endpoint directly via a TanStack Query hook.
- Loading → skeleton; error/no-network → an error state with retry (no cached fallback).
- **Remove** the Live/Offline pill and sync badge (no sqlite, no `expo-network`). Optionally a simple "last updated" timestamp. If a connectivity indicator is later wanted, it needs `expo-network` (a new dep) — out of scope for v1.

Also: the reference reads focus/refresh via `@react-navigation`'s `useFocusEffect` and navigates quick-actions via `useNavigation().navigate(tab)`. **Port to expo-router:** `useFocusEffect` from `expo-router` (or refetch on mount via TanStack Query), and `useRouter().push('/receiving' | '/rejects' | '/bucket-transfer' | '/shelving' | '/issuing')` for actions. No `NavigationContainer`, no tab navigator.

---

## 6. Proposed execution order

Two OTA-shippable phases; the Dashboard phase has a backend precondition.

### OTA 1 — Restyle pass (visual only, no behavior change) — 🟨 code-complete (awaiting device visual check)
Decision applied: reference structure + typography + shadows + radii; **Xflora accent `#699dcd` kept**; `primary` set to the reference near-black `#171717`. Done: installed `@expo-google-fonts/dm-sans` + `@expo-google-fonts/poppins`; `src/lib/fonts.ts` loads them (`APP_FONTS`) and patches `Text`/`TextInput.render` to default to DM Sans (Poppins via the `typography` tokens); root `_layout.tsx` holds the splash until fonts + hydration are ready; `ui/theme.ts` rebuilt (colors/radii/shadow/fontSize/fontFamily, keys backward-compatible); `Button`/`Pill`/`AppDrawer` opt headings into Poppins; `AppBar`/`Field` inherit via tokens; the 5 screens restyle automatically through the shared tokens + global font. **Gate met:** `tsc` clean; `expo export` (android) bundled the full graph with zero errors. Device visual check still pending.

Original step list (for reference):
1. Add fonts: `@expo-google-fonts/dm-sans`, `@expo-google-fonts/poppins` (asset packages; `expo-font` native module **already in our build → JS/asset-only, OTA-safe**, no rebuild). Load via `useFonts` in `src/app/_layout.tsx`, hold splash until ready.
2. Extend `src/components/ui/theme.ts` per §1 (fonts, fontSize, shadow, radii.xl, textSecondary/muted, palette alignment) — after the brand-palette decision.
3. Restyle shared `ui/` (`AppBar`, `Button`, `Field`, `Picker`, `Pill`) + `AppDrawer` to the new tokens; keep all behavior and the data-driven `WORKFLOW_ITEMS`.
4. Sweep the 5 workflow screens (Receiving, Rejects, Bucket Transfer, Shelving, Issuing) so they read the new tokens (they already use `colors/spacing/radii`, so mostly automatic; verify each).
5. Gate: `tsc` clean; device smoke-test that the 4 verified flows still submit.
   *Caveat:* if we discover `expo-font` isn't actually initialized in the current dev client, font load needs one dev-client rebuild — but the dep is present, so expect OTA-safe.

### OTA 2 — Dashboard — 🟨 code-complete (awaiting device check + Received confirmation)
Built online-only. Files: `src/features/dashboard/useDashboardStats.ts` (TanStack Query; `allSettled` over three symmetric `{from,to}→message.total_stems` calls — `get_receiving_dashboard_data` / `get_shelving_dashboard_data` / `get_bucket_transfer_stats`; per-tile "—" fallback, error only if all three fail), `src/components/ui/StatTile.tsx` (bento tile, tones blue/green/stone, hero variant), and a rebuilt `src/app/(app)/index.tsx` = header (hamburger→drawer, date, "Hi {name}") + **Received (hero) / Shelved / Transferred** tiles + quick-action chips driven by `WORKFLOW_ITEMS` (→ expo-router `router.push`), with loading spinner, error+Retry, and pull-to-refresh. No React Navigation. The old Stock-Entry **entries list was removed from the landing** per the "tiles + quick actions only" decision — `useStockEntries`/`useStockEntryTypes`/`allowedTypes` and the `stock-entry/[id]` route are now unused (left in place; remove or resurface later). **Gate met:** `tsc` clean; `expo export` (android) bundled with zero errors. **Pending:** the `get_receiving_dashboard_data` sibling to land server-side (until then the Received tile shows "—"), plus a device check that the three tiles read correctly against live Xflora.

Original plan (for reference):
6. **Backend precondition:** author the Xflora dashboard endpoint(s) (§4.3) — `received_today` (Receiving Stock Entries), `shelved_today` (Shelf Item Log), `issued_today` (issue ledger), + optional breakdown. Not blocking OTA 1.
7. New components: `StatTile`, `SectionCard`, `StatRow`/`ProgressBar` (§3).
8. Rebuild `src/app/(app)/index.tsx` as the new Dashboard: header (no offline/sync badge), **three stat tiles remapped to Received / Shelved / Issued** (drop the field-harvest hero and the GRADED tile — **grading is not an Xflora mobile flow**), then the breakdown section (coldroom/variety, pending the backend shape), then quick actions wired to expo-router routes.
9. Online-only data via a TanStack Query hook; skeleton + error/retry states.
10. Gate: `tsc` clean; typed-routes regen if routes change; device-verify the stats against live Xflora.

**Stat remap summary:** reference `[Hero: Field Harvest] [Received] [Graded] [Rejects]` → Xflora **`[Received (hero)]` + `[Shelved] [Transferred] [Graded]`** (3-across). No field-harvest hero; Issued dropped (no daily-stems aggregate); Graded added in OTA 3 as a stat-only tile.

### OTA 3 — Graded tile + bottom tabs + drawer restyle — 🟨 code-complete (awaiting device check)
- **Graded tile:** `useDashboardStats` adds a 4th call `get_grading_stats` → `{total_stems, total_entries}`; `DashboardStats` gains `gradedStems`/`gradedEntries`; `StatTile` gains a `sublabel` line and auto-shrinking value (`adjustsFontSizeToFit`). Layout is now **hero Received + a 3-across row (Shelved / Transferred / Graded)**; Graded shows stems big with "N entries" as sublabel. Graded stays **out of the drawer/tabs** (stat only). Per-tile "—" fallback unchanged (errors only if all 4 calls fail).
- **Bottom tabs:** `src/app/(app)/_layout.tsx` converted from `Stack` to expo-router **`Tabs`**, matching the reference styling on our tokens (icon-only, `tabBarActiveTintColor: primary` / inactive `muted`, `height: 52 + insets.bottom`, surface bg + hairline top border). Five tabs — **Home / Receiving / Bucket Transfer / Shelving / Issuing** (lucide icons matching the drawer). **Rejects, Configure, ERP Desk, stock-entry/[id]** are `href: null` (off the bar; Rejects reachable via drawer + dashboard quick action). Drawer overlay preserved (Modal from the Home header hamburger). No React Navigation.
- **Drawer restyle:** `AppDrawer` header switched from the dark band to the reference's **light panel** — white header with a hairline bottom border, 44px primary avatar circle + name (Poppins semiBold) + email (DM Sans, textSecondary), farm badge kept (restyled to `surfaceAlt`); nav-row icons → `textSecondary`. Structure/animation unchanged.
- **Gate met:** `tsc` clean; Metro boot regenerated router types (all routes present, no `kikwetu`); `expo export` (android) bundled reproducibly (exit 0, no fatal errors).

---

## 7. Reference file index
- Tokens: `src/theme.ts` (+ inline `C` palette in `DashboardScreen.tsx`)
- Dashboard: `src/screens/DashboardScreen.tsx` (Header, GreenhouseRow, ActionChip, MissingBucketsModal)
- Components: `src/components/StatCard.tsx`, `src/components/DrawerContent.tsx`, `src/components/Skeleton.tsx`
- Data: `src/services/api.ts` (`fetchDashboardData`, `fetchGradingDashboard`, `fetchUnreceivedBuckets`); offline baseline `src/database/reports.ts`
- Server script (only one shipped): `server-scripts/get_greenhouse_breakdown.py`
- Types: `src/types/index.ts` (`GreenhouseHarvestRow`, `VarietyBreakdownRow`, `UnreceivedBucketsResponse`, `GradingDashboardData`)
- App shell (React Navigation — reference only, do not port): `App.tsx` (`useFonts`, `TAB_ICONS`, tab navigator)
