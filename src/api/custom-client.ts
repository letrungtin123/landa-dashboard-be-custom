// ═══════════════════════════════════════════════════════════════
// Custom API Client — Kết nối tới Express backend mới
// Bearer auth, auto-refresh 401, token rotation
// ═══════════════════════════════════════════════════════════════

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { config } from "@/config/env";

export const customApiClient = axios.create({
  baseURL: config.customApiUrl,
  headers: { "Content-Type": "application/json" },
  timeout: config.apiTimeoutMs,
});

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

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

  // Superadmin hoặc superuser multi-tenant: gắn X-Tenant-Id header từ tenant context store
  if (user?.role === 'superadmin' || user?.role === 'superuser') {
    const tenantStore = await getTenantStore();
    const { activeTenantId } = tenantStore.getState();
    if (activeTenantId) {
      req.headers['X-Tenant-Id'] = activeTenantId;
    }
  }

  return req;
});

// ── Response Interceptor: 401 → refresh → retry ──
customApiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }
    originalRequest._retried = true;

    const store = await getAuthStore();

    // Nếu đang refresh → đợi promise hiện tại
    if (isRefreshing && refreshPromise) {
      const success = await refreshPromise;
      if (success) {
        const { accessToken } = store.getState();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return customApiClient(originalRequest);
      }
      return Promise.reject(error);
    }

    // Bắt đầu refresh
    isRefreshing = true;
    refreshPromise = store.getState().performTokenRefresh().finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

    const success = await refreshPromise;
    if (success) {
      const { accessToken } = store.getState();
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return customApiClient(originalRequest);
    }

    // Refresh thất bại → logout
    store.getState().logout();
    return Promise.reject(error);
  }
);
