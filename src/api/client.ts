// ============================================================
// Axios API Client — Bearer auth, CSRF, auto-refresh 401
// KHÔNG LOG DỮ LIỆU NHẠY CẢM
// ============================================================

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { config } from "@/config/env";
import { ensureTokenRefresh } from "./refresh-manager";

export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  headers: { "Content-Type": "application/json" },
  timeout: config.apiTimeoutMs,
});

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : "";
}

// Lazy import để tránh circular dependency
async function getAuthStore() {
  const { useAuthStore } = await import("@/utils/store");
  return useAuthStore;
}

// Request: gắn Bearer + CSRF
apiClient.interceptors.request.use(async (req) => {
  const store = await getAuthStore();
  const { accessToken } = store.getState();
  if (accessToken) {
    req.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (req.method && req.method !== "get") {
    const csrf = getCsrfToken();
    if (csrf) req.headers["X-CSRFToken"] = csrf;
  }

  // Chuyển hướng các request tới CMS API
  if (req.url?.startsWith('/cms-api/')) {
    const rawCmsEnv = (import.meta.env.VITE_OPENEDX_CMS_URL || "").trim();

    // Nếu cấu hình VITE_OPENEDX_CMS_URL rỗng -> App đang rely vào Proxy cùng origin (Kong hoặc Vite Preview)
    // Hoặc nếu đang chạy dev server -> Vite dev proxy sẽ lo việc route
    if (import.meta.env.DEV || rawCmsEnv === "") {
      req.baseURL = "";
      // Giữ nguyên prefix /cms-api/ để proxy (Vite hoặc Kong) nhận diện và xử lý
    } else {
      // Nếu có explicit CMS URL (chạy build tĩnh không proxy), bắn trực tiếp và bóc prefix
      req.baseURL = config.cmsBaseUrl;
      req.url = req.url.replace(/^\/cms-api/, '');
    }
  }

  return req;
});

// Response: 401 → refresh (shared singleton) → retry
apiClient.interceptors.response.use(
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
      window.location.href = "/admin/login?error=account_disabled";
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    // Dùng shared singleton → tránh race condition 2 clients cùng refresh
    const success = await ensureTokenRefresh();
    if (success) {
      const store = await getAuthStore();
      const { accessToken } = store.getState();
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    }

    // Refresh thất bại → logout
    const store = await getAuthStore();
    store.getState().logout();
    window.location.href = "/admin/login?session=expired";
    return Promise.reject(error);
  }
);

