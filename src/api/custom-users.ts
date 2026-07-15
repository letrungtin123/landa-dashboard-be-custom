// ═══════════════════════════════════════════════════════════════
// Custom Users API — CRUD users qua Express backend
// Thay thế landa-admin.ts (edX) cho module users
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface CustomUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  role: "superadmin" | "superuser" | "staff" | "learner_plus" | "learner";
  is_active: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  last_login_at: string | null;
  created_at: string;
  permission_groups?: { id: string; name: string }[];
  permission_group_id?: string | null;
  permission_group_name?: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Danh sách users (phân trang + filters) */
export async function fetchUsers(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  role?: string;
  is_active?: string;
  permission_group_id?: string;
}) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<CustomUser>>>("/api/users", { params });
  return data.data;
}

/** Chi tiết user + permission groups */
export async function fetchUserById(id: string) {
  const { data } = await customApiClient.get<ApiResponse<CustomUser>>(`/api/users/${id}`);
  return data.data;
}

/** Tạo user mới */
export async function createUser(input: {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
  role: string;
  tenant_id?: string;
}) {
  const { data } = await customApiClient.post<ApiResponse<CustomUser>>("/api/users", input);
  return data.data;
}

/** Cập nhật user */
export async function updateUser(id: string, input: Partial<{
  username: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  is_active: boolean;
  password: string;
  avatar_url: string;
}>) {
  const { data } = await customApiClient.put<ApiResponse<CustomUser>>(`/api/users/${id}`, input);
  return data.data;
}

/** Xóa user */
export async function deleteUser(id: string) {
  await customApiClient.delete(`/api/users/${id}`);
}

/** Gán permission groups cho user (replace toàn bộ) */
export async function assignUserPermGroups(userId: string, groupIds: string[]) {
  await customApiClient.put(`/api/users/${userId}/permission-groups`, { permission_group_ids: groupIds });
}
