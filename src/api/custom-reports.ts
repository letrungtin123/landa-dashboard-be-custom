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
    date_from?: string;
    date_to?: string;
    range_label?: string;
  };
  overview: {
    total_learners: number;
    active_learners: number;
    completion_rate: number;
    total_enrollments: number;
    completed_enrollments: number;
    incomplete_enrollments: number;
  };
}

export type ReportChartGranularity = 'auto' | 'day' | 'week' | 'month';
export type ReportChartWindowDirection = 'initial' | 'before' | 'after';

export interface ReportChartWindowMeta {
  mode: 'window';
  range_start: string;
  range_end: string;
  window_start: string;
  window_end: string;
  has_before: boolean;
  has_after: boolean;
  next_before: string | null;
  next_after: string | null;
  limit_buckets: number;
}
export interface ReportChartPoint {
  month: string | number;
  month_label: string;
  bucket?: string;
  bucket_label?: string;
  value?: number;
  [key: string]: unknown;
}

export interface ReportChartResponse {
  year: number;
  metric: string;
  is_grouped?: boolean;
  granularity?: Exclude<ReportChartGranularity, 'auto'>;
  date_from?: string;
  date_to?: string;
  bucket_count?: number;
  window?: ReportChartWindowMeta;
  series_limit?: number;
  series_overflow?: boolean;
  data: ReportChartPoint[];
  grouped_data?: Record<string, ReportChartPoint[]>;
}

export interface ReportTopCourse {
  course_id: string;
  name: string;
  enrollments: number;
}

export type ReportCourseCompletionStatus = 'all' | 'not_started' | 'learning' | 'completed';
export type LearnerDetailDataScope = 'report_filter' | 'learner_history';

export interface ReportCourseCompletionRanking {
  course_id: string;
  name: string;
  total_enrollments: number;
  completed_enrollments: number;
  incomplete_enrollments: number;
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
  completion_rate: number;
  completed_courses: number;
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

type ReportDateParams = {
  date_from?: string;
  date_to?: string;
};

export async function getReportSummary(params?: ReportDateParams & {
  month?: number;
  year?: number;
  group_id?: number | string;
  subgroup_id?: number | string;
  team_id?: number | string;
}): Promise<ReportSummaryResponse> {
  const { data } = await customApiClient.get<ApiResponse<ReportSummaryResponse>>(`${BASE}/summary`, { params });
  return data.data;
}

export async function getReportChart(params: ReportDateParams & {
  year?: number;
  metric: string;
  group_id?: number | string;
  group_by_org?: boolean;
  grouped?: boolean;
  subgroup_id?: number | string;
  team_id?: number | string;
  granularity?: ReportChartGranularity;
  mode?: 'range' | 'window';
  direction?: ReportChartWindowDirection;
  anchor_bucket?: string;
  limit_buckets?: number;
  series_limit?: number;
}): Promise<ReportChartResponse> {
  const queryParams: any = { ...params };
  if (params.grouped === false) queryParams.grouped = 'false';
  if (!params.group_by_org) delete queryParams.group_by_org;
  const { data } = await customApiClient.get<ApiResponse<ReportChartResponse>>(`${BASE}/chart`, { params: queryParams });
  return data.data;
}

export async function getReportTopCourses(params?: ReportDateParams & {
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

export async function getReportCourseCompletionRanking(params?: ReportDateParams & {
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

export async function getReportCourseCompletionLearners(courseId: string, params?: ReportDateParams & {
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

export async function getReportLearners(params?: ReportDateParams & {
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

export async function downloadReportExcel(params: ReportDateParams & {
  month?: number;
  year?: number;
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
    : plainName || (params.date_from && params.date_to
      ? `bao-cao-tong-hop-${params.date_from}-den-${params.date_to}.xlsx`
      : `bao-cao-tong-hop-${params.month ? `${params.month}-` : ''}${params.year || new Date().getFullYear()}.xlsx`);

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
  data_scope?: LearnerDetailDataScope;
  date_from?: string;
  date_to?: string;
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
