import { ALLOWED_STOCK_ENTRY_TYPES } from './allowedTypes';

// The allowlist IS the source of truth — we no longer fetch Stock Entry Types
// from Frappe. Workers may only file the 5 types defined in allowedTypes.ts.
// Shape mimics a TanStack useQuery result so the dashboard consumer is unchanged.
export function useStockEntryTypes() {
  return {
    data: ALLOWED_STOCK_ENTRY_TYPES as string[],
    isLoading: false,
    error: null,
  };
}
