import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ValidSite } from '../../lib/siteUrl';
import {
  APP_KEYS,
  TENANT_KEYS,
  getAppItem,
  getItemFor,
  setActiveTenant,
  setAppItem,
  setItemFor,
} from '../../lib/storage';
import { resetTenantState } from '../../lib/tenantReset';
import { useAuthStore } from '../../stores/auth';
import { loginAndGetSession } from './authService';
import { tearDownTenant } from './tearDownTenant';

export interface LoginInput {
  /** Already validated by the screen — the type is the proof. */
  site: ValidSite;
  email: string;
  password: string;
}

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCredentials = useAuthStore((s) => s.setCredentials);
  const queryClient = useQueryClient();

  async function submit({ site, email, password }: LoginInput) {
    setIsLoading(true);
    setError(null);
    try {
      const { sid, fullName, tenantId } = await loginAndGetSession(
        site,
        email.trim(),
        password,
      );

      // ── one live session at a time ──────────────────────────────────────────
      // Signing in to a different site ends the previous one properly: the server
      // is told, and every key that tenant owned is deleted. Without the server
      // call the abandoned sid would stay valid for its full 30-day Max-Age.
      const outgoing = await getAppItem(APP_KEYS.ACTIVE_TENANT);
      if (outgoing && outgoing !== tenantId) {
        const outgoingSid = await getItemFor(outgoing, TENANT_KEYS.SID);
        await tearDownTenant(outgoing, outgoingSid);
      }

      // Before setCredentials, never after. The gate mounts (app) the moment
      // isAuthenticated flips and the dashboard query fires immediately; flushing
      // afterwards would let the previous session's figures paint for a frame.
      // See the ORDERING note in tenantReset.ts.
      resetTenantState(queryClient);

      setActiveTenant(tenantId);
      await Promise.all([
        setItemFor(tenantId, TENANT_KEYS.SID, sid),
        setItemFor(tenantId, TENANT_KEYS.EMAIL, email.trim()),
        setItemFor(tenantId, TENANT_KEYS.FULLNAME, fullName),
        setAppItem(APP_KEYS.LAST_SITE, tenantId),
      ]);
      // Written last: it is the pointer boot follows, so it should only exist once
      // the keys it points at are on disk.
      await setAppItem(APP_KEYS.ACTIVE_TENANT, tenantId);

      setCredentials({ sid, instanceUrl: site.origin, tenantId, fullName, email: email.trim() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return { submit, isLoading, error };
}
