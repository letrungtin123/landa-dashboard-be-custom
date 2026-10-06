import { customApiClient } from './custom-client';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type NewsStatus = 'active' | 'archived';

export interface NewsPostSummary {
  id: string;
  title: string;
  excerpt: string;
  preview_image_path: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
}

export interface NewsPostDetail extends NewsPostSummary {
  content_html: string;
  created_by: string | null;
  updated_by: string | null;
  archived_by: string | null;
}

export interface NewsPage {
  results: NewsPostSummary[];
  page_size: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface NewsWritePayload {
  title: string;
  content_html: string;
  preview_image_path: string | null;
  upload_session_id: string;
}

export async function getManagedNews(params: {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: NewsStatus;
}): Promise<NewsPage> {
  const { data } = await customApiClient.get<ApiResponse<NewsPage>>('/api/news/manage', { params });
  return data.data;
}

export async function getManagedNewsPost(postId: string): Promise<NewsPostDetail> {
  const { data } = await customApiClient.get<ApiResponse<NewsPostDetail>>(`/api/news/manage/${postId}`);
  return data.data;
}

export async function createNewsPost(payload: NewsWritePayload): Promise<NewsPostDetail> {
  const { data } = await customApiClient.post<ApiResponse<NewsPostDetail>>('/api/news', payload);
  return data.data;
}

export async function updateNewsPost(
  postId: string,
  payload: NewsWritePayload & { expected_version: number },
): Promise<NewsPostDetail> {
  const { data } = await customApiClient.patch<ApiResponse<NewsPostDetail>>(`/api/news/${postId}`, payload);
  return data.data;
}

export async function archiveNewsPost(postId: string): Promise<NewsPostDetail> {
  const { data } = await customApiClient.post<ApiResponse<NewsPostDetail>>(`/api/news/${postId}/archive`);
  return data.data;
}

export async function restoreNewsPost(postId: string): Promise<NewsPostDetail> {
  const { data } = await customApiClient.post<ApiResponse<NewsPostDetail>>(`/api/news/${postId}/restore`);
  return data.data;
}

export async function uploadNewsImage(
  file: File,
  uploadSessionId: string,
  kind: 'preview' | 'inline',
): Promise<{ storage_path: string; filename: string; size: number }> {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('upload_session_id', uploadSessionId);
  formData.append('kind', kind);
  const { data } = await customApiClient.post<ApiResponse<{ storage_path: string; filename: string; size: number }>>(
    '/api/news/images',
    formData,
    { headers: { 'Content-Type': undefined } },
  );
  return data.data;
}

export async function importNewsImage(
  sourceUrl: string,
  uploadSessionId: string,
): Promise<{ storage_path: string; filename: string; size: number }> {
  const { data } = await customApiClient.post<ApiResponse<{ storage_path: string; filename: string; size: number }>>(
    '/api/news/images/import',
    { source_url: sourceUrl, upload_session_id: uploadSessionId },
  );
  return data.data;
}

export async function deletePendingNewsImage(storagePath: string, uploadSessionId: string): Promise<void> {
  await customApiClient.delete('/api/news/images', {
    data: { storage_path: storagePath, upload_session_id: uploadSessionId },
  });
}
