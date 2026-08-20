# Restyle Plan — aligning xflora-rn to the Upande Packhouse design system, + Grading and Packing

> **Reference for the LOOK (read-only):** `mark-judah/upande-packhouse` — Expo SDK 54 / RN 0.81.5, expo-router, Ionicons, zustand + repository pattern.
> **Reference for the CONTRACT:** the **Server Script list on `xflora.upande.com`** — the source of truth for what endpoints exist and what they do. `teddy5456/Upande-Harvest-React` points at a *different site* and is a hint source only; it has produced wrong endpoints twice. See §8.0.
> **This app:** Expo SDK 56 / RN 0.85.3 / React 19.2.3, expo-router, **lucide-react-native**, **react-query**, expo-secure-store, Sentry.
>
> **Scope:** adopt the packhouse *visual system* and its `Screen` / `Card` / `Notice` primitives. Keep our dashboard, our data layer, our auth, our router, our SDK version. Then build Grading and Packing fresh against Xflora's own contract.
>
> **Decisions taken:** restyle in place (not folding into the packhouse repo); Xflora's steel-blue accent `#699dcd` is retired for full monochrome.

---

## 0. Hard constraints

These are not preferences. Breaking any of them costs a rebuild or a production incident.

1. **Icons stay lucide.** Packhouse is `@expo/vector-icons` (Ionicons) throughout, including a `ROUTE_ICONS: Record<DrawerItem['route'], IconName>` map in `SideMenu.tsx`. Port the components, remap every icon to `lucide-react-native`. Do not add `@expo/vector-icons` to `package.json`.
2. **Copy forward only.** We are three minor SDKs ahead of the reference. No dependency gets pinned down to match packhouse's versions. If a packhouse component uses an API that moved in RN 0.85, fix forward.
3. **Do not touch the data or auth layer.** Keep react-query and the SecureStore session-cookie client in `src/lib/api.ts`. Do not import packhouse's `src/core/api/client.ts` or `src/core/auth/*` — it is AsyncStorage + zustand repository and would be a regression. Both apps are session-cookie auth, so there is no contract difference to reconcile.
4. **Never import packhouse's `src/core/tenant/instance-mapper.ts`.** It maps Xflora to `xflora.fsn.frappe.cloud` — the internal Frappe Cloud hostname that produced `Failed host lookup` DNS errors on mobile networks. This app stays pinned to `https://xflora.upande.com`.
5. **Do not adopt packhouse's tenant machinery** (`src/core/tenant/*`, `src/composition/drawer-resolver.ts`, `RequireStation.tsx`). This is a single-tenant app; `src/features/navigation/drawerItems.ts` is already the single source of truth for nav.
6. **Everything below is OTA-shippable.** No new native modules are introduced. Ship via `eas update`, not a new APK. If a phase ever adds a native dep, stop and flag it.

---

## 1. Where we already match

The `DESIGN_PORT_PLAN.md` port of the Mona v2 reference means the token layer is already ~90% aligned. Both apps share, byte-for-byte:

- `#171717` neutral primary, `#525252` / `#A3A3A3` text tiers, `#FFFFFF` / `#F5F5F5` surfaces, `#E5E5E5` border
- `success #22C55E`, `warning #F59E0B`, `error #EF4444`, `overlay rgba(0,0,0,0.4)`
- DM Sans 400/500 + Poppins 600/700, loaded via `useFonts` and gated on `fontsLoaded`
- `fontSize` 11/13/15/18/22/28
- `spacing` 4/8/12/16/24/32
- `radii` 6/10/14/20/9999
- `shadow.sm` / `shadow.md`

So this is a gap-closing exercise, not a re-skin.

## 2. What actually differs

| Area | Packhouse | Here | Phase |
|---|---|---|---|
| App bar | White `surface`, hairline bottom border, **centred black** title, hamburger left, symmetric right spacer | Dark `#171717` bar, **left-aligned white** title, back arrow | 2 |
| Screen ground | `#F5F5F5` | `#FAFAFA` | 1 |
| Screen wrapper | One `<Screen>` owning header + SideMenu + loading + error/retry + pull-to-refresh + footer slot + `KeyboardAvoidingView` | `<AppBar>` composed per screen, chrome hand-rolled each time | 2–3 |
| Button | Pill radius, `minHeight: 48`, Poppins **bold**, primary/outline/ghost, `iconLeft`, built-in `ActivityIndicator` | radius 10, semiBold, primary/ghost, no loading state | 4 |
| Card | White, hairline border, radius 10, uppercase micro-title with `letterSpacing: 0.4`, `marginBottom: md` | Does not exist | 2 |
| Alert | 4 tones with paired bg/fg (`info` `#EEF2FF`/`#3730A3`, `success` `#F0FDF4`/`#166534`, `warn` `#FFFBEB`/`#92400E`, `danger` `#FEF2F2`/`#991B1B`) + leading icon | Does not exist | 2 |
| Accent | Fully monochrome — `info` is literally `#171717` | `#699dcd` on 14 sites | 1, 5 |
| Missing primitives | `Segmented`, `Dropdown`, `DecisionChip`, `ProgressBar`, `Toast`, `OfflineBanner`, `FAB`, `LabeledInput`, `DateSelector`, `Spinner`, `PendingScreen` | — | 4 |

The app bar flip and adopting `<Screen>` do most of the visible work. `Card` is the reason our screens don't currently read as the same family — packhouse groups every form section in one.

---

## 3. Phase 1 — tokens

**Files:** `src/components/ui/theme.ts` (replace wholesale with the supplied version)

- `colors.accent` becomes an alias of `#171717`, marked `@deprecated`. This makes all 14 accent sites monochrome with **zero screen edits** — the same legacy-alias pattern packhouse itself used when it absorbed the production design system.
- `colors.bg`: `#FAFAFA` → `#F5F5F5`.
- `typography.title`: `#fff` → `colors.text`. Required, since the app bar goes white in Phase 2.
- Adds `text`, `textMuted`, `textSecondary`, `textOnPrimary`, `bgMuted`, `info`, the `h1`–`h3` / `bodySmall` / `caption` / `mono` ramp, `eyebrow` for Card titles, and a `borderRadius` alias exposing `.full`.

`typography.label` is deliberately **left alone** at semiBold/13 — it's the form-field label used by `Field.tsx`, and swapping it to packhouse's uppercase 11px treatment would silently restyle every form in the app. The uppercase treatment lives in the new `eyebrow` key instead, used only by `Card`.

**Verify:** `npx tsc --noEmit` clean, then boot the app. Expect an instantly monochrome app with a still-dark app bar. Nothing should be broken.

## 4. Phase 2 — the `Screen`, `Card`, `Alert` primitives

**New files:** `src/components/ui/Screen.tsx`, `src/components/ui/Card.tsx` (exports `Card` and `Alert`)

Port `packhouse/src/core/ui/Screen.tsx` with these changes:

- `Ionicons name="menu-outline"` → lucide `Menu`
- Replace the imported `SideMenu` with the existing `src/components/AppDrawer.tsx`, which already matches structurally — restyle it rather than replacing it
- Drop the `useTenant()` / `instanceUrl` reads
- Keep: centred title, white `surface` header with `StyleSheet.hairlineWidth` bottom border, `bgMuted` body, `loading` → centred spinner, `error` → title + message + optional `Retry`, `onRefresh` → `RefreshControl`, `scroll` / `contentPadded` escape hatches, `footer` slot on white with a hairline top border, `KeyboardAvoidingView` with `behavior: 'padding'` on iOS only.

Port `Card` and `Alert` as-is; `Card`'s title uses the new `typography.eyebrow`.

**Verify:** `Screen` renders standalone on a throwaway route before any migration.

## 5. Phase 3 — migrate the five screens

Order matters: establish the pattern on the smallest file, verify on a device, then repeat.

1. `configure.tsx` (110 lines) — the pattern-setter
2. `bucket-transfer.tsx` (283)
3. `shelving.tsx` (333)
4. `receiving.tsx` (436)
5. `issuing.tsx` (464)

**`rejects.tsx` (303) is out of Phase 3.** It is not migrated and keeps `AppBar`. It still needs the Phase 5 accent rename — that is a token cleanup, independent of the `Screen` migration.

For each: replace `<SafeAreaView>` + `<AppBar>` + hand-rolled `<ScrollView>` with `<Screen title="…">`, then group each logical form section in a `<Card title="…">`. Replace ad-hoc inline warning/error blocks with `<Notice tone>` (exported from `Card.tsx`; named `Notice` rather than the reference's `Alert` to avoid colliding with react-native's `Alert.alert`). Delete the now-dead local `styles` entries as you go — don't leave orphans.

Two notes:

- Packhouse's `Screen` has **no back affordance** — navigation is drawer + tabs, and the header is hamburger-only. **We diverge deliberately here:** the reference has no back prop because it has no pushed routes, and we do. `Screen` takes an optional `onBack` that swaps the hamburger for a lucide `ChevronLeft` in the same leading slot; when it is set the drawer is not mounted, since there would be no way to open it.

  `onBack` goes on exactly three routes — `configure`, `erp-desk`, `stock-entry/[id]` — and all three already have it. Every screen remaining in Phase 3 (`bucket-transfer`, `shelving`, `receiving`, `issuing`) is a tab destination, so **`onBack` applies to none of them**; they are hamburger-only, like `index`. `rejects` is also registered `href: null` but is out of Phase 3 and keeps `AppBar`, so it never takes `onBack`.

  Note that `erp-desk` and `stock-entry/[id]` were bare "coming in Phase 6" stubs with no header of any kind, so they were wrapped in `<Screen scroll={false}>` rather than converted.
