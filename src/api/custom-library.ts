// ═══════════════════════════════════════════════════════════════
// Custom Library API — Documents + Document Categories
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

// ── Types ──

export interface DocCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  doc_count: number;
  created_at: string;
}

export interface Document {
  id: string;
  title: string;
  file_url: string;
  file_size: number;
  file_size_display?: string;
  extension: string;
  category_id: string | null;
  category_name: string | null;
  is_visible: boolean;
  uploaded_by_name: string | null;
  created_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Document Categories ──

export async function getCategories(params?: { page?: number; page_size?: number; search?: string; doc_count?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<DocCategory>>>("/api/library/categories", { params });
  return { categories: data.data.data, total: data.data.total, page: data.data.page, page_size: data.data.pageSize };
}

export async function getAllCategories() {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<DocCategory>>>("/api/library/categories", { params: { page_size: 200 } });
  return data.data.data;
}

export async function createCategory(name: string, tenant_id?: string) {
  const { data } = await customApiClient.post<ApiResponse<DocCategory>>("/api/library/categories", { name, tenant_id });
  return { success: true, id: data.data.id, slug: data.data.slug };
}

export async function updateCategory(catId: string, name: string) {
  await customApiClient.patch(`/api/library/categories/${catId}`, { name });
  return { success: true };
}

export async function deleteCategory(catId: string) {
  await customApiClient.delete(`/api/library/categories/${catId}`);
  return { success: true };
}

export async function bulkDeleteCategories(ids: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ deleted: number }>>("/api/library/categories/bulk", { ids, action: 'delete' });
  return { success: true, deleted: data.data.deleted };
}

// ── Documents ──

export async function getDocuments(params: { page?: number; page_size?: number; search?: string; category_id?: string; extension?: string }) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedResponse<Document>>>("/api/library/documents", { params });
  return { documents: data.data.data, total: data.data.total, page: data.data.page, page_size: data.data.pageSize };
}

export async function uploadDocument(formData: FormData) {
  // For now, create via JSON (file upload needs separate handling with multer)
  const { data } = await customApiClient.post<ApiResponse<Document>>("/api/library/documents", formData);
  return { success: true, created: 1, errors: [] as string[] };
}

export async function updateDocument(docId: string, updates: { title?: string; is_visible?: boolean; category_id?: string | null }) {
  await customApiClient.patch(`/api/library/documents/${docId}`, updates);
  return { success: true };
}

export async function deleteDocument(docId: string) {
  await customApiClient.delete(`/api/library/documents/${docId}`);
  return { success: true };
}

export async function bulkDocumentAction(ids: string[], action: 'show' | 'hide' | 'set_category', categoryId?: string | null) {
  const body: Record<string, unknown> = { ids, action };
  if (action === 'set_category') body.category_id = categoryId;
  const { data } = await customApiClient.post<ApiResponse<{ updated: number }>>("/api/library/documents/bulk", body);
  return { success: true, updated: data.data.updated };
}
