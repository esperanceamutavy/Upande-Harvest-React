import { useStationStore } from '../../stores/station';

export function useStation() {
  return useStationStore((s) => s.station);
}
