# Auth feature

## generate_keys and key rotation

Frappe's `frappe.core.doctype.user.user.generate_keys` rotates the `api_secret` on every call if
a key pair already exists. This app calls it on every login, so each new login session gets a fresh
secret. This is an accepted trade-off because this app is the only consumer of the per-worker API
key. The old secret is silently replaced — no data is lost.

If a user logs in from two devices simultaneously, the second login will invalidate the first
device's secret. The first device will receive 403 errors on the next API call and the auth gate
will redirect it back to the login screen.