- **`AppBar.tsx` survives Phase 5.** `rejects.tsx` is its one remaining consumer once the five screens are migrated, so it cannot be deleted. It goes only when `rejects` is eventually migrated or retired.

**Verify:** each screen on a physical device against production before moving to the next. These are live coldroom flows.

## 6. Phase 4 — Button and the primitive backfill

Upgrade `src/components/ui/Button.tsx` to the packhouse contract: `borderRadius.full`, `minHeight: 48`, Poppins **bold** label, `variant: 'primary' | 'outline' | 'ghost'`, `iconLeft`, `loading` rendering an inline `ActivityIndicator`, disabled at `opacity: 0.45` and pressed at `0.85`.

The current API takes `children`; packhouse takes `label`. Support both during migration (`label?: string; children?: ReactNode`) so the migrated screens don't all have to change in the same commit.

Then backfill only what the screens actually need — resist porting all twelve. `Dropdown` overlaps our existing `Picker` — compare before porting, don't end up with both.

**Backfill decisions, after auditing the five migrated screens:**

| Primitive | Verdict | Reason |
|---|---|---|
| `Segmented` | **ported** | Receiving's `Is Bunched` / `Partial bucket` were two checkboxes that disabled each other — a three-state single-select wearing two booleans. Now one `Segmented` over `standard \| bunched \| partial`. **Batch Receiving stays a checkbox**: it is orthogonal and composes with all three modes, so the plan's original "single/batch/bunched" framing was wrong. |
| `ProgressBar` | deferred | No consumer among the five. Its natural home is Packing's `N/250` stem cap (§8.3) — port it in Phase 6, against a real use. |
| `Toast` | rejected | Every migrated screen already reports through an inline `<Notice>` anchored next to the control that produced it. Adding a second, transient channel would split feedback across two idioms and make scan errors easier to miss — a regression in a flow where the packer is looking at the field, not the top of the screen. |
| `OfflineBanner` | **blocked by hard constraints** | Requires `expo-network` (a native module → breaks constraint 6, no longer OTA-shippable) **and** consecutive-API-failure counters wired into the HTTP client (`packhouse/src/core/network/store.ts`), which means editing `src/lib/api.ts` → constraint 3. Not portable without breaking two constraints. Revisit only if a new build is on the table anyway. |
| `Dropdown` | rejected | `Picker` already covers every call site. Porting it would leave two overlapping select components. |

## 7. Phase 5 — cleanup ✅ COMPLETE

Two corrections to what this section originally said:

- ~~**Fix the scan line.**~~ **The original bullet was wrong on three counts.** `BarcodeScannerOverlay.tsx` has **no scan line** — no reticle, no animated bar, just a full-bleed `CameraView` and a close button. Line 111 is `settingsBtn`, the "Open Settings" button on the permission-denied screen. And its `ACCENT` was `const ACCENT = '#699dcd'` — a **hardcoded literal, not `colors.accent`** — so Phase 1's alias never touched it and there was no invisible-black-line regression to fix.

  **The underlying worry was real, just mislocated.** `settingsBtn` sits on a `#000` background, so resolving it to the monochrome primary `#171717` would have made it near-invisible — the exact failure the bullet described, on a different element. Resolved by inverting instead: `#FFFFFF` fill with `#171717` text.
- **The `rgba(105,157,205,·)` hairlines were an unlisted site.** Five `qrBtn` borders (`receiving`, `rejects`, `shelving`, `bucket-transfer`, `issuing`) and issuing's packing-card border hardcoded the steel-blue at 0.3–0.4 alpha rather than going through `colors.accent`. **`tsc` cannot catch these** — deleting the token proves nothing about a string literal. All now `colors.border`. Grep for the literal, don't trust the compiler.
- Renamed every `const ACCENT = colors.accent` across `receiving` / `rejects` / `shelving` / `bucket-transfer` / `issuing`, resolving per site: `colors.text` for icons and spinners, `colors.primary` for fills (checkbox, chip), `colors.border` for hairlines. The `const ACCENT` declarations are gone rather than repointed.
- `Pill.tsx` `info: colors.accent` → `colors.info`.
- `login.tsx` `clientBadge` → `colors.textMuted`.
- `index.tsx` `ActivityIndicator color={colors.accent}` → `colors.text`.
- Deleted `colors.accent` from `theme.ts`; `npx tsc --noEmit` clean. No `colors.accent`, `ACCENT`, or `105,157,205` reference survives anywhere in `src/`.
- ~~Delete `AppBar.tsx`.~~ **Not in this phase.** `rejects.tsx` is out of Phase 3 and still renders `AppBar`, so the component keeps a live consumer. See §5.
- ✅ **Removed the Phase 2 `ui-preview` harness — all three pieces:**
  1. the route file `src/app/(app)/ui-preview.tsx` — deleted
  2. its `<Tabs.Screen name="ui-preview" options={{ href: null }} />` entry in `src/app/(app)/_layout.tsx` — removed
  3. the `{ label: 'UI Preview', … }` row in `WORKFLOW_ITEMS` in `src/features/navigation/drawerItems.ts` — removed

  Missing (2) would have left a `Tabs.Screen` pointing at a route that no longer exists; missing (3) a dead drawer row that throws on tap. `grep -r ui-preview src/` returns nothing. The `LayoutGrid` import stays in both files — Shelving still uses it.

  It was held back deliberately until the device pass, since it was the only place `Button`'s variants and `Segmented` could be checked in isolation. **Phase 5 is now complete.**

## 8. Phase 6 — Grading and Packing

**Backend status on `xflora.upande.com`:** **Grading is built** (§8.2). **Packing's contract is confirmed and its write path is fixed as of 2026-08-20** — the summary-field corruption is resolved. One blocker remains before it can ship: the `item_code`/`uom` convention mismatch that silently mis-warehouses scans and gates Rule 3 (§8.3). Dispatch is unscoped rather than blocked (§8.4).

### 8.0 Source split — read this first

Two repos and one live site. Conflating them is how Kikwetu's and Karen's business rules leak into Xflora — and how endpoints that do not exist end up in this plan.

| | Source | Authoritative for | Never take |
|---|---|---|---|
| **Look** | `mark-judah/upande-packhouse` → `/tmp/packhouse` | `Screen` / `Card` / `Notice` / `Button`, layout, component structure | business logic, endpoints, payloads |
| **Existence** | **Live `xflora.upande.com`, probed by `curl`** | *whether* an endpoint exists — nothing else | behaviour |
| **Behaviour** | Bench console — **a LOCAL SNAPSHOT, last synced ~27 July 2026** | Server Script bodies: payloads, envelopes, validation rules. **Provisional.** | existence, and anything drifted since 27 July |
| ~~Contract~~ | ~~`teddy5456/Upande-Harvest-React`~~ → `/tmp/xflora-legacy` | **nothing. Demoted — see below.** | endpoints, payloads, architecture, code |

### ⚠️ Two tiers of confidence. Do not conflate them.

**Endpoint existence is confirmed live.** Frappe resolves the method name before authenticating, so an unauthenticated `curl` distinguishes "no such method" from "permission denied" — which makes existence checkable without a session. Verified on the live site:

| Endpoint | Live |
|---|---|
| `createOrUpdateFarmPackList` | ✅ present |
| `mobile_grading_entry` | ✅ present |
| `get_bucket_details` | ✅ present |
| `get_sales_order_lines` | ✅ present |
| `createDispatchEntry` | ✅ present — **contradicts §8.4, see there** |
| `add_bunch_to_box` | ❌ **absent** — confirms §8.3's deletion of the box model |

**Script bodies are NOT confirmed live.** Every `script` field quoted in §8.2 and §8.3 was read from a bench console backed by a **local snapshot last synced ~27 July 2026**. The endpoints are real; their current implementations are inferred from a copy that is months stale and may have drifted.

**Evidence the snapshot is stale:** OPL numbering diverges sharply. Newest OPL in the snapshot is `OPL-2026-00900` (27 July); live is at `OPL-2026-02904` today. **Every OPL id in this plan is illustrative only** — never treat one as a real, current document.

Three behaviours the correctness rules depend on are therefore **snapshot-sourced and pending live confirmation**. Each is tagged 🟡 at its use site:

| Behaviour | Depended on by | Risk if it has drifted |
|---|---|---|
| The ungraded-bunch `frappe.throw` | **Rule 2** | If it no longer throws, one-bunch-per-scan is merely tidier, not corrective — and ungraded bunches may pack silently. |
| The `item_locations[0]` warehouse fallback | **Rule 3** | If it now errors instead of falling back, Rule 3 is defence-in-depth rather than the only guard. If it still falls back, Rule 3 is load-bearing. (The `uom`-format half of this is resolved live — see §8.3.) |
| The `frappe.response['data']` envelope | **the packing client's ability to read any response** | Wrong guess here means every successful pack looks like a parse failure. Cheapest of the three to confirm — one real call shows it. |

**Confirm all three with one authenticated call each before the packing screen is trusted in the field.** A single successful pack against a live OPL settles the envelope; a deliberately ungraded bunch settles Rule 2; a deliberate wrong-variety scan settles Rule 3. That is three scans, and it is the difference between a spec and a guess.

Note the same caveat applies retroactively to **§8.2's flat-envelope finding, which is already in shipped code** — see the tag there.

