// ═══════════════════════════════════════════════════════════════
// Custom Courses API — CRUD + modal configs + notifications
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

// ── Types ──

export interface CustomCourse {
  id: string;
  display_name: string;
  org: string;
  visible_to_staff_only: boolean;
  start_date: string | null;
  end_date: string | null;
  end?: string | null;
  modified?: string | null;
  image_url: string;
  created_at: string;
  updated_at: string;
}

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

export interface SectionModalConfig {
  section_id: string;
  enabled: boolean;
  title: string;
  description: string;
  updated_at?: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Courses ──

export async function getCourses(params: { page?: number; page_size?: number; search?: string; visibility?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<CustomCourse>>>("/api/courses", { params });
  return { courses: data.data.data, total: data.data.total, page: data.data.page, page_size: data.data.pageSize };
}

export async function createCourse(input: { id: string; display_name: string; org?: string; tenant_id?: string }) {
  const { data } = await customApiClient.post<ApiResponse<CustomCourse>>("/api/courses", input);
  return data.data;
}

export async function updateCourse(courseId: string, updates: { visible_to_staff_only?: boolean; display_name?: string; image_url?: string }) {
  await customApiClient.patch(`/api/courses/${encodeURIComponent(courseId)}`, updates);
  return { success: true };
}

export async function bulkCourseAction(ids: string[], action: 'staff_only' | 'public') {
  const { data } = await customApiClient.post<ApiResponse<{ updated: number }>>("/api/courses/bulk", { ids, action });
  return { success: true, updated: data.data.updated };
}

/** Hard delete course */
export async function deleteCourse(courseId: string) {
  await customApiClient.delete(`/api/courses/${encodeURIComponent(courseId)}`);
}

// ── Course Modal Config ──

export async function getCourseModalConfig(courseId: string): Promise<CourseModalConfig> {
  const { data } = await customApiClient.get<ApiResponse<CourseModalConfig>>(`/api/courses/${encodeURIComponent(courseId)}/modal-config`);
  return data.data;
}

export async function updateCourseModalConfig(courseId: string, config: Partial<CourseModalConfig>) {
  await customApiClient.put(`/api/courses/${encodeURIComponent(courseId)}/modal-config`, config);
  return { success: true };
}

// ── Section Modal Config ──

export async function getSectionModalConfig(courseId: string, sectionId: string): Promise<SectionModalConfig> {
  const { data } = await customApiClient.get<ApiResponse<SectionModalConfig>>(`/api/courses/${encodeURIComponent(courseId)}/section-modal-config`, { params: { section_id: sectionId } });
  return data.data;
}

export async function updateSectionModalConfig(courseId: string, config: SectionModalConfig) {
  await customApiClient.put(`/api/courses/${encodeURIComponent(courseId)}/section-modal-config`, config);
  return { success: true };
}

// ── Course Notification ──

export async function sendCourseNotification(courseId: string, payload: { title: string; message: string }) {
  const { data } = await customApiClient.post<ApiResponse<{ success: boolean; recipients: number }>>("/api/notifications", {
    course_id: courseId,
    title: payload.title,
    message: payload.message,
  });
  return data.data;
}
