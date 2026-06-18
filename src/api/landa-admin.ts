// ============================================================
// Landa Admin API — Documents, Categories, Courses
// Endpoints trên LMS: /api/landa/admin/
// Auth: Bearer token (OAuth2) — tự động qua apiClient
// ============================================================

import { apiClient } from './client';

// ── Types ──

export interface LandaDocument {
  id: number;
  title: string;
  extension: string;
  file_size: number;
  file_size_display: string;
  category_id: number | string;
  category_name: string;
  is_visible: boolean;
  uploaded_by_name: string;
  created_at: string;
}

export interface LandaCategory {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  doc_count: number;
}

export interface LandaCourse {
  id: string;
  display_name: string;
  description?: string | null;
  org: string;
  visible_to_staff_only: boolean;
  start: string;
  end: string;
  created: string;
  modified: string;
  image_url?: string;
}

interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  data: T[];
}

export interface ReportSummaryResponse {
  meta: {
    month: number;
    year: number;
    month_label: string;
    is_current_month: boolean;
  };
  overview: {
    total_learners: number;
    total_staff: number;
    active_learners: number;
    total_courses: number;
    completion_rate: number;
    total_enrollments: number;
  };
  lists: {
    uncompleted_trend: Array<{
      day: string;
      count: number;
    }>;
  };
}

export interface ReportChartResponse {
  year: number;
  metric: string;
  is_grouped?: boolean;
  dedup_yearly_total?: number;
  data: Array<any>;
}

export interface ReportTopCourse {
  course_id: string;
  name: string;
  enrollments: number;
}

export interface ReportLearnerStatus {
  username: string;
  email: string;
  avatar?: string;
  last_completion_at: string | null;
  progress: number;
  course_name: string;
  status: 'not_started' | 'learning' | 'completed';
  enrolled_courses: number;
}

export interface ReportPaginatedResponse<T> {
  count: number;
  total_pages: number;
  current_page: number;
  results: T[];
}

// Base path cho admin API (trên LMS, proxy qua /api)
const BASE = '/api/landa/admin';

// ══════════════════════════════════════════════
// Documents API
// ══════════════════════════════════════════════

export async function getDocuments(params: {
  page?: number;
  page_size?: number;
  search?: string;
  category_id?: number | string;
  extension?: string;
}): Promise<PaginatedResponse<LandaDocument>> {
  const { data } = await apiClient.get(`${BASE}/documents/`, { params });
  return {
    data: data.documents,
    total: data.total,
    page: data.page,
    page_size: data.page_size,
  };
}

