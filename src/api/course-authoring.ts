/**
 * course-authoring.ts
 * API layer cho Course Authoring — dùng đúng Studio CMS endpoints
 * theo chuẩn frontend-app-authoring chính thức của Open edX.
 *
 * Base URL: /cms-api → proxy → http://studio.local.openedx.io
 * Auth: session cookie (sessionid) + X-CSRFToken header
 */

import { apiClient } from './client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CourseIndexSection {
  id: string;
  display_name: string;
  category: string;
  published: boolean;
  has_changes: boolean;
  start?: string;
  due?: string;
  child_info?: {
    category: string;
    display_name: string;
    children: CourseIndexSection[];
  };
  actions?: {
    deletable: boolean;
    draggable: boolean;
    childAddable: boolean;
    duplicable: boolean;
  };
}

export interface CourseIndexResponse {
  course_release_date: string;
  course_structure: CourseIndexSection;
  lms_link: string;
  reindex_link: string;
}

export interface XBlockInfo {
  id: string;
  display_name: string;
  category: string;
  metadata: Record<string, any>;
  data?: string;
  children?: string[];
  published?: boolean;
  has_changes?: boolean;
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
  external_url: string;
  portable_url: string;
  thumbnail?: string;
  locked: boolean;
  is_reference?: boolean;
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
  description?: string | null;
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

// ─────────────────────────────────────────────
// CSRF Helper
// ─────────────────────────────────────────────

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
}

function cmsHeaders() {
  return { 'X-CSRFToken': getCsrfToken() };
}

// ─────────────────────────────────────────────
// Course Index API (Outline)
// ─────────────────────────────────────────────

/**
 * Lấy toàn bộ cây Outline của course từ Studio contentstore API
 * GET /api/contentstore/v1/course_index/{courseId}
 */
export async function getCourseOutlineIndex(courseId: string): Promise<CourseIndexResponse> {
  const { data } = await apiClient.get(`/cms-api/api/contentstore/v1/course_index/${encodeURIComponent(courseId)}`);
  return data;
}

// Alias cho backward compatibility với trang course-editor.tsx
export const getCourseOutline = getCourseOutlineIndex;

// ─────────────────────────────────────────────
// XBlock CRUD — Studio REST API
// ─────────────────────────────────────────────

/**
 * Lấy chi tiết một XBlock (metadata, data, children)
 * GET /landa-admin/api/authoring/xblock/{blockId}
 */
export async function getXBlockInfo(blockId: string): Promise<XBlockInfo> {
  const { data } = await apiClient.get(`/cms-api/landa-admin/api/authoring/xblock/${encodeURIComponent(blockId)}`);
  return data;
}

// Alias
export const getBlockInfo = getXBlockInfo;

/**
 * Lấy danh sách children của một Unit (vertical)
 * GET /api/contentstore/v1/container/{unitId}/children
 *
 * Studio trả về: { children: [{ name, block_id, block_type, ... }] }
 */
export async function getUnitChildren(unitId: string): Promise<UnitChildrenResponse> {
  const { data } = await apiClient.get(
    `/cms-api/api/contentstore/v1/container/${encodeURIComponent(unitId)}/children`
  );

  // Studio dùng 'name' thay 'display_name', 'block_id' là usage_key thay 'id'
  const rawChildren: any[] = data?.children || data?.xblocks || data?.blocks || [];

  const children = rawChildren.map((c: any) => ({
    // Ưu tiên: id → usage_key → locator → block_id (đây là usage_key đầy đủ)
    id: c.id || c.usage_key || c.locator || c.block_locator || c.block_id || '',
    block_id: c.block_id || '',
    // Studio dùng 'name', không phải 'display_name'
    display_name: c.display_name || c.name || '(Không tên)',
    block_type: c.block_type || c.category || c.type || 'unknown',
    user_partition_info: c.user_partition_info || null,
    actions: c.actions || null,
    has_changes: c.has_changes ?? false,
    published: c.published ?? true,
  }));

  return { children };
}

/**
 * Tạo XBlock mới — dùng custom backend endpoint để tránh Studio CSRF/403
 * POST /landa-admin/api/authoring/xblock/
 */
export async function createXBlock(payload: CreateXBlockPayload): Promise<{ locator: string; courseKey: string }> {
  const body = {
    type: payload.type || payload.category,
    category: payload.category || payload.type,
    parent_locator: payload.parent_locator,
    ...(payload.display_name && { display_name: payload.display_name }),
    ...(payload.boilerplate && { boilerplate: payload.boilerplate }),
  };
  const { data } = await apiClient.post('/cms-api/landa-admin/api/authoring/xblock/', body);
  return data;
}

// Alias
export async function createBlock(
  parentLocator: string,
  category: string,
  displayName?: string
): Promise<{ locator: string; courseKey: string }> {
  return createXBlock({ parent_locator: parentLocator, category, display_name: displayName });
}

