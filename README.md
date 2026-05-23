# kikwetu-harvest-rn

React Native + Expo port of the Kikwetu Harvest Flutter app.
Farm operations data-capture for cut-flower farms — harvesting, receiving, grading, packing, dispatch.

See [STACK.md](STACK.md) for locked technology decisions and [PORTING_PLAN.md](PORTING_PLAN.md) for phase-by-phase status.
[RECON.md](RECON.md) is the source-of-truth reference for Flutter app behaviour, endpoints, and data shapes.

## Prerequisites

- Node 20+
- [Expo Go](https://expo.dev/go) on your iOS or Android device (v1 uses managed workflow)
- A running Frappe/ERPNext instance (Kikwetu staging or production)

## Setup

```bash
npm install

cp .env.example .env
# Edit .env and fill in EXPO_PUBLIC_SENTRY_DSN (optional; app works without it)
```

## Run

```bash
npx expo start
```

Scan the QR code with Expo Go. The app will show the login screen (Phase 1 not yet implemented — it shows a placeholder).

Clear Metro cache if you see stale module errors:

```bash
npx expo start -c
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | No | Sentry DSN for the React Native project. App is a no-op without it. |

## Project docs

- [STACK.md](STACK.md) — locked decisions: Expo SDK, navigation, state, HTTP, UI
- [PORTING_PLAN.md](PORTING_PLAN.md) — phase checklist with acceptance criteria
- [RECON.md](RECON.md) — full Flutter app reconnaissance (endpoints, data shapes, screens)
- [AGENTS.md](AGENTS.md) — working agreement for AI agents in this repo
