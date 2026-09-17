import { useQueryClient } from '@tanstack/react-query';

import { removeAppItem, APP_KEYS, setActiveTenant } from '../../lib/storage';
import { resetTenantState } from '../../lib/tenantReset';
import { useAuthStore } from '../../stores/auth';
import { tearDownTenant } from './tearDownTenant';

export function useLogout() {
  const clearCredentials = useAuthStore((s) => s.clearCredentials);
  const queryClient = useQueryClient();

  async function logout() {
    const { tenantId, sid } = useAuthStore.getState();

    if (tenantId) {
      // Server-side invalidation plus every key this tenant owns. `last_site` is
      // deliberately NOT cleared — it is what prefills the site field next time,
      // and it is a hostname, not a credential.
      await tearDownTenant(tenantId, sid);
      await removeAppItem(APP_KEYS.ACTIVE_TENANT);
    }
    setActiveTenant(null);

    // Credentials first, so the gate unmounts (app) rather than leaving mounted
    // observers to refetch against a cache we are about to wipe. Both calls land
    // in the same tick, so no render sees a half-cleared world.
    clearCredentials();
    resetTenantState(queryClient);
  }

  return { logout };
}
