import { create } from 'zustand';

interface AuthState {
  sid: string | null;
  /** Always `https://${tenantId}` — derived on hydrate, never stored separately. */
  instanceUrl: string | null;
  /** The site this session belongs to, e.g. `xflora.upande.com`. Namespaces storage. */
  tenantId: string | null;
  fullName: string | null;
  email: string | null;
  isAuthenticated: boolean;
  setCredentials: (params: {
    sid: string;
    instanceUrl: string;
    tenantId: string;
    fullName: string;
    email: string;
  }) => void;
  clearCredentials: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  sid: null,
  instanceUrl: null,
  tenantId: null,
  fullName: null,
  email: null,
  isAuthenticated: false,
  setCredentials: ({ sid, instanceUrl, tenantId, fullName, email }) =>
    set({ sid, instanceUrl, tenantId, fullName, email, isAuthenticated: true }),
  clearCredentials: () =>
    set({
      sid: null,
      instanceUrl: null,
      tenantId: null,
      fullName: null,
      email: null,
      isAuthenticated: false,
    }),
}));
