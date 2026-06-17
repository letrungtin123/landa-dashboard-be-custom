/**
 * custom-course-authoring.ts
 * API layer cho Course Authoring — replaces OpenEdX Studio CMS
 * Base URL: customApiUrl/api/course-authoring
 * Auth: Bearer token via customApiClient (no CSRF needed)
 */

import { customApiClient } from './custom-client';

// ── Types ──

export interface CourseIndexSection {
  id: string;
  display_name: string;
  block_type: string;
  category?: string;
  published: boolean;
  has_changes: boolean;
  sort_order?: number;
  start?: string;
  due?: string;
  child_info?: {
    category: string;
    display_name: string;
    children: CourseIndexSection[];
  };
  children?: CourseIndexSection[];
  actions?: {
    deletable: boolean;
    draggable: boolean;
    childAddable: boolean;
    duplicable: boolean;
  };
}

export interface CourseIndexResponse {
  course_id: string;
  course_structure: CourseIndexSection;
  // Backward compat aliases
  course_release_date?: string;
  lms_link?: string;
  reindex_link?: string;
}

export interface XBlockInfo {
  id: string;
  display_name: string;
  block_type: string;
  category?: string;
  metadata: Record<string, any>;
  data?: any;
  children?: string[];
  published?: boolean;
  has_changes?: boolean;
  is_published?: boolean;
  has_draft_changes?: boolean;
  lms_url?: string;
  edited_on?: string;
}

export interface UnitChildrenResponse {
  children: {
    id: string;
    block_id: string;
    display_name: string;
    block_type: string;
    user_partition_info: any;
    actions: any;
    has_changes: boolean;
    published: boolean;
    lms_url?: string;
  }[];
}

export interface CourseAsset {
  id: string;
  display_name: string;
  content_type: string;
  date_added: string;
  url: string;
  external_url?: string;
  portable_url?: string;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  locked?: boolean;
  is_locked?: boolean;
  file_size?: number;
}

export interface CourseAssetsResponse {
  start: number;
  end: number;
  page: number;
  pageSize: number;
  totalCount: number;
  assets: CourseAsset[];
}

export interface Course {
  id: string;
  display_name: string;
  org: string;
  number: string;
  run: string;
  start?: string;
  end?: string;
}

export interface CreateXBlockPayload {
  type?: string;
  category?: string;
  parent_locator: string;
  display_name?: string;
  boilerplate?: string;
}

// ── API Response wrapper ──

type ApiResponse<T> = { success: boolean; data: T };

const BASE = '/api/course-authoring';

// ── Course Outline ──

export async function getCourseOutlineIndex(courseId: string): Promise<CourseIndexResponse> {
  const { data } = await customApiClient.get<ApiResponse<CourseIndexResponse>>(
    `${BASE}/outline/${encodeURIComponent(courseId)}`,
  );
  return data.data;
}

export const getCourseOutline = getCourseOutlineIndex;

// ── Block CRUD ──

export async function getXBlockInfo(blockId: string): Promise<XBlockInfo> {
  const { data } = await customApiClient.get<ApiResponse<XBlockInfo>>(
    `${BASE}/blocks/${encodeURIComponent(blockId)}`,
  );
  const block = data.data;
  // Normalize field names for backward compat
  return {
    ...block,
    category: block.category || block.block_type,
    published: block.published ?? block.is_published,
    has_changes: block.has_changes ?? block.has_draft_changes,
  };
}

export const getBlockInfo = getXBlockInfo;

export async function getUnitChildren(unitId: string): Promise<UnitChildrenResponse> {
  const { data } = await customApiClient.get<ApiResponse<{ children: any[] }>>(
    `${BASE}/units/${encodeURIComponent(unitId)}/children`,
  );

  const rawChildren = data.data?.children || [];
  const children = rawChildren.map((c: any) => ({
    id: c.id || c.block_id || '',
    block_id: c.block_id || c.id || '',
    display_name: c.display_name || '(Không tên)',
    block_type: c.block_type || 'unknown',
    user_partition_info: c.user_partition_info || null,
    actions: c.actions || null,
    has_changes: c.has_changes ?? false,
    published: c.published ?? true,
  }));

  return { children };
}

