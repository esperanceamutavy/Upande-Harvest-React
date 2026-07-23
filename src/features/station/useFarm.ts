import { useFarmStore } from '../../stores/farm';

/** Returns the configured farm, or null if none set yet. */
export function useFarm() {
  return useFarmStore((s) => s.farm);
}
