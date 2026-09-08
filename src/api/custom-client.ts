// ═══════════════════════════════════════════════════════════════
// Custom API Client — Kết nối tới Express backend mới
// Bearer auth, auto-refresh 401, token rotation
// ═══════════════════════════════════════════════════════════════

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { config } from "@/config/env";
import { ensureTokenRefresh } from "./refresh-manager";
import { scheduleTenantDataQuotaRefresh } from "@/utils/tenant-data-quota-refresh";

type QuotaTrackedRequestConfig = InternalAxiosRequestConfig & {
  tenantDataQuotaRefreshTenantId?: string;
};

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

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

function getHeaderTenantId(req: InternalAxiosRequestConfig): string | null {
  const rawValue = req.headers['X-Tenant-Id'] ?? req.headers['x-tenant-id'];
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null;
}

function isQuotaRelevantMutation(req: InternalAxiosRequestConfig): boolean {
  const method = req.method?.toLowerCase();
  return Boolean(method && MUTATING_METHODS.has(method) && req.url?.startsWith('/api/'));
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
      req.headers['X-Tenant-Id'] ||= activeTenantId;
    }
  }

  // Keep the tenant that this request was sent for. If a superadmin switches
  // tenant while a request is in flight, its successful response must never
  // refresh the header for the newly selected tenant by mistake.
  if (isQuotaRelevantMutation(req)) {
    const requestTenantId = getHeaderTenantId(req) || (user?.role !== 'superadmin' ? user?.tenant_id : null);
    if (requestTenantId) {
      (req as QuotaTrackedRequestConfig).tenantDataQuotaRefreshTenantId = requestTenantId;
    }
  }

  return req;
});

// ── Response Interceptor: 401 → refresh (shared singleton) → retry ──
customApiClient.interceptors.response.use(
  (res) => {
    const request = res.config as QuotaTrackedRequestConfig;
    if (request.tenantDataQuotaRefreshTenantId) {
      scheduleTenantDataQuotaRefresh(request.tenantDataQuotaRefreshTenantId);
    }
    return res;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    // Bỏ qua logic refresh nếu là request login hoặc refresh (tránh việc refresh lỗi -> F5 trang khi user nhập sai pass)
    if (originalRequest.url?.includes('/api/auth/login') || originalRequest.url?.includes('/api/auth/refresh')) {
      return Promise.reject(error);
    }

    // Tài khoản bị khóa bởi Admin → logout ngay, KHÔNG thử refresh
    const responseData = error.response?.data as Record<string, unknown> | undefined;
    if (responseData?.error === "account_disabled") {
      const store = await getAuthStore();
      store.getState().logout();
      window.location.href = "/admin/login?error=account_disabled";
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    // Single source of truth: store.performTokenRefresh() có mutex + cooldown
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
    window.location.href = "/admin/login?session=expired";
    return Promise.reject(error);
  }
);

