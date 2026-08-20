# Restyle Plan — aligning xflora-rn to the Upande Packhouse design system, + Grading and Packing

> **Reference for the LOOK (read-only):** `mark-judah/upande-packhouse` — Expo SDK 54 / RN 0.81.5, expo-router, Ionicons, zustand + repository pattern.
> **Reference for the CONTRACT (read-only):** `teddy5456/Upande-Harvest-React` — the live Xflora app. Endpoints and payloads only, no code. See §8.0.
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

## 7. Phase 5 — cleanup

All done except the harness removal at the bottom. Two corrections to what this section originally said:

- ~~**Fix the scan line.**~~ **The original bullet was wrong on three counts.** `BarcodeScannerOverlay.tsx` has **no scan line** — no reticle, no animated bar, just a full-bleed `CameraView` and a close button. Line 111 is `settingsBtn`, the "Open Settings" button on the permission-denied screen. And its `ACCENT` was `const ACCENT = '#699dcd'` — a **hardcoded literal, not `colors.accent`** — so Phase 1's alias never touched it and there was no invisible-black-line regression to fix.

  **The underlying worry was real, just mislocated.** `settingsBtn` sits on a `#000` background, so resolving it to the monochrome primary `#171717` would have made it near-invisible — the exact failure the bullet described, on a different element. Resolved by inverting instead: `#FFFFFF` fill with `#171717` text.
- **The `rgba(105,157,205,·)` hairlines were an unlisted site.** Five `qrBtn` borders (`receiving`, `rejects`, `shelving`, `bucket-transfer`, `issuing`) and issuing's packing-card border hardcoded the steel-blue at 0.3–0.4 alpha rather than going through `colors.accent`. **`tsc` cannot catch these** — deleting the token proves nothing about a string literal. All now `colors.border`. Grep for the literal, don't trust the compiler.
- Renamed every `const ACCENT = colors.accent` across `receiving` / `rejects` / `shelving` / `bucket-transfer` / `issuing`, resolving per site: `colors.text` for icons and spinners, `colors.primary` for fills (checkbox, chip), `colors.border` for hairlines. The `const ACCENT` declarations are gone rather than repointed.
- `Pill.tsx` `info: colors.accent` → `colors.info`.
- `login.tsx` `clientBadge` → `colors.textMuted`.
- `index.tsx` `ActivityIndicator color={colors.accent}` → `colors.text`.
- Deleted `colors.accent` from `theme.ts`; `npx tsc --noEmit` clean. No `colors.accent`, `ACCENT`, or `105,157,205` reference survives anywhere in `src/`.
- ~~Delete `AppBar.tsx`.~~ **Not in this phase.** `rejects.tsx` is out of Phase 3 and still renders `AppBar`, so the component keeps a live consumer. See §5.
- **Remove the Phase 2 `ui-preview` harness — all three pieces. ⚠️ DELIBERATELY NOT DONE YET.**
  1. the route file `src/app/(app)/ui-preview.tsx`
  2. its `<Tabs.Screen name="ui-preview" options={{ href: null }} />` entry in `src/app/(app)/_layout.tsx`
  3. the `{ label: 'UI Preview', icon: LayoutGrid, route: '/ui-preview' }` row in `WORKFLOW_ITEMS` in `src/features/navigation/drawerItems.ts`

  Missing (2) leaves a `Tabs.Screen` pointing at a route that no longer exists; missing (3) leaves a dead drawer row that throws on tap. Deleting only the file is not enough.

  **Held back on purpose:** the harness is the only place `Button`'s six variants and `Segmented` can be checked in isolation, and Phases 3–5 have not been verified on a device yet. Deleting it now would remove the instrument before the measurement. **This is the last outstanding Phase 5 item — do it once the device pass is signed off, before the Phase 7 `eas update`.**

## 8. Phase 6 — Grading and Packing

**Backend status on `xflora.upande.com`:** the APIs exist through packing. **Grading and Packing are UNBLOCKED.** Dispatch has no endpoints and stays blocked — see §8.4.

