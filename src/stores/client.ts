import { create } from 'zustand';

import { CLIENT_REGISTRY, type ClientConfig, type ClientId } from '../lib/clients';

interface ClientState {
  clientId: ClientId | null;
  clientConfig: ClientConfig | null;
  setClient: (id: ClientId) => void;
  clearClient: () => void;
}

export const useClientStore = create<ClientState>((set) => ({
  clientId: null,
  clientConfig: null,
  setClient: (id) => set({ clientId: id, clientConfig: CLIENT_REGISTRY[id] }),
  clearClient: () => set({ clientId: null, clientConfig: null }),
}));
