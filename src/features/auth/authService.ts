import axios from 'axios';

import { isAllowedSiteHost, type ValidSite } from '../../lib/siteUrl';

// Dedicated one-shot client for the login call.
// No auth headers, no base URL — fully self-contained per call.
const loginClient = axios.create({ timeout: 10_000 });

// normalizeUrl is GONE. It probed https:// and fell back to http:// on any error,
// which was defensible while the host was a compile-time constant on a farm
// network. It stops being defensible the moment the host is typed by a user: the
// request below puts usr and pwd in a form body, so a fallback nobody can see
// hands a password to anyone on the path. A TLS failure now fails, loudly.
//
// Nothing here accepts a bare string any more. Taking a ValidSite means a caller
// cannot reach this function without having visibly gone through parseSiteInput.

export interface LoginSession {
  instanceUrl: string;
  sid: string;
  fullName: string;
  tenantId: string;
}

/**
 * Single-step cookie login: POST /api/method/login, read the sid out of the
 * Set-Cookie response header.
 *
 * The sid is returned to the caller, which persists it as the only credential.
 * Every subsequent authenticated request sends it as `Cookie: sid=<sid>`.
 */
export async function loginAndGetSession(
  site: ValidSite,
  email: string,
  password: string,
): Promise<LoginSession> {
  // Belt and braces behind the type: the only constructor of a ValidSite already
  // validates, but this is the last gate before a password goes over the wire.
  if (!isAllowedSiteHost(site.host) || site.origin !== `https://${site.host}`) {
    throw new Error('Unsupported site address.');
  }
  const instanceUrl = site.origin;

  // ── Cookie login ─────────────────────────────────────────────────────────
  console.log(`[auth] Posting login to ${instanceUrl}`);

  try {
    const loginRes = await loginClient.post(
      `${instanceUrl}/api/method/login`,
      new URLSearchParams({ usr: email, pwd: password }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    // React Native XHR exposes Set-Cookie; browsers don't — this is intentional.
    const cookieHeader = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'][0]
      : ((loginRes.headers['set-cookie'] as string | undefined) ?? '');

    const sidMatch = /sid=([^;]+)/.exec(cookieHeader);
    const sid = sidMatch?.[1];
    if (!sid || sid === 'Guest') {
      throw new Error('Login failed — server did not return a session. Check your credentials.');
    }

    const fullName = (loginRes.data as { full_name?: string }).full_name ?? email;
    console.log('[auth] Login successful, got session cookie');
    return { instanceUrl, sid, fullName, tenantId: site.tenantId };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if (err.response) {
        const data = err.response.data as { message?: string; exception?: string } | string | undefined;
        // A host that resolves but is not a Harvest site answers /api/method/login
        // with a 404 HTML page. That used to be unreachable behind the pinned host;
        // now it is the likeliest thing a user will do wrong, and it deserves
        // better than the bare string "Login failed".
        if (err.response.status === 404 || typeof data === 'string') {
          throw new Error(`${site.host} is not a Harvest site.`);
        }
        throw new Error(data?.message ?? data?.exception ?? 'Login failed');
      }
      // Widened from "check your network connection": with the http:// fallback
      // gone, a certificate problem lands here too, and blaming the network would
      // send the user looking in the wrong place.
      throw new Error(`Cannot reach ${site.host} — check the address and your connection.`);
    }
    if (err instanceof Error) throw err;
    throw new Error('Login failed.');
  }
}