### ⚠️ The legacy repo is NOT authoritative for Xflora

`teddy5456/Upande-Harvest-React` **points at a different site.** It was treated as the contract source for §8.2 and §8.3 and produced wrong answers both times:

- **§8.2** cited `upande_harvest.api.get_grader_open_bucket`. It does not exist on `xflora.upande.com`.
- **§8.3** cited seven box-scanning endpoints. **None of them exist** — `add_bunch_to_box` confirmed absent live.

**Existence is settled by probing the live site**; a Server Script list from any bench console tells you what that bench has, which is not the same question. For behaviour, read the `script` field — these are Server Scripts, so the source *is* the specification — but record which bench it came from and how stale that bench is.

The legacy repo stays cloned only as a **hint source** — it suggests what an endpoint might be called and roughly how a flow behaves. Every symbol taken from it must be confirmed against the site before it reaches code. Treat an endpoint named there as a hypothesis, never a fact.

```bash
git clone --depth 1 https://github.com/teddy5456/Upande-Harvest-React.git /tmp/xflora-legacy
```

**Do not port from `/tmp/xflora-legacy`.** It is React Navigation + expo-sqlite + an offline sync queue on SDK 54. We build fresh on `Screen` / `Card` / `Notice` + react-query.

Note that packhouse's packing screen lives at `src/tenants/karen/features/packing/PackingScreen.tsx` — under `tenants/karen`. The path itself is the warning: that file's flow is Karen's, and only its layout transfers.

The earlier plan to `git checkout origin/kikwetu -- <path>` the Kikwetu grading/packing screens **is withdrawn.** Those screens encode Kikwetu's rules against Kikwetu's endpoints; neither matches Xflora.

### 8.1 Hard requirement — write serialization

`submitGrading` is wrapped in `serializedByKey('grading', …)` — `api.ts:460`, with the rationale at `api.ts:486-492`. Same-key submissions run strictly one at a time: on slow networks, rapid scanning lets request N+1 reach the server before N's ACK, and for Stock-Entry writes that corrupts bucket state.

**React Query mutations run in parallel by default, so this guard does not come for free — it must be carried across explicitly.** A per-key in-flight promise map (`api.ts:493-507`) is the reference implementation: same key queues, different keys stay parallel, and a rejected predecessor still lets the successor run.

This is a correctness requirement, not an optimisation. A grading screen without it will corrupt bucket state in the field under exactly the conditions it is used in — fast repeated scans on coldroom Wi-Fi.

**Packing needs the same guard, for a different reason — RESOLVED, no longer an open question.** The earlier framing here (a client-side cap race across `add_bunch_to_box`) is void: those endpoints do not exist, and the cap is not what races.

`createOrUpdateFarmPackList` performs a **read-modify-write on the Farm Pack List document** — fetch the doc, find the matching `pack_list_item` row, `row.bunch_qty += n`, `doc.save()`. `Box Label` follows the identical pattern for its `box_item` rows. Two concurrent posts can read the same value and both write `n+1`, losing an increment; two concurrent first-scans can each create a duplicate Farm Pack List for the same `(sales_order, order_pick_list)`.

**Wrap packing writes in `serializeByKey('packing')`.** Distinct key from `'grading'`, so the two flows queue independently rather than blocking each other. Detail in §8.3.

### 8.2 Grading — ✅ BUILT AND VERIFIED LIVE. Closed.

**ONE call. `mobile_grading_entry`, and nothing else.**

Two endpoints this section previously specified are **not part of grading**, for two different reasons:

1. **`upande_harvest.api.get_grader_open_bucket` does not exist on `xflora.upande.com`.** Verified against the site: `upande_harvest.api` contains dashboard functions only, and the short-form endpoints are Server Scripts. Calling it returns `module 'upande_harvest.api' has no attribute 'get_grader_open_bucket'` — the app is installed, the function is not. **Do not work around this client-side.** And nothing needs reimplementing: grading has no bucket step at all, so there was never anything for this call to contribute.
2. **`frappe.client.get_value` on `Bunch QR Code` (`getBunchInfo`, `api.ts:467`) is a packing call.** Its only consumer is `XfloraPackingScreen.tsx:199`. Production removed the grading pre-fetch deliberately and left the reason in the source (`GradeScreen.tsx:284-287`):

   > *"we no longer pre-fetch bunch_size + stem_length here. The server's Mobile Grading Entry API reads them from the Bunch QR Code directly, so the pre-fetch was a redundant 150-300ms round-trip per scan. Sending empty strings is equivalent for the server."*

   Re-adding it would put 150–300ms back on **every scan** in the app's fastest-repeating flow.

| Endpoint | Payload | Source |
|---|---|---|
| `mobile_grading_entry` | `{ bucket_id: '', bunch_id, bunch_size: '', farm, grader, qty: 0, stem_length: '', variety: '' }` | `api.ts:446`, `GradeScreen.tsx:281-297` |

Five fields go empty on purpose. `bunch_size` / `stem_length` / `variety` / `qty` because the server reads them off the `Bunch QR Code` record — and **`bucket_id` because it is inert.**

**There is no bucket resolution.** The script never reads `bucket_id`, never queries Receiving Out, and never looks for an open bucket. It resolves the bunch off `Bunch QR Code` and moves stock between two hardcoded warehouses:

```
from: "XFL Receiving Coldstore  - XFL"   →   to: "XFL Graded Sold - XFL"
```

`bucket_id: ''` is kept in the payload purely to match the legacy shape, which costs nothing. Any earlier claim in this plan that the server "resolves the bucket from the grader" was wrong.

#### Response — FLAT envelope

> 🟢 **VERIFIED LIVE.** The error envelope, the HTTP status, `_server_messages` presence, the unwrapped error text and the `grader` identifier format were all checked against the live site. `createOrUpdateFarmPackList`'s live body also proved byte-identical to the snapshot (§8.3), corroborating the snapshot reading of these scripts generally.
>
> Still snapshot-only, and harmless: the hardcoded warehouse pair and the 20099–20826 self-heal, neither of which the client depends on. The success-response shape is confirmed by the entries log rendering variety and stem count on a real scan.

On success the script sets four **top-level siblings** on `frappe.response`, and `message` is a plain string:

```
{ message: "Grading entry submitted successfully",
  stock_entry: "MAT-STE-…", qty: 10, variety: "Athena-35CM" }
```

**There is no nested `message` object.** Unwrapping `body.message ?? body` — the pattern the other Xflora endpoints need — resolves to that string here and makes every field read back `undefined`. That shipped as a defect once; the entries log rendered "Bunch graded" with no variety or stem count. Read the top level directly.

**`stem_length` is not returned.** The response carries only `variety` and `qty`, so `GradingResult` does not declare a stem length rather than surfacing a permanently-null field.

**`bucket_remaining_stems` is not returned either**, and would be ignored regardless — production documents it as unreliable on re-used buckets, since it sums every harvest and every bunch the bucket has ever seen with no cycle window and so floors at 0 (`GradeScreen.tsx:310-316`).

#### ✅ Error envelope — VERIFIED LIVE. No client change needed.

On failure the script sets `http_status_code: 500`, plus the error text in **both** `message` (the same key that carries the success string) and `error`.

**Frappe returns a real HTTP 500**, so axios rejects and the interceptor runs — the ordinary error path, no special handling required.

**`_server_messages` IS present.** Frappe populates it from the `frappe.throw` *before* the script's own `except` block catches and re-raises, so the standard Frappe error envelope survives. `parseFrappeError` therefore reads `serverMessages[0]` — its first and intended branch — and `extractFrappeError` returns that via `err.message`.

*Correcting an earlier note here:* this was described as the text surfacing "by fallback rather than by design", through a three-deep accident. **That was wrong** — it assumed `_server_messages` was absent. The standard path is live and the chain is the designed one. The only true observation from that note is that `extractFrappeError`'s `err.response?.data?…` branches are dead for `api.ts`-originated errors, since the interceptor has already normalised to an `ApiError` — that is the interceptor working as intended, not a defect.

**Error text arrives unwrapped** — `Bunch BUNCH-123 not found`, with no `Error processing packing:`-style prefix (contrast §8.3). So `isAlreadyGraded`'s substring match runs against the raw server string, exactly as built.

**No hardening applied and none needed.** The earlier suggestion to treat a present `error` key as failure regardless of status is withdrawn: the status is reliable.

`excType` is still `undefined` for these errors — nothing branches on it, and nothing should start.

#### ✅ `grader` — no resolver needed. The shipped code is correct.

**Employee docnames ARE the payroll numbers.** On this site `name == employee == employee_number`, e.g. `"869"`. So the badge value the QR carries is already the primary key the script looks up:

```python
employee = frappe.db.get_value("Employee", graded_by, "name")
```

Consequences, all confirming what is already built:

- **The local badge latch is correct.** No request is needed at badge-scan time.
- **`extractGradingQrValue`'s `employee_id` preference is right** — `pick('employee_id', 'employee', 'grader')` resolves to the docname.
- **`lookup_employee` is optional and not part of this flow.** It resolves a display *name*, not an ID, so it would only serve a nicety like showing the grader's name next to the latched badge.

*Correcting an earlier note here:* this section previously flagged a "live risk in the shipped grading screen" — that `employee_id` might be a payroll number rather than a docname and every scan would fail. **On this site those are the same string, so there was never a risk.** The inference was reasonable from the script alone; it needed the data to settle, and the data says the code is right.

#### Two minor findings, neither blocking