/**
 * Cập nhật XBlock — POST /landa-admin/api/authoring/xblock/{blockId}
 */
export async function updateXBlock(
  blockId: string,
  payload: { metadata?: Record<string, any>; data?: string; children?: string[]; publish?: string }
): Promise<XBlockInfo> {
  const { data } = await apiClient.post(
    `/cms-api/landa-admin/api/authoring/xblock/${encodeURIComponent(blockId)}`,
    payload
  );
  return data;
}

// Alias
export const updateBlock = updateXBlock;

/**
 * Thay đổi thứ tự các con của một block
 */
export async function reorderChildren(parentId: string, childIds: string[]): Promise<XBlockInfo> {
  return updateXBlock(parentId, { children: childIds });
}

/**
 * Đổi tên block
 */
export async function renameBlock(blockId: string, displayName: string): Promise<XBlockInfo> {
  return updateXBlock(blockId, { metadata: { display_name: displayName } });
}

/**
 * Publish block
 */
export async function publishBlock(blockId: string): Promise<XBlockInfo> {
  return updateXBlock(blockId, { publish: 'make_public' });
}

/**
 * Xóa XBlock — DELETE /landa-admin/api/authoring/xblock/{blockId}
 */
export async function deleteXBlock(blockId: string): Promise<void> {
  await apiClient.delete(`/cms-api/landa-admin/api/authoring/xblock/${encodeURIComponent(blockId)}`);
}

// Alias
export const deleteBlock = deleteXBlock;

// ─────────────────────────────────────────────
// Course Create API (custom backend endpoint)
// ─────────────────────────────────────────────

/**
 * Lấy danh sách courses của user (custom endpoint)
 */
export async function getCourseList(): Promise<Course[]> {
  const { data } = await apiClient.get('/cms-api/landa-admin/api/authoring/courses/');
  return data;
}

/**
 * Tạo course mới (custom endpoint)
 * start mặc định 2020-01-01 để auto-publish
 */
export async function createCourse(payload: {
  org: string;
  number: string;
  run: string;
  display_name: string;
  description: string;
  start?: string;
}): Promise<Course> {
  const { data } = await apiClient.post(
    '/cms-api/landa-admin/api/authoring/courses/',
    payload,
    { headers: cmsHeaders() }
  );
  return data;
}

// ─────────────────────────────────────────────
// Custom XBlock Handlers (la_crossword, la_sortable)
// ─────────────────────────────────────────────

/**
 * Gọi studio_submit handler cho custom XBlocks
 * POST /landa-admin/api/authoring/xblock/{blockId}/handler/studio_submit
 */
export async function studioSubmit(blockId: string, payload: any): Promise<any> {
  const { data } = await apiClient.post(
    `/cms-api/landa-admin/api/authoring/xblock/${encodeURIComponent(blockId)}/handler/studio_submit`,
    payload,
    { headers: cmsHeaders() }
  );
  return data;
}

// ─────────────────────────────────────────────
// Assets API (Files & Uploads)
// ─────────────────────────────────────────────

export async function getCourseAssets(courseId: string, page = 0, pageSize = 50, textSearch = '', assetType = ''): Promise<CourseAssetsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
    sort: 'date_added',
    direction: 'desc',
  });
  if (textSearch) params.append('text_search', textSearch);
  if (assetType) params.append('asset_type', assetType);

  const { data } = await apiClient.get(
    `/cms-api/landa-admin/api/authoring/assets/${encodeURIComponent(courseId)}/?${params.toString()}`
  );
  return data;
}

export async function uploadCourseAsset(courseId: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post(
    `/cms-api/landa-admin/api/authoring/assets/${encodeURIComponent(courseId)}/`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', ...cmsHeaders() } }
  );
  return data;
}

export async function deleteCourseAsset(courseId: string, assetId: string): Promise<void> {
  await apiClient.delete(
    `/cms-api/landa-admin/api/authoring/assets/${encodeURIComponent(courseId)}/${encodeURIComponent(assetId)}`,
    { headers: cmsHeaders() }
  );
}

export async function updateCourseAssetLock(courseId: string, assetId: string, locked: boolean): Promise<any> {
  const { data } = await apiClient.put(
    `/cms-api/landa-admin/api/authoring/assets/${encodeURIComponent(courseId)}/${encodeURIComponent(assetId)}`,
    { locked },
    { headers: cmsHeaders() }
  );
  return data;
}

export async function updateCourseAssetReference(courseId: string, assetIds: string[], isReference: boolean): Promise<any> {
  const { data } = await apiClient.patch(
    `/cms-api/landa-admin/api/authoring/assets/${encodeURIComponent(courseId)}/reference`,
    { assetIds, is_reference: isReference },
    { headers: cmsHeaders() }
  );
  return data;
}
