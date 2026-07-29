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

export type ReportCourseCompletionStatus = 'all' | 'not_started' | 'learning' | 'completed';

export interface ReportCourseCompletionRanking {
  course_id: string;
  name: string;
  visible_learners: number;
  learning_count: number;
  completed_count: number;
  not_started_count: number;
  completion_rate: number;
}

export interface ReportCourseCompletionLearner {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  avatar?: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  progress: number | null;
  status: Exclude<ReportCourseCompletionStatus, 'all'>;
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
  completed_at: string | null;
  progress: number;
  is_completed: boolean;
  status: Exclude<ReportCourseCompletionStatus, 'all'>;
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

export type StudyTimeGranularity = 'day' | 'month' | 'year';

export interface StudyTimeMeta {
  from: string;
  to: string;
  granularity: StudyTimeGranularity;
  requested_granularity: StudyTimeGranularity;
  default_weekly: boolean;
  point_count: number;
  reduced_granularity: boolean;
}

export interface AdminUserStudyTimeResponse {
  username: string;
  entries: StudyTimeEntry[];
  meta?: StudyTimeMeta;
}

// ── API Functions ──

const BASE = '/api/reports';

type ApiResponse<T> = { success: boolean; data: T };

export async function getReportSummary(params?: {
  month?: number;
  year?: number;
  group_id?: number | string;
  subgroup_id?: number | string;
  team_id?: number | string;
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
  team_id?: number | string,
): Promise<ReportChartResponse> {
  const params: any = { year, metric };
  if (group_id) params.group_id = group_id;
  if (subgroup_id) params.subgroup_id = subgroup_id;
  if (team_id) params.team_id = team_id;
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
  team_id?: number | string;
}): Promise<ReportPaginatedResponse<ReportTopCourse>> {
  const { data } = await customApiClient.get<ApiResponse<ReportPaginatedResponse<ReportTopCourse>>>(`${BASE}/top-courses`, { params });
  return data.data;
}

export async function getReportCourseCompletionRanking(params?: {
  page?: number;
  page_size?: number;
  month?: number;
  year?: number;
  group_id?: number | string;
  subgroup_id?: number | string;
  team_id?: number | string;
}): Promise<ReportPaginatedResponse<ReportCourseCompletionRanking>> {
  const { data } = await customApiClient.get<ApiResponse<ReportPaginatedResponse<ReportCourseCompletionRanking>>>(`${BASE}/course-completion-ranking`, { params });
  return data.data;
}

export async function getReportCourseCompletionLearners(courseId: string, params?: {
  page?: number;
  page_size?: number;
  search?: string;
  month?: number;
  year?: number;
  group_id?: number | string;
  subgroup_id?: number | string;
  team_id?: number | string;
  status?: ReportCourseCompletionStatus;
}): Promise<ReportPaginatedResponse<ReportCourseCompletionLearner>> {
  const { data } = await customApiClient.get<ApiResponse<ReportPaginatedResponse<ReportCourseCompletionLearner>>>(`${BASE}/course-completion-ranking/${encodeURIComponent(courseId)}/learners`, { params });
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
  team_id?: number | string;
  status?: 'all' | 'not_started' | 'learning' | 'completed';
}): Promise<ReportPaginatedResponse<ReportLearnerStatus>> {
  const { data } = await customApiClient.get<ApiResponse<ReportPaginatedResponse<ReportLearnerStatus>>>(`${BASE}/learners`, { params });
  return data.data;
}

// Backward-compatible alias
export const getReportUncompletedLearners = getReportLearners;

export async function downloadReportExcel(params: {
  month?: number;
  year: number;
  group_id?: number | string;
  subgroup_id?: number | string;
  team_id?: number | string;
  group_label?: string;
  subgroup_label?: string;
  team_label?: string;
}): Promise<{ blob: Blob; fileName: string }> {
  const response = await customApiClient.get<Blob>(`${BASE}/export.xlsx`, {
    params,
    responseType: 'blob',
    timeout: 0,
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  const utf8Name = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const fileName = utf8Name
    ? decodeURIComponent(utf8Name)
    : plainName || `bao-cao-tong-hop-${params.month ? `${params.month}-` : ''}${params.year}.xlsx`;

  return { blob: response.data, fileName };
}

export async function getLearnerDetail(params: {
  username: string;
  page?: number;
  page_size?: number;
  search?: string;
  group_id?: number | string;
  subgroup_id?: number | string;
  team_id?: number | string;
  status?: ReportCourseCompletionStatus;
}): Promise<LearnerDetailResponse> {
  const { data } = await customApiClient.get<ApiResponse<LearnerDetailResponse>>(`${BASE}/learner-detail`, {
    params,
  });
  return data.data;
}

export async function getAdminUserBadges(username: string): Promise<AdminUserBadgesResponse> {
  const { data } = await customApiClient.get<ApiResponse<AdminUserBadgesResponse>>(`${BASE}/user-badges`, {
    params: { username },
  });
  return data.data;
}

export async function getAdminUserStudyTime(
  username: string,
  params?: { from?: string; to?: string; granularity?: StudyTimeGranularity },
): Promise<AdminUserStudyTimeResponse> {
  const { data } = await customApiClient.get<ApiResponse<AdminUserStudyTimeResponse>>(`${BASE}/user-study-time`, {
    params: { username, ...params },
  });
  return data.data;
}

/** Danh sách groups cho filter report (dùng quyền report_summary) */
export async function getReportGroups(): Promise<{ groups: Array<{ id: string; name: string; subgroup_count: number }>; total: number }> {
  const { data } = await customApiClient.get<ApiResponse<{ groups: Array<{ id: string; name: string; subgroup_count: number }>; total: number }>>(`${BASE}/groups`);
  return data.data;
}

/** Danh sách subgroups trong 1 group cho filter report */
export async function getReportSubGroups(groupId: string): Promise<{ subgroups: Array<{ id: string; name: string; team_count: number }>; total: number }> {
  const { data } = await customApiClient.get<ApiResponse<{ subgroups: Array<{ id: string; name: string; team_count: number }>; total: number }>>(`${BASE}/groups/${groupId}/subgroups`);
  return data.data;
}

/** Danh sách teams trong 1 subgroup cho filter report */
export async function getReportTeams(groupId: string, subgroupId: string): Promise<{ teams: Array<{ id: string; name: string; member_count: number }>; total: number }> {
  const { data } = await customApiClient.get<ApiResponse<{ teams: Array<{ id: string; name: string; member_count: number }>; total: number }>>(`${BASE}/groups/${groupId}/subgroups/${subgroupId}/teams`);
  return data.data;
}