### 8.0 Source split — read this first

Two reference repos, and they are authoritative for different things. Mixing them up is how Kikwetu's and Karen's business rules leak into Xflora.

| | Repo | Authoritative for | Never take |
|---|---|---|---|
| **Look** | `mark-judah/upande-packhouse` → `/tmp/packhouse` | `Screen` / `Card` / `Notice` / `Button`, layout, component structure | business logic, endpoints, payloads |
| **Contract** | `teddy5456/Upande-Harvest-React` → `/tmp/xflora-legacy` | endpoint names, payload shapes, response envelopes, write ordering | architecture, any code |

```bash
git clone --depth 1 https://github.com/teddy5456/Upande-Harvest-React.git /tmp/xflora-legacy
```

**Do not port from `/tmp/xflora-legacy`.** It is React Navigation + expo-sqlite + an offline sync queue on SDK 54. We take the *contract only* and build fresh on `Screen` / `Card` / `Notice` + react-query. Every endpoint below is in `/tmp/xflora-legacy/src/services/api.ts`.

Note that packhouse's packing screen lives at `src/tenants/karen/features/packing/PackingScreen.tsx` — under `tenants/karen`. The path itself is the warning: that file's flow is Karen's, and only its layout transfers.

The earlier plan to `git checkout origin/kikwetu -- <path>` the Kikwetu grading/packing screens **is withdrawn.** Those screens encode Kikwetu's rules against Kikwetu's endpoints; neither matches Xflora.

### 8.1 Hard requirement — write serialization

`submitGrading` is wrapped in `serializedByKey('grading', …)` — `api.ts:460`, with the rationale at `api.ts:486-492`. Same-key submissions run strictly one at a time: on slow networks, rapid scanning lets request N+1 reach the server before N's ACK, and for Stock-Entry writes that corrupts bucket state.

**React Query mutations run in parallel by default, so this guard does not come for free — it must be carried across explicitly.** A per-key in-flight promise map (`api.ts:493-507`) is the reference implementation: same key queues, different keys stay parallel, and a rejected predecessor still lets the successor run.

This is a correctness requirement, not an optimisation. A grading screen without it will corrupt bucket state in the field under exactly the conditions it is used in — fast repeated scans on coldroom Wi-Fi.

**OPEN QUESTION — do not decide unilaterally.** The legacy app serializes five keys: `grading` (460), `harvest` (523), `receiving` (543), `issuing` (892, 900), `receiving_out` (930). It does **not** serialize `add_bunch_to_box` (583) or `pack_bunch_to_opl` (607), which are also scan-driven writes. Either that is a deliberate exemption because boxes tolerate concurrent appends, or it is a latent bug the legacy app has not hit yet. **Resolve with the backend owner before building Packing.**

**The §8.3 pack-rate cap narrows this question sharply.** A stem cap is a read-modify-write against a shared per-box total: read `stemsInBox`, add `incomingBunchSize`, compare to `pack_rate`. Two concurrent scans can both read the same total, both pass the check, and both commit — overfilling the box. That is precisely the corruption `serializedByKey` exists to prevent, and it means the "boxes tolerate concurrent appends" reading only holds if the box has no cap. It has one.

So the answer follows from §8.3(a):

- **If `add_bunch_to_box` enforces the cap atomically server-side**, client serialization is a UX nicety — the server is the guard, and a concurrent scan gets a clean rejection.
- **If the client is the only enforcement**, concurrent scans defeat the cap outright and serialization is **mandatory**, exactly as it is for grading.

**Recommendation, raised from neutral:** serialize `add_bunch_to_box` and `pack_bunch_to_opl` **unless the backend owner confirms atomic enforcement.** Serializing when it turns out to be unnecessary costs a little scan latency; not serializing when it was necessary overfills boxes in the field. The asymmetry favours the guard, so it should be the default and removed only on a confirmed answer.

