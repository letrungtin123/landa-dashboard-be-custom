// ═══════════════════════════════════════════════════════════════
// Custom Groups API — Org → SubGroup → Team + assignments
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Types ──

export interface OrgGroup {
  id: string;
  name: string;
  description: string;
  subgroup_count: number;
  created_at: string;
}

export interface SubGroup {
  id: string;
  name: string;
  org_group_id: string;
  team_count: number;
  created_at: string;
}

export interface SubGroupMember {
  id: string;
  username: string;
  full_name?: string;
  email: string;
  avatar?: string;
  added_at: string;
}

export interface AssignedCourse {
  course_id: string;
  display_name: string;
  assigned_at: string;
}

export interface AssignedCategory {
  category_id: string;
  name: string;
  assigned_at: string;
}

export interface AssignedCourseCategory {
  category_id: string;
  name: string;
  slug: string;
  assigned_at: string;
}

export interface Team {
  id: string;
  name: string;
  sub_group_id: string;
  member_count: number;
  course_count: number;
  course_category_count: number;
  created_at: string;
}

export interface SubGroupDetail {
  id: string;
  name: string;
  org_group_id: string;
  org_group_name: string;
  team_count: number;
  teams: Team[];
  member_count: number;
  course_count: number;
  category_count: number;
  course_category_count: number;
  members: SubGroupMember[];
  courses: AssignedCourse[];
  categories: AssignedCategory[];
  course_categories: AssignedCourseCategory[];
  created_at: string;
}

export interface TeamDetail extends Team {
  subgroup_name: string;
  org_group_id: string;
  org_group_name: string;
  category_count: number;
  members: SubGroupMember[];
  courses: AssignedCourse[];
  categories: AssignedCategory[];
  course_categories: AssignedCourseCategory[];
}

export interface GroupAuditLogItem {
  id: string;
  actor_username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  details: string;
  ip_address: string;
  created_at: string;
}

// ── Org Groups ──

export interface GroupNotificationSmtpStatus {
  configured: boolean;
  is_enabled: boolean;
  has_password: boolean;
  can_send_email: boolean;
  host: string | null;
  from_email: string | null;
  reason: string | null;
}

