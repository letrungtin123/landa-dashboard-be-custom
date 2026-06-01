// ═══════════════════════════════════════════════════════════════
// Custom Course Categories API — CRUD + assign courses
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export interface CourseCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  course_count: number;
  created_at: string;
}

export interface CourseCategoryMembership {
  id: string;
  course_id: string;
  display_name: string;
  assigned_at: string | null;
}

export async function getCourseCategories() {
  const { data } = await customApiClient.get<ApiResponse<{ results: CourseCategory[] }>>("/api/course-categories");
  return data.data;
}

export async function createCourseCategory(payload: { name: string; description?: string; sort_order?: number; tenant_id?: string }) {
  const { data } = await customApiClient.post<ApiResponse<{ id: string; name: string; slug: string }>>("/api/course-categories", payload);
  return data.data;
}

export async function updateCourseCategory(id: string, payload: { name?: string; description?: string; sort_order?: number }) {
  const { data } = await customApiClient.put<ApiResponse<{ id: string; name: string; slug: string }>>(`/api/course-categories/${id}`, payload);
  return data.data;
}

export async function deleteCourseCategory(id: string) {
  await customApiClient.delete(`/api/course-categories/${id}`);
}

export async function getCourseCategoryCourses(categoryId: string) {
  const { data } = await customApiClient.get<ApiResponse<{ results: CourseCategoryMembership[]; count: number }>>(`/api/course-categories/${categoryId}/courses`);
  return data.data;
}

export async function addCoursesToCategory(categoryId: string, courseIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ assigned: number; skipped: number }>>(`/api/course-categories/${categoryId}/courses`, { course_ids: courseIds });
  return data.data;
}

export async function removeCourseFromCategory(categoryId: string, courseId: string) {
  await customApiClient.delete(`/api/course-categories/${categoryId}/courses/${encodeURIComponent(courseId)}`);
}
