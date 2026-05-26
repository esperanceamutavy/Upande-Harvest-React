export type DiscardReason = 'Lack of market' | 'Disease';

export interface BunchEntry {
  name: string;
  custom_scanned_grading: number;
  custom_scanned_packing: number;
  custom_greenhouse?: string | null;
  stock_entry_type: string;
  custom_graded_by?: string | null;
  custom_bunch_id?: string | null;
}

export interface FetchBunchEntriesResponse {
  message: BunchEntry[];
}

export interface DiscardPayload {
  userFarm: string;
  bunchId: string;
  discardReason: DiscardReason;
}

export interface DiscardResponse {
  message: string;
  stock_entry: string;
}
