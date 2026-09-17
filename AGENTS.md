# xflora-rn — Agent Instructions

## Expo HAS CHANGED
Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code that uses Expo APIs. Your training data is likely out of date.

## Project context
This is a single-instance React Native + Expo app for **Xflora** (`xflora.upande.com`), grown out of a
port of a Flutter app (`~/projects/kikwetu-harvest-flutter`, read-only reference). Before making
decisions, read:
- `XFLORA_PORT_PLAN.md` — **the live plan.** Xflora endpoint contracts, screen-by-screen scope, open decisions.
- `RESTYLE_PLAN.md` — **the live plan.** Packhouse design system adoption, UI primitives, and the Grading/Packing/Dispatch work in §8.
- `STACK.md` — locked stack decisions (Expo SDK, navigation, state, HTTP, UI library). Do not introduce new libraries or patterns without updating this file first.
- `RECON.md` — reconnaissance of the Flutter app. Still the reference for Flutter-side behavior.

> `PORTING_PLAN.md` describes the **superseded Kikwetu multi-client port** and is kept for history
> only. Do not take scope, phase numbers, or task status from it.

## Working agreement
1. Read `XFLORA_PORT_PLAN.md`, `RESTYLE_PLAN.md`, and `STACK.md` at the start of every session.
2. Match patterns established in earlier phases. Do not invent new patterns mid-port without flagging it.
3. For Flutter behavior questions, read the Flutter file at `~/projects/kikwetu-harvest-flutter/lib/...` and cite the file:line. Do not guess.
4. When stuck or facing a design decision not covered in the planning docs, stop and ask the user — do not pick silently.
5. Update status in `XFLORA_PORT_PLAN.md` / `RESTYLE_PLAN.md` (⬜ → 🟨 → ✅) as you complete work.
6. Do not modify files in `~/projects/kikwetu-harvest-flutter/`. It is reference-only.
7. Do not commit `node_modules`, `.expo`, `ios/`, `android/` build outputs, or environment files with secrets.

## Scope reminder
- Single instance: **Xflora only**, pinned to `xflora.upande.com` in `src/lib/config.ts`. There is no client picker.
- Bluetooth thermal printing = v1.1 (requires dev build). Not in v1.
- Auth = **session cookie**. The app stores the `sid` from `POST /api/method/login` and replays it as
  `Cookie: sid=<sid>`. There is NO `generate_keys` step and NO `Authorization: token` header.

## Constraints

These are not preferences. Breaking one costs a rebuild, a lost session, or a production incident.

1. **Prefer OTA-shippable changes.** Flag any new native dependency explicitly — it forces an
   `eas build` and a store round-trip, not an `eas update`.
2. **User-entered site URLs validate against an allowlist of `*.upande.com`, and are https-only.**
   Drop `normalizeUrl()`'s HEAD probe and `http://` fallback for them: the login POST carries
   `usr`/`pwd` in a form body, so a silent downgrade to `http://` puts a password on the wire in
   clear text. The pinned-host path may keep its current behaviour until the pin is removed.
3. **All persisted keys are namespaced by tenant id.** Never write an unprefixed key. The `sid`
   request interceptor replays the `sid` belonging to the *active* tenant.
4. **Legacy installs hold flat keys** — SecureStore: `SID`, `INSTANCE_URL`; AsyncStorage:
   `instanceurl_backup`, `email_backup`, `fullname`, `email`, `USER_FARM`. The migration **copies**
   to the prefixed key, **verifies** the copy, and only then **deletes** the flat one. Never
   delete-then-write. It must be idempotent and crash-safe: no existing session is lost, and nobody
   is logged out by upgrading.
5. **There is no offline queue.** Do not design for one, and do not go looking for one.

## When to ask the user vs. just proceed
- **Proceed silently:** mechanical tasks (install a package listed in STACK.md, port a screen following the established pattern, fix a TypeScript error).
- **Ask the user:** new dependency, deviation from STACK.md, ambiguous Flutter behavior, anything that affects more than one phase.