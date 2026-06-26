// ═══════════════════════════════════════════════════════════════
// Custom Auth API — Login, Refresh, Logout, Me
// Kết nối tới Express backend mới thay vì Open edX
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";
import type { RoleLabelMap } from "@/utils/role-labels";

/** Response format chuẩn từ custom backend */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/** Response từ login/refresh */
export interface CustomLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: CustomUserInfo;
  permissions: Record<string, { can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean }>;
  tenant_modules: string[];
  managed_tenants: { id: string; name: string }[];
  role_labels?: RoleLabelMap;
  member_groups?: { id: string; name: string }[];
}

/** Thông tin user từ backend */
export interface CustomUserInfo {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  role: "learner" | "learner_plus" | "staff" | "superuser" | "superadmin";
  tenant_id: string | null;
  tenant_name: string | null;
}

/** Response từ GET /auth/me */
export interface CustomMeResponse {
  user: CustomUserInfo;
  permissions: Record<string, { can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean }>;
  tenant_modules: string[];
  managed_tenants: { id: string; name: string }[];
  role_labels?: RoleLabelMap;
  member_groups?: { id: string; name: string }[];
}

/**
 * Đăng nhập bằng username/password.
 */
export async function customLoginApi(username: string, password: string): Promise<CustomLoginResponse> {
  const { data } = await customApiClient.post<ApiResponse<CustomLoginResponse>>("/api/auth/login", {
    username,
    password,
    client_app: "admin",
    origin: window.location.origin,
  });
  return data.data;
}

/**
 * Refresh token — nhận token pair mới.
 * QUAN TRỌNG: Dùng axios trực tiếp, KHÔNG dùng customApiClient.
 * customApiClient interceptor gắn expired Bearer token → BE reject 401 → vòng lặp.
 */
export async function customRefreshApi(refreshToken: string, tenantId?: string | null): Promise<CustomLoginResponse> {
  const axios = (await import("axios")).default;
  const { config } = await import("@/config/env");
  const baseURL = config.customApiUrl;

  const { data } = await axios.post<ApiResponse<CustomLoginResponse>>(
    `${baseURL}/api/auth/refresh`,
    { refresh_token: refreshToken, ...(tenantId ? { tenant_id: tenantId } : {}) },
    { headers: { "Content-Type": "application/json" }, timeout: 10_000 }
  );
  return data.data;
}

export async function customGetRoleLabelsApi(): Promise<RoleLabelMap> {
  const { data } = await customApiClient.get<ApiResponse<{ role_labels: RoleLabelMap }>>("/api/auth/role-labels");
  return data.data.role_labels || {};
}

/**
 * Lấy thông tin user hiện tại + permissions.
 */
export async function customGetMeApi(): Promise<CustomMeResponse> {
  const { data } = await customApiClient.get<ApiResponse<CustomMeResponse>>("/api/auth/me");
  return data.data;
}

/**
 * Đăng xuất — revoke refresh token.
 */
export async function customLogoutApi(refreshToken: string): Promise<void> {
  await customApiClient.post("/api/auth/logout", { refresh_token: refreshToken });
}

/**
 * Exchange One-Time Token → full auth session.
 * Dùng cho cross-app SSO (FE 5173 → Admin Dashboard).
 * KHÔNG cần auth header — OTT tự nó là proof of identity.
 */
export async function customExchangeOttApi(ott: string): Promise<CustomLoginResponse> {
  const axios = (await import("axios")).default;
  const { config } = await import("@/config/env");
  const baseURL = config.customApiUrl;

  const { data } = await axios.post<ApiResponse<CustomLoginResponse>>(
    `${baseURL}/api/auth/ott/exchange`,
    { ott },
    { headers: { "Content-Type": "application/json" }, timeout: 10_000 }
  );
  return data.data;
}

/**
 * Generate One-Time Token cho cross-app SSO (Admin → FE Learner).
 * Cần auth header — user phải đã login.
 */
export async function customGenerateOttApi(): Promise<{ ott: string; expires_in: number }> {
  const { data } = await customApiClient.post<ApiResponse<{ ott: string; expires_in: number }>>("/api/auth/ott/generate");
  return data.data;
}