### 8.2 Grading — unblocked, online-only, core flow only. ✅ BUILT

**ONE call. `mobile_grading_entry`, and nothing else.**

Two endpoints this section previously specified are **not part of grading**, for two different reasons:

1. **`upande_harvest.api.get_grader_open_bucket` does not exist on `xflora.upande.com`.** Verified against the site: `upande_harvest.api` contains dashboard functions only, and the short-form endpoints are Server Scripts. Calling it returns `module 'upande_harvest.api' has no attribute 'get_grader_open_bucket'` — the app is installed, the function is not. **Do not work around this client-side.** The server resolves the grader's open bucket during the write, so there is nothing to reimplement.
2. **`frappe.client.get_value` on `Bunch QR Code` (`getBunchInfo`, `api.ts:467`) is a packing call.** Its only consumer is `XfloraPackingScreen.tsx:199`. Production removed the grading pre-fetch deliberately and left the reason in the source (`GradeScreen.tsx:284-287`):

   > *"we no longer pre-fetch bunch_size + stem_length here. The server's Mobile Grading Entry API reads them from the Bunch QR Code directly, so the pre-fetch was a redundant 150-300ms round-trip per scan. Sending empty strings is equivalent for the server."*

   Re-adding it would put 150–300ms back on **every scan** in the app's fastest-repeating flow.

| Endpoint | Payload | Source |
|---|---|---|
| `mobile_grading_entry` | `{ bucket_id: '', bunch_id, bunch_size: '', farm, grader, qty: 0, stem_length: '', variety: '' }` | `api.ts:446`, `GradeScreen.tsx:281-297` |

Five fields go empty on purpose: `bucket_id` because the server resolves it from the grader, and `bunch_size` / `stem_length` / `variety` / `qty` because the server reads them off the `Bunch QR Code` record.

Response: `{ message, stock_entry, variety, source_item, stem_length, qty, bucket_remaining_stems? }` (`types/index.ts:100-110`). It is the **only** source for variety / stem length / qty — the client cannot know them pre-submit — so it drives the entries log.

**Ignore `bucket_remaining_stems`.** Production documents it as unreliable on re-used buckets: it sums every harvest and every bunch the bucket has ever seen with no cycle window, so it floors at 0 (`GradeScreen.tsx:310-316`).

**No client-side `item_group` derivation and no lockout window.** Any `Grader3` / `SPRAY` substring / 100-second lockout / `DATE_SUB` vs `add_to_date` UTC-vs-EAT note is **Kikwetu's and has been deleted from this plan.** Do not reintroduce it.

**Out of scope:** sqlite, the sync queue, the stem pool (`addToPool` / `gradeFromPool` / `getPoolStatus`), bouquet grading, bucket balance, rejects.

#### Accepted consequence — first-scan failure, not badge-scan failure

Without a pre-flight there is no point at which the client can check whether a grader has an open Receiving Out. **A grader who has not done Receiving Out is therefore not caught when their badge is scanned — they find out on their FIRST BUNCH SCAN**, when `mobile_grading_entry` rejects the write.

This is accepted. The server's error is more specific than anything the client could synthesise, and it surfaces through the `danger` `Notice`, which already works. The cost is one wasted bunch scan per mis-sequenced grader; the alternative was a call that does not exist.

#### As built

`src/app/(app)/grading.tsx`, drawer-only (`href: null`), plus `features/grading/{gradingQr,useSubmitGrading}.ts`, `types/grading.ts`, `lib/serializeByKey.ts`.