- **`lookup_employee` returns HTTP 200 with `exists: false`** for an unknown employee — success status, negative result in the body. That is a **fourth response convention** on this backend, alongside grading's flat-with-siblings, packing's `data` envelope, and the conventional nested `message`. **There is no house style: read each script before writing its client.** This is the same lesson §8.0 draws about provenance, arriving from a different direction.
- **`Employee.user_id` is null across the board**, so the already-graded message's `graded by <name>` lookup — `get_value("Employee", {"user_id": owner}, "employee_name")` — finds nothing and falls back to the raw `owner`. The amber duplicate row will read a username or email rather than a person's name. **Cosmetic**, and it is the server's string, so fixing it is a server-side or data-side change, not a client one.

#### Real failure modes

There are four, all surfaced from the server's own message:

| Failure | Server message | Notes |
|---|---|---|
| **Already graded** | `Bunch <id> has already been graded by <name> (<stock entry>)` | **The one a grader will actually hit.** Duplicate scan, resolved by the guard on `Stock Entry` where `stock_entry_type = 'Grading'`, `custom_bunch_id = <id>`, `docstatus = 1`. |
| Bunch not found | `Bunch <id> not found` | No `Bunch QR Code` record. See the self-heal note below. |
| Employee not found | `Employee <grader> does not exist` | Badge value must be the Employee docname — which on this site IS the payroll number. Confirmed fine; see below. |
| Invalid bunch size | `Invalid bunch size: '<raw>'` | `bunch_size` on the record has no digits in it. |

**Already-graded is a warning, not an error.** It means the bunch is already in the system — a benign outcome for the packer, and materially different from a hard failure. The client substring-matches `already been graded` and renders it as a `warn` `Notice` plus an amber log row, reserving red for the other three. Substring, not equality: the message interpolates a name and a document id.

There is also a **self-heal path** in the script for bunch numbers `20099–20826`, a 2026-07-17 label-printing gap where labels were issued but `Bunch QR Code` records never created. Within that range only, the script will create the record from `variety` + `bunch_size` supplied in the payload. **We send those empty, so the self-heal cannot fire for us** — a bunch in that range will report "not found". Worth knowing if such a label surfaces in the coldroom; it is not worth pre-populating the fields for, since the range is closed and historical.

**No client-side `item_group` derivation and no lockout window.** Any `Grader3` / `SPRAY` substring / 100-second lockout / `DATE_SUB` vs `add_to_date` UTC-vs-EAT note is **Kikwetu's and has been deleted from this plan.** Do not reintroduce it.

**Out of scope:** sqlite, the sync queue, the stem pool (`addToPool` / `gradeFromPool` / `getPoolStatus`), bouquet grading, bucket balance, rejects.

#### As built

`src/app/(app)/grading.tsx`, drawer-only (`href: null`), plus `features/grading/{gradingQr,useSubmitGrading}.ts`, `types/grading.ts`, `lib/serializeByKey.ts`.

- **Two scans, one request.** Badge scan latches the grader **locally, with no network call**. Bunch scans then submit one request each. The grader stays latched across bunches, so a whole bucket is graded on one badge scan; "Change grader" clears it.
- **No bucket displayed anywhere.** There is no bucket in this flow — see above. Server-resolved variety and qty appear in the entries log after each write.
- **Entries log** (`This session`, capped at 12 rows, newest first) records **all three outcomes**: success, duplicate (amber), error (red). A rejected scan is the grader's cue to re-scan and is easy to miss if its only trace is a `Notice` that the next scan overwrites.
- **QR routing is type-aware.** `detectGradingQrType` ports the legacy JSON-key and string-prefix detection, so a badge scanned into the bunch field re-latches the grader instead of being submitted as a bunch. Bucket-type QRs are rejected with the Direct-to-Grader message, as in the reference.
- **Writes are serialized** through `serializeByKey('grading', …)` — §8.1. Lives in `lib/serializeByKey.ts`, not `lib/api.ts` (constraint 3).

### 8.3 Packing — contract confirmed; write path fixed; one blocker left

**Everything this section previously said about packing was wrong.** It was derived from `/tmp/xflora-legacy`, which points at a different site (§8.0).

#### DELETED — the box-scanning model does not exist

None of these are on `xflora.upande.com`. Verified against the full Server Script list (63 scripts):

`list_open_opls_for_packing` · `get_packable_varieties` · `create_boxes_for_opl` · `get_open_box_for_opl` · `add_bunch_to_box` · `close_pack_box` · `pack_bunch_to_opl` · `get_pack_box_recipe`

The three "blocking questions" about `add_bunch_to_box` are deleted with it — there is no such endpoint to ask questions about. **`createOrUpdateFarmPackList` is the only packing write.**

Note the reversal: §8.3 previously deleted `createOrUpdateFarmPackList` as "Karen's flow, does not exist on Xflora". That was exactly backwards. It exists, it is enabled, and it is the whole contract.

#### The real contract

`POST /api/method/createOrUpdateFarmPackList` — Server Script `Create Or Update Farm Pack List`, module `Upande Harvest`, enabled. Requires `Content-Type: application/json`; the script reads `frappe.request.get_json()`.

```
{
  custom_sales_order:     string,   // REQUIRED — throws if missing
  custom_order_pick_list: string,   // REQUIRED — throws if missing
  custom_customer:        string,   // used only as Box Label.customer on creation
  custom_farm:            string,   // read into a local and never used — see below
  items: [{
    item_code:          string,     // required per row
    bunch_uom:          string,     // required per row, format "Name(number)"
    bunch_id:           string,     // required per row
    custom_stem_length: string,     // required per row
    box_id:             string,     // default "1"
    bunch_qty:          number,     // default 1
  }]
}
```

**Response envelope is `data`, not `message`.** The script sets `frappe.response['data'] = {...}`, so the client reads `res.data.data`:

> 🟡 **Snapshot-sourced (~27 July 2026), pending live confirmation** (§8.0). **Confirm this first** — it is the cheapest of the three to settle (one successful pack shows it) and the most disruptive to get wrong: a wrong envelope makes every successful pack look like a parse failure. Given this backend already uses three different envelope shapes across four endpoints, do not assume. Write the parse defensively: prefer `data`, fall back to `message`, and log which one answered.

```
{ status: 'created' | 'updated', message, docname, already_packed: [...], newly_packed: number }
```

**Every error is double-wrapped.** The script's outer handler is `except Exception as e: frappe.throw(_("Error processing packing: ") + str(e))`, and `frappe.throw` is how its own validations fire — so they get caught and re-thrown with the prefix. A Rule-2 rejection reaches the client as `Error processing packing: Bunch BUNCH-123 has not been graded in the system…`. **Match on substrings, never on equality.**

`custom_farm` is assigned to a local (`user_farm`) and then never read. **Send it — it is not merely harmless, it is the value `Box Label.farm` needs**, and the fix for that is on the server side of the same wire (see the Box Label section). It does not affect the write today. On the create path neither customer nor farm is set on the Farm Pack List itself.

#### ✅ FIXED (2026-08-20) — summary-field corruption. Analysis retained as the verification shape.

**Three defects fixed on live `xflora.upande.com`.** The live script body was byte-identical to the snapshot and untouched since 2026-02-20, so the analysis below described the live behaviour exactly — which is also the strongest confirmation yet that the snapshot reading of this script was sound (§8.0).

| # | Fixed | Effect |
|---|---|---|
| 1 | `custom_number_of_stems` no longer accumulates — corrected at **three sites**; it is a per-bunch constant | removes the N² × 10 inflation |
| 2 | `set_summary_fields` derives `total_stems` from `doc.pack_list_item`, not the request payload | cumulative in **both** branches; kills the assign-not-accumulate under-reporting |
| 3 | `packed` % denominator uses `OPL.custom_total_stems` instead of summing `loc.qty` | `loc.qty` is in **bunches** on a `Bunch(N)` OPL, so the percentage was inflated ~tenfold |

Defect 3 was not in the original analysis — it is a second, independent inflation in the same computation, and it means the historical `packed` figures were wrong by both N² *and* a bunches-vs-stems factor.

**Packing writes are no longer corrupt.** This is no longer a ship gate.

**Retained below, deliberately:** the mechanism and the N = 1 exposure table. They are now the **post-fix verification shape** — they say precisely what a correct session should and should not look like, and defect 2's fix is the one our one-bunch-per-scan client depended on most.

Two things this does *not* settle:

- **The 16 existing FPLs still carry the old figures.** The fix corrects future writes; it does not recompute stored documents. Backfill remains a separate decision.
- **Remaining packing blockers are unchanged** and all still backend: the `item_code` convention question gating Rule 3, the closure trigger for the Box Label PDF, and Box Label field population.

<details>
<summary><strong>Original analysis — retained as the verification shape</strong></summary>

**This was the highest-severity item in §8.3 and a hard gate on shipping packing.** It outranked the Box Label field gaps: those make labels incomplete, this made stored data wrong.

`FPL-2026-00017` reports `total_stems` **64,000** and `packed` **8000.0%** for a real session of 80 × `Bunch(10)` = **800 stems**. The OPL is correct (`custom_total_stems` `"800"`), so the corruption is entirely inside `createOrUpdateFarmPackList`.

**Bug 1 — create branch inflates by N² × 10**, where N is the number of bunches in one submission. Four independent confirmations:

