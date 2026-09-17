// Moves a legacy install's flat storage keys into its tenant namespace.
//
// Pure: the two stores are injected, so the whole thing runs under `node --test`
// with a fake that can be told to throw at any step. That matters more here than
// anywhere else in the app — the property being claimed is "no crash at any point
// can log a worker out", and that is only a claim until a test kills it mid-write.
//
// TYPE-STRIPPING: Node preserves value-position imports at runtime, so a single
// non-`import type` import from a file that touches React Native would break
// `npm test` with a module-resolution error rather than a type error. Both imports
// below are pure modules with no dependency graph. Keep it that way. For the same
// reason: no enum, no namespace, no parameter properties.

import { parseSiteInput } from './siteUrl.ts';
import {
  APP_KEYS,
  LEGACY_MANIFEST,
  LEGACY_RETIRED,
  appKey,
  tenantKey,
  type StoreKind,
} from './tenantKeys.ts';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type MigrationPhase = 'derive' | 'copy' | 'commit' | 'delete';

export type MigrationEvent =
  | { type: 'tenant-fallback'; source: 'instanceurl_backup' | 'default' }
  | { type: 'scheme-upgraded' }
  | { type: 'verify-failed'; key: string }
  | { type: 'error'; phase: MigrationPhase; key?: string };

export interface MigrationIO {
  secure: KeyValueStore;
  async: KeyValueStore;
  /** Host to assume when the legacy value is missing or unusable. Injected, not imported. */
  fallbackHost: string;
  /** Key names and phases only — never values. */
  onEvent?: (event: MigrationEvent) => void;
}

export type MigrationStatus = 'nothing-to-migrate' | 'migrated' | 'failed';

export interface MigrationResult {
  status: MigrationStatus;
  /** The tenant the data belongs to, or null when there was nothing to migrate. */
  tenantId: string | null;
  failedAt?: { phase: MigrationPhase; key?: string };
}

function pick(io: MigrationIO, kind: StoreKind): KeyValueStore {
  return kind === 'secure' ? io.secure : io.async;
}

/**
 * A stored origin may be `http://` — old builds fell back to it when the https
 * HEAD probe failed. Upgrade the scheme before parsing rather than rejecting it:
 * the host is what we need, and the session cookie is host-bound and carries no
 * scheme binding, so nothing is lost by reading it.
 */
