# kikwetu-harvest-rn — Locked Stack Decisions

> Read this before writing any code. Do not introduce new libraries or change patterns without updating this file first.

> **When in doubt about a package, check https://docs.expo.dev/versions/v56.0.0/ — STACK.md was drafted before all SDK 56 deprecations were known.**

## Platform
- **Runtime:** React Native via Expo (managed workflow)
- **Expo SDK:** 56 (locked at project creation, May 2026)
- **Target:** Android primary (matches Flutter app's primary use). iOS secondary.
- **Dev client:** Plain Expo Go for v1. Dev build introduced at v1.1 for Bluetooth printing.

## Language
- **TypeScript, strict mode** (`tsconfig.json` already has `"strict": true`)
- No `.js` files except config files
- Path aliases: `@/` → `src/`, `@/assets/` → `assets/` (already configured)

## Navigation
- **Expo Router** (file-based routing, pre-installed in the project)
- Auth-gated routes via `(auth)` and `(app)` route groups
- Initial route logic in `src/app/_layout.tsx`

## State management
- **Zustand** for global client state (auth, client identity, user station)
- **TanStack Query** (`@tanstack/react-query`) for server state — caching, refetch, optimistic updates
- React `useState` / `useReducer` for local component state
- **No Redux.** No MobX. No Context for state (only for theme/i18n if needed).

## HTTP client
- **`axios`** with a single configured instance in `src/lib/api.ts`
- **Auth:** `Cookie: sid=<sid>` injected per-request via interceptor (no mutable shared headers)
- **Base URL:** Read from the Zustand auth store at request time
- **Error normalization:** Single response interceptor mapping Frappe errors → typed `ApiError`

## UI / styling
- **Tamagui** for component primitives and design tokens
- **`lucide-react-native`** for icons
- **No** Material UI / Paper / NativeBase / Gluestack
- Theme tokens mirror Flutter colors:
  - `primary` = `#44433e` (charcoal)
  - `accent` = `#699dcd` (steel blue)
  - `success` = `#48773E` (dark green)
  - `background` = `#F4F4F6`
- Font: Inter (via `@tamagui/font-inter` — ships the same font files and integrates with `createInterFont()`; `@expo-google-fonts/inter` is redundant alongside Tamagui)

## Forms & validation
- **`react-hook-form`** for form state
- **`zod`** for schema validation
- Resolver: `@hookform/resolvers/zod`

## Storage
- **`@react-native-async-storage/async-storage`** for non-sensitive (instanceurl, userStation, email_backup)
- **`expo-secure-store`** for sensitive (API key, API secret)

## Native modules in v1
- **`expo-camera`** — `CameraView` with built-in `barcodeScannerSettings` for QR scanning
- **`expo-audio`** — audio playback for `beep.mp3`, `submit.mp3`, `error.mp3` (replaces `expo-av`, which was split into `expo-audio` + `expo-video` in SDK 54+; `expo-av` is incompatible with SDK 56)
- **`expo-haptics`** — replaces Flutter's `vibration` package (`impactAsync(Heavy)` ≈ 200ms pulse)
- **`react-native-svg`** — required by `lucide-react-native` (icons) and will be used for QR rendering in Phase 6
- **`@react-native-community/datetimepicker`** — native date picker for dashboard date-range filter (Phase 2.4)

## Installed but deferred to Phase 6
- **`react-native-webview`** — ERP Desk screen (Phase 6.3). Token auth does not produce a browser session; proper integration requires `@react-native-cookies/cookies` to inject a Frappe session cookie. Do not use in v1 screens before Phase 6.3.

## Deferred to v1.1 (requires dev build)
- Bluetooth thermal printing (`react-native-thermal-receipt-printer` or similar — printer model TBD)

## Multi-tenancy abstraction
- **`src/lib/clients.ts`** — typed registry mapping `ClientId` → config (theme overrides, feature flags, base URL hints)
- **`src/lib/instanceMapper.ts`** — port of Flutter's `InstanceMapper`, returns typed `ClientId | null` from a URL
- **`useClient()` hook** — returns the current client config from Zustand; no raw string comparisons in components
- v1 implements full Kikwetu config; other clients have stub configs and "Not yet ported" placeholder screens

## Auth pattern — session cookie (`sid`)

Same mechanism as the Flutter app. **There is no API-key step.**

- The host is not typed by the user — it is pinned to `INSTANCE_HOST` in `src/lib/config.ts`
  (`xflora.upande.com`). The login form takes email + password only.
- `normalizeUrl()` (`src/features/auth/authService.ts`) tries `https://` with a 5s HEAD check and
  falls back to `http://`.
- App calls `POST /api/method/login` with a form body (`usr`, `pwd`). The `sid` is read out of the
  response's `Set-Cookie` header — React Native's XHR exposes it; a browser would not.
- A response whose `sid` is missing or literally `Guest` is treated as a failed login.
- `sid` + `instanceUrl` are persisted to `expo-secure-store` (`SECURE_KEYS.SID`,
  `SECURE_KEYS.INSTANCE_URL`) and hydrated into `useAuthStore` on launch by `src/app/_layout.tsx`.
- Every subsequent request carries `Cookie: sid=<sid>`, injected by the `apiClient` request
  interceptor in `src/lib/api.ts`.
- `401` clears the store and deletes the stored `sid`, dropping the user at login. `403` is a normal
  per-endpoint permission error and does **not** log out.

### Cookie scope (verified against `xflora.upande.com`, 2026-09-17)

Frappe sets the session cookie with **no `Domain` attribute**, so it is **host-only** — bound to
`xflora.upande.com` exactly, not `.upande.com`:

```
set-cookie: sid=…; Expires=…; Max-Age=2592000; Secure; HttpOnly; Path=/; SameSite=Lax
```

Two consequences: a `sid` is never valid against a sibling `*.upande.com` site, and `Max-Age` is
30 days, so a stored session outlives a shift but not a month of leave.

## Error tracking
- **Sentry React Native** — new Sentry project (separate from Flutter), DSN in `.env`

## OTA updates
- **EAS Update** — replaces Flutter's `upgrader` package and Shorebird

## Phase 0 lessons learned

- **Verify SDK 56 compatibility before assuming a package works.** `expo-av` was listed in initial planning but is incompatible with SDK 54+; it crashes at runtime with `NoClassDefFoundError`. Always cross-check against https://docs.expo.dev/versions/v56.0.0/ before committing a package choice.
- **`npx expo install` over `npm install` for native modules.** It pins the version that matches the current SDK and automatically adds config plugins; bare `npm install` can pull in a mismatched version.
- **Test the dev client APK after every native module addition.** JS-only changes are safe to OTA; anything that touches native code requires a rebuild before the crash surface is known.

## What we explicitly chose NOT to use
- ❌ Redux / Redux Toolkit — overkill for this app's state shape
- ❌ React Navigation — Expo Router is the modern default
- ❌ React Native Paper / NativeBase / Gluestack — Tamagui is more flexible for visual redesign
- ❌ Cookie auth — token auth instead
- ❌ Mutable shared headers — axios interceptor injects per-request

## File structure (feature-folder)
src/
├── app/                       # Expo Router routes
│   ├── _layout.tsx            # Root layout (auth gate)
│   ├── (auth)/
│   │   └── login.tsx
│   └── (app)/
│       ├── _layout.tsx        # Tabs/drawer
│       ├── index.tsx          # Dashboard (entry list)
│       ├── configure.tsx      # Station setup
│       └── kikwetu/
│           ├── harvesting.tsx
│           ├── receiving.tsx
│           ├── grading.tsx
│           ├── grading-test.tsx
│           ├── packing.tsx
│           ├── dispatch.tsx
│           ├── discards.tsx
│           ├── rejects.tsx
│           ├── harvesting-report.tsx
│           └── receiving-report.tsx
├── features/                  # Feature folders: hooks, logic, feature-specific components
│   ├── auth/
│   ├── stock/
│   ├── scanning/
│   └── station/
├── components/                # Cross-feature UI primitives only (Button, Input, etc.)
├── lib/                       # Cross-cutting infra
│   ├── api.ts                 # axios instance + interceptors
│   ├── storage.ts             # async-storage + secure-store wrappers
│   ├── clients.ts             # client config registry
│   ├── instanceMapper.ts
│   ├── audio.ts               # expo-audio wrappers for beep/submit/error
│   └── haptics.ts             # expo-haptics wrappers
├── stores/                    # Zustand stores
│   ├── auth.ts
│   ├── client.ts
│   └── station.ts
└── types/                     # Shared TypeScript types
├── frappe.ts
└── stock.ts