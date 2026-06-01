/**
 * custom-reports.ts
 * API layer cho Reports — replaces edX report endpoints
 * Base URL: customApiUrl/api/reports
 * Auth: Bearer token via customApiClient
 */

import { customApiClient } from './custom-client';

// ── Types ──

export interface ReportSummaryResponse {
  meta: {
    month: number;
    year: number;
    month_label: string;
    is_current_month: boolean;
  };
  overview: {
    total_learners: number;
    active_learners: number;
    completion_rate: number;
    total_enrollments: number;
  };
}

export interface ReportChartResponse {
  year: number;
  metric: string;
  is_grouped?: boolean;
  data: Array<{ month: number; month_label: string; value: number; [key: string]: unknown }>;
  grouped_data?: Record<string, Array<{ month: number; month_label: string; value: number }>>;
}

export interface ReportTopCourse {
  course_id: string;
  name: string;
  enrollments: number;
}

export interface ReportLearnerStatus {
  username: string;
  email: string;
  avatar?: string | null;
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

export interface AdminUserBadge {
  badge_id: string;
  earned_at: string;
}

export interface AdminUserBadgesResponse {
  username: string;
  badges: AdminUserBadge[];
}

export interface StudyTimeEntry {
  date: string;
  minutes: number;
}

export interface AdminUserStudyTimeResponse {
  username: string;
  entries: StudyTimeEntry[];
}

// ── API Functions ──

const BASE = '/api/reports';

type ApiResponse<T> = { success: boolean; data: T };

export async function getReportSummary(params?: {
  month?: number;
  year?: number;
  group_id?: number | string;
  subgroup_id?: number | string;
}): Promise<ReportSummaryResponse> {
  const { data } = await customApiClient.get<ApiResponse<ReportSummaryResponse>>(`${BASE}/summary`, { params });
  return data.data;
}

export async function getReportChart(
  year: number,
  metric: string,
  group_id?: number | string,
  group_by_org?: boolean,
  grouped?: boolean,
  subgroup_id?: number | string,
): Promise<ReportChartResponse> {
  const params: any = { year, metric };
  if (group_id) params.group_id = group_id;
  if (subgroup_id) params.subgroup_id = subgroup_id;
  if (group_by_org) params.group_by_org = true;
  if (grouped === false) params.grouped = 'false';
  const { data } = await customApiClient.get<ApiResponse<ReportChartResponse>>(`${BASE}/chart`, { params });
  return data.data;
}

export async function getReportTopCourses(params?: {
  page?: number;
  page_size?: number;
  month?: number;
  year?: number;
  group_id?: number | string;
  subgroup_id?: number | string;
}): Promise<ReportPaginatedResponse<ReportTopCourse>> {
  const { data } = await customApiClient.get<ApiResponse<ReportPaginatedResponse<ReportTopCourse>>>(`${BASE}/top-courses`, { params });
  return data.data;
}

export async function getReportLearners(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  month?: number;
  year?: number;
  group_id?: number | string;
  subgroup_id?: number | string;
  status?: 'all' | 'not_started' | 'learning' | 'completed';
}): Promise<ReportPaginatedResponse<ReportLearnerStatus>> {
  const { data } = await customApiClient.get<ApiResponse<ReportPaginatedResponse<ReportLearnerStatus>>>(`${BASE}/learners`, { params });
  return data.data;
}

// Backward-compatible alias
export const getReportUncompletedLearners = getReportLearners;

export async function getLearnerDetail(
  username: string,
  page = 1,
  search = '',
): Promise<LearnerDetailResponse> {
  const { data } = await customApiClient.get<ApiResponse<LearnerDetailResponse>>(`${BASE}/learner-detail`, {
    params: { username, page, search, page_size: 10 },
  });
  return data.data;
}

export async function getAdminUserBadges(username: string): Promise<AdminUserBadgesResponse> {
  const { data } = await customApiClient.get<ApiResponse<AdminUserBadgesResponse>>(`${BASE}/user-badges`, {
    params: { username },
  });
  return data.data;
}

export async function getAdminUserStudyTime(username: string): Promise<AdminUserStudyTimeResponse> {
  const { data } = await customApiClient.get<ApiResponse<AdminUserStudyTimeResponse>>(`${BASE}/user-study-time`, {
    params: { username },
  });
  return data.data;
}
