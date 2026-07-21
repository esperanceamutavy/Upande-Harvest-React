# Auth feature

## Single-step cookie (session) auth

This app authenticates exactly like the original Flutter app: a single
`POST {instanceUrl}/api/method/login` with `x-www-form-urlencoded` `{ usr, pwd }`.
The server responds with a `Set-Cookie: sid=<sid>` header (React Native's XHR exposes
`Set-Cookie`; browsers don't). We extract `sid` from that header — if it's missing or
equal to `Guest`, login fails with a credential error.

The `sid` session cookie is the **only** credential stored (in SecureStore under
`SECURE_KEYS.SID`) and sent. Every authenticated request carries it as
`Cookie: sid=<sid>` (injected by the request interceptor in `src/lib/api.ts`). There is
no `api_key`, no `api_secret`, and no `Authorization` header anywhere.

We do **not** call `frappe.core.doctype.user.user.generate_keys`. That method is gated
behind `frappe.only_for("System Manager")`, and harvest users lack that role, so calling
it 403s. Cookie auth avoids the problem entirely.

## Session expiry

The response interceptor clears auth on a `401`, so the auth gate routes the app back to
the login screen when the session cookie expires or is invalidated. A `403` is treated as
a legitimate per-endpoint permission error (not session expiry) and does **not** trigger
auto-logout.

## Logout

`useLogout` makes a best-effort `POST {instanceUrl}/api/method/logout` (sending the sid
cookie) to invalidate the server session, then deletes the sid + instance URL from
SecureStore and clears local auth state. AsyncStorage backups (instance URL, email) are
preserved so the login form pre-fills on the next login.
