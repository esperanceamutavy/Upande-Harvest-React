import { create } from 'zustand';

export interface UserStation {
  farm: string;
  farmName: string;
  warehouse: string;
  warehouseName: string;
}

interface StationState {
  station: UserStation | null;
  setStation: (station: UserStation) => void;
  clearStation: () => void;
}

export const useStationStore = create<StationState>((set) => ({
  station: null,
  setStation: (station) => set({ station }),
  clearStation: () => set({ station: null }),
}));
