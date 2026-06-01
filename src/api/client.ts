// ============================================================
// Axios API Client — Bearer auth, CSRF, auto-refresh 401
// KHÔNG LOG DỮ LIỆU NHẠY CẢM
// ============================================================

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { config } from "@/config/env";

export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  headers: { "Content-Type": "application/json" },
  timeout: config.apiTimeoutMs,
});

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

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
  const { accessToken, tokenType } = store.getState() as any;
  if (accessToken) {
    req.headers.Authorization = `${tokenType} ${accessToken}`;
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

// Response: 401 → refresh → retry
apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }
    originalRequest._retried = true;

    const store = await getAuthStore();

    if (isRefreshing && refreshPromise) {
      const success = await refreshPromise;
      if (success) {
        const { accessToken, tokenType } = store.getState() as any;
        originalRequest.headers.Authorization = `${tokenType} ${accessToken}`;
        return apiClient(originalRequest);
      }
      return Promise.reject(error);
    }

    isRefreshing = true;
    refreshPromise = store.getState().performTokenRefresh().finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

    const success = await refreshPromise;
    if (success) {
      const { accessToken, tokenType } = store.getState() as any;
      originalRequest.headers.Authorization = `${tokenType} ${accessToken}`;
      return apiClient(originalRequest);
    }

    store.getState().logout();
    return Promise.reject(error);
  }
);
