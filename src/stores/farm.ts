import { create } from 'zustand';

/**
 * Xflora config is farm-only. There is no station/warehouse concept here — the
 * Flutter reference hides the warehouse field for Xflora (configure_user_farm_screen.dart:173
 * `if (!isXflora)`) and persists just `userFarm`. Of the 5 v1 flows, only Shelving
 * reads this (`farm` in the shelving_entry body). See XFLORA_PORT_PLAN.md §5.2.
 */
export interface UserFarm {
  /** Farm doc `name` — the value sent to the API (e.g. shelving_entry `farm`). */
  farm: string;
  /** Farm `farm_name` — display label only. */
  farmName: string;
}

interface FarmState {
  farm: UserFarm | null;
  setFarm: (farm: UserFarm) => void;
  clearFarm: () => void;
}

export const useFarmStore = create<FarmState>((set) => ({
  farm: null,
  setFarm: (farm) => set({ farm }),
  clearFarm: () => set({ farm: null }),
}));
