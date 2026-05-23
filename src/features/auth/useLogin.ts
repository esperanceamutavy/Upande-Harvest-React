import { useState } from 'react';

import { SECURE_KEYS, STORAGE_KEYS, setSecureItem, setStorageItem } from '../../lib/storage';
import { useAuthStore } from '../../stores/auth';
import { loginAndGetKeys } from './authService';

export interface LoginInput {
  url: string;
  email: string;
  password: string;
}

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCredentials = useAuthStore((s) => s.setCredentials);

  async function submit({ url, email, password }: LoginInput) {
    setIsLoading(true);
    setError(null);
    try {
      const { instanceUrl, apiKey, apiSecret, fullName } = await loginAndGetKeys(
        url.trim().toLowerCase(),
        email.trim(),
        password,
      );

      // Persist sensitive credentials to SecureStore
      await Promise.all([
        setSecureItem(SECURE_KEYS.API_KEY, apiKey),
        setSecureItem(SECURE_KEYS.API_SECRET, apiSecret),
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
      setCredentials({ apiKey, apiSecret, instanceUrl, fullName, email: email.trim() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return { submit, isLoading, error };
}
