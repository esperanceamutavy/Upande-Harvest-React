import type { QueryClient } from '@tanstack/react-query';

import { clearVariantParentCache } from '../features/packing/useBunchDetails';
import { clearBucketItemCache } from '../features/receiving/useBucketItem';
import { useFarmStore } from '../stores/farm';

/**
 * Drop every scrap of the outgoing session's data that lives in memory.
 *
 * Called on logout AND on login. Login matters as much as logout: signing in as a
 * different user — or, once the site is chosen at login, against a different
 * instance — must not inherit the previous one's numbers.
 *
 * ORDERING: at login this MUST run before `setCredentials`. The auth gate in
 * `src/app/_layout.tsx` mounts the `(app)` group the moment `isAuthenticated`
 * flips, and `(app)/index` immediately fires its dashboard query. Flush after
 * that and the previous session's figures paint for a frame before the wipe
 * lands. While `isAuthenticated` is still false only the `(auth)` group is
 * mounted, and it issues no queries — so there is no window at all.
 *
 * `serializeByKey`'s in-flight map is deliberately NOT cleared: it holds promises
 * rather than data, and dropping them would unblock a write that is still in
 * flight.
 */
export function resetTenantState(queryClient: QueryClient): void {
  // Best-effort only, and worth being honest about: no queryFn in this app
  // forwards the AbortSignal to axios, so nothing is actually aborted. `clear()`
  // below removes the Query objects regardless, and a late response then resolves
  // into an orphan that no observer reads.
  void queryClient.cancelQueries();

  // Synchronous. Wipes the query cache and the mutation cache together.
  queryClient.clear();

  useFarmStore.getState().clearFarm();

  // Both are module-scope Maps keyed by Frappe doc names, which collide across
  // instances. See the comments on each.
  clearBucketItemCache();
  clearVariantParentCache();
}