function hostFromStoredOrigin(stored: string): string | null {
  const upgraded = stored.replace(/^http:\/\//i, 'https://');
  const parsed = parseSiteInput(upgraded);
  return parsed.ok ? parsed.site.host : null;
}

/**
 * Idempotent and crash-safe. Runs on EVERY boot; once there is nothing to move it
 * is a handful of reads and no writes at all.
 *
 * There is deliberately no "migration done" marker. Idempotency comes from the
 * algorithm rather than from a flag that could itself be written at the wrong
 * moment — and it means a partially completed delete is always swept eventually.
 *
 * THE INVARIANT, which is the entire safety argument: at every instant, for every
 * key, at least one of {flat, prefixed} holds the original value. Nothing is ever
 * deleted before its copy has been written AND read back equal. There is no
 * delete-then-write anywhere below.
 */
export async function migrateFlatKeys(io: MigrationIO): Promise<MigrationResult> {
  const emit = io.onEvent ?? (() => {});
  let phase: MigrationPhase = 'derive';

  try {
    // ── 0. Is there anything at all to do? ───────────────────────────────────
    // A fresh install must leave NO trace of a migration that had nothing to
    // migrate: no active_tenant, no marker, no writes of any kind.
    const flats = new Map<string, string | null>();
    for (const entry of [...LEGACY_MANIFEST, ...LEGACY_RETIRED]) {
      flats.set(entry.flat, await pick(io, entry.store).get(entry.flat));
    }
    if ([...flats.values()].every((v) => v === null)) {
      return { status: 'nothing-to-migrate', tenantId: null };
    }

    // ── 1. Which tenant does this data belong to? ────────────────────────────
    // active_tenant FIRST. On a resume after a crash during the delete phase the
    // flat instanceurl may already be gone, and this is the only surviving answer.
    let tenantId = await io.secure.get(appKey(APP_KEYS.ACTIVE_TENANT));

    if (!tenantId) {
      const stored = flats.get('instanceurl');
      const fromStored = stored ? hostFromStoredOrigin(stored) : null;
      if (fromStored) {
        if (/^http:\/\//i.test(stored ?? '')) emit({ type: 'scheme-upgraded' });
        tenantId = fromStored;
      }
    }

    if (!tenantId) {
      const backup = flats.get('instanceurl_backup');
      const fromBackup = backup ? hostFromStoredOrigin(backup) : null;
      if (fromBackup) {
        emit({ type: 'tenant-fallback', source: 'instanceurl_backup' });
        tenantId = fromBackup;
      }
    }

    if (!tenantId) {
      // Not a guess. useLogin passed INSTANCE_HOST unconditionally and there has
      // never been a code path that stored any other host, so every legacy
      // install provably belongs to the pinned site.
      emit({ type: 'tenant-fallback', source: 'default' });
      const parsed = parseSiteInput(io.fallbackHost);
      if (!parsed.ok) {
        return { status: 'failed', tenantId: null, failedAt: { phase: 'derive' } };
      }
      tenantId = parsed.site.host;
    }

    // ── 2. Copy, and verify every copy before anything is deleted ────────────
    phase = 'copy';
    for (const entry of LEGACY_MANIFEST) {
      const value = flats.get(entry.flat);
      if (value === null || value === undefined) continue;

      const store = pick(io, entry.store);
      const dest = tenantKey(tenantId, entry.to);

      await store.set(dest, value);

      const readBack = await store.get(dest);
      if (readBack !== value) {
        emit({ type: 'verify-failed', key: entry.flat });
        // Abort having deleted NOTHING. The legacy path is still whole, so this
        // boot falls back to it and the next one tries again.
        return { status: 'failed', tenantId, failedAt: { phase: 'copy', key: entry.flat } };
      }
    }

    // ── 3. Commit point ──────────────────────────────────────────────────────
    // Past this line every flat value has a verified duplicate and the new path
    // stands on its own. last_site first: it is only a prefill convenience, and
    // active_tenant is the one that actually switches boot onto the new path.
    phase = 'commit';
    await io.async.set(appKey(APP_KEYS.LAST_SITE), tenantId);
    await io.secure.set(appKey(APP_KEYS.ACTIVE_TENANT), tenantId);

    const committed = await io.secure.get(appKey(APP_KEYS.ACTIVE_TENANT));
    if (committed !== tenantId) {
      emit({ type: 'verify-failed', key: APP_KEYS.ACTIVE_TENANT });
      return { status: 'failed', tenantId, failedAt: { phase: 'commit' } };
    }

    // ── 4. Delete the flat keys ──────────────────────────────────────────────
    // Retired keys first, then the manifest in reverse so the credential goes
    // last — it narrows the window in which a half-removed session could be
    // observed, though the commit above already makes that window harmless.
    phase = 'delete';
    for (const entry of LEGACY_RETIRED) {
      await pick(io, entry.store).remove(entry.flat);
    }
    for (let i = LEGACY_MANIFEST.length - 1; i >= 0; i -= 1) {
      const entry = LEGACY_MANIFEST[i];
      await pick(io, entry.store).remove(entry.flat);
    }

    return { status: 'migrated', tenantId };
  } catch {
    // Any throw from either store — and equally the shape a process kill leaves
    // behind, since nothing after the failing operation runs in either case.
    // Nothing has been deleted that was not already copied and verified, so the
    // session survives: this boot reads whichever side is whole, the next resumes.
    emit({ type: 'error', phase });
    return { status: 'failed', tenantId: null, failedAt: { phase } };
  }
}