- **Two scans, one request.** Badge scan latches the grader **locally, with no network call**. Bunch scans then submit one request each. The grader stays latched across bunches, so a whole bucket is graded on one badge scan; "Change grader" clears it.
- **No resolved-bucket card.** The bucket cannot be known before the first submit, so nothing about it is displayed. Server-resolved variety / stem length / qty appear in the entries log *after* each write instead.
- **Entries log** (`This session`, capped at 12 rows, newest first) records **failures as well as successes**. A rejected scan is the packer's cue to re-scan and is easy to miss if its only trace is a `Notice` that the next scan overwrites.
- **QR routing is type-aware.** `detectGradingQrType` ports the legacy JSON-key and string-prefix detection, so a badge scanned into the bunch field re-latches the grader instead of being submitted as a bunch. Bucket-type QRs are rejected with the Direct-to-Grader message, as in the reference.
- **Writes are serialized** through `serializeByKey('grading', …)` — §8.1. Lives in `lib/serializeByKey.ts`, not `lib/api.ts` (constraint 3).

### 8.3 Packing — unblocked

Xflora's own contract. `api.ts:579-615`:

| Endpoint | Payload |
|---|---|
| `list_open_opls_for_packing` | `{ from_date?, to_date? }` |
| `get_packable_varieties` | `{}` |
| `create_boxes_for_opl` | `{ opl }` |
| `get_open_box_for_opl` | `{ opl }` |
| `add_bunch_to_box` | `{ bunch_id, box_id?, opl?, farm? }` |
| `close_pack_box` | `{ box_name }` |
| `pack_bunch_to_opl` | `{ opl, bunch_id }` |

**Deleted from this plan as not existing on Xflora:** `get_pick_list_with_farm_pack_list`, `createOrUpdateFarmPackList`, `fetchPicklists`, `fetchStockEntryByBunch`, and the `Farm Pack List` doctype. Those are Karen's Farm Pack List flow. The ten client-side validations and the `data`-not-`message` envelope quirk went with them.

Use packhouse's `PackingScreen.tsx` for layout and component structure only.

#### Rule 1 — pack rate cap

**Scope: Xflora packs straight single-variety boxes.** Mix boxes are a later phase — see "Mix boxes" below. Rule 1 is the correct cap for every box in Phase 6 scope.

`pack_rate` comes from the Sales Order via the OPL. It is returned by `get_open_box_for_opl` (`OpenBoxResponse.pack_rate`, `types/index.ts:373`) and by `list_open_opls_for_packing` (`PackableOpl.pack_rate`, `types/index.ts:382`). A third endpoint, `get_pack_box_recipe`, also carries it (`PackBoxRecipe.pack_rate`, `api.ts:649`), but is not needed in Phase 6 — again, see "Mix boxes".

**`pack_rate` is expressed in STEMS, not bunches.** A box at `pack_rate` 250 holds 25 bunches only if every bunch is size 10, and `bunch_size` is per `Bunch QR Code` record. **Do not implement a bunch-count cap.** Track a running stem total.

The test is whether the **incoming** bunch overshoots:

```
stemsInBox + incomingBunchSize > pack_rate   → reject the scan
```

The legacy app gets this wrong twice, and both are defects to fix rather than behaviour to copy:

1. **Off by one bunch.** `PackingScreen.tsx:199` tests `stemsInBox >= session.pack_rate` — it admits a bunch that overshoots, and only refuses the one *after*. A box at 245/250 accepts a size-10 bunch and lands at 255.
2. **Offline-only.** That check sits inside an `if (!isConnected)` branch. **Online scans have no client-side cap at all** — the online path posts and then merely *reports* the result (`PackingScreen.tsx:246`: `show('success', 'Box full — …')`, a success toast).

#### Mix boxes — deliberately deferred, not missing

Xflora packs single-variety boxes. Mix is a later phase and is **out of Phase 6 scope by decision**, not by oversight. The machinery exists in the contract and is named here so nobody rediscovers it as a gap:

| Symbol | Location | Status |
|---|---|---|
| `PackableOpl.is_mix` | `types/index.ts:383` | present, unused in Phase 6 |
| `PackBoxRecipe.is_mix_box` | `api.ts:652` | present, unused in Phase 6 |
| `PackBoxRecipe.recipe: MixRecipeItem[]` | `api.ts:653` | present, unused in Phase 6 |
| `MixRecipeItem` — `{ item_code, item_name, target_stems, packed_stems, remaining, done }` | `api.ts:636-643` | present, unused in Phase 6 |
| `get_pack_box_recipe` | `api.ts:657` | **not called in Phase 6** |

