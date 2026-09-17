// Run with: npm test
//
// The group that matters most is "HOSTILE" below. Every input in it is accepted by
// the obvious implementation, `host.endsWith('.upande.com')`, and every one of them
// points somewhere other than a .upande.com site. That group is the reason this
// module exists; the rest is housekeeping.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hostFromOrigin, isAllowedSiteHost, parseSiteInput } from './siteUrl.ts';

function accepts(input: string, host: string) {
    const r = parseSiteInput(input);
    assert.equal(r.ok, true, `expected ${JSON.stringify(input)} to be accepted`);
    if (!r.ok) return;
    assert.equal(r.site.host, host);
    assert.equal(r.site.origin, `https://${host}`);
    assert.equal(r.site.tenantId, host);
}

function rejects(input: string, reason: string) {
    const r = parseSiteInput(input);
    assert.equal(r.ok, false, `expected ${JSON.stringify(input)} to be rejected`);
    if (r.ok) return;
    assert.equal(r.reason, reason, `wrong reason for ${JSON.stringify(input)}`);
}

// ── HOSTILE ──────────────────────────────────────────────────────────────────
// Each of these satisfies `endsWith('.upande.com')` on the raw string.

test('HOSTILE — a path can carry the allowed suffix while the host is elsewhere', () => {
    rejects('evil.com/.upande.com', 'path');
    rejects('evil.com#.upande.com', 'path');
    rejects('evil.com?x=.upande.com', 'path');
});

test('HOSTILE — userinfo puts the real host after the @', () => {
    // The dangerous direction: this resolves to evil.com, and cutting the path
    // before checking for @ would have yielded the host xflora.upande.com.
    rejects('https://xflora.upande.com@evil.com', 'credentials');
    rejects('https://evil.com@xflora.upande.com', 'credentials');
});

test('HOSTILE — a Cyrillic homograph is a different host that looks identical', () => {
    // U+0445 CYRILLIC SMALL LETTER HA, not U+0078 LATIN SMALL LETTER X.
    rejects('хflora.upande.com', 'charset');
});

test('HOSTILE — a bare suffix is not a site', () => {
    rejects('.upande.com', 'not-allowed');
});

// ── the allowlist proper ─────────────────────────────────────────────────────

test('the apex itself is not a site', () => {
    rejects('upande.com', 'not-allowed');
});

test('a deeper subdomain is refused — single label only', () => {
    rejects('a.b.upande.com', 'not-allowed');
    rejects('staging.xflora.upande.com', 'not-allowed');
});

test('a lookalike apex is refused', () => {
    rejects('xflora.upande.com.evil.com', 'not-allowed');
    rejects('notupande.com', 'not-allowed');
    rejects('fakeupande.com', 'not-allowed');
    rejects('upande.com.evil.com', 'not-allowed');
});

test('hyphens are allowed inside a label but not at its edges', () => {
    accepts('kaitet-group.upande.com', 'kaitet-group.upande.com');
    accepts('mona-flowers-staging.upande.com', 'mona-flowers-staging.upande.com');
    rejects('-x.upande.com', 'not-allowed');
    rejects('x-.upande.com', 'not-allowed');
});

test('a label over 63 characters is refused', () => {
    rejects(`${'a'.repeat(64)}.upande.com`, 'not-allowed');
    accepts(`${'a'.repeat(63)}.upande.com`, `${'a'.repeat(63)}.upande.com`);
});

test('underscores are not legal in a hostname', () => {
    // Caught by the charset gate rather than the allowlist — `_` is not a legal
    // hostname character at all, so it never reaches the regex.
    rejects('x_y.upande.com', 'charset');
});

// ── schemes ──────────────────────────────────────────────────────────────────

test('http is refused with its own message, never silently upgraded', () => {
    // The whole point of dropping normalizeUrl's fallback: the login POST carries
    // the password in a form body.
    rejects('http://xflora.upande.com', 'insecure-scheme');
});

test('other schemes are refused', () => {
    rejects('ftp://xflora.upande.com', 'bad-scheme');
    rejects('javascript:alert(1)', 'bad-scheme');
    rejects('mailto:someone@upande.com', 'bad-scheme');
    rejects('//xflora.upande.com', 'bad-scheme');
});

test('https is accepted and stripped', () => {
    accepts('https://xflora.upande.com', 'xflora.upande.com');
    accepts('https://xflora.upande.com/', 'xflora.upande.com');
});

test('a backslash is not a slash here, whatever WHATWG says', () => {
    rejects('https:\\\\xflora.upande.com', 'bad-scheme');
});

// ── ports and paths ──────────────────────────────────────────────────────────

test('a port is refused — the session cookie is host-only and 443 is assumed', () => {
    rejects('xflora.upande.com:8080', 'port');
    rejects('https://xflora.upande.com:443', 'port');
});

test('a path is refused rather than silently discarded', () => {
    rejects('https://xflora.upande.com/app/stock-entry', 'path');
    rejects('xflora.upande.com/api/method/login', 'path');
});

// ── normalization ────────────────────────────────────────────────────────────

test('case and surrounding whitespace are normalized away', () => {
    accepts('  xflora.upande.com  ', 'xflora.upande.com');
    accepts('XFLORA.UPANDE.COM', 'xflora.upande.com');
    accepts('HTTPS://Xflora.Upande.Com/', 'xflora.upande.com');
});

test('internal whitespace is refused, not stripped', () => {
    // A WHATWG parser removes these and proceeds with a host the user cannot see.
    rejects('xflora .upande.com', 'whitespace');
    rejects('xflora\t.upande.com', 'whitespace');
    rejects('xflora.upande.com\nevil.com', 'whitespace');
});

test('one trailing FQDN dot is absorbed, two are not', () => {
    accepts('xflora.upande.com.', 'xflora.upande.com');
    rejects('xflora.upande.com..', 'charset');
});

test('empty input', () => {
    rejects('', 'empty');
    rejects('   ', 'empty');
});

// ── round trip ───────────────────────────────────────────────────────────────

test('parsing an origin returns the same site — pre-fill depends on this', () => {
    for (const host of [
        'xflora.upande.com',
        'kikwetu.upande.com',
        'kaitet-group.upande.com',
        'mona-flowers-staging.upande.com',
    ]) {
        const first = parseSiteInput(host);
        assert.equal(first.ok, true);
        if (!first.ok) continue;
        const second = parseSiteInput(first.site.origin);
        assert.equal(second.ok, true);
        if (!second.ok) continue;
        assert.deepEqual(second.site, first.site);
    }
});

test('hostFromOrigin inverts origin, and refuses anything it should not', () => {
    assert.equal(hostFromOrigin('https://xflora.upande.com'), 'xflora.upande.com');
    // A legacy install may hold an http:// origin from the old fallback. It must
    // not round-trip silently — the caller has to decide to upgrade it.
    assert.equal(hostFromOrigin('http://xflora.upande.com'), null);
    assert.equal(hostFromOrigin('https://evil.com'), null);
});

test('isAllowedSiteHost is the regex alone and assumes a clean host', () => {
    assert.equal(isAllowedSiteHost('xflora.upande.com'), true);
    assert.equal(isAllowedSiteHost('XFLORA.UPANDE.COM'), false); // caller lowercases
    assert.equal(isAllowedSiteHost('evil.com'), false);
});
