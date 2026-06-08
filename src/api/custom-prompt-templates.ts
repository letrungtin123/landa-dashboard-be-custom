// ═══════════════════════════════════════════════════════════════
// Prompt Templates API — System Prompt Mascots
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from './custom-client';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  avatar_url: string | null;
  fullbody_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateListResult {
  templates: PromptTemplate[];
  activeCount: number;
  maxActive: number;
}

// ── Superadmin CRUD ──

export async function fetchTemplates(): Promise<TemplateListResult> {
  const { data } = await customApiClient.get<ApiResponse<TemplateListResult>>('/api/prompt-templates');
  return data.data;
}

export async function fetchActiveTemplates(): Promise<PromptTemplate[]> {
  const { data } = await customApiClient.get<ApiResponse<PromptTemplate[]>>('/api/prompt-templates/active');
  return data.data;
}

export async function fetchTemplate(id: string): Promise<PromptTemplate> {
  const { data } = await customApiClient.get<ApiResponse<PromptTemplate>>(`/api/prompt-templates/${id}`);
  return data.data;
}

export async function createTemplate(input: {
  name: string;
  description?: string;
  prompt: string;
  is_active?: boolean;
  sort_order?: number;
}): Promise<PromptTemplate> {
  const { data } = await customApiClient.post<ApiResponse<PromptTemplate>>('/api/prompt-templates', input);
  return data.data;
}

export async function updateTemplate(id: string, input: {
  name?: string;
  description?: string;
  prompt?: string;
  is_active?: boolean;
  sort_order?: number;
}): Promise<PromptTemplate> {
  const { data } = await customApiClient.put<ApiResponse<PromptTemplate>>(`/api/prompt-templates/${id}`, input);
  return data.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await customApiClient.delete(`/api/prompt-templates/${id}`);
}

export async function uploadTemplateAvatar(id: string, file: File): Promise<PromptTemplate> {
  const formData = new FormData();
  formData.append('avatar', file);
  const { data } = await customApiClient.post<ApiResponse<PromptTemplate>>(
    `/api/prompt-templates/${id}/avatar`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function uploadTemplateFullbody(id: string, file: File): Promise<PromptTemplate> {
  const formData = new FormData();
  formData.append('fullbody', file);
  const { data } = await customApiClient.post<ApiResponse<PromptTemplate>>(
    `/api/prompt-templates/${id}/fullbody`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}
