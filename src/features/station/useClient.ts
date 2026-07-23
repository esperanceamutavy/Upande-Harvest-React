import { useClientStore } from '../../stores/client';

/** Returns the current ClientConfig, or null if no client is set. */
export function useClient() {
  return useClientStore((s) => s.clientConfig);
}
