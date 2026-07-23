import axios from 'axios';

// Dedicated one-shot client for the two-step login flow.
// No auth headers, no base URL — fully self-contained per call.
const loginClient = axios.create({ timeout: 10_000 });

/** Tries https:// first; falls back silently to http:// on any error. */
export async function normalizeUrl(bareUrl: string): Promise<string> {
  const candidate = `https://${bareUrl}`;
  console.log(`[auth] Trying https://${bareUrl}`);
  try {
    await axios.head(candidate, { timeout: 5_000 });
    console.log(`[auth] HTTPS succeeded for ${bareUrl}`);
    return candidate;
  } catch {
    console.log(`[auth] HTTPS failed for ${bareUrl}, falling back to http://`);
    return `http://${bareUrl}`;
  }
}

export interface LoginSession {
  instanceUrl: string;
  sid: string;
  fullName: string;
}

/**
 * Single-step cookie login:
 *   1. normalizeUrl — https:// with http:// fallback
 *   2. POST /api/method/login — get the sid session cookie
 *
 * The sid is returned to the caller, which persists it as the only credential.
 * Every subsequent authenticated request sends it as `Cookie: sid=<sid>`.
 */
export async function loginAndGetSession(
  bareUrl: string,
  email: string,
  password: string,
): Promise<LoginSession> {
  const instanceUrl = await normalizeUrl(bareUrl);

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
    return { instanceUrl, sid, fullName };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if (err.response) {
        const data = err.response.data as { message?: string; exception?: string } | undefined;
        throw new Error(data?.message ?? data?.exception ?? 'Login failed');
      }
      const host = bareUrl.split('/')[0];
      throw new Error(`Cannot reach ${host} — check your network connection.`);
    }
    if (err instanceof Error) throw err;
    throw new Error('Login failed.');
  }
}