**Requirement:** if `list_open_opls_for_packing` returns OPLs with `is_mix: true`, **filter them out of the picker.** The payload accepts only `{ from_date?, to_date? }`, so there is no server-side filter to ask for — this is a client-side exclusion. A mix OPL that can be selected will fail somewhere deeper in the flow, where the error is far harder to read than "not offered".

**Consequence for whenever mix does land: Rule 1 gets rewritten, not extended.** A mix box's cap is not one stem total against one `pack_rate` — `MixRecipeItem` carries `target_stems` / `packed_stems` / `remaining` **per `item_code`**, so the cap becomes per-recipe-line, and the admission test becomes "does this bunch's variety have a line with room" rather than "is there room in the box". A single running total cannot express that. Recording it now so nobody tries to bolt mix onto Rule 1 later.

#### Rule 2 — graded validation at scan time

An ungraded bunch must be rejected **the moment it is scanned**, not at `close_pack_box`. Deferring it to close means a packer discovers the bad bunch after the box is physically packed. Current behaviour is the defect being fixed.

#### Backend implication — record, do not design around

Both rules are most likely **server-side changes to `add_bunch_to_box`**, which today appears to accept both overfill and ungraded bunches.

**Client-side enforcement alone is not sufficient.** Two scans landing concurrently can both read the same stem total and both pass a client check, and the box overfills anyway. The robust shape is **atomic rejection inside `add_bunch_to_box`**, with the client mirroring the rule purely for instant feedback.

#### BLOCKING QUESTIONS for the backend owner

- **(a)** Does `add_bunch_to_box` reject a bunch that would exceed `pack_rate`, or does it accept and merely flag? *Evidence it does not reject:* the legacy online path treats a full box as a success (`PackingScreen.tsx:246`), which implies the server accepted the overshooting bunch and reported `full: true` afterwards.
- **(b)** Does it reject an ungraded bunch, or is that check only in `close_pack_box`?
- **(c)** Does its response return `stems_count` and the bunch's own stem contribution, so the client can render `N/250` without a second round trip? **Largely already answered — needs confirmation, not discovery.** `AddBunchResponse` (`types/index.ts:314-324`) already declares `stems` (this bunch's contribution), `stems_count`, `pack_rate`, `remaining`, and `full`; `PackBunchToOplResponse` (`types/index.ts:401-417`) declares the same set plus `bunch.bunch_size`. So the question narrows to whether those fields are populated and authoritative post-write.

Serialization for `add_bunch_to_box` / `pack_bunch_to_opl` is unresolved — see §8.1, where these rules sharpen it considerably.

### 8.4 Dispatch — BLOCKED

No endpoints on Xflora. Placeholder only.

`fetchDispatchTrucks` and `createDispatchEntry` are **Karen-only**. Xflora's dispatch contract is **undefined** — not "the same as Karen's", not "probably like packing". **Do not design against packhouse's dispatch flow;** doing so would bake Karen's model into Xflora before the backend has an opinion. Revisit when endpoints exist.

### 8.5 Navigation

`drawerItems.ts` has Grading and Packing stubbed as v2 candidates; uncomment and point at `/grading` and `/packing`. Decide whether either earns a slot on the five-tab bar in `(app)/_layout.tsx` or stays drawer-only with `href: null`. Both are tab-or-drawer destinations, so neither takes `onBack` (§5).

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

Phase 6 is no longer backend-blocked: Grading and Packing are unblocked and can be built once Phase 5 lands. **Grading is clear to start first** — it has no open questions. **Packing has three blocking questions (§8.3) plus the serialization decision that follows from them (§8.1)**, all needing the backend owner. Dispatch stays blocked indefinitely on §8.4.
