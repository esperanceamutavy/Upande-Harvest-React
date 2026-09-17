// Key composition for tenant-namespaced storage.
//
// Pure, zero imports — the migration imports this and must stay runnable under
// `node --test`, which has no React Native around it.
//
// expo-secure-store permits only [A-Za-z0-9._-] in a key and THROWS on anything
// else, so key legality is a runtime concern, not a style one. It is asserted by
// test over the cross-product of hosts and keys rather than argued for here.

/** Keys owned by one tenant. Values are per-site and never shared. */
export const TENANT_KEYS = {
  SID: 'sid',
  FULLNAME: 'fullname',
  EMAIL: 'email',
  USERFARM: 'userfarm',
} as const;
export type TenantKey = (typeof TENANT_KEYS)[keyof typeof TENANT_KEYS];

/**
 * The two keys that cannot be tenant-scoped, under a reserved namespace.
 *
 * This is a deliberate, signed-off exception to "never write an unprefixed key".
 * expo-secure-store has NO key-enumeration API — there is no getAllKeys for the
 * keychain — so boot cannot discover which tenant's sid to read unless a pointer
 * was written down somewhere tenant-independent. Neither key holds user data.
 *
 * ACTIVE_TENANT lives in SecureStore rather than AsyncStorage on purpose: it must
 * share a fate with the sid it points at. An Android restore that brings back the
 * keychain but not AsyncStorage would otherwise leave a valid session with no
 * pointer to it, and log the user out for no reason.
 */
export const APP_KEYS = {
  ACTIVE_TENANT: 'active_tenant',
  LAST_SITE: 'last_site',
} as const;
export type AppKey = (typeof APP_KEYS)[keyof typeof APP_KEYS];

export type StoreKind = 'secure' | 'async';

export const TENANT_KEY_STORE: Record<TenantKey, StoreKind> = {
  sid: 'secure',
  fullname: 'async',
  email: 'async',
  userfarm: 'async',
};

export const APP_KEY_STORE: Record<AppKey, StoreKind> = {
  active_tenant: 'secure',
  last_site: 'async',
};

const APP_NS = 'app';
const SEP = '__';

/**
 * `xflora.upande.com` + `sid` -> `xflora.upande.com__sid`.
 *
 * Injective: logical key names contain no double underscore, so the last `__` in
 * a composed key always separates tenant from key. A tenant id can never be the
 * string `app`, because it must carry a `.upande.com` suffix to exist at all —
 * so the two namespaces cannot collide.
 */
export function tenantKey(tenantId: string, key: TenantKey): string {
  return `${tenantId}${SEP}${key}`;
}

export function appKey(key: AppKey): string {
  return `${APP_NS}${SEP}${key}`;
}

/** Flat keys that carry a value forward into the tenant namespace. */
export const LEGACY_MANIFEST = [
  { flat: 'sid', to: TENANT_KEYS.SID, store: 'secure' },
  { flat: 'fullname', to: TENANT_KEYS.FULLNAME, store: 'async' },
  { flat: 'email_backup', to: TENANT_KEYS.EMAIL, store: 'async' },
  { flat: 'userFarm', to: TENANT_KEYS.USERFARM, store: 'async' },
] as const satisfies readonly { flat: string; to: TenantKey; store: StoreKind }[];

/**
 * Flat keys that are deleted rather than carried forward.
 *
 * `instanceurl` and `instanceurl_backup` are retired because the origin is now
 * `https://${tenantId}` — keeping a second copy invites the two to disagree.
 * `instanceurl` is still READ during migration, to work out which tenant the
 * legacy data belongs to; it is the deletion that is new, not the read.
 *
 * `email` is the write-only twin of `email_backup` (useLogin wrote both, nothing
 * ever read this one). `email_backup` is canonical.
 */
export const LEGACY_RETIRED = [
  { flat: 'instanceurl', store: 'secure' },
  { flat: 'instanceurl_backup', store: 'async' },
  { flat: 'email', store: 'async' },
] as const satisfies readonly { flat: string; store: StoreKind }[];