| FPL | N | N² × 10 | Reported |
|---|---|---|---|
| `FPL-2026-00017` | 80 | 64,000 | 64,000 ✓ *(hand-verified)* |
| `FPL-2026-00015` | 28 | 7,840 | 7,840 ✓ |
| `FPL-2026-00014` | 50 | 25,000 | 25,000 ✓ |
| `FPL-2026-00006` | 40 | 16,000 | 16,000 ✓ |

And `64000 / 800 × 100 = 8000.0%`, matching the reported `packed` exactly.

**Mechanism.** The create branch passes `aggregated_items` to `set_summary_fields`. Grouping has accumulated **both** members of the pair:

```python
grouped_items[key]["bunch_qty"]              += item["bunch_qty"]              # → N
grouped_items[key]["custom_number_of_stems"] += item["custom_number_of_stems"] # → N × 10
```

`custom_number_of_stems` is a **per-bunch constant** (10 for `Bunch(10)`) and must not accumulate. `set_summary_fields` then multiplies the two — `bunch_qty × custom_number_of_stems` = `N × 10N` = **N² × 10**.

The update branch passes ungrouped `processed_items` (each `1 × 10`), so it does not inflate — which is why `FPL-2026-00016` is correct at 140.

**Bug 2 — update branch ASSIGNS instead of accumulating.** `set_summary_fields` sets `total_stems` from the current call's items only, discarding everything packed previously. An FPL updated with a single bunch reports **10 stems** regardless of history — see `FPL-2026-00013`, `00011`, `00003`, all exactly 10.

**Recommended fix: stop deriving summaries from the request payload.** After the appends, sum over the document's own rows:

```python
total = 0
for row in doc.pack_list_item:
    stems_per_bunch = int(row.bunch_uom.split("(")[1].split(")")[0])
    total += (row.bunch_qty or 0) * stems_per_bunch
```

Cumulative and correct in **both** branches, and immune to how the payload happens to be grouped. **The same substitution fixes `sync_box_label`**, which is handed the identical inflated `(bunch_qty, custom_number_of_stems)` pair.

