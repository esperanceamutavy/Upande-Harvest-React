/** Raw Frappe error response body shape */
export interface FrappeErrorBody {
  exc_type?: string;
  exception?: string;
  message?: string;
  exc?: string;
  /** JSON-encoded array: [{message, indicator, title}] */
  _server_messages?: string;
}

/** Normalised error thrown by the axios interceptor */
export interface ApiError {
  status: number;
  excType?: string;
  message: string;
  serverMessages?: string[];
}
