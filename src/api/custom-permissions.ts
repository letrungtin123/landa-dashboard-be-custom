// ═══════════════════════════════════════════════════════════════
// Permission Groups API — CRUD groups + ma trận permissions
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  tenant_id: string;
  tenant_name: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionGroupDetail extends PermissionGroup {
  permissions: ModulePermission[];
  members: GroupMember[];
}

export interface ModulePermission {
  module_id: string;
  code: string;
  name: string;
  icon: string;
  sort_order: number;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface GroupMember {
  id: string;
  username: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
}

export type PermissionGroupHistoryAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'matrix_updated'
  | 'members_assigned'
  | 'member_removed'
  | 'configuration_updated';

export interface PermissionGroupHistoryListItem {
  id: string;
  permission_group_id: string;
  permission_group_name: string;
  action: PermissionGroupHistoryAction;
  actor_username: string;
  actor_display_name: string | null;
  actor_role: string | null;
  created_at: string;
}

export interface PermissionMatrixHistorySnapshot {
  module_code: string;
  module_name: string | null;
  module_icon: string | null;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface PermissionGroupHistoryState {
  group: { id: string; name: string; description: string };
  matrix: PermissionMatrixHistorySnapshot[];
}

export interface PermissionGroupHistoryParticipant {
  user_id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  change: 'added' | 'removed' | 'reassigned';
  previous_group_id?: string | null;
  previous_group_name?: string | null;
}

export interface PermissionGroupHistoryDetail extends PermissionGroupHistoryListItem {
  actor_id: string;
  actor_email: string | null;
  before_state: PermissionGroupHistoryState | null;
  after_state: PermissionGroupHistoryState | null;
  participants: PermissionGroupHistoryParticipant[];
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Danh sách permission groups (phân trang) */
export async function fetchPermGroups(params?: { page?: number; page_size?: number; search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<PermissionGroup>>>("/api/permission-groups", { params });
  return data.data;
}

/** Chi tiết group + ma trận permissions + members */
export async function fetchPermGroupById(id: string) {
  const { data } = await customApiClient.get<ApiResponse<PermissionGroupDetail>>(`/api/permission-groups/${id}`);
  return data.data;
}

/** Tạo permission group */
export async function createPermGroup(input: { name: string; description?: string; tenant_id?: string }) {
  const { data } = await customApiClient.post<ApiResponse<PermissionGroup>>("/api/permission-groups", input);
  return data.data;
}

/** Cập nhật permission group */
export async function updatePermGroup(id: string, input: { name?: string; description?: string }) {
  const { data } = await customApiClient.put<ApiResponse<PermissionGroup>>(`/api/permission-groups/${id}`, input);
  return data.data;
}

/** Xóa permission group */
export async function deletePermGroup(id: string) {
  await customApiClient.delete(`/api/permission-groups/${id}`);
}

/** Cập nhật ma trận permissions (bulk) */
export async function updatePermMatrix(groupId: string, permissions: {
  module_code: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
}[]) {
  await customApiClient.put(`/api/permission-groups/${groupId}/permissions`, { permissions });
}

/** Save the permission matrix and all pending member changes in one transaction. */
export async function savePermGroupConfiguration(groupId: string, input: {
  permissions: {
    module_code: string;
    can_view: boolean;
    can_add: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }[];
  add_user_ids: string[];
  remove_user_ids: string[];
}) {
  const { data } = await customApiClient.put<ApiResponse<{ changed: boolean }>>(`/api/permission-groups/${groupId}/configuration`, input);
  return data.data;
}

/** Thêm users vào permission group (bulk) */
export async function addMembersToGroup(groupId: string, userIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ added: number; total: number }>>(`/api/permission-groups/${groupId}/members`, { user_ids: userIds });
  return data.data;
}

/** Xóa user khỏi permission group */
export async function removeMemberFromGroup(groupId: string, userId: string) {
  await customApiClient.delete(`/api/permission-groups/${groupId}/members/${userId}`);
}

export async function fetchPermissionGroupHistory(params?: {
  cursor?: string | null;
  page_size?: number;
  search?: string;
  from?: string;
  to?: string;
}) {
  const { data } = await customApiClient.get<ApiResponse<{
    data: PermissionGroupHistoryListItem[];
    total: number;
    has_more: boolean;
    next_cursor: string | null;
  }>>('/api/permission-groups/history', { params });
  return data.data;
}

export async function fetchPermissionGroupHistoryDetail(historyId: string) {
  const { data } = await customApiClient.get<ApiResponse<PermissionGroupHistoryDetail>>(`/api/permission-groups/history/${historyId}`);
  return data.data;
}
