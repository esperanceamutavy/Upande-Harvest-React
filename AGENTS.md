# Kikwetu Harvest RN — Agent Instructions

## Expo HAS CHANGED
Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code that uses Expo APIs. Your training data is likely out of date.

## Project context
This is a React Native + Expo port of a Flutter app (`~/projects/kikwetu-harvest-flutter`, read-only reference). Before making decisions, read:
- `RECON.md` — full reconnaissance of the Flutter app. The source of truth for what the app does, what endpoints it calls, what data shapes it sends.
- `STACK.md` — locked stack decisions (Expo SDK, navigation, state, HTTP, UI library). Do not introduce new libraries or patterns without updating this file first.
- `PORTING_PLAN.md` — phase-by-phase porting checklist with acceptance criteria. Update task status as you work.

## Working agreement
1. Read `STACK.md` and `PORTING_PLAN.md` at the start of every session.
2. Match patterns established in earlier phases. Do not invent new patterns mid-port without flagging it.
3. For Flutter behavior questions, read the Flutter file at `~/projects/kikwetu-harvest-flutter/lib/...` and cite the file:line. Do not guess.
4. When stuck or facing a design decision not covered in the planning docs, stop and ask the user — do not pick silently.
5. Update `PORTING_PLAN.md` task status (⬜ → 🟨 → ✅) as you complete work.
6. Do not modify files in `~/projects/kikwetu-harvest-flutter/`. It is reference-only.
7. Do not commit `node_modules`, `.expo`, `ios/`, `android/` build outputs, or environment files with secrets.

## Scope reminder
- v1 = Kikwetu client only. Other clients (Kaitet, Mona, Xflora) have stub screens in v1.
- Bluetooth thermal printing = v1.1 (requires dev build). Not in v1.
- Auth = token (`Authorization: token <key>:<secret>`) generated transparently on first login. NOT cookies. NOT user-typed API keys.

## When to ask the user vs. just proceed
- **Proceed silently:** mechanical tasks (install a package listed in STACK.md, port a screen following the established pattern, fix a TypeScript error).
- **Ask the user:** new dependency, deviation from STACK.md, ambiguous Flutter behavior, anything that affects more than one phase.