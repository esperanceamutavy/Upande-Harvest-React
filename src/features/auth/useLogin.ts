import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { INSTANCE_HOST } from '../../lib/config';
import { SECURE_KEYS, STORAGE_KEYS, setSecureItem, setStorageItem } from '../../lib/storage';
import { resetTenantState } from '../../lib/tenantReset';
import { useAuthStore } from '../../stores/auth';
import { loginAndGetSession } from './authService';

export interface LoginInput {
  email: string;
  password: string;
}

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCredentials = useAuthStore((s) => s.setCredentials);
  const queryClient = useQueryClient();

  async function submit({ email, password }: LoginInput) {
    setIsLoading(true);
    setError(null);
    try {
      const { instanceUrl, sid, fullName } = await loginAndGetSession(
        INSTANCE_HOST,
        email.trim(),
        password,
      );

      // Persist sensitive credentials to SecureStore
      await Promise.all([
        setSecureItem(SECURE_KEYS.SID, sid),
        setSecureItem(SECURE_KEYS.INSTANCE_URL, instanceUrl),
      ]);

      // Persist non-sensitive fields to AsyncStorage (pre-fill + hydration on next launch)
      await Promise.all([
        setStorageItem(STORAGE_KEYS.INSTANCE_URL_BACKUP, instanceUrl),
        setStorageItem(STORAGE_KEYS.EMAIL_BACKUP, email.trim()),
        setStorageItem('fullname', fullName),
        setStorageItem('email', email.trim()),
      ]);

      console.log('[auth] Stored credentials');

      // Before setCredentials, never after. The gate mounts (app) the moment
      // isAuthenticated flips and the dashboard query fires immediately; flushing
      // afterwards would let the previous user's figures paint for a frame. See
      // the ORDERING note in tenantReset.ts.
      resetTenantState(queryClient);

      setCredentials({ sid, instanceUrl, fullName, email: email.trim() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return { submit, isLoading, error };
}