**⚠️ What our own client design does to this.** One-bunch-per-scan (Rule 2's fix) means N = 1 on every request, which changes the exposure rather than removing it:

| | Effect at N = 1 |
|---|---|
| Bug 1 (N² inflation) | **Avoided entirely** — `1² × 10 = 10` is correct |
| Bug 2 (assign not accumulate) | **Fully hit** — `total_stems` is overwritten with `10` on every scan and permanently reads 10 |
| `pack_list_item` row data | **Correct** — `bunch_qty` accumulates via the matched-row increment |
| `Box Label.box_item.qty` | **Correct** — `+= 1 × 10` per scan accumulates properly |

So a session driven by this client produced **accurate row detail and accurate Box Label quantities, with summary fields stuck at one bunch** (`total_stems` 10, `packed` ~1%). Under-reporting rather than inflation — a different symptom from the historical records, which is why post-fix verification should check both shapes.

**Blast radius.** Every FPL and Box Label created through this endpoint between February and the 2026-08-20 fix carries wrong summaries; **16 FPLs exist.**

> **Provenance note (§8.0):** the four N² matches were independent live confirmation that `set_summary_fields` was unchanged from the snapshot body — since borne out directly, the live script having been byte-identical and untouched since 2026-02-20. That is strong corroboration for the rest of the snapshot-sourced reading of this script, including Rule 2's throw and Rule 3's warehouse fallback.

</details>

**✅ VERIFICATION SHAPE — what a correct session should now look like.** Post-fix, one-bunch-per-scan against a `Bunch(10)` OPL with `custom_total_stems` 800:

| After n scans | Expected |
|---|---|
| `pack_list_item` row `bunch_qty` | `n` (unchanged by the fix — was already right) |
| `total_stems` | `n × 10`, **cumulative and rising** — the old bug froze this at 10 |
| `packed` | `n × 10 / 800 × 100` — e.g. 10% at n = 8, never above 100% |
| `Box Label.box_item.qty` | `n × 10` (unchanged — was already right) |

The two "unchanged" rows are the control: if they move, something new has broken. `total_stems` rising is the specific evidence that defect 2's fix took, and it is the one this client most depended on.

#### Rule 2 — graded validation is ALREADY server-side. No backend work.

> 🟡 **Snapshot-sourced (~27 July 2026), pending live confirmation.** The throw below is quoted from the local-snapshot bench, not the live site (§8.0). Confirm by scanning a deliberately ungraded bunch. If it no longer throws, one-bunch-per-scan becomes a tidiness measure rather than a correctness one — and ungraded bunches may be packing silently today.

```python
if not grading_stock_entry:
    frappe.throw(_("Bunch " + bunch_id + " has not been graded in the system. "
                   "Perform the grading scan on it to enable packing"))
```

The lookup is `Stock Entry` where `custom_bunch_id == bunch_id`. Grading sets that field (`mobile_grading_entry` writes `custom_bunch_id` and `custom_scanned_grading = 1`), so the two flows already interlock.

**It surfaces late only because the current client batches.** `frappe.throw` aborts the whole request, so one ungraded bunch at position 17 kills all 25 scans in the array.

**THE FIX IS CLIENT-SIDE: one bunch per scan, `items` of length 1.** Then a rejection blames exactly the bunch that caused it and the preceding scans are already committed. Render the server's message in the `danger` `Notice`.

A second reason to submit singly: rows failing `if not all([item_code, bunch_uom, stem_length, bunch_id]): continue` are **silently dropped** — no error, no mention in the response. In a batch they vanish. At length 1 the array empties and the script throws `No valid entries to process`, which is at least visible.

#### `already_packed` — and the conflict one-per-scan creates

A bunch whose Stock Entry has `custom_scanned_packing == 1` is **not** thrown on. It is appended to `already_packed_bunches` and skipped.

**But that only holds in a batch.** The script also has:

```python
if already_packed_bunches and not processed_items:
    frappe.throw(_("All scanned bunches have already been packed: " + bunch_list))
```

At `items` length 1 an already-packed bunch is *always* the only item, so `processed_items` is always empty and **this always throws.** One-per-scan therefore converts the graceful skip into an exception.

**Consequence for the client:** to surface an already-packed bunch as a `warn` rather than a `danger`, the client must catch the error and test the message for `already been packed`, downgrading the tone on a match. The `already_packed[]` array will effectively never be populated in our usage — it is a batch-only affordance. Do not build the warn path around reading that array.

#### The Sales Order — where the packing session gets its parameters

**✅ UNBLOCKED. `custom_packrate` is confirmed on a live order (value `140`), and no Server Script change is needed.** Read the Sales Order directly:

```
GET /api/resource/Sales Order/<name>          — or frappe.client.get
```

**Do not amend `get_sales_order_lines`.** It does not select the pack fields, and it does not need to; the resource read returns the whole document including children.

**`Sales Order Item`** — one row per variety, each pointing at an OPL:

| Field | Example | Use |
|---|---|---|
| `item_code` | `Confidential-50CM` | the variety |
| `custom_packrate` | `140` (Int) | stems per box |
| `custom_number_of_boxes` | `2` | boxes for this line |
| `custom_opl` | `OPL-2026-02904` | the OPL this line packs against |
| `qty` | `280` | stems ordered on the line |
| `stock_uom` | `Stems` | unit of `qty` |

**`Sales Order`** (parent) — `customer`, `custom_farm`, `custom_box_type`, `custom_bunching` (`X10`), `custom_total_boxes`.

#### ✅ Read the packing parameters from the OPL, not the Sales Order

**The OPL's own `Pick List Item` rows carry everything the session needs**, so the packing screen never has to fetch the Sales Order at all. Confirmed on two live OPLs:

| Field | `OPL-2026-02914` | `OPL-2026-02172` | Notes |
|---|---|---|---|
| `custom_packrate` | `"495"` | `"312"` | **string here, not Int — parse it.** (`Sales Order Item.custom_packrate` is an Int; the OPL copy is a string. Same meaning, different type.) |
| `custom_total_stems` | `"1485"` | `"936"` | string too |
| rows | 15 | 10 | **row count, NOT box count** |
| boxes | `1485 / 495` = **3** | `936 / 312` = **3** | |
| `item_locations[*].uom` | `Bunch(10)` on all 15 | `Bunch(12)` on all 10 | one size per OPL |
| stem lengths | `50CM` ×14, `60CM` ×1 | `60CM` / `70CM` / `80CM` | **several per OPL** |

Prefer the OPL values: one fetch instead of two, and they are the rows the server matches against.

#### ⛔ `custom_box_id` is a ROW IDENTIFIER, not a box number

**`OPL-2026-02914` has 15 rows numbered 1–15 but only 3 boxes** (`1485 / 495`). `OPL-2026-02172` has 10 rows and 3 boxes. The numbers do not correspond and never will.

**Any earlier claim that box numbers are pre-assigned on the OPL is deleted.** They are not assigned anywhere. **The client owns box numbering** — start at `1`, increment when the Rule 1 cap would be exceeded, stop at `M`. Reading `custom_box_id` as a box number would produce 15 boxes for a 3-box order.

#### STRUCTURAL — what an OPL actually is

**One OPL = one variety (`item_code`), one bunch size (`uom`), MANY stem lengths.**

Corrected: this section previously said "a single variety at a single length" and claimed length was baked into `item_code`. The live data refutes the length half — `OPL-2026-02914` carries `50CM` and `60CM` rows under the same `item_code`, and `OPL-2026-02172` spans `60/70/80CM`.

What that fixes for the screen:

- **Choosing an OPL fixes `item_code`, `custom_packrate`, `custom_total_stems` and the bunch size** for the whole session. Those need reading once.
- **It does not fix stem length.** Length varies per scan and must be carried per bunch — see Rule 3, which now needs two comparisons rather than one.
- Single-*variety* remains structural. Single-*length* was never true.

> **Open question — how is `item_code` versus length actually related?** The Sales Order Item example is `Confidential-50CM`, which looks like it encodes a length; yet an OPL keeps one `item_code` across `50CM` and `60CM` rows. Either the OPL's `item_code` is variety-only and the Sales Order's is not, or the suffix is a naming convention that does not track `custom_stem_length`. **Do not rely on parsing a length out of `item_code`.** Read `custom_stem_length` as its own field, always.

#### Rule 1 — pack rate cap. Client-side; the server has no cap at all.

There is no `pack_rate`, no capacity check and no box-fullness concept anywhere in the script. Nothing stops an overfilled box server-side.

Mirror the script's own parse so client and server agree on stem counts exactly:

```
stems_per_bunch = int(bunch_uom.split("(")[1].split(")")[0])   // "Bunch(10)" → 10
reject when box_total + (bunch_qty * stems_per_bunch) > custom_packrate
```

The script computes `number_of_stems` identically and throws `Invalid bunch size format for UOM '<uom>'. Expected format: 'Name(number)'` when the parse fails — so a client-side parse failure predicts a server-side one, and should block the scan locally rather than round-trip.

**Field name is `custom_packrate`, not `custom_pack_rate`** — the obvious guess is wrong. `xflora_set_so_item_pack_fields` is the desk-side *writer* of it (run after `update_child_qty_rate`, also maintaining `custom_number_of_boxes` and the parent's `custom_total_boxes`); it is not a read path.

**✅ CONFIRMED on two live OPLs. Both bounds come from the OPL:**

```
capPerBox = parseInt(custom_packrate)                        // "495" → 495
boxCount  = parseInt(custom_total_stems) / capPerBox         // 1485 / 495 = 3
```

`OPL-2026-02914`: `1485 / 495` = **3**. `OPL-2026-02172`: `936 / 312` = **3**.

Both fields are **strings** on `Pick List Item` — parse before dividing, or `"1485" / "495"` silently coerces and `"1485" + …` does not.

*Superseded:* the previous formula was `qty / custom_packrate = custom_number_of_boxes` off `Sales Order Item` (`280 / 140 = 2`). Still arithmetically true, but it needs a second fetch and — critically — `qty` on `Pick List Item` means something different (see below). Use `custom_total_stems`.

**Render "Box N of M", and refuse scans past M.** The server has no cap, no box count, and no `box_id` value meaning "invalid", so past box `M` the client is the only thing that can stop a scan.

**⛔ NEVER read `total_stems` back from the server as the running total.** The client must maintain its own, computed from each scanned bunch's `bunch_uom`. This is not a preference or a round-trip optimisation — **`total_stems` is actively wrong on live data**: inflated by N² × 10 on the create branch, and overwritten with only the current call's stems on the update branch. See the CRITICAL section above. A client that trusted it would show `8000%` packed on one OPL and `1%` on another, both for correctly packed boxes.

#### ⚠️ `qty` on `Pick List Item` is BUNCHES, and can be FRACTIONAL

Not stems. And not whole:

| OPL | `qty` | uom | stems |
|---|---|---|---|
| `OPL-2026-02172` | `8.333333333` | `Bunch(12)` | 100 |
| — | `8.5` | `Bunch(10)` | 85 |

**Do not assume whole bunches, and do not use `qty` in the box arithmetic.** Two consequences:

- **Box math uses `custom_total_stems`**, which is already in stems and integral. Deriving stems as `qty × stems_per_bunch` invites float error — `8.333333333 × 12 = 99.999999996`, and comparing that to a cap gives an off-by-one at the boundary.
- A fractional `qty` means the order genuinely expects a **partial bunch**. We submit `bunch_qty: 1` per scanned bunch, so the client's running stem total advances in whole-bunch steps and can never land exactly on a fractional target. Expect the last box of such an OPL to be short by design; do not treat that as a cap failure or block on it.

#### Rule 3 — variety mismatch. CORRECTNESS REQUIREMENT, same tier as Rule 2.

> 🟡 **Snapshot-sourced (~27 July 2026), pending live confirmation** (§8.0). Confirm by scanning a deliberate wrong-variety bunch against a test OPL. Either answer keeps the rule: if the fallback still fires, Rule 3 is the only guard against silent misallocation; if the server now errors instead, Rule 3 becomes defence-in-depth and a faster local rejection. **Implement it either way.**

The script resolves `source_warehouse` by matching `item_code` + `custom_stem_length` + `uom` against `order_pick_list.item_locations`, and **on no match falls back to `item_locations[0].warehouse` with no error and no mention in the response.**

**A bunch of the wrong variety therefore packs successfully, into the wrong warehouse, silently.** Stock lands in the wrong place, the Farm Pack List looks correct, and nothing in the response says otherwise. This is worse than a rejection: it is invisible.

**The client MUST reject a scanned bunch that does not match a row on the OPL, before posting.** No extra round-trip is needed: the `Bunch QR Code` lookup already required for `bunch_uom` returns both fields.

**⚠️ TWO dimensions, checked separately. An `item_code` match is NOT enough.**

Corrected: this previously said length was baked into `item_code`, so one comparison covered both. **False.** A single OPL carries several stem lengths under one `item_code` — `OPL-2026-02914` is `50CM` ×14 plus `60CM` ×1; `OPL-2026-02172` spans `60/70/80CM`. Matching only `item_code` would let a 60CM bunch pass into a 50CM row's slot and pick up the fallback warehouse.

The check is therefore against the OPL's `item_locations`, on **both** fields:

```
accept only if some row in item_locations satisfies
    row.item_code           === bunch.item_code
AND row.custom_stem_length  === bunch.stem_length
```

That is the same pair the server matches on, so a client-side pass predicts a server-side match and the fallback never fires. `uom` is the third dimension the server checks.

Note this makes Rule 3 a **membership test against the OPL's rows**, not a comparison against one scalar — which is what keeps it correct for a mixed-variety OPL as well.

This ranks with Rule 2, not with Rule 1. Rule 1 prevents an overfull box, which is visible and recoverable. Rule 3 prevents silent stock misallocation, which is neither.

#### 🔴 Rule 3 CANNOT be a strict string match yet — the mismatch is CONFIRMED FIRING on live data

**`OPL-2026-02906` holds `item_code` `"Athena"` while its Box Label row reads `"Athena-35CM"`, and its `uom` is `"Stems"`, not `"Bunch(10)"`.** Two of the server's three match dimensions fail, so **every scan on that OPL fell back to `item_locations[0].warehouse` silently.** This is no longer a hypothesis about a convention inconsistency — it has already happened, in production, undetected.

Implemented as strict equality, Rule 3 would **reject every scan** on such an OPL: the bunch's `item_code` (`Athena-35CM`, matching the Box Label form) never equals the OPL's (`Athena`). That converts a silent-corruption bug into a total block, which is safer but unusable.

So Rule 3 is correct in intent and **not yet implementable as specified.** One of these has to happen first, and it is a data/backend decision, not a client one:

1. **Reconcile the `item_code` convention** so OPL rows and `Bunch QR Code` rows agree. Cleanest, and it fixes the warehouse resolution for everyone, not just this client.
2. **Define the relationship explicitly** — e.g. OPL `item_code` is the variety stem and the bunch's is `<variety>-<length>` — and have the client match on the documented derivation rather than equality. Fragile: it re-introduces exactly the "parse a length out of `item_code`" pattern this plan already warns against.

Until one lands, **the client cannot distinguish "wrong variety" from "convention mismatch"**, and any rejection it raises may be a false positive. Do not ship Rule 3 as a hard block against live OPLs before this is settled — and note that not shipping it leaves the silent-misallocation path open, which is why this belongs on the same gate as the summary-field corruption above.

#### ✅ RESOLVED — a `Stems`-uom OPL does NOT break the paren parse

Correcting an earlier claim of mine, which rested on a wrong premise. §8.3 previously recorded that a `Stems`-uom OPL "cannot be packed through this endpoint" because `bunch_uom.split("(")[1]` would throw on `"Stems"`.

**That is wrong. The parse operates on the *payload's* `bunch_uom`, not the OPL's `uom`:**

```python
bunch_uom = entry.get("bunch_uom")          # from items[] — i.e. Bunch QR Code
number_of_stems = int(bunch_uom.split("(")[1].split(")")[0])
```

Since the client always sends `Bunch(N)` from the `Bunch QR Code` record, the parse always succeeds regardless of what the OPL says. `OPL-2026-02906` is the proof: uom `Stems`, and it packed.

**The real consequence is narrower and worse.** The OPL's `uom` is used only in the three-way warehouse match, so a `Stems`-uom OPL **always fails that match and always takes the fallback warehouse** — silently, on every scan, forever. It is not un-packable; it is un-*correctly*-packable.

This folds into Rule 3's blocker above rather than being a separate question: both are the same failure, reached through different dimensions of the same match.

#### `bunch_uom` comes from the bunch, never from the order

| Source | Field | Value | Format |
|---|---|---|---|
| ✅ `Bunch QR Code` | `bunch_size` | `Bunch(10)` | `Name(number)` — what the script's paren parse requires |
| ✅ OPL `item_locations[*].uom` | `uom` | `Bunch(10)` | same format. **Constant across the OPL** |
| ❌ `Sales Order` | `custom_bunching` | `X10` | different format entirely; would throw `Invalid bunch size format` |

**Send the value from the scanned `Bunch QR Code`.** `custom_bunching` is not a substitute — the formats do not agree and passing `X10` fails the parse.

#### ✅ ONE bunch size per OPL — and this closes the gap

All 15 rows of `OPL-2026-02914` are `Bunch(10)`; all 10 rows of `OPL-2026-02172` are `Bunch(12)`. **Size varies between OPLs, never within one.** Read it once, from `item_locations[0].uom`.

Two things follow:

**1. The `uom` format agrees — but NOT universally.** §8.0 flagged as unverified whether OPL `item_locations.uom` used the same `Bunch(N)` form as `Bunch QR Code.bunch_size`. On these two OPLs it does. **But `OPL-2026-02906` has `uom` `"Stems"`**, so the agreement is a property of *some* OPLs, not of the field. Partially resolved only: a `Bunch(N)`-uom OPL will match cleanly; a `Stems`-uom one never will (see the Rule 3 blocker above).

**2. The wrong-size gap is closable *on OPLs whose uom is in `Bunch(N)` form*.** Previously left open because `custom_bunching`'s semantics were unconfirmed; that is no longer the obstacle, since `item_locations[0].uom` states the required size in the same format the bunch record uses:

```
reject when bunch.bunch_size !== opl.item_locations[0].uom
```

Worth doing, because nothing else catches it. A `Bunch(5)` in a `Bunch(10)` OPL passes Rule 3's variety-and-length check, and Rule 1 just counts 5 stems instead of 10 — so the box hits its stem cap holding the wrong number of bunches, and the discrepancy is invisible in both the response and the Farm Pack List. **Recommend adopting this as part of Rule 3**: same "does this bunch belong in this OPL" question, third dimension of the same match.

**Guard it against the `Stems` case**, though — applied naively, this comparison rejects every scan on a `Stems`-uom OPL, since `"Bunch(10)" !== "Stems"`. That is the same blocker as Rule 3's, reached through the third dimension: the check is correct, and it cannot be enabled until OPL uom data is consistent.

`custom_bunching` (`X10`) is then only a human-readable echo on the Sales Order. Its semantics remain unconfirmed but no longer matter to the client.

#### Boxes have no lifecycle

`box_id` is an integer-as-string, default `"1"`. The script converts it with `box_number = int(bucket_id)` and — on `ValueError`/`TypeError` — **silently falls back to `box_number = 0`** rather than erroring. Always send a numeric string.

It becomes `box_number` on a `Box Label` keyed by `(order_pick_list, box_number)`: existing label → matching `box_item` row by `(variety, length)` gets `qty += bunch_qty * number_of_stems`, else a new row is appended; no label → one is created. There is nothing to open and nothing to close. **The client owns the box number: pick it, and increment it when the Rule 1 cap would be exceeded.**

Internally the Farm Pack List stores the box number in a field named `bucket_id` on `pack_list_item`. Confusing, but that is the column — it is the box, not a coldroom bucket.

#### 🔧 Box Label — the printable deliverable. ALL BACKEND WORK.

> **SCOPE: none of this is client work.** Every item here is a change to `sync_box_label` inside the `createOrUpdateFarmPackList` Server Script. **Recorded, not to be attempted from this repo** — it needs Frappe site access and belongs to whoever owns the script.
>
> **Corrected:** this previously said the packing screen "can be built and shipped against the contract as it stands." **It cannot** — the same script corrupts its summary fields on every write (see the CRITICAL section), and `sync_box_label` receives the same inflated `(bunch_qty, custom_number_of_stems)` pair. Box Label quantities are wrong for the same reason and by the same fix. **Building the screen is fine; shipping it is gated on the script fix.**

The `Box Label` print format is **Jinja with `raw_printing = 0`**, so the deliverable is a **rendered PDF attachment**, not an ESC/POS byte stream to a thermal printer. That matters for the client eventually — a PDF is fetched and shared/printed via the OS, not written to a socket — but nothing about it is blocked on the v1.1 Bluetooth printing work.

**Six fields the format renders but `sync_box_label` never sets.** Each renders blank today:

| Field | Renders as | Source |
|---|---|---|
| `farm` | `.farm-name` | the payload's `custom_farm` — **currently read into a local and discarded** |
| `farm_code` | `.farm-subcode` — the `KE/032/0863/132` line | needs a source; farm master data |
| `pack_rate` | `PACKRATE` line | `custom_packrate` on `Pick List Item` |
| `box_total_count` | `.box-count` | the box count — `custom_total_stems / custom_packrate` (Rule 1) |
| `qr_code` | `.qr-placeholder` | generate as the OPL already does for `custom_qr_code` |
| `farm_pack_list_link` | link back to the FPL | **`fpl_name` is already a parameter of `sync_box_label` and ignored.** The field exists. One line. |

`farm_pack_list_link` is the cheapest of the six by a wide margin — the value is already in scope at the call site, it is simply never assigned.

Note this retires an earlier observation. §8.3 previously recorded `custom_farm` as "read into a local and never used — send it anyway, harmless." **It is not merely harmless: it is the input the label's `farm` field needs.** Keep sending it; the fix is on the server side of the same wire.

**⛔ The header `length` field is WRONG and must be resolved, not just populated.**

`Box Label.length` is a Link to `Stem Length` — a single value. But a box holds **one variety across one or more stem lengths, or several varieties when it is a mixed box**, so no single value can describe its contents. `sync_box_label` sets it once, from whichever row created the label, and never updates it. A box built from `50CM` then `60CM` bunches is labelled `50CM`.

Two acceptable fixes; this is a decision, not a bug to patch:

1. **Drop `length` from the format** and render per-row lengths from `box_item`, which already carries `length` per row. Cleanest — the data is already correct at row level.
2. **Redefine it as an explicit summary** (dominant length, or a range like `50–60CM`) and document that it is not authoritative.

Either way, **`box_item` rows are the real contents** — `.product-line` renders one per row — and the header field must not be trusted as a description of the box.

**Day code — DEFERRED, NOT CANCELLED.**

Every physical label carries a `DAY CODE: 6/02` line. **There is no field for it on the doctype**, and no derivation rule recorded anywhere. It is a **KEPHIS export requirement**, so a label without it is not merely cosmetically incomplete.

Needs two things from whoever owns the paperwork: a new field on `Box Label`, and the derivation rule (what `6/02` counts from — day-of-week over week-of-year, packhouse day number, something else). **Out of scope for this phase.**

Recorded explicitly so that **shipping a label without a day code is a decision on record, not something discovered at an inspection.**

**Closure has no trigger — STILL OPEN.**

Every `createOrUpdateFarmPackList` call is an incremental add. Nothing anywhere signals *"this box is finished"* — there is no close endpoint (§8.3 deletions), no status on `Box Label`, and no field the client could set. So there is no event on which to render and attach the PDF.

The client knows when a box is full — Rule 1's cap is exactly that signal — but has no way to communicate it. Resolving this needs a backend affordance: a `close_box`-style call, a status transition, or rendering on the Nth add once `box_total_count` is known. **This is the gating question for the PDF deliverable**, and it is independent of the six missing fields: populating them without a closure trigger still leaves nothing that decides *when* to produce the document.

#### Serialization — requirement stands, reasoning corrected

Not a cap race. `createOrUpdateFarmPackList` does a **read-modify-write on the Farm Pack List document**:

```python
doc = frappe.get_doc("Farm Pack List", existing_doc[0].name)
...
row.bunch_qty = (row.bunch_qty or 0) + vals["bunch_qty"]
doc.save()
```

Two concurrent posts can both read the same `bunch_qty` and both write `n+1`, losing an increment. `Box Label` has the identical fetch → `row.qty += …` → `save()` pattern, so it can lose a box row's stems the same way. There is also a create race: two concurrent first-scans can both find no existing Farm Pack List and both create one for the same `(sales_order, order_pick_list)`.

**Wrap in `serializeByKey('packing')`** — same mechanism as grading (§8.1), different key, so packing and grading do not block each other.

The read-modify-write shape is snapshot-sourced like the rest, but this one needs no live confirmation before building: serializing is correct whether or not the pattern has changed, and the guard costs a little scan latency at worst. Unlike Rules 2 and 3, there is no branch here where the answer changes what we do.

#### Resolved — both former blockers are closed

**(a) pack rate — RESOLVED, field and read path.** `custom_packrate` on `Sales Order Item`, confirmed at `140` on a live order. Read via `/api/resource/Sales Order/<name>` or `frappe.client.get`, which returns the parent and its children in one call. **No Server Script change; `get_sales_order_lines` is not to be amended.** Details under "The Sales Order" above.

*(Superseded: this previously recorded Rule 1 as blocked on the field being unreadable, and proposed adding it to `get_sales_order_lines`. The resource read makes that unnecessary.)*

**(b) resolving `item_code` / `bunch_uom` / `custom_stem_length` from a scanned `bunch_id` — RESOLVED.**

Not `get_bucket_details`. That endpoint takes a **`bucket_id`**, not a bunch, and returns `{bucket_id, variety, greenhouse, farm, found, found_via}` — no UOM, no stem length. Wrong key and wrong fields.

The answer is a direct read of the **`Bunch QR Code`** doctype, keyed by `bunch_id`, which is precisely what `mobile_grading_entry` does internally:

```python
frappe.db.get_value("Bunch QR Code", bunch_id,
                    ["item_code", "stem_length", "bunch_size", "farm"], as_dict=True)
```

Client-side that is `frappe.client.get_value` on `Bunch QR Code` — i.e. **the legacy `getBunchInfo` call is correct after all**, which is consistent with its only legacy consumer having been the packing screen (§8.2).

Field mapping, confirmed against live records:

| Payload field | Source | Example |
|---|---|---|
| `item_code` | `Bunch QR Code.item_code` | `Athena-35CM` |
| `bunch_uom` | `Bunch QR Code.bunch_size` | `Bunch(10)` |
| `custom_stem_length` | `Bunch QR Code.stem_length` | `35CM` |

`bunch_size` is already in the `Name(number)` form the script's paren parse requires — verified on live rows, not inferred.

#### Mix boxes — a supported backend case we are deferring BY CHOICE

This framing has been wrong three times. Each correction narrowed it further than the evidence supported; this version is deliberately the weakest claim the data will carry.

**`custom_is_mixed_box_pick_list` exists on the OPL.** It is `0` on both live samples — so **single-variety is what the current data happens to look like, NOT a structural guarantee.** Mixed boxes are a case the backend supports and models explicitly.

Withdrawn, in order:

1. ~~Mix machinery exists (`PackBoxRecipe`, `is_mix_box`, `MixRecipeItem`, `get_pack_box_recipe`)~~ — all from the wrong site (§8.0); none exist here. Still void.
2. ~~"There is no `is_mix` flag, so there is nothing to filter"~~ — **false. `custom_is_mixed_box_pick_list` is that flag.** The filter requirement is reinstated: see the picker note below.
3. ~~"Mix is structurally absent — a session scoped to an OPL cannot mix, it falls out of the data model"~~ — **false, and the most misleading of the three.** Nothing in the model forbids it; we simply have not seen one.

What holds:

- A box's contents are its **`box_item` rows** — `(variety, qty, uom, length)`. One variety across several lengths, or several varieties in a mixed box. Both are representable and both render (`.product-line` per row).
- **Mixed lengths within one variety are normal**, not an edge case — `OPL-2026-02914` runs `50CM` + `60CM`, `OPL-2026-02172` runs `60/70/80CM`.
- **Deferring mix is a product choice**, and it needs enforcing rather than assuming. **The OPL picker should exclude, or clearly mark, any OPL with `custom_is_mixed_box_pick_list = 1`** — otherwise a packer eventually selects one and the screen behaves as though it were single-variety.

Rule 3 is already correct for this case: it is expressed as a membership test over `item_locations` on `item_code` **and** `custom_stem_length`, not a comparison against one fixed variety, so it holds whether or not the OPL is mixed. No rework needed there when mix is picked up — the work is in selection and in the cap, not in validation.

#### Residual risks to watch when building

- **Check against a LIVE OPL, not a snapshot one.** OPL ids in this plan are illustrative (§8.0) — the snapshot tops out at `OPL-2026-00900` while live is past `OPL-2026-02904`. Anything below only means something when re-read from the live site.
- ~~**BLOCKING — summary-field corruption.**~~ **✅ FIXED 2026-08-20.** Three defects corrected live; writes are no longer corrupt. The retained analysis is now the post-fix verification shape. 16 pre-fix FPLs still carry wrong summaries — backfill is a separate decision.
- **🔴 BLOCKING — the `item_code` / `uom` convention mismatch is firing in production.** `OPL-2026-02906` (`item_code` `Athena` vs bunch `Athena-35CM`, uom `Stems`) fails two of three match dimensions on every scan and silently takes the fallback warehouse. Rule 3 cannot ship as a strict match until OPL and `Bunch QR Code` conventions are reconciled — and not shipping it leaves the silent-misallocation path open. See the Rule 3 blocker.
- **⛔ OPEN — box closure has no trigger.** Nothing signals that a box is complete, so there is no event on which to render the Box Label PDF. Backend affordance required; see the Box Label section. Gates the printable deliverable specifically.
- ~~**OPEN — what gets scanned into a `Stems`-uom OPL?**~~ **RESOLVED** — the paren parse reads the *payload's* `bunch_uom` (always `Bunch(N)` from the bunch record), not the OPL's, so such an OPL packs without throwing. It simply never matches a warehouse. Folded into the Rule 3 blocker above.
- **The OPL picker has exclusion criteria to settle before it is built:** `custom_is_mixed_box_pick_list = 1` OPLs (deferred by choice), and — until the convention mismatch is fixed — OPLs whose `item_code`/`uom` cannot match their bunches, which will silently mis-warehouse everything scanned into them. Decide exclude-vs-mark for each.
- **The silent warehouse fallback is Rule 3, not a watch item.** Promoted — see Rule 3. The `uom` half is **only partially** resolved: two sampled OPLs use `Bunch(N)`, but `OPL-2026-02906` uses `Stems`, so format agreement is a property of some OPLs rather than of the field.
- **The doctype is spelled `Order Pick LIst`** — capital `I`. That typo is the actual doctype name; any direct query must reproduce it.
- The OPL must have `item_locations`, or the call throws `Order Pick List has no location entries defined`.
- The Farm Pack List is `submit()`ed on creation and thereafter updated with `ignore_validate_update_after_submit`, with `status` forced to `Completed` on every write. Expect no draft state.

### 8.4 Dispatch — UNSCOPED, not blocked. This section's premise was wrong.

**Correction: `createDispatchEntry` IS present on Xflora — confirmed live** (§8.0). This section previously said "No endpoints on Xflora. Placeholder only" and called the endpoint "Karen-only". Both are false. A `Dispatch Entry` Server Script exists and is enabled.

So dispatch is not backend-blocked in the way §8.4 claimed. What is actually missing is **scoping**: nobody has said what the Xflora dispatch flow should do, and no one has read the script body.

Before designing anything: read `Dispatch Entry`'s `script` field for the real payload, and check whether `fetchDispatchTrucks` (or any truck-listing equivalent) exists live — it was never probed. Note that `Sales Order Item` carries a `custom_truck` field, which suggests trucks are modelled somewhere.

**The original warning still stands and is the reason this stays unbuilt:** do not design against packhouse's dispatch flow. That would bake Karen's model into Xflora before anyone has decided what Xflora needs. The blocker is a product decision, not a missing endpoint.

### 8.5 Navigation

**Grading is done** — `{ label: 'Grading', icon: Hexagon, route: '/grading' }` in `WORKFLOW_ITEMS`, registered `href: null` in `(app)/_layout.tsx`, so it is drawer-and-quick-action only. The tab bar is full at five; promoting Grading onto it means demoting something else, which is an open call.

**Packing** takes the same treatment when built: drawer entry plus `href: null`. Both are tab-or-drawer destinations, so neither takes `onBack` (§5).

## 9. Phase 7 — ship

```bash
npx tsc --noEmit
npx expo lint
eas update --branch preview --message "Packhouse design system + Grading/Packing"
```

Verify on a preview-channel device, then promote to `production`. No new APK needed at any point in this plan.

---

## Sequencing note

Phases 1–5 are self-contained and shippable on their own. Ship the restyle first rather than holding it behind Grading and Packing.

**Grading is built** (§8.2). **Packing's contract is fully mapped** (§8.3) — every parameter comes off the OPL's own `Pick List Item` rows in one fetch: `custom_packrate` for the per-box cap, `custom_total_stems / custom_packrate` for the box count, `item_locations[0].uom` for the bunch size. Three client-side rules are correctness requirements: Rule 2's one-bunch-per-scan so a rejection blames the right bunch, **Rule 3's two-field variety-and-length match plus the bunch-size check**, and Rule 1's stem cap with the "Box N of M" bound.

**Packing's write path was fixed on 2026-08-20.** ✅ The summary-field corruption — N² × 10 inflation on create, assign-not-accumulate on update, and a bunches-vs-stems denominator in `packed` % — is resolved live. **Writes are no longer corrupt.** 16 pre-fix FPLs still carry wrong summaries; backfill is a separate decision.

*(Two earlier versions of this note were wrong in opposite directions: the first said the Box Label backlog "does not block packing writes" when the writes were themselves corrupt; the second said packing was blocked on that corruption, which is now fixed. Current position below.)*

**One blocker remains before packing can ship:** the **`item_code` / `uom` convention mismatch, firing in production.** `OPL-2026-02906` fails two of three warehouse-match dimensions and silently mis-warehouses every scan. Rule 3 cannot be enabled as a strict match until OPL and `Bunch QR Code` conventions are reconciled — and leaving it off keeps the silent path open. Backend/data work, **not client work.**

**Still open, lower severity:** the OPL picker's exclusion criteria (mixed-box OPLs, and any OPL whose convention mismatch cannot be reconciled), and the Box Label output workstream — six unset fields, a header `length` that cannot describe a real box, a **missing day code KEPHIS requires**, and **no closure trigger to render the PDF on**. The day-code omission in particular is recorded so that shipping without it is a decision rather than a surprise at inspection.

**Confidence is split, and the split matters** (§8.0): endpoint *existence* is confirmed live, but every script *body* comes from a bench snapshot ~27 July 2026. Three snapshot-sourced behaviours carry the correctness rules and are tagged 🟡 at their use sites. They cost three deliberate scans to confirm — a successful pack, an ungraded bunch, a wrong-variety bunch — and that should happen on the first live packing session rather than after it.

**Dispatch is unscoped, not blocked** — `createDispatchEntry` exists live, contrary to what §8.4 previously claimed. What is missing is a product decision about what Xflora dispatch should do, plus a read of the script body.
