import axios from 'axios';

import { clearTenant } from '../../lib/storage';

/**
 * End a tenant's session completely — on the server as well as on the device.
 *
 * Shared by logout and by logging in to a DIFFERENT site. The switch path matters
 * as much as logout: without the server call, "one live session at a time" would
 * be true only locally, and the abandoned sid would stay valid for its full 30-day
 * Max-Age on a device someone else might pick up.
 *
 * Best-effort on the network, unconditional on the device. A worker on a farm
 * network with no signal still gets their local keys cleared.
 */
export async function tearDownTenant(tenantId: string, sid: string | null): Promise<void> {
  if (sid) {
    try {
      await axios.post(`https://${tenantId}/api/method/logout`, undefined, {
        headers: { Cookie: `sid=${sid}` },
        timeout: 5_000,
      });
    } catch {
      // ignore — network failure, or a session the server already expired
    }
  }

  await clearTenant(tenantId);
}
