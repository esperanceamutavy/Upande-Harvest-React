export interface RejectReasonItem {
  name: string;
  reason: string;
  reject_type: string;  // 'Field' | 'Cleared' — NOT same as RejectType below. Not used for filtering.
}

export type RejectType = 'Harvesting' | 'Grading';

export interface RejectReasonsResponse {
  reject_reasons: RejectReasonItem[];
  varieties: string[];
}

export interface RejectItem {
  reason: string;
  quantity: number;
}

export interface RejectPayload {
  customFarm: string;
  greenhouse: string;
  rejectType: RejectType;
  variety: string;
  rejects: RejectItem[];
}

export interface RejectResponse {
  message: string;
  stock_entry: string;
}
