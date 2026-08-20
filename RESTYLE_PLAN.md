# Restyle Plan — aligning xflora-rn to the Upande Packhouse design system, + Grading and Packing

> **Reference (read-only):** `mark-judah/upande-packhouse` — Expo SDK 54 / RN 0.81.5, expo-router, Ionicons, zustand + repository pattern.
> **This app:** Expo SDK 56 / RN 0.85.3 / React 19.2.3, expo-router, **lucide-react-native**, **react-query**, expo-secure-store, Sentry.
>
> **Scope:** adopt the packhouse *visual system* and its `Screen` / `Card` / `Alert` primitives. Keep our dashboard, our data layer, our auth, our router, our SDK version. Then port Grading and Packing from the `kikwetu` branch.
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

## 5. Phase 3 — migrate the six screens

Order matters: establish the pattern on the smallest file, verify on a device, then repeat.

1. `configure.tsx` (110 lines) — the pattern-setter
2. `rejects.tsx` (303)
3. `bucket-transfer.tsx` (283)
4. `shelving.tsx` (333)
5. `receiving.tsx` (436)
6. `issuing.tsx` (464)

For each: replace `<SafeAreaView>` + `<AppBar>` + hand-rolled `<ScrollView>` with `<Screen title="…">`, then group each logical form section in a `<Card title="…">`. Replace ad-hoc inline warning/error blocks with `<Alert tone>`. Delete the now-dead local `styles` entries as you go — don't leave orphans.

Two notes:

- Packhouse's `Screen` has **no back affordance** — navigation is drawer + tabs, and the header is hamburger-only. **We diverge deliberately here:** the reference has no back prop because it has no pushed routes, and we do. `Screen` takes an optional `onBack` that swaps the hamburger for a lucide `ChevronLeft` in the same leading slot; when it is set the drawer is not mounted, since there would be no way to open it.

  `onBack` goes on exactly the four routes registered `href: null` in `(app)/_layout.tsx` — `rejects`, `configure`, `erp-desk`, `stock-entry/[id]`. The five tab destinations (`index`, `receiving`, `bucket-transfer`, `shelving`, `issuing`) stay hamburger-only. Applied to `configure`, `erp-desk`, and `stock-entry/[id]`; `rejects` picks it up when it migrates as Phase 3 step 2.

  Note that `erp-desk` and `stock-entry/[id]` were bare "coming in Phase 6" stubs with no header of any kind, so they were wrapped in `<Screen scroll={false}>` rather than converted.
- Once all six are migrated, `AppBar.tsx` has no consumers. Delete it in Phase 5, not before.

**Verify:** each screen on a physical device against production before moving to the next. These are live coldroom flows.

## 6. Phase 4 — Button and the primitive backfill

Upgrade `src/components/ui/Button.tsx` to the packhouse contract: `borderRadius.full`, `minHeight: 48`, Poppins **bold** label, `variant: 'primary' | 'outline' | 'ghost'`, `iconLeft`, `loading` rendering an inline `ActivityIndicator`, disabled at `opacity: 0.45` and pressed at `0.85`.

The current API takes `children`; packhouse takes `label`. Support both during migration (`label?: string; children?: ReactNode`) so the six screens don't all have to change in the same commit.

