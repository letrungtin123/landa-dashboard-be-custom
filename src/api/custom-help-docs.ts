// ═══════════════════════════════════════════════════════════════
// Custom Help Docs API — Folders + Pages
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export interface HelpFolder {
  id: string;
  title: string;
  slug: string;
  icon: string;
  sort_order: number;
  page_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface HelpPageSummary {
  id: string;
  folder_id: string;
  folder_title: string;
  title: string;
  slug: string;
  sort_order: number;
  is_published: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface HelpPageDetail extends HelpPageSummary {
  content: string;
  created_by: string | null;
  updated_by: string | null;
}

// ── Folders ──

export async function getHelpFolders() {
  const { data } = await customApiClient.get<ApiResponse<{ folders: HelpFolder[]; total: number }>>("/api/help-docs/folders");
  return data.data;
}

export async function createHelpFolder(payload: { title: string; icon?: string; tenant_id?: string }) {
  const { data } = await customApiClient.post<ApiResponse<{ success: boolean; id: string; slug: string }>>("/api/help-docs/folders", payload);
  return data.data;
}

export async function updateHelpFolder(folderId: string, payload: { title?: string; icon?: string }) {
  await customApiClient.patch(`/api/help-docs/folders/${folderId}`, payload);
  return { success: true };
}

export async function deleteHelpFolder(folderId: string) {
  await customApiClient.delete(`/api/help-docs/folders/${folderId}`);
  return { success: true };
}

export async function reorderHelpFolders(orderedIds: string[]) {
  await customApiClient.patch("/api/help-docs/folders/reorder", { ordered_ids: orderedIds });
  return { success: true };
}

// ── Pages ──

export async function getHelpPages(folderId?: string) {
  const params: Record<string, unknown> = {};
  if (folderId) params.folder_id = folderId;
  const { data } = await customApiClient.get<ApiResponse<{ pages: HelpPageSummary[]; total: number }>>("/api/help-docs/pages", { params });
  return data.data;
}

export async function getHelpPage(pageId: string): Promise<HelpPageDetail> {
  const { data } = await customApiClient.get<ApiResponse<HelpPageDetail>>(`/api/help-docs/pages/${pageId}`);
  return data.data;
}

export async function createHelpPage(payload: { folder_id: string; title: string; content?: string }) {
  const { data } = await customApiClient.post<ApiResponse<{ success: boolean; id: string; slug: string }>>("/api/help-docs/pages", payload);
  return data.data;
}

export async function updateHelpPage(pageId: string, payload: { title?: string; content?: string; is_published?: boolean }) {
  await customApiClient.patch(`/api/help-docs/pages/${pageId}`, payload);
  return { success: true };
}

export async function deleteHelpPage(pageId: string) {
  await customApiClient.delete(`/api/help-docs/pages/${pageId}`);
  return { success: true };
}

export async function reorderHelpPages(folderId: string, orderedIds: string[]) {
  await customApiClient.patch("/api/help-docs/pages/reorder", { folder_id: folderId, ordered_ids: orderedIds });
  return { success: true };
}

// ── Image Upload (placeholder — needs multer on BE) ──

export async function uploadHelpImage(file: File) {
  const formData = new FormData();
  formData.append('image', file);
  // TODO: Add file upload endpoint to BE
  console.warn('[uploadHelpImage] File upload endpoint not yet implemented');
  return { success: true, url: URL.createObjectURL(file), filename: file.name };
}