export async function getOrgGroups(params?: { page?: number; page_size?: number; search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<{ groups: OrgGroup[]; total: number; page: number; page_size: number }>>("/api/groups", { params });
  return data.data;
}

export async function createOrgGroup(payload: { name: string; description?: string; tenant_id?: string }) {
  const { data } = await customApiClient.post<ApiResponse<{ id: string; name: string }>>("/api/groups", payload);
  return data.data;
}

export async function updateOrgGroup(id: string, payload: { name?: string; description?: string }) {
  await customApiClient.patch(`/api/groups/${id}`, payload);
  return { success: true };
}

export async function deleteOrgGroup(id: string) {
  await customApiClient.delete(`/api/groups/${id}`);
  return { success: true };
}

// ── Sub Groups ──

export async function getSubGroups(groupId: string, params?: { search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<{ subgroups: SubGroup[]; total: number }>>(`/api/groups/${groupId}/subgroups`, { params });
  return data.data;
}

export async function createSubGroup(groupId: string, payload: { name: string }) {
  const { data } = await customApiClient.post<ApiResponse<{ id: string; name: string }>>(`/api/groups/${groupId}/subgroups`, payload);
  return data.data;
}

export async function getSubGroupDetail(id: string): Promise<SubGroupDetail> {
  const { data } = await customApiClient.get<ApiResponse<SubGroupDetail>>(`/api/groups/subgroups/${id}`);
  return data.data;
}

export async function updateSubGroup(id: string, payload: { name: string }) {
  await customApiClient.patch(`/api/groups/subgroups/${id}`, payload);
  return { success: true };
}

export async function deleteSubGroup(id: string) {
  await customApiClient.delete(`/api/groups/subgroups/${id}`);
  return { success: true };
}

// ── Teams ──

export async function getTeams(subgroupId: string, params?: { search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<{ teams: Team[]; total: number }>>(`/api/groups/subgroups/${subgroupId}/teams`, { params });
  return data.data;
}

export async function createTeam(subgroupId: string, payload: { name: string }) {
  const { data } = await customApiClient.post<ApiResponse<{ id: string; name: string }>>(`/api/groups/subgroups/${subgroupId}/teams`, payload);
  return data.data;
}

export async function getTeamDetail(id: string): Promise<TeamDetail> {
  const { data } = await customApiClient.get<ApiResponse<TeamDetail>>(`/api/groups/teams/${id}`);
  return data.data;
}

export async function getTeamMembers(teamId: string, params?: { page?: number; page_size?: number; search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<SubGroupMember>>>(`/api/groups/teams/${teamId}/members`, { params });
  return data.data;
}

export async function getTeamCategories(teamId: string, params?: { page?: number; page_size?: number; search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<AssignedCategory>>>(`/api/groups/teams/${teamId}/categories`, { params });
  return data.data;
}

export async function getTeamCourseCategories(teamId: string, params?: { page?: number; page_size?: number; search?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<AssignedCourseCategory>>>(`/api/groups/teams/${teamId}/course-categories`, { params });
  return data.data;
}

export async function updateTeam(id: string, payload: { name: string }) {
  await customApiClient.patch(`/api/groups/teams/${id}`, payload);
  return { success: true };
}

export async function deleteTeam(id: string) {
  await customApiClient.delete(`/api/groups/teams/${id}`);
  return { success: true };
}

// ── Team Members ──

export async function getGroupNotificationSmtpStatus() {
  const { data } = await customApiClient.get<ApiResponse<GroupNotificationSmtpStatus>>("/api/groups/smtp-status");
  return data.data;
}

export async function addTeamMembers(teamId: string, userIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{
    success: boolean;
    added: number;
    skipped: number;
    notification_id: string | null;
    email_requested: boolean;
    email_queued: number;
    email_skipped_reason: string | null;
  }>>(`/api/groups/teams/${teamId}/members`, {
    user_ids: userIds,
  });
  return data.data;
}

export async function removeTeamMember(teamId: string, userId: string) {
  await customApiClient.delete(`/api/groups/teams/${teamId}/members/${userId}`);
  return { success: true };
}

// ── Team Courses ──

export async function assignTeamCourses(teamId: string, courseIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ success: boolean; assigned: number; skipped: number }>>(`/api/groups/teams/${teamId}/courses`, { course_ids: courseIds });
  return data.data;
}

export async function revokeTeamCourse(teamId: string, courseId: string) {
  await customApiClient.delete(`/api/groups/teams/${teamId}/courses/${encodeURIComponent(courseId)}`);
  return { success: true };
}

// ── Team Doc Categories (legacy: categories) ──

export async function assignTeamCategories(teamId: string, categoryIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ success: boolean; assigned: number; skipped: number }>>(`/api/groups/teams/${teamId}/categories`, { category_ids: categoryIds });
  return data.data;
}

export async function revokeTeamCategory(teamId: string, categoryId: string) {
  await customApiClient.delete(`/api/groups/teams/${teamId}/categories/${categoryId}`);
  return { success: true };
}

// ── Team Course Categories ──

export async function assignTeamCourseCategories(teamId: string, categoryIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ success: boolean; assigned: number; skipped: number }>>(`/api/groups/teams/${teamId}/course-categories`, { category_ids: categoryIds });
  return data.data;
}

export async function revokeTeamCourseCategory(teamId: string, categoryId: string) {
  await customApiClient.delete(`/api/groups/teams/${teamId}/course-categories/${categoryId}`);
  return { success: true };
}

// ── Group Audit Logs ──

export interface GroupAuditLogsResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: GroupAuditLogItem[];
}

export async function getGroupAuditLogs(params?: { page?: number; page_size?: number; search?: string; action?: string; date_from?: string; date_to?: string }) {
  const { data } = await customApiClient.get<ApiResponse<GroupAuditLogsResponse>>("/api/groups/audit-logs", { params });
  return data.data;
}

// ── My Role (placeholder — will be removed in new RBAC) ──

export interface MyRoleResponse {
  role: string | null;
  group_ids: string[];
  group_names: string[];
}

export async function getMyRole(): Promise<MyRoleResponse> {
  // New system uses permission_groups instead of edX groups
  return { role: null, group_ids: [], group_names: [] };
}
