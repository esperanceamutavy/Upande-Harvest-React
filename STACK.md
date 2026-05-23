# kikwetu-harvest-rn — Locked Stack Decisions

> Read this before writing any code. Do not introduce new libraries or change patterns without updating this file first.

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
- **Auth:** `Authorization: token <api_key>:<api_secret>` header injected per-request via interceptor (no mutable shared headers)
- **Base URL:** Read from Zustand auth store at request time (the user enters it at login)
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
- **`expo-av`** — audio playback for `beep.mp3`, `submit.mp3`, `error.mp3`
- **`expo-haptics`** — replaces Flutter's `vibration` package (`impactAsync(Heavy)` ≈ 200ms pulse)
- **`react-native-webview`** — ERP Desk view (token auth: inject `Authorization` header into webview requests)

## Deferred to v1.1 (requires dev build)
- Bluetooth thermal printing (`react-native-thermal-receipt-printer` or similar — printer model TBD)

## Multi-tenancy abstraction
- **`src/lib/clients.ts`** — typed registry mapping `ClientId` → config (theme overrides, feature flags, base URL hints)
- **`src/lib/instanceMapper.ts`** — port of Flutter's `InstanceMapper`, returns typed `ClientId | null` from a URL
- **`useClient()` hook** — returns the current client config from Zustand; no raw string comparisons in components
- v1 implements full Kikwetu config; other clients have stub configs and "Not yet ported" placeholder screens

## Auth pattern (replaces Flutter cookie auth)
- User enters URL + email + password on login
- App calls `POST /api/method/login` with form body → receives session cookie (transient, in-memory only)
- App calls `POST /api/method/frappe.core.doctype.user.user.generate_keys` with the cookie → receives api_key + api_secret
- Cookie is discarded; api_key + api_secret are stored in `expo-secure-store`
- Every future request uses `Authorization: token <api_key>:<api_secret>` header
- The user never sees, types, or knows about the API key

## Error tracking
- **Sentry React Native** — new Sentry project (separate from Flutter), DSN in `.env`

## OTA updates
- **EAS Update** — replaces Flutter's `upgrader` package and Shorebird

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
│   ├── audio.ts               # expo-av wrappers for beep/submit/error
│   └── haptics.ts             # expo-haptics wrappers
├── stores/                    # Zustand stores
│   ├── auth.ts
│   ├── client.ts
│   └── station.ts
└── types/                     # Shared TypeScript types
├── frappe.ts
└── stock.ts