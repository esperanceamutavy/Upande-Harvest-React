// Run with: npm test
//
// The claim this file exists to defend: NO crash, at any point, in any number of
// repetitions, can log a worker out. That is a claim about interleavings, so the
// fake store below can be armed to throw at a chosen operation, and the test then
// re-runs the migration over the SAME map — exactly what the next app launch does.
//
// The load-bearing case is "crash mid-delete, with flat instanceurl already gone".
// It fails outright if the resume tries to re-derive the tenant from disk instead
// of reading active_tenant. See the comment on it below.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrateFlatKeys, type KeyValueStore, type MigrationIO } from './migrateTenantKeys.ts';
import { APP_KEYS, appKey, tenantKey } from './tenantKeys.ts';

const HOST = 'xflora.upande.com';
const SID = 'abc123def456';

class FakeStore implements KeyValueStore {
    map = new Map<string, string>();
    log: { op: 'get' | 'set' | 'remove'; key: string }[] = [];
    private failures: { op: string; key: string }[] = [];
    private corrupt = new Map<string, string>();

    constructor(seed: Record<string, string> = {}) {
        for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
    }

    /**
     * Throw once on this operation, then behave normally on a retry.
     *
     * This is also how a process KILL is simulated. migrateFlatKeys catches every
     * throw and returns `failed` without running anything further — which is byte
     * for byte the disk state a kill at the same instant would leave. So the test
     * asserts on the map, then re-runs, exactly as the next app launch would.
     */
    failOn(op: 'get' | 'set' | 'remove', key: string) {
        this.failures.push({ op, key });
        return this;
    }

    /** set() silently stores something else — exercises the verify-unequal path. */
    corruptOn(key: string, stored: string) {
        this.corrupt.set(key, stored);
        return this;
    }

    private check(op: string, key: string) {
        const i = this.failures.findIndex((f) => f.op === op && f.key === key);
        if (i === -1) return;
        this.failures.splice(i, 1); // fire once, so a retry can succeed
        throw new Error(`fail ${op} ${key}`);
    }

    async get(key: string) {
        this.log.push({ op: 'get', key });
        this.check('get', key);
        return this.map.get(key) ?? null;
    }

    async set(key: string, value: string) {
        this.log.push({ op: 'set', key });
        this.check('set', key);
        this.map.set(key, this.corrupt.get(key) ?? value);
    }

    async remove(key: string) {
        this.log.push({ op: 'remove', key });
        this.check('remove', key);
        this.map.delete(key);
    }
}

function legacyInstall() {
    return {
        secure: new FakeStore({ sid: SID, instanceurl: `https://${HOST}` }),
        async: new FakeStore({
            instanceurl_backup: `https://${HOST}`,
            email_backup: 'worker@upande.com',
            email: 'stale@upande.com',
            fullname: 'A Worker',
            userFarm: '{"farm":"FARM-001","farmName":"Main"}',
        }),
    };
}

function io(stores: { secure: FakeStore; async: FakeStore }): MigrationIO {
    return { secure: stores.secure, async: stores.async, fallbackHost: HOST };
}

/**
 * "Never delete before a verified copy", as an executable property rather than a
 * review comment: every remove of a flat key must be preceded, in the same store's
 * log, by a set of the destination AND a get of it (the read-back).
 */
function assertNeverDeletedBeforeVerifiedCopy(store: FakeStore, flat: string, dest: string) {
    const removeAt = store.log.findIndex((e) => e.op === 'remove' && e.key === flat);
    if (removeAt === -1) return; // never deleted; nothing to prove
    const before = store.log.slice(0, removeAt);
    assert.ok(
        before.some((e) => e.op === 'set' && e.key === dest),
        `${flat} was removed before ${dest} was written`,
    );
    assert.ok(
        before.some((e) => e.op === 'get' && e.key === dest),
        `${flat} was removed before ${dest} was read back`,
    );
}

// ── the ordinary paths ───────────────────────────────────────────────────────

test('a fresh install writes NOTHING — no active_tenant, no marker', () => {
    const stores = { secure: new FakeStore(), async: new FakeStore() };
    return migrateFlatKeys(io(stores)).then((r) => {
        assert.equal(r.status, 'nothing-to-migrate');
        assert.equal(r.tenantId, null);
        assert.equal(stores.secure.map.size, 0);
        assert.equal(stores.async.map.size, 0);
        assert.equal(
            [...stores.secure.log, ...stores.async.log].filter((e) => e.op !== 'get').length,
            0,
            'a fresh install performed a write',
        );
    });
});

