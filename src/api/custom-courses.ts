// ═══════════════════════════════════════════════════════════════
// Custom Courses API — CRUD + modal configs + notifications
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

// ── Types ──

export interface CustomCourse {
  id: string;
  display_name: string;
  description: string | null;
  org: string;
  visible_to_staff_only: boolean;
  start_date: string | null;
  end_date: string | null;
  end?: string | null;
  modified?: string | null;
  image_url: string;
  created_at: string;
  updated_at: string;
  mentor?: CourseMentor | null;
  mentor_id?: string | null;
}

export interface CourseMentor {
  id: string;
  username: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: string;
  bio?: string | null;
}

export interface CourseMentorSection {
  course_id: string;
  description: string | null;
  logo_light: string | null;
  logo_dark: string | null;
  updated_at: string | null;
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

export async function createCourse(input: { id: string; display_name: string; description: string; org?: string; tenant_id?: string }) {
  const { data } = await customApiClient.post<ApiResponse<CustomCourse>>("/api/courses", input);
  return data.data;
}

export async function updateCourse(courseId: string, updates: { visible_to_staff_only?: boolean; display_name?: string; description?: string; image_url?: string }) {
  await customApiClient.patch(`/api/courses/${encodeURIComponent(courseId)}`, updates);
  return { success: true };
}

export async function bulkCourseAction(ids: string[], action: 'staff_only' | 'public') {
  const { data } = await customApiClient.post<ApiResponse<{ updated: number }>>("/api/courses/bulk", { ids, action });
  return { success: true, updated: data.data.updated };
}

/** Request course deletion. Backend hides it immediately and purges data in the background. */
export async function deleteCourse(courseId: string) {
  await customApiClient.delete(`/api/courses/${encodeURIComponent(courseId)}`);
}

export async function getCourseMentor(courseId: string): Promise<CourseMentor | null> {
  const { data } = await customApiClient.get<ApiResponse<{ mentor: CourseMentor | null }>>(
    `/api/courses/${encodeURIComponent(courseId)}/mentor`,
  );
  return data.data.mentor;
}

export async function getCourseMentorCandidates(
  courseId: string,
  params: { page?: number; page_size?: number; search?: string },
) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<CourseMentor>>>(
    `/api/courses/${encodeURIComponent(courseId)}/mentor-candidates`,
    { params },
  );
  return {
    mentors: data.data.data,
    total: data.data.total,
    page: data.data.page,
    page_size: data.data.pageSize,
    total_pages: data.data.totalPages,
  };
}

export async function updateCourseMentor(courseId: string, mentorId: string | null): Promise<CourseMentor | null> {
  const { data } = await customApiClient.patch<ApiResponse<{ mentor: CourseMentor | null }>>(
    `/api/courses/${encodeURIComponent(courseId)}/mentor`,
    { mentor_id: mentorId },
  );
  return data.data.mentor;
}

export async function getCourseMentorSection(courseId: string): Promise<CourseMentorSection | null> {
  const { data } = await customApiClient.get<ApiResponse<{ mentor_section: CourseMentorSection | null }>>(
    `/api/courses/${encodeURIComponent(courseId)}/mentor-section`,
  );
  return data.data.mentor_section;
}

export async function updateCourseMentorSection(
  courseId: string,
  payload: { description: string | null },
): Promise<CourseMentorSection> {
  const { data } = await customApiClient.put<ApiResponse<{ mentor_section: CourseMentorSection }>>(
    `/api/courses/${encodeURIComponent(courseId)}/mentor-section`,
    payload,
  );
  return data.data.mentor_section;
}

export async function uploadCourseMentorSectionLogo(
  courseId: string,
  mode: 'light' | 'dark',
  file: File,
): Promise<CourseMentorSection> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  const { data } = await customApiClient.post<ApiResponse<{ mentor_section: CourseMentorSection }>>(
    `/api/courses/${encodeURIComponent(courseId)}/mentor-section/logo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data.mentor_section;
}

export async function deleteCourseMentorSectionLogo(
  courseId: string,
  mode: 'light' | 'dark',
): Promise<CourseMentorSection | null> {
  const { data } = await customApiClient.delete<ApiResponse<{ mentor_section: CourseMentorSection | null }>>(
    `/api/courses/${encodeURIComponent(courseId)}/mentor-section/logo/${mode}`,
  );
  return data.data.mentor_section;
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
