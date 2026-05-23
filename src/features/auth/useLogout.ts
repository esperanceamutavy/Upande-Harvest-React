import { SECURE_KEYS, deleteSecureItem } from '../../lib/storage';
import { useAuthStore } from '../../stores/auth';

export function useLogout() {
  const clearCredentials = useAuthStore((s) => s.clearCredentials);

  async function logout() {
    // Delete sensitive keys. AsyncStorage backups (instanceurl_backup, email_backup)
    // are preserved so the login form pre-fills on the next login.
    await Promise.all([
      deleteSecureItem(SECURE_KEYS.API_KEY),
      deleteSecureItem(SECURE_KEYS.API_SECRET),
      deleteSecureItem(SECURE_KEYS.INSTANCE_URL),
    ]);
    clearCredentials();
  }

  return { logout };
}