test('a full legacy install migrates, verifies, and then clears the flat keys', async () => {
    const stores = legacyInstall();
    const r = await migrateFlatKeys(io(stores));

    assert.equal(r.status, 'migrated');
    assert.equal(r.tenantId, HOST);

    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID);
    assert.equal(stores.async.map.get(tenantKey(HOST, 'email')), 'worker@upande.com');
    assert.equal(stores.async.map.get(tenantKey(HOST, 'fullname')), 'A Worker');
    assert.equal(
        stores.async.map.get(tenantKey(HOST, 'userfarm')),
        '{"farm":"FARM-001","farmName":"Main"}',
    );
    assert.equal(stores.secure.map.get(appKey(APP_KEYS.ACTIVE_TENANT)), HOST);
    assert.equal(stores.async.map.get(appKey(APP_KEYS.LAST_SITE)), HOST);

    for (const k of ['sid', 'instanceurl']) assert.equal(stores.secure.map.has(k), false);
    for (const k of ['email_backup', 'email', 'fullname', 'userFarm', 'instanceurl_backup']) {
        assert.equal(stores.async.map.has(k), false, `${k} survived`);
    }

    assertNeverDeletedBeforeVerifiedCopy(stores.secure, 'sid', tenantKey(HOST, 'sid'));
    assertNeverDeletedBeforeVerifiedCopy(stores.async, 'email_backup', tenantKey(HOST, 'email'));
});

test('running twice is a no-op the second time', async () => {
    const stores = legacyInstall();
    await migrateFlatKeys(io(stores));
    stores.secure.log = [];
    stores.async.log = [];

    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'nothing-to-migrate');
    assert.equal(
        [...stores.secure.log, ...stores.async.log].filter((e) => e.op !== 'get').length,
        0,
        'the second run wrote something',
    );
});

// ── crashes ──────────────────────────────────────────────────────────────────

test('CRASH mid-copy — nothing is deleted, and the retry completes', async () => {
    const stores = legacyInstall();
    stores.async.failOn('set', tenantKey(HOST, 'email'));

    const killed = await migrateFlatKeys(io(stores));
    assert.equal(killed.status, 'failed');
    assert.equal(killed.failedAt?.phase, 'copy');
    assert.equal(
        [...stores.secure.log, ...stores.async.log].filter((e) => e.op === 'remove').length,
        0,
        'a delete happened during the copy phase',
    );
    assert.equal(stores.secure.map.get('sid'), SID, 'the flat sid was disturbed');

    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'migrated');
    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID);
});

test('CRASH between the copy and the commit — the legacy path is still whole', async () => {
    const stores = legacyInstall();
    stores.secure.failOn('set', appKey(APP_KEYS.ACTIVE_TENANT));

    const killed = await migrateFlatKeys(io(stores));
    assert.equal(killed.status, 'failed');
    assert.equal(killed.failedAt?.phase, 'commit');
    assert.equal(stores.secure.map.get('sid'), SID);
    assert.equal(stores.secure.map.has(appKey(APP_KEYS.ACTIVE_TENANT)), false);

    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'migrated');
    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID);
});

test('CRASH mid-delete, with flat instanceurl ALREADY GONE — the load-bearing case', async () => {
    // This is the one that proves the resume reads active_tenant rather than
    // re-deriving from disk. instanceurl is deleted first in the retired sweep, so
    // by the time a delete crashes it is genuinely unavailable. If the resume
    // tried to re-derive from it, the tenant would silently become the fallback —
    // which happens to be the same host here, so the assertion below removes
    // instanceurl_backup too and points the fallback somewhere else entirely.
    const stores = legacyInstall();
    stores.async.failOn('remove', 'userFarm');

    const killed = await migrateFlatKeys(io(stores));
    assert.equal(killed.status, 'failed');
    assert.equal(killed.failedAt?.phase, 'delete');
    assert.equal(stores.secure.map.get(appKey(APP_KEYS.ACTIVE_TENANT)), HOST);
    assert.equal(stores.secure.map.has('instanceurl'), false, 'instanceurl should be gone');

    const wrongFallback: MigrationIO = {
        secure: stores.secure,
        async: stores.async,
        fallbackHost: 'kikwetu.upande.com',
    };
    const r = await migrateFlatKeys(wrongFallback);

    assert.equal(r.status, 'migrated');
    assert.equal(r.tenantId, HOST, 'the resume lost the tenant and fell back');
    assert.equal(stores.async.map.has('userFarm'), false);
    // Nothing was written under the wrong tenant.
    assert.equal(stores.secure.map.has(tenantKey('kikwetu.upande.com', 'sid')), false);
});

test('CRASH after every delete but before returning — the retry is clean', async () => {
    const stores = legacyInstall();
    const r1 = await migrateFlatKeys(io(stores));
    assert.equal(r1.status, 'migrated');

    const r2 = await migrateFlatKeys(io(stores));
    assert.equal(r2.status, 'nothing-to-migrate');
    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID, 'the session was lost');
});

// ── failures that are not crashes ────────────────────────────────────────────

