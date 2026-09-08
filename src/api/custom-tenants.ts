// ═══════════════════════════════════════════════════════════════
// Tenants API — CRUD tenants + module toggle
// Kết nối tới custom Express backend
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";
import type { GroupLabelMap } from "@/utils/group-labels";
import type { RoleLabelMap } from "@/utils/role-labels";
import type { CourseComponentPermissionType } from "@/utils/course-component-permissions";

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
  /** Bigint values are transported as decimal strings to avoid JS precision loss. */
  data_limit_bytes: string | null;
  database_used_bytes: string;
  storage_used_bytes: string;
  storage_reserved_bytes: string;
  data_quota_state: "initializing" | "observing" | "enforced" | "reconciling" | "drifted";
  data_quota_last_verified_at: string | null;
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
  data_quota: TenantDataQuota | null;
}

export interface TenantDataQuota {
  limitBytes: string | null;
  databaseUsedBytes: string;
  storageUsedBytes: string;
  storageReservedBytes: string;
  totalUsedBytes: string;
  availableBytes: string | null;
  state: "initializing" | "observing" | "enforced" | "reconciling" | "drifted";
  lastVerifiedAt: string | null;
}

export interface TenantModule {
  module_id: string;
  code: string;
  name: string;
  icon: string;
  sort_order: number;
  is_enabled: boolean;
}

export interface TenantCourseComponentPermissions {
  allowed_component_types: CourseComponentPermissionType[];
}

export interface TenantSmtpConfig {
  tenant_id: string;
  is_enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  from_email: string;
  from_name: string;
  reply_to_email: string | null;
  copy_to_sender: boolean;
  copy_to_email: string | null;
  has_password: boolean;
  masked_username: string | null;
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
export async function createTenant(input: { name: string; slug: string; domain_learner?: string | null; domain_admin?: string | null; max_users?: number | null; max_courses?: number | null; data_limit_bytes?: string | null; settings?: Record<string, unknown> }) {
  const { data } = await customApiClient.post<ApiResponse<Tenant>>("/api/tenants", input);
  return data.data;
}

/** Cập nhật tenant */
export async function updateTenant(id: string, input: Partial<{ name: string; slug: string; domain_learner: string | null; domain_admin: string | null; max_users: number | null; max_courses: number | null; data_limit_bytes: string | null; is_active: boolean; settings: Record<string, unknown> }>) {
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

export async function fetchTenantCourseComponentPermissions(tenantId: string): Promise<TenantCourseComponentPermissions> {
  const { data } = await customApiClient.get<ApiResponse<TenantCourseComponentPermissions>>(
    `/api/tenants/${tenantId}/course-component-permissions`,
  );
  return data.data;
}

export async function updateTenantCourseComponentPermissions(
  tenantId: string,
  allowedComponentTypes: CourseComponentPermissionType[],
): Promise<TenantCourseComponentPermissions> {
  const { data } = await customApiClient.put<ApiResponse<TenantCourseComponentPermissions>>(
    `/api/tenants/${tenantId}/course-component-permissions`,
    { allowed_component_types: allowedComponentTypes },
  );
  return data.data;
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

/** Quota của tenant được xác định ở backend từ phiên hiện tại. */
export async function fetchCurrentTenantDataQuota(): Promise<TenantDataQuota> {
  const { data } = await customApiClient.get<ApiResponse<TenantDataQuota>>('/api/tenants/current/data-quota');
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

export async function fetchTenantGroupLabels(tenantId: string): Promise<GroupLabelMap> {
  const { data } = await customApiClient.get<ApiResponse<{ labels: GroupLabelMap }>>(`/api/tenants/${tenantId}/group-labels`);
  return data.data.labels || {};
}

export async function updateTenantGroupLabels(tenantId: string, labels: GroupLabelMap): Promise<GroupLabelMap> {
  const { data } = await customApiClient.put<ApiResponse<{ labels: GroupLabelMap }>>(
    `/api/tenants/${tenantId}/group-labels`,
    { labels },
  );
  return data.data.labels || {};
}

export async function fetchTenantSmtpConfig(tenantId: string): Promise<TenantSmtpConfig> {
  const { data } = await customApiClient.get<ApiResponse<TenantSmtpConfig>>(`/api/tenants/${tenantId}/smtp`);
  return data.data;
}

export async function updateTenantSmtpConfig(
  tenantId: string,
  input: Omit<TenantSmtpConfig, 'tenant_id' | 'has_password' | 'masked_username'> & { password?: string },
): Promise<TenantSmtpConfig> {
  const { data } = await customApiClient.put<ApiResponse<TenantSmtpConfig>>(`/api/tenants/${tenantId}/smtp`, input);
  return data.data;
}
