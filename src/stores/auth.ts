import { create } from 'zustand';

interface AuthState {
  apiKey: string | null;
  apiSecret: string | null;
  instanceUrl: string | null;
  fullName: string | null;
  email: string | null;
  isAuthenticated: boolean;
  setCredentials: (params: {
    apiKey: string;
    apiSecret: string;
    instanceUrl: string;
    fullName: string;
    email: string;
  }) => void;
  clearCredentials: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  apiKey: null,
  apiSecret: null,
  instanceUrl: null,
  fullName: null,
  email: null,
  isAuthenticated: false,
  setCredentials: ({ apiKey, apiSecret, instanceUrl, fullName, email }) =>
    set({ apiKey, apiSecret, instanceUrl, fullName, email, isAuthenticated: true }),
  clearCredentials: () =>
    set({
      apiKey: null,
      apiSecret: null,
      instanceUrl: null,
      fullName: null,
      email: null,
      isAuthenticated: false,
    }),
}));
