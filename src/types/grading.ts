// Raw scan from a bunch QR label
export interface ScannedBunch {
  grader: string;       // e.g. "HR-EMP-01160"
  stem_length: string;  // e.g. "50CM"
  bunch_id: string;     // e.g. "BUNCH-111837"
}

// Raw scan from a variety QR
export interface ScannedVariety {
  variety: string;      // e.g. "Athena"
}

// Payload for POST /api/method/grader3
export interface GradingPayload {
  farm: string;
  variety: string;
  stem_length: string;
  grader: string;
  bunch_id: string;
  bunch_size_override?: string;  // omit to use server-side item_group derivation
}

// Response shape from grader3
export interface GradingResponse {
  message: string;
  stock_entry?: string;
  error?: string;
}