export async function createXBlock(
  payload: CreateXBlockPayload,
): Promise<{ locator: string; courseKey: string }> {
  const body = {
    parent_id: payload.parent_locator,
    block_type: payload.type || payload.category,
    display_name: payload.display_name,
    boilerplate: payload.boilerplate,
  };
  const { data } = await customApiClient.post<ApiResponse<{ locator: string; courseKey: string; id: string }>>(
    `${BASE}/blocks`,
    body,
  );
  return { locator: data.data.locator || data.data.id, courseKey: data.data.courseKey };
}

export async function createBlock(
  parentLocator: string,
  category: string,
  displayName?: string,
): Promise<{ locator: string; courseKey: string }> {
  return createXBlock({ parent_locator: parentLocator, category, display_name: displayName });
}

export async function updateXBlock(
  blockId: string,
  payload: { metadata?: Record<string, any>; data?: any; children?: string[]; publish?: string },
): Promise<XBlockInfo> {
  const { data } = await customApiClient.patch<ApiResponse<XBlockInfo>>(
    `${BASE}/blocks/${encodeURIComponent(blockId)}`,
    payload,
  );
  return data.data;
}

export const updateBlock = updateXBlock;

export async function reorderChildren(parentId: string, childIds: string[]): Promise<XBlockInfo> {
  return updateXBlock(parentId, { children: childIds });
}

export async function renameBlock(blockId: string, displayName: string): Promise<XBlockInfo> {
  return updateXBlock(blockId, { metadata: { display_name: displayName } });
}

export async function publishBlock(blockId: string): Promise<XBlockInfo> {
  return updateXBlock(blockId, { publish: 'make_public' });
}

export async function deleteXBlock(blockId: string): Promise<void> {
  await customApiClient.delete(`${BASE}/blocks/${encodeURIComponent(blockId)}`);
}

export const deleteBlock = deleteXBlock;

// ── Studio Submit (custom XBlocks) ──

export async function studioSubmit(blockId: string, payload: any): Promise<any> {
  const { data } = await customApiClient.post(
    `${BASE}/blocks/${encodeURIComponent(blockId)}/handler/studio_submit`,
    payload,
  );
  return (data as any).data || data;
}

// ── Assets ──

export async function getCourseAssets(
  courseId: string,
  page = 0,
  pageSize = 50,
  textSearch = '',
  assetType = '',
): Promise<CourseAssetsResponse> {
  const params: any = { page, page_size: pageSize };
  if (textSearch) params.text_search = textSearch;
  if (assetType) params.asset_type = assetType;

  const { data } = await customApiClient.get<ApiResponse<CourseAssetsResponse>>(
    `${BASE}/assets/${encodeURIComponent(courseId)}`,
    { params },
  );
  return data.data;
}

export async function uploadCourseAsset(courseId: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await customApiClient.post(
    `${BASE}/assets/${encodeURIComponent(courseId)}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return (data as any).data || data;
}

export async function deleteCourseAsset(courseId: string, assetId: string): Promise<void> {
  await customApiClient.delete(
    `${BASE}/assets/${encodeURIComponent(courseId)}/${encodeURIComponent(assetId)}`,
  );
}

export async function deleteCourseAssetByStoragePath(courseId: string, storagePath: string): Promise<void> {
  await customApiClient.post(
    `${BASE}/assets/${encodeURIComponent(courseId)}/delete-by-path`,
    { storage_path: storagePath },
  );
}

export async function updateCourseAssetLock(courseId: string, assetId: string, locked: boolean): Promise<any> {
  // Not implemented in custom backend yet, but keeping API compat
  return { success: true };
}

// ── Course Creation ──

export async function createCourse(payload: {
  org: string;
  number: string;
  run: string;
  display_name: string;
  start?: string;
}): Promise<Course> {
  const { data } = await customApiClient.post<ApiResponse<Course>>(
    `${BASE}/courses`,
    payload,
  );
  return data.data;
}

export async function getCourseList(): Promise<Course[]> {
  // Use existing custom-courses endpoint
  const { data } = await customApiClient.get<ApiResponse<{ courses: Course[] }>>('/api/courses');
  return data.data?.courses || [];
}
