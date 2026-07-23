import { create } from 'zustand';

interface AuthState {
  sid: string | null;
  instanceUrl: string | null;
  fullName: string | null;
  email: string | null;
  isAuthenticated: boolean;
  setCredentials: (params: {
    sid: string;
    instanceUrl: string;
    fullName: string;
    email: string;
  }) => void;
  clearCredentials: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  sid: null,
  instanceUrl: null,
  fullName: null,
  email: null,
  isAuthenticated: false,
  setCredentials: ({ sid, instanceUrl, fullName, email }) =>
    set({ sid, instanceUrl, fullName, email, isAuthenticated: true }),
  clearCredentials: () =>
    set({
      sid: null,
      instanceUrl: null,
      fullName: null,
      email: null,
      isAuthenticated: false,
    }),
}));
