// ═══════════════════════════════════════════════════════════════
// Custom API Client — Kết nối tới Express backend mới
// Bearer auth, auto-refresh 401, token rotation
// ═══════════════════════════════════════════════════════════════

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { config } from "@/config/env";
import { ensureTokenRefresh } from "./refresh-manager";

export const customApiClient = axios.create({
  baseURL: config.customApiUrl,
  headers: { "Content-Type": "application/json" },
  timeout: config.apiTimeoutMs,
});

// Lazy import store — tránh circular dependency
async function getAuthStore() {
  const { useAuthStore } = await import("@/utils/store");
  return useAuthStore;
}

// Lazy import tenant store — tránh circular dependency
async function getTenantStore() {
  const { useTenantStore } = await import("@/utils/tenant-store");
  return useTenantStore;
}

// ── Request Interceptor: gắn Bearer token + X-Tenant-Id (superadmin/superuser) ──
customApiClient.interceptors.request.use(async (req) => {
  const store = await getAuthStore();
  const { accessToken, user } = store.getState();
  if (accessToken) {
    req.headers.Authorization = `Bearer ${accessToken}`;
  }

  // CHỈ superadmin mới switch tenant qua X-Tenant-Id header
  if (user?.role === 'superadmin') {
    const tenantStore = await getTenantStore();
    const { activeTenantId } = tenantStore.getState();
    if (activeTenantId) {
      req.headers['X-Tenant-Id'] = activeTenantId;
    }
  }

  return req;
});

// ── Response Interceptor: 401 → refresh (shared singleton) → retry ──
customApiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    // Tài khoản bị khóa bởi Admin → logout ngay, KHÔNG thử refresh
    const responseData = error.response?.data as Record<string, unknown> | undefined;
    if (responseData?.error === "account_disabled") {
      const store = await getAuthStore();
      store.getState().logout();
      window.location.href = "/login?error=account_disabled";
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    // Dùng shared singleton → tránh race condition 2 clients cùng refresh
    const success = await ensureTokenRefresh();
    if (success) {
      const store = await getAuthStore();
      const { accessToken } = store.getState();
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return customApiClient(originalRequest);
    }

    // Refresh thất bại → logout
    const store = await getAuthStore();
    store.getState().logout();
    window.location.href = "/login?session=expired";
    return Promise.reject(error);
  }
);

