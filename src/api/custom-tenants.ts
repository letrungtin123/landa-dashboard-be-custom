// ═══════════════════════════════════════════════════════════════
// Tenants API — CRUD tenants + module toggle
// Kết nối tới custom Express backend
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";
import type { RoleLabelMap } from "@/utils/role-labels";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain_learner: string | null;
  domain_admin: string | null;
  max_users: number | null;
  max_courses: number | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TenantQuotaUsage {
  max_users: number | null;
  max_courses: number | null;
  current_users: number;
  current_courses: number;
}

export interface TenantModule {
  module_id: string;
  code: string;
  name: string;
  icon: string;
  sort_order: number;
  is_enabled: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Danh sách tenants (phân trang) */
export async function fetchTenants(params?: { page?: number; page_size?: number; search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<Tenant>>>("/api/tenants", { params });
  return data.data;
}

/** Chi tiết tenant */
export async function fetchTenantById(id: string) {
  const { data } = await customApiClient.get<ApiResponse<Tenant>>(`/api/tenants/${id}`);
  return data.data;
}

/** Tạo tenant */
export async function createTenant(input: { name: string; slug: string; domain_learner?: string | null; domain_admin?: string | null; max_users?: number | null; max_courses?: number | null; settings?: Record<string, unknown> }) {
  const { data } = await customApiClient.post<ApiResponse<Tenant>>("/api/tenants", input);
  return data.data;
}

/** Cập nhật tenant */
export async function updateTenant(id: string, input: Partial<{ name: string; slug: string; domain_learner: string | null; domain_admin: string | null; max_users: number | null; max_courses: number | null; is_active: boolean; settings: Record<string, unknown> }>) {
  const { data } = await customApiClient.put<ApiResponse<Tenant>>(`/api/tenants/${id}`, input);
  return data.data;
}

/** Xóa tenant */
export async function deleteTenant(id: string) {
  await customApiClient.delete(`/api/tenants/${id}`);
}

/** Lấy modules config của tenant */
export async function fetchTenantModules(tenantId: string) {
  const { data } = await customApiClient.get<ApiResponse<TenantModule[]>>(`/api/tenants/${tenantId}/modules`);
  return data.data;
}

/** Cập nhật modules toggle cho tenant */
export async function updateTenantModules(tenantId: string, modules: { module_id: string; is_enabled: boolean }[]) {
  await customApiClient.put(`/api/tenants/${tenantId}/modules`, { modules });
}

/** Lấy danh sách tenants mà user được quản lý */
export async function getUserTenants(userId: string): Promise<{ tenant_id: string; tenant_name: string }[]> {
  const { data } = await customApiClient.get<ApiResponse<{ tenant_id: string; tenant_name: string }[]>>(`/api/tenants/user-tenants/${userId}`);
  return data.data;
}

/** Gán user quản lý nhiều tenants (thay thế toàn bộ) */
export async function setUserTenants(userId: string, tenantIds: string[]): Promise<{ updated: number }> {
  const { data } = await customApiClient.put<ApiResponse<{ updated: number }>>(`/api/tenants/user-tenants/${userId}`, { tenant_ids: tenantIds });
  return data.data;
}

/** Lấy quota usage hiện tại của tenant */
export async function fetchTenantQuota(tenantId: string): Promise<TenantQuotaUsage> {
  const { data } = await customApiClient.get<ApiResponse<TenantQuotaUsage>>(`/api/tenants/${tenantId}/quota`);
  return data.data;
}

export async function fetchTenantRoleLabels(tenantId: string): Promise<RoleLabelMap> {
  const { data } = await customApiClient.get<ApiResponse<{ labels: RoleLabelMap }>>(`/api/tenants/${tenantId}/role-labels`);
  return data.data.labels || {};
}

export async function updateTenantRoleLabels(tenantId: string, labels: RoleLabelMap): Promise<RoleLabelMap> {
  const { data } = await customApiClient.put<ApiResponse<{ labels: RoleLabelMap }>>(
    `/api/tenants/${tenantId}/role-labels`,
    { labels },
  );
  return data.data.labels || {};
}
