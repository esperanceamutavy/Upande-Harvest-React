import axios, { AxiosError } from 'axios';

import type { ApiError, FrappeErrorBody } from '../types/frappe';
import { SECURE_KEYS, deleteSecureItem } from './storage';
import { useAuthStore } from '../stores/auth';

function parseFrappeError(error: AxiosError<FrappeErrorBody>): ApiError {
  const status = error.response?.status ?? 0;
  const data = error.response?.data;

  let serverMessages: string[] = [];
  if (data?._server_messages) {
    try {
      const parsed = JSON.parse(data._server_messages) as Array<{ message: string }>;
      serverMessages = parsed.map((m) => m.message);
    } catch {
      // malformed _server_messages — ignore
    }
  }

  return {
    status,
    excType: data?.exc_type,
    message:
      serverMessages[0] ??
      data?.message ??
      data?.exception ??
      error.message ??
      'Unknown error',
    serverMessages,
  };
}

/**
 * Single axios instance. Base URL and session cookie are injected
 * per-request in the request interceptor (Phase 1.3).
 * STACK.md §HTTP: no mutable shared headers — always injected via interceptor.
 */
export const apiClient = axios.create();

// Request interceptor — reads live store state so every request picks up current credentials.
apiClient.interceptors.request.use((config) => {
  const { instanceUrl, sid } = useAuthStore.getState();
  if (instanceUrl) {
    config.baseURL = instanceUrl;
  }
  if (sid) {
    config.headers.Cookie = `sid=${sid}`;
  }
  return config;
});

// Response interceptor — normalise Frappe errors → ApiError.
// A 401 means the session cookie is expired/invalid — clear auth so the gate
// routes back to login. 403 is a legit per-endpoint permission error, not session
// expiry, so we do NOT auto-logout on it.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<FrappeErrorBody>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearCredentials();
      void deleteSecureItem(SECURE_KEYS.SID);
    }
    return Promise.reject(parseFrappeError(error));
  },
);

export function extractFrappeError(e: unknown): string {
  const err = e as { response?: { data?: { message?: string; exception?: string } }; message?: string };
  return err.response?.data?.message
    ?? err.response?.data?.exception
    ?? err.message
    ?? 'Unknown error';
}
