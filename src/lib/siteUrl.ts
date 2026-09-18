// Parsing and allowlisting for the site the user types at login.
//
// Pure, zero imports — it has to stay importable by `node --test`, which runs on
// plain Node with no React Native around it.
//
// WHY THIS IS HAND-PARSED, and not `new URL()` or zod's `z.url()` (which delegates
// to `new URL()`):
//
//   1. React Native ships an incomplete `URL` polyfill. It has no IDNA handling and
//      has historically disagreed with the spec on backslashes and userinfo.
//   2. Even a correct WHATWG parser is the wrong tool. Its conveniences — treating
//      `\` as `/`, SILENTLY STRIPPING tab/newline from the middle of a URL,
//      percent-decoding — are exactly the smuggling surface we are trying to close.
//      We want a parser that refuses ambiguity, not one that resolves it politely.
//
// No lookbehind anywhere: Hermes support for it is unreliable.
//
// The order of the checks below IS the security property. Each step removes an
// ambiguity that a later step would otherwise inherit — most importantly, `@` is
// rejected before the path is cut, so `https://good.upande.com@evil.com` can never
// be read as the host `good.upande.com`.

/** A host that passed the allowlist. The only way to obtain one is `parseSiteInput`. */
export interface ValidSite {
  /** Canonical lowercase host, e.g. `xflora.upande.com`. */
  host: string;
  /** Always `https://${host}`. The only origin the app will talk to. */
  origin: string;
  /** Storage and cache namespace. Equals `host` — see the note below. */
  tenantId: string;
}

export type SiteError =
  | 'empty'
  | 'whitespace'
  | 'insecure-scheme'
  | 'bad-scheme'
  | 'credentials'
  | 'port'
  | 'path'
  | 'charset'
  | 'not-allowed';

export type SiteParse = { ok: true; site: ValidSite } | { ok: false; reason: SiteError };

// Anchored at both ends. EXACTLY ONE label, then one apex, then end of input.
//
// Why that is unambiguous even though an apex may itself contain dots: every class
// in the label portion excludes `.`, so whatever the label consumes is dot-free and
// the `\.` after it is necessarily the FIRST dot in the host. Everything past that
// dot is matched by bare literals against `$`. So an accepted host decomposes
// uniquely as <label>.<apex>, and a label can never absorb part of an apex — it
// would have to swallow a dot to do it. `a.b.upande.com` and `a.b.fsn.frappe.cloud`
// are both refused by the same mechanism.
//
// No leading or trailing hyphen; 1-63 characters.
//
// ⚠️ NO APEX MAY BE A PROPER SUFFIX OF ANOTHER. Adding `frappe.cloud` as a third
// apex would silently make `fsn.frappe.cloud` an accepted *site* (label `fsn`) —
// and with it every other tenant on Frappe Cloud. Check this before extending.
//
// `fsn.frappe.cloud` is the Frappe Cloud hostname serving post-harvest, which is
// not on upande.com. It is listed separately rather than folded into a
// `(?:upande|fsn\.frappe)\.(?:com|cloud)` shape on purpose: that shape would form
// a cross-product and accept `x.upande.cloud` and `x.fsn.frappe.com`, neither of
// which exists. Each apex stays atomic. If post-harvest moves to upande.com, the
// removal is this alternative, this paragraph, and the FSN group in the tests.
const SITE_HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:upande\.com|fsn\.frappe\.cloud)$/;

/** The allowlist on its own, for callers that already hold a clean lowercase host. */
export function isAllowedSiteHost(host: string): boolean {
  return SITE_HOST_RE.test(host);
}

export function parseSiteInput(raw: string): SiteParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  // Before anything else. A WHATWG parser would strip an embedded \t or \n and
  // carry on with a different host than the one the user can see.
  if (/\s/.test(trimmed)) return { ok: false, reason: 'whitespace' };

  let s = trimmed.toLowerCase();

  if (s.startsWith('//')) return { ok: false, reason: 'bad-scheme' };

  // A leading `word:` is a scheme only if it is followed by `//`, or if the word
  // carries no dot. That second clause is what keeps `xflora.upande.com:8080` out
  // of this branch — it is a port, and gets its own error below.
  const scheme = /^([a-z][a-z0-9+.-]*):(\/\/)?/.exec(s);
  if (scheme) {
    const name = scheme[1];
    const slashes = scheme[2] !== undefined;
    if (slashes || !name.includes('.')) {
      if (name === 'https' && slashes) s = s.slice(scheme[0].length);
      else if (name === 'http') return { ok: false, reason: 'insecure-scheme' };
      else return { ok: false, reason: 'bad-scheme' };
    }
  }

  // Must precede the path cut. `https://x.upande.com@evil.com` has its real host
  // AFTER the `@`; cutting the path first would hand back `x.upande.com`.
  if (s.includes('@')) return { ok: false, reason: 'credentials' };

  const cut = s.search(/[/?#]/);
  if (cut !== -1) {
    const rest = s.slice(cut);
    s = s.slice(0, cut);
    // A bare trailing slash is fine; anything else is discarded input, and a user
    // who pasted a deep link deserves to be told rather than silently trimmed.
    if (rest !== '/') return { ok: false, reason: 'path' };
  }

  if (s.includes(':')) return { ok: false, reason: 'port' };

  // The gate that stops homographs: `хflora.upande.com` with a Cyrillic х is a
  // different host entirely, and passes a naive `endsWith('.upande.com')`.
  if (!/^[a-z0-9.-]+$/.test(s)) return { ok: false, reason: 'charset' };

  if (s.endsWith('.')) s = s.slice(0, -1); // FQDN root dot
  if (s.endsWith('.')) return { ok: false, reason: 'charset' };

  if (!isAllowedSiteHost(s)) return { ok: false, reason: 'not-allowed' };

  // tenantId is the FULL HOST, not the subdomain label. The label is unique only
  // relative to a fixed apex: that is a property of this allowlist, not of the
  // data, and it would be destroyed silently the first time a second apex is added.
  //
  // That is no longer hypothetical — fsn.frappe.cloud arrived. Under a label scheme
  // `post-harvest.fsn.frappe.cloud` and `post-harvest.upande.com` would now share a
  // storage namespace, and one site could read the other's session. Because the id
  // is the full host they get distinct namespaces, and adding the apex needed no
  // migration at all. Leave this as the full host.
  return { ok: true, site: { host: s, origin: `https://${s}`, tenantId: s } };
}

/** Inverse of `ValidSite.origin`, for reading a stored origin back. */
export function hostFromOrigin(origin: string): string | null {
  const parsed = parseSiteInput(origin);
  return parsed.ok ? parsed.site.host : null;
}

export function siteErrorMessage(reason: SiteError): string {
  switch (reason) {
    case 'empty':
      return 'Site required';
    case 'whitespace':
      return 'Site address cannot contain spaces';
    case 'insecure-scheme':
      return 'Site must be https';
    case 'bad-scheme':
      return 'Enter a site address, not a link';
    case 'credentials':
      return 'Site address cannot contain "@"';
    case 'port':
      return 'Site address cannot contain a port';
    case 'path':
      return 'Enter the site address only, without a path';
    case 'charset':
      return 'Site address contains invalid characters';
    case 'not-allowed':
      return 'Must be a .upande.com or .fsn.frappe.cloud site';
  }
}
