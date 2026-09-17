import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { migrateFlatKeys, type KeyValueStore, type MigrationResult } from './migrateTenantKeys.ts';
import {
  TENANT_KEYS,
  TENANT_KEY_STORE,
  APP_KEY_STORE,
  appKey,
  tenantKey,
  type AppKey,
  type StoreKind,
  type TenantKey,
} from './tenantKeys.ts';

export { APP_KEYS, TENANT_KEYS } from './tenantKeys.ts';
export type { AppKey, TenantKey } from './tenantKeys.ts';

// The ONLY module in src/ allowed to touch AsyncStorage or expo-secure-store.
// eslint's no-restricted-imports enforces that everywhere else, so a flat write is
// a build failure rather than a code-review catch.
//
// Every persisted value belongs to exactly one tenant, and the API below makes an
// unprefixed write inexpressible: the exported functions take a TenantKey from a
// closed union, never a raw key string, and compose the prefix themselves.

const secureDriver: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

const asyncDriver: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

function driver(kind: StoreKind): KeyValueStore {
  return kind === 'secure' ? secureDriver : asyncDriver;
}

// ── active tenant ────────────────────────────────────────────────────────────
//
// PUSHED IN by boot and by login — never pulled out of the auth store. Reading
// `useAuthStore.getState()` from here would make storage depend on stores/auth
// while useLogin depends on storage, which is a cycle. A module-level variable
// with exactly two writers is simpler, synchronous, and easy to reason about.

let activeTenant: string | null = null;

export function setActiveTenant(tenantId: string | null): void {
  activeTenant = tenantId;
}

export function getActiveTenant(): string | null {
  return activeTenant;
}

class MissingTenantError extends Error {
  constructor(key: string) {
    super(`storage: no active tenant when accessing "${key}"`);
    this.name = 'MissingTenantError';
  }
}

// ── tenant-scoped access ─────────────────────────────────────────────────────

export function getItemFor(tenantId: string, key: TenantKey): Promise<string | null> {
  return driver(TENANT_KEY_STORE[key]).get(tenantKey(tenantId, key));
}

export function setItemFor(tenantId: string, key: TenantKey, value: string): Promise<void> {
  return driver(TENANT_KEY_STORE[key]).set(tenantKey(tenantId, key), value);
}

export function removeItemFor(tenantId: string, key: TenantKey): Promise<void> {
  return driver(TENANT_KEY_STORE[key]).remove(tenantKey(tenantId, key));
}

/**
 * The implicit-tenant variants THROW when no tenant is active, rather than falling
 * back to something unprefixed. A throw is a crash in dev and a Sentry event in
 * production; a fallback would be a silent flat write, which is the one outcome
 * this whole module exists to prevent.
 */
function requireTenant(key: TenantKey): string {
  if (!activeTenant) throw new MissingTenantError(key);
  return activeTenant;
}

export function getItem(key: TenantKey): Promise<string | null> {
  return getItemFor(requireTenant(key), key);
}

export function setItem(key: TenantKey, value: string): Promise<void> {
  return setItemFor(requireTenant(key), key, value);
}

export function removeItem(key: TenantKey): Promise<void> {
  return removeItemFor(requireTenant(key), key);
}

/** Delete every key this tenant owns. Used by logout and by a site switch. */
export async function clearTenant(tenantId: string): Promise<void> {
  await Promise.all(
    Object.values(TENANT_KEYS).map((key) => removeItemFor(tenantId, key)),
  );
}

// ── the reserved app namespace ───────────────────────────────────────────────
//
// Two keys, neither holding user data. See the note in tenantKeys.ts for why they
// cannot be tenant-scoped: SecureStore has no key-enumeration API, so boot needs a
// tenant-independent pointer to find the session at all.

export function getAppItem(key: AppKey): Promise<string | null> {
  return driver(APP_KEY_STORE[key]).get(appKey(key));
}

export function setAppItem(key: AppKey, value: string): Promise<void> {
  return driver(APP_KEY_STORE[key]).set(appKey(key), value);
}

export function removeAppItem(key: AppKey): Promise<void> {
  return driver(APP_KEY_STORE[key]).remove(appKey(key));
}

// ── migration ────────────────────────────────────────────────────────────────

/**
 * Runs on every boot. Idempotent and a no-op once there is nothing to move — see
 * migrateTenantKeys.ts for the crash-safety argument and its tests.
 */
export function runStorageMigration(fallbackHost: string): Promise<MigrationResult> {
  return migrateFlatKeys({
    secure: secureDriver,
    async: asyncDriver,
    fallbackHost,
    onEvent: (event) => console.log('[storage] migration', event),
  });
}

/**
 * Read the legacy flat keys WITHOUT writing anything.
 *
 * Only used when the migration reports `failed`: the app then behaves exactly as
 * the previous build did for that launch and retries next time, so a storage
 * fault costs nobody their session. Delete this, and LEGACY_MANIFEST with it, one
 * release after the migration ships.
 */
export async function readLegacyFlatSession(): Promise<{
  sid: string | null;
  instanceUrl: string | null;
  fullName: string | null;
  email: string | null;
  userFarm: string | null;
}> {
  const [sid, instanceUrl, fullName, email, userFarm] = await Promise.all([
    secureDriver.get('sid'),
    secureDriver.get('instanceurl'),
    asyncDriver.get('fullname'),
    asyncDriver.get('email_backup'),
    asyncDriver.get('userFarm'),
  ]);
  return { sid, instanceUrl, fullName, email, userFarm };
}
