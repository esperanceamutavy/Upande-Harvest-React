import axios from 'axios';

import { SECURE_KEYS, deleteSecureItem } from '../../lib/storage';
import { useAuthStore } from '../../stores/auth';

export function useLogout() {
  const clearCredentials = useAuthStore((s) => s.clearCredentials);

  async function logout() {
    // Best-effort server-side session invalidation. Send the sid cookie to
    // /api/method/logout; ignore any error (network, already-expired session).
    const { instanceUrl, sid } = useAuthStore.getState();
    if (instanceUrl && sid) {
      try {
        await axios.post(`${instanceUrl}/api/method/logout`, undefined, {
          headers: { Cookie: `sid=${sid}` },
          timeout: 5_000,
        });
      } catch {
        // ignore — logging out locally regardless
      }
    }

    // Delete sensitive keys. AsyncStorage backups (instanceurl_backup, email_backup)
    // are preserved so the login form pre-fills on the next login.
    await Promise.all([
      deleteSecureItem(SECURE_KEYS.SID),
      deleteSecureItem(SECURE_KEYS.INSTANCE_URL),
    ]);
    clearCredentials();
  }

  return { logout };
}