Then backfill only what the screens actually need — resist porting all twelve. `Segmented` (Receiving's single/batch/bunched mode switch is hand-rolled today), `ProgressBar`, `Toast`, and `OfflineBanner` are the ones that pay for themselves. `Dropdown` overlaps our existing `Picker` — compare before porting, don't end up with both.

## 7. Phase 5 — cleanup

- **Fix the scan line.** `src/features/scanning/BarcodeScannerOverlay.tsx:111` uses `ACCENT` as the scan-line `backgroundColor`. With accent now `#171717`, that's a black line on a dark camera feed — invisible. Change to `#FFFFFF` (or `colors.success` if you want it to read as "armed"). **This is a functional regression if missed, not a cosmetic one.**
- Rename the five `const ACCENT = colors.accent` declarations in `receiving` / `rejects` / `shelving` / `bucket-transfer` / `issuing` to reference `colors.text` (icons) or `colors.primary` (fills) per site.
- `Pill.tsx:11` `info: colors.accent` → `colors.info`.
- `login.tsx:179` `clientBadge` → `colors.textMuted`; a black badge under the logo reads as an error.
- `index.tsx:72` `ActivityIndicator color={colors.accent}` → `colors.text`.
- Delete `colors.accent` from `theme.ts`. `npx tsc --noEmit` is the proof.
- Delete `AppBar.tsx`.
- **Remove the Phase 2 `ui-preview` harness — all three pieces:**
  1. the route file `src/app/(app)/ui-preview.tsx`
  2. its `<Tabs.Screen name="ui-preview" options={{ href: null }} />` entry in `src/app/(app)/_layout.tsx`
  3. the `{ label: 'UI Preview', icon: LayoutGrid, route: '/ui-preview' }` row in `WORKFLOW_ITEMS` in `src/features/navigation/drawerItems.ts`

  Missing (2) leaves a `Tabs.Screen` pointing at a route that no longer exists; missing (3) leaves a dead drawer row that throws on tap. Deleting only the file is not enough.

## 8. Phase 6 — Grading and Packing

**These already exist on the `kikwetu` branch of this repo**, in this architecture — expo-router, lucide, react-query, `useStation`, `playSubmit` / `playError`, `haptics`, `extractFrappeError`, `BarcodeScannerOverlay`, `Picker`, `Pill`.

```
src/app/(app)/kikwetu/grading.tsx            424 lines
src/app/(app)/kikwetu/packing.tsx            573 lines
src/features/grading/useCreateGradingEntry.ts
src/features/grading/useBunchSizeOptions.ts
src/features/packing/useCreateOrUpdateFarmPackList.ts
src/features/packing/useFetchPickListWithFarmPackList.ts
src/types/grading.ts
src/types/packing.ts
```

Bring them over with `git checkout origin/kikwetu -- <path>` per file, land them at `src/app/(app)/grading.tsx` and `src/app/(app)/packing.tsx` (no `kikwetu/` segment), then restyle to `<Screen>` + `<Card>` like Phase 3.

**The port is UI-cheap and backend-expensive.** The screens carry Kikwetu's business rules, which are not Xflora's:

- **Grading** — Kikwetu is per-bunch QR against the `Grader3` server script, which derives `bunch_size` from the variety's `item_group` (case-insensitive `SPRAY` substring → 5, else 10) and enforces a 100-second `Bunch QR Code` lockout. It also carries the timezone fix: the window must be computed with `frappe.utils.add_to_date(frappe.utils.now_datetime(), seconds=-100)`, **not** SQL `DATE_SUB(NOW(), …)` — MariaDB's `NOW()` is UTC while Frappe stores local (EAT), so the SQL form never expires. Xflora already has a `get_grading_stats` script feeding the Graded dashboard tile, so grading data exists on that instance — the open question is which doctype writes it and whether the QR contract is the same.
- **Packing** — Kikwetu scans an OPL QR (URL form, last path segment is the ID), loads via `get_pick_list_with_farm_pack_list` (response under `data`, **not** `message`), applies ten client-side validations, and submits a batch to `createOrUpdateFarmPackList`. Xflora needs to actually have `Farm Pack List` and those two endpoints.

**Gate on this before writing any Grading/Packing code:** confirm on `xflora.upande.com` whether (a) the grading QR contract and target doctype match Kikwetu's, and (b) `get_pick_list_with_farm_pack_list` / `createOrUpdateFarmPackList` / `Farm Pack List` exist. If either is absent, the phase is a backend build with a UI port on top, not a UI port — size it accordingly.

`drawerItems.ts` already has both stubbed as v2 candidates; uncomment and point at the new routes. Decide whether either earns a slot on the five-tab bar in `(app)/_layout.tsx` or stays drawer-only with `href: null`.

## 9. Phase 7 — ship

```bash
npx tsc --noEmit
npx expo lint
eas update --branch preview --message "Packhouse design system + Grading/Packing"
```

Verify on a preview-channel device, then promote to `production`. No new APK needed at any point in this plan.

---

## Sequencing note

Phases 1–5 are self-contained and shippable on their own. Phase 6 depends on backend answers that don't exist yet. Ship the restyle first rather than holding it behind Grading and Packing.
