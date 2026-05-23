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

export interface LoginKeys {
  instanceUrl: string;
  apiKey: string;
  apiSecret: string;
  fullName: string;
}

/**
 * Three-step login:
 *   1. normalizeUrl — https:// with http:// fallback
 *   2. POST /api/method/login — get sid cookie (lives only in this function scope)
 *   3. POST generate_keys — exchange cookie for permanent api_key + api_secret
 *
 * The sid cookie is a local const and is never written to any storage.
 */
export async function loginAndGetKeys(
  bareUrl: string,
  email: string,
  password: string,
): Promise<LoginKeys> {
  const instanceUrl = await normalizeUrl(bareUrl);

  // ── Step 1: cookie login ─────────────────────────────────────────────────
  console.log(`[auth] Posting login to ${instanceUrl}`);
  let rawCookie: string;
  let fullName: string;

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

    fullName = (loginRes.data as { full_name?: string }).full_name ?? email;
    rawCookie = `sid=${sid}`;
    console.log('[auth] Login successful, got cookie');
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

  // ── Step 2: generate_keys ────────────────────────────────────────────────
  // Cookie passed as a request header — never stored anywhere.
  console.log(`[auth] Generating API key for ${email}`);
  try {
    const keysRes = await loginClient.post(
      `${instanceUrl}/api/method/frappe.core.doctype.user.user.generate_keys`,
      new URLSearchParams({ user: email }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: rawCookie,
        },
      },
    );

    const message = (
      keysRes.data as { message?: { api_key?: string; api_secret?: string } } | undefined
    )?.message;

    const apiKey = message?.api_key;
    const apiSecret = message?.api_secret;

    if (apiKey && !apiSecret) {
      throw new Error(
        'Server did not return API secret. Please contact your administrator to reset your API key.',
      );
    }
    if (!apiKey || !apiSecret) {
      throw new Error('Server did not return API credentials. Please try again.');
    }

    console.log('[auth] Generated API key');
    return { instanceUrl, apiKey, apiSecret, fullName };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if (err.response) {
        const data = err.response.data as { message?: string } | undefined;
        throw new Error(data?.message ?? 'Failed to generate API key. Please try again.');
      }
      throw new Error('Failed to generate API key. Please try again.');
    }
    if (err instanceof Error) throw err;
    throw new Error('Failed to generate API key. Please try again.');
  }
}
