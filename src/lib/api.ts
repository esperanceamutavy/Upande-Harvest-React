import axios, { AxiosError } from 'axios';

import type { ApiError, FrappeErrorBody } from '../types/frappe';
import { readableServerMessage, stripHtml } from './frappeMessage.ts';
import { TENANT_KEYS, removeItemFor } from './storage';
import { useAuthStore } from '../stores/auth';

function parseFrappeError(error: AxiosError<FrappeErrorBody>): ApiError {
  const status = error.response?.status ?? 0;
  const data = error.response?.data;

  let serverMessages: string[] = [];
  if (data?._server_messages) {
    try {
      const parsed = JSON.parse(data._server_messages) as Array<{ message: string }>;
      // Strip at the boundary. Frappe hands us HTML — ERPNext's own
      // NegativeStockError ships two <a href="/desk/..."> tags — and every
      // screen renders this string into a <Text>, which shows markup verbatim.
      serverMessages = parsed.map((m) => stripHtml(m.message)).filter(Boolean);
    } catch {
      // malformed _server_messages — ignore
    }
  }

  return {
    status,
    excType: data?.exc_type,
    // `??` was the bug's other half: a message of pure markup stripped to ''
    // is still not null, so it would win over a usable fallback.
    message: readableServerMessage(serverMessages, [
      data?.message,
      data?.exception,
      error.message,
    ]),
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
      // Read the tenant BEFORE clearing — the implicit accessors throw when no
      // tenant is active, and that throw would land inside this error handler.
      const { tenantId } = useAuthStore.getState();
      useAuthStore.getState().clearCredentials();
      if (tenantId) void removeItemFor(tenantId, TENANT_KEYS.SID);
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