export async function uploadDocument(formData: FormData): Promise<{ success: boolean; created: number; errors?: string[] }> {
  const { data } = await apiClient.post(`${BASE}/documents/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function updateDocument(docId: number, updates: {
  title?: string;
  is_visible?: boolean;
  category_id?: number | null;
}): Promise<{ success: boolean }> {
  const { data } = await apiClient.patch(`${BASE}/documents/${docId}/`, updates);
  return data;
}

export async function deleteDocument(docId: number): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete(`${BASE}/documents/${docId}/`);
  return data;
}

export async function bulkDocumentAction(ids: number[], action: 'show' | 'hide' | 'set_category', categoryId?: number | null): Promise<{ success: boolean; updated: number }> {
  const body: Record<string, unknown> = { ids, action };
  if (action === 'set_category') body.category_id = categoryId;
  const { data } = await apiClient.post(`${BASE}/documents/bulk/`, body);
  return data;
}

// ══════════════════════════════════════════════
// Categories API
// ══════════════════════════════════════════════

/** Paginated categories (cho tab danh mục) */
export async function getCategories(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  doc_count?: string;
}): Promise<PaginatedResponse<LandaCategory>> {
  const { data } = await apiClient.get(`${BASE}/categories/`, { params });
  return {
    data: data.categories,
    total: data.total ?? data.categories.length,
    page: data.page ?? 1,
    page_size: data.page_size ?? data.categories.length,
  };
}

/** Load tất cả categories không phân trang (cho dropdown filter) */
export async function getAllCategories(): Promise<LandaCategory[]> {
  const { data } = await apiClient.get(`${BASE}/categories/`, { params: { page_size: 100 } });
  return data.categories;
}

export async function createCategory(name: string): Promise<{ success: boolean; id: number; slug: string }> {
  const { data } = await apiClient.post(`${BASE}/categories/`, { name });
  return data;
}

export async function updateCategory(catId: number, name: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.patch(`${BASE}/categories/${catId}/`, { name });
  return data;
}

export async function deleteCategory(catId: number): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete(`${BASE}/categories/${catId}/`);
  return data;
}

export async function bulkDeleteCategories(ids: number[]): Promise<{ success: boolean; deleted: number }> {
  const { data } = await apiClient.post(`${BASE}/categories/bulk/`, { ids, action: 'delete' });
  return data;
}

// ══════════════════════════════════════════════
// Courses API
// ══════════════════════════════════════════════

export async function getCourses(params: {
  page?: number;
  page_size?: number;
  search?: string;
  visibility?: 'all' | 'staff_only' | 'public';
}): Promise<PaginatedResponse<LandaCourse>> {
  const { data } = await apiClient.get(`${BASE}/courses/`, { params });
  return {
    data: data.courses,
    total: data.total,
    page: data.page,
    page_size: data.page_size,
  };
}

export async function updateCourse(courseId: string, updates: {
  visible_to_staff_only?: boolean;
  display_name?: string;
  description?: string;
}): Promise<{ success: boolean }> {
  const { data } = await apiClient.patch(`${BASE}/courses/${encodeURIComponent(courseId)}/`, updates);
  return data;
}

export async function bulkCourseAction(ids: string[], action: 'staff_only' | 'public'): Promise<{ success: boolean; updated: number }> {
  const { data } = await apiClient.post(`${BASE}/courses-bulk/`, { ids, action });
  return data;
}

// ── Course Modal Config ──

export interface CourseModalConfig {
  course_id: string;
  welcome_enabled: boolean;
  welcome_title: string;
  welcome_description: string;
  confirm_enabled: boolean;
  confirm_title: string;
  confirm_description: string;
  confirm_checkbox_text: string;
  completion_enabled: boolean;
  completion_title: string;
  completion_description: string;
  completion_social_type: string;
  completion_social_link: string;
  updated_at: string | null;
}

export async function getCourseModalConfig(courseId: string): Promise<CourseModalConfig> {
  const { data } = await apiClient.get(`${BASE}/courses/${encodeURIComponent(courseId)}/modal-config/`);
  return data;
}

export async function updateCourseModalConfig(courseId: string, config: Partial<CourseModalConfig>): Promise<{ success: boolean }> {
  const { data } = await apiClient.put(`${BASE}/courses/${encodeURIComponent(courseId)}/modal-config/`, config);
  return data;
}

// ── Section Modal Config (cấu hình modal khích lệ per-section) ──

export interface SectionModalConfig {
  section_id: string;
  enabled: boolean;
  title: string;
  description: string;
  updated_at?: string | null;
}

export async function getSectionModalConfig(courseId: string, sectionId: string): Promise<SectionModalConfig> {
  const { data } = await apiClient.get(`${BASE}/courses/${encodeURIComponent(courseId)}/section-modal-config/`, {
    params: { section_id: sectionId }
  });
  return data;
}

export async function updateSectionModalConfig(courseId: string, config: SectionModalConfig): Promise<{ success: boolean }> {
  const { data } = await apiClient.put(`${BASE}/courses/${encodeURIComponent(courseId)}/section-modal-config/`, config);
  return data;
}

// ── Course Notification ──

export async function sendCourseNotification(courseId: string, payload: {
  title: string;
  message: string;
}): Promise<{ success: boolean; recipients: number }> {
  const { data } = await apiClient.post(`${BASE}/courses/${encodeURIComponent(courseId)}/send-notification/`, payload);
  return data;
}

// ══════════════════════════════════════════════
// Report Summary API
// ══════════════════════════════════════════════
export interface LearnerDetailResult {
  course_id: string;
  course_name: string;
  enrolled_at: string | null;
  progress: number;
  is_completed: boolean;
}

export interface LearnerDetailResponse {
  username: string;
  groups?: Array<{ group_name: string; subgroup_name: string }>;
  results: LearnerDetailResult[];
  total_count: number;
  total_pages: number;
  current_page: number;
}

export const getLearnerDetail = async (username: string, page = 1, search = ''): Promise<LearnerDetailResponse> => {
  const response = await apiClient.get(`${BASE}/learner-detail/`, {
    params: { username, page, search, page_size: 10 }
  });
  return response.data;
};

export async function getReportSummary(params?: { month?: number; year?: number; group_id?: number | string; subgroup_id?: number | string }): Promise<ReportSummaryResponse> {
  const { data } = await apiClient.get<ReportSummaryResponse>(`${BASE}/report-summary/`, { params });
  return data;
}

export async function getReportChart(year: number, metric: string, group_id?: number | string, group_by_org?: boolean, grouped?: boolean, subgroup_id?: number | string): Promise<ReportChartResponse> {
  const params: any = { year, metric };
  if (group_id) params.group_id = group_id;
  if (subgroup_id) params.subgroup_id = subgroup_id;
  if (group_by_org) params.group_by_org = true;
  if (grouped === false) params.grouped = 'false';
  const { data } = await apiClient.get<ReportChartResponse>(`${BASE}/report-chart/`, { params });
  return data;
}

export async function getReportTopCourses(params?: { page?: number; page_size?: number; month?: number; year?: number; group_id?: number | string; subgroup_id?: number | string }): Promise<ReportPaginatedResponse<ReportTopCourse>> {
  const { data } = await apiClient.get<ReportPaginatedResponse<ReportTopCourse>>(`${BASE}/report-top-courses/`, { params });
  return data;
}

export async function getReportLearners(params?: { page?: number; page_size?: number; search?: string; month?: number; year?: number; group_id?: number | string; subgroup_id?: number | string; status?: 'all' | 'not_started' | 'learning' | 'completed' }): Promise<ReportPaginatedResponse<ReportLearnerStatus>> {
  const { data } = await apiClient.get<ReportPaginatedResponse<ReportLearnerStatus>>(`${BASE}/report-uncompleted-learners/`, { params });
  return data;
}

// Backward-compatible alias
export const getReportUncompletedLearners = getReportLearners;

// ─────────────────────────────────────────────────────────────────
// User Management API
// ─────────────────────────────────────────────────────────────────

export interface LandaUser {
  id: number;
  username: string;
  email: string;
  phone: string;
  role: 'superuser' | 'staff' | 'learner' | 'learner_plus';
  is_active: boolean;
  date_joined: string;
  avatar?: string;
}

export async function getAdminUsers(params: { 
  page: number; 
  page_size: number; 
  search?: string; 
  role?: string;
  group_id?: number | string;
  subgroup_id?: number | string;
}): Promise<PaginatedResponse<LandaUser>> {
  const { data } = await apiClient.get<PaginatedResponse<LandaUser>>(`${BASE}/users/`, { params });
  // Map fields slightly as the general PaginatedResponse expects 'data' but the generic DRF might return 'results' depending on usage.
  // Our new API returns 'results', so we map it.
  return {
    total: data.total,
    page: data.page,
    page_size: data.page_size,
    data: (data as any).results || []
  };
}

export async function createAdminUser(payload: Partial<LandaUser> & { password?: string }): Promise<{ success: boolean; id: number }> {
  const { data } = await apiClient.post(`${BASE}/users/`, payload);
  return data;
}

export async function updateAdminUser(id: number, payload: Partial<LandaUser> & { password?: string }): Promise<{ success: boolean }> {
  const { data } = await apiClient.put(`${BASE}/users/${id}/`, payload);
  return data;
}


// ── Audit Logs ──

export interface AuditLog {
  id: number;
  actor_username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity_type: string;
  entity_name: string;
  entity_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface AuditLogsParams {
  page?: number;
  page_size?: number;
  search?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
}

export interface AuditLogsResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: AuditLog[];
}

export async function getAuditLogs(params: AuditLogsParams = {}): Promise<AuditLogsResponse> {
  const cleanParams: Record<string, string | number> = {};
  if (params.page) cleanParams.page = params.page;
  if (params.page_size) cleanParams.page_size = params.page_size;
  if (params.search) cleanParams.search = params.search;
  if (params.action && params.action !== 'all') cleanParams.action = params.action;
  if (params.date_from) cleanParams.date_from = params.date_from;
  if (params.date_to) cleanParams.date_to = params.date_to;

  const { data } = await apiClient.get<AuditLogsResponse>(`${BASE}/audit-logs/`, { params: cleanParams });
  return data;
}

// ══════════════════════════════════════════════
// Admin User Badges & Study Time API
// ══════════════════════════════════════════════
export interface AdminUserBadge {
  badge_id: string;
  earned_at: string;
}

export interface AdminUserBadgesResponse {
  username: string;
  badges: AdminUserBadge[];
}

export const getAdminUserBadges = async (username: string): Promise<AdminUserBadgesResponse> => {
  const { data } = await apiClient.get<AdminUserBadgesResponse>(`${BASE}/user-badges/`, {
    params: { username },
  });
  return data;
};

export interface StudyTimeEntry {
  date: string;
  minutes: number;
}

export interface AdminUserStudyTimeResponse {
  username: string;
  entries: StudyTimeEntry[];
}

export const getAdminUserStudyTime = async (username: string): Promise<AdminUserStudyTimeResponse> => {
  const { data } = await apiClient.get<AdminUserStudyTimeResponse>(`${BASE}/user-study-time/`, {
    params: { username },
  });
  return data;
};

// ══════════════════════════════════════════════
// Course Categories API (CRUD)
// ══════════════════════════════════════════════

export interface CourseCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  course_count: number;
  created_at: string | null;
}

export interface CourseCategoryMembership {
  id: number;
  course_id: string;
  display_name: string;
  assigned_at: string | null;
}

export async function getCourseCategories(): Promise<{ results: CourseCategory[] }> {
  const { data } = await apiClient.get(`${BASE}/course-categories/`);
  return data;
}

export async function createCourseCategory(payload: {
  name: string;
  description?: string;
  sort_order?: number;
}): Promise<{ id: number; name: string; slug: string }> {
  const { data } = await apiClient.post(`${BASE}/course-categories/`, payload);
  return data;
}

export async function updateCourseCategory(
  id: number,
  payload: { name?: string; description?: string; sort_order?: number },
): Promise<{ id: number; name: string; slug: string }> {
  const { data } = await apiClient.put(`${BASE}/course-categories/${id}/`, payload);
  return data;
}

export async function deleteCourseCategory(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/course-categories/${id}/`);
}

export async function getCourseCategoryCourses(
  categoryId: number,
): Promise<{ results: CourseCategoryMembership[]; count: number }> {
  const { data } = await apiClient.get(`${BASE}/course-categories/${categoryId}/courses/`);
  return data;
}

export async function addCoursesToCategory(
  categoryId: number,
  courseIds: string[],
): Promise<{ assigned: number; skipped: number }> {
  const { data } = await apiClient.post(`${BASE}/course-categories/${categoryId}/courses/`, { course_ids: courseIds });
  return data;
}

export async function removeCourseFromCategory(
  categoryId: number,
  courseId: string,
): Promise<void> {
  await apiClient.delete(`${BASE}/course-categories/${categoryId}/courses/${encodeURIComponent(courseId)}/`);
}