test('a copy that verifies unequal aborts without deleting anything', async () => {
    const stores = legacyInstall();
    stores.secure.corruptOn(tenantKey(HOST, 'sid'), 'truncated');

    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'failed');
    assert.equal(r.failedAt?.phase, 'copy');
    assert.equal(r.failedAt?.key, 'sid');
    assert.equal(stores.secure.map.get('sid'), SID, 'the flat sid was deleted anyway');
    assert.equal(stores.secure.map.has(appKey(APP_KEYS.ACTIVE_TENANT)), false);
});

test('a store that throws on read aborts, touching nothing', async () => {
    const stores = legacyInstall();
    stores.secure.failOn('get', 'sid');

    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'failed');
    assert.equal(stores.secure.map.get('sid'), SID);
    assert.equal(
        [...stores.secure.log, ...stores.async.log].filter((e) => e.op === 'remove').length,
        0,
    );
});

test('a store that throws during delete leaves the session live on the new keys', async () => {
    const stores = legacyInstall();
    stores.async.failOn('remove', 'instanceurl_backup');

    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'failed');
    assert.equal(r.failedAt?.phase, 'delete');
    // The commit already happened, so the new path is whole and usable.
    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID);
    assert.equal(stores.secure.map.get(appKey(APP_KEYS.ACTIVE_TENANT)), HOST);

    const again = await migrateFlatKeys(io(stores));
    assert.equal(again.status, 'migrated');
    assert.equal(stores.async.map.has('instanceurl_backup'), false);
});

// ── tenant derivation ────────────────────────────────────────────────────────

test('an http:// instanceurl is read and upgraded, not rejected', async () => {
    // Old builds fell back to http:// when the https HEAD probe failed. That value
    // is still a perfectly good statement of WHICH host the session belongs to.
    const stores = {
        secure: new FakeStore({ sid: SID, instanceurl: `http://${HOST}` }),
        async: new FakeStore({ email_backup: 'worker@upande.com' }),
    };
    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'migrated');
    assert.equal(r.tenantId, HOST);
    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID);
});

test('an unparseable instanceurl falls back to instanceurl_backup', async () => {
    const stores = {
        secure: new FakeStore({ sid: SID, instanceurl: 'garbage' }),
        async: new FakeStore({ instanceurl_backup: `https://${HOST}` }),
    };
    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.tenantId, HOST);
    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID);
});

test('with both instance keys missing, the session still migrates to the fallback', async () => {
    const stores = {
        secure: new FakeStore({ sid: SID }),
        async: new FakeStore(),
    };
    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'migrated');
    assert.equal(r.tenantId, HOST);
    assert.equal(stores.secure.map.get(tenantKey(HOST, 'sid')), SID);
});

test('a logged-out legacy install keeps its email prefill and gains no session', async () => {
    const stores = {
        secure: new FakeStore(),
        async: new FakeStore({ email_backup: 'worker@upande.com', instanceurl_backup: `https://${HOST}` }),
    };
    const r = await migrateFlatKeys(io(stores));
    assert.equal(r.status, 'migrated');
    assert.equal(stores.async.map.get(tenantKey(HOST, 'email')), 'worker@upande.com');
    assert.equal(stores.secure.map.has(tenantKey(HOST, 'sid')), false);
});

test('email_backup is canonical where the two email keys disagree', async () => {
    const stores = legacyInstall();
    await migrateFlatKeys(io(stores));
    assert.equal(stores.async.map.get(tenantKey(HOST, 'email')), 'worker@upande.com');
    assert.equal(stores.async.map.has('email'), false);
});

// ── key legality, which SecureStore enforces by throwing ─────────────────────

test('every composed key is legal for expo-secure-store', () => {
    const hosts = [
        'xflora.upande.com',
        'kikwetu.upande.com',
        'kaitet-group.upande.com',
        'mona-flowers-staging.upande.com',
        'a.upande.com',
        'post-harvest.fsn.frappe.cloud',
    ];
    const keys = ['sid', 'fullname', 'email', 'userfarm'] as const;
    const legal = /^[A-Za-z0-9._-]+$/;

    const seen = new Set<string>();
    for (const h of hosts) {
        for (const k of keys) {
            const composed = tenantKey(h, k);
            assert.match(composed, legal, `${composed} would make SecureStore throw`);
            assert.equal(seen.has(composed), false, `${composed} is not unique`);
            seen.add(composed);
        }
    }
    for (const k of Object.values(APP_KEYS)) {
        const composed = appKey(k);
        assert.match(composed, legal);
        assert.equal(composed.startsWith('app__'), true);
    }
});

test('no tenant key can be mistaken for an app key, or for a flat key', () => {
    // A tenant id must carry a .upande.com suffix to exist, so it can never be
    // the literal string "app" — the two namespaces cannot collide.
    for (const k of ['sid', 'fullname', 'email', 'userfarm'] as const) {
        assert.equal(tenantKey('xflora.upande.com', k).startsWith('app__'), false);
        assert.notEqual(tenantKey('xflora.upande.com', k), k);
    }
});
