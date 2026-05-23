import axios, { AxiosError } from 'axios';

import type { ApiError, FrappeErrorBody } from '../types/frappe';
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
 * Single axios instance. Base URL and Authorization header are injected
 * per-request in the request interceptor (Phase 1.3).
 * STACK.md §HTTP: no mutable shared headers — always injected via interceptor.
 */
export const apiClient = axios.create();

// Request interceptor — reads live store state so every request picks up current credentials.
apiClient.interceptors.request.use((config) => {
  const { instanceUrl, apiKey, apiSecret } = useAuthStore.getState();
  if (instanceUrl) {
    config.baseURL = instanceUrl;
  }
  if (apiKey && apiSecret) {
    config.headers.Authorization = `token ${apiKey}:${apiSecret}`;
  }
  return config;
});

// Response interceptor — normalise Frappe errors → ApiError
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<FrappeErrorBody>) => Promise.reject(parseFrappeError(error)),
);
