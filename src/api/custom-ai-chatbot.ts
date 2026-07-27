// ═══════════════════════════════════════════════════════════════
// AI Chatbot API — KB + Bot + Document management
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ── Types ──

export interface Knowledgebase {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  restore_state?: 'idle' | 'queued' | 'restoring' | 'uploading' | 'completed' | 'failed';
  active_restore_job_id?: string | null;
  restore_required?: boolean;
  restore_reason?: string | null;
  restore_error_reason?: string | null;
  restore_progress?: {
    total_docs: number;
    enqueued_docs: number;
    learned_docs: number;
    failed_docs: number;
    skipped_docs: number;
  } | null;
}

export interface KbDocument {
  id: string;
  tenant_id: string;
  kb_id: string;
  type: string;
  name: string;
  status: 'draft' | 'learning' | 'learned' | 'error' | 'deleting';
  error_reason: string | null;
  source_info: { name?: string; size?: number; extension?: string; mime_type?: string };
  file_path: string | null;
  content: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chatbot {
  id: string;
  tenant_id: string;
  kb_id: string | null;
  name: string;
  config: Record<string, unknown>;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  kb_name?: string | null;
  persona_previews?: { name: string; avatar_url: string | null; fullbody_url: string | null }[];
}

export type InputFilterMessageCode =
  | 'EMPTY'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'GIBBERISH'
  | 'BINARY_GARBAGE'
  | 'PROFANITY'
  | 'UNSUPPORTED_LANG'
  | 'REPEATED_SENTENCE';

export interface InputFilterConfig {
  enabled: boolean;
  enable_length: boolean;
  enable_normalize: boolean;
  enable_language: boolean;
  enable_gibberish: boolean;
  enable_repeat: boolean;
  enable_profanity: boolean;
  filter_params: {
    length: {
      min: number;
      max: number;
    };
    language: {
      foreignCharThreshold: number;
    };
    gibberish: {
      minEntropyThreshold: number;
      maxRepeatRatio: number;
      minValidCharRatio: number;
      maxConsonantCluster: number;
    };
    repeat: {
      maxRepeatCount: number;
      ttlSeconds: number;
    };
    profanity: {
      blockSeverity: 'HIGH' | 'MEDIUM';
      blacklistVi: string[];
      blacklistEn: string[];
    };
  };
  message_config: Array<{
    code: InputFilterMessageCode;
    message: string;
  }>;
}

interface PaginatedDocs {
  data: KbDocument[];
  total: number;
}

interface UploadResult {
  results: { file: string; success: boolean; data?: KbDocument; error?: string }[];
  uploaded: number;
  failed: number;
}

export interface RestoreKnowledgebaseResult {
  queued: true;
  job_id: string;
  kb_id: string;
  lock_ttl_seconds: number;
}

// ── Knowledge Base CRUD ──

export interface FetchKbsParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export async function fetchKnowledgebases(params?: FetchKbsParams) {
  const { data } = await customApiClient.get<ApiResponse<{ data: Knowledgebase[]; total: number }>>("/api/ai-chatbot/kb", { params });
  return data.data;
}

export async function fetchKnowledgebase(id: string) {
  const { data } = await customApiClient.get<ApiResponse<Knowledgebase>>(`/api/ai-chatbot/kb/${id}`);
  return data.data;
}

export async function createKnowledgebase(input: { name: string; description?: string }) {
  const { data } = await customApiClient.post<ApiResponse<Knowledgebase>>("/api/ai-chatbot/kb", input);
  return data.data;
}

export async function updateKnowledgebase(id: string, input: { name?: string; description?: string }) {
  const { data } = await customApiClient.put<ApiResponse<Knowledgebase>>(`/api/ai-chatbot/kb/${id}`, input);
  return data.data;
}

export async function deleteKnowledgebase(id: string) {
  await customApiClient.delete(`/api/ai-chatbot/kb/${id}`);
}

export async function restoreKnowledgebase(id: string): Promise<RestoreKnowledgebaseResult> {
  const { data } = await customApiClient.post<ApiResponse<RestoreKnowledgebaseResult>>(
    `/api/ai-chatbot/kb/${id}/restore`,
  );
  return data.data;
}

// ── Document CRUD ──

export interface FetchDocumentsParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  type?: string;
}

export async function fetchDocuments(kbId: string, params?: FetchDocumentsParams) {
  const { data } = await customApiClient.get<ApiResponse<PaginatedDocs>>(
    `/api/ai-chatbot/kb/${kbId}/documents`,
    { params },
  );
  return data.data;
}

/** Multi-file upload (up to 20 files) */
export async function uploadDocuments(kbId: string, files: File[]): Promise<UploadResult> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const { data } = await customApiClient.post<ApiResponse<UploadResult>>(
    `/api/ai-chatbot/kb/${kbId}/documents`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data.data;
}

export async function deleteDocument(kbId: string, docId: string) {
  await customApiClient.delete(`/api/ai-chatbot/kb/${kbId}/documents/${docId}`);
}

/** Bulk delete multiple documents */
export async function bulkDeleteDocuments(kbId: string, docIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ deleted: number }>>(
    `/api/ai-chatbot/kb/${kbId}/documents/bulk-delete`,
    { doc_ids: docIds },
  );
  return data.data;
}

/** Retry failed documents */
export async function retryDocuments(kbId: string, docIds: string[]) {
  const { data } = await customApiClient.post<ApiResponse<{ retried: number }>>(
    `/api/ai-chatbot/kb/${kbId}/documents/retry`,
    { doc_ids: docIds },
  );
  return data.data;
}

// ── FAQ ──

/** Upload FAQ xlsx file */
export async function uploadFaqDocument(kbId: string, file: File): Promise<KbDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await customApiClient.post<ApiResponse<KbDocument>>(
    `/api/ai-chatbot/kb/${kbId}/documents/faq`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data.data;
}

/** Download FAQ template xlsx */
export async function downloadFaqTemplate(kbId: string) {
  const response = await customApiClient.get(
    `/api/ai-chatbot/kb/${kbId}/documents/faq-template`,
    { responseType: "blob" },
  );
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = "faq_template.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ── Articles ──

export async function createArticle(kbId: string, input: { title: string; content: string }): Promise<KbDocument> {
  const { data } = await customApiClient.post<ApiResponse<KbDocument>>(
    `/api/ai-chatbot/kb/${kbId}/articles`,
    input,
  );
  return data.data;
}

export async function updateArticle(kbId: string, docId: string, input: { title?: string; content?: string; expected_updated_at?: string }): Promise<KbDocument> {
  const { data } = await customApiClient.put<ApiResponse<KbDocument>>(
    `/api/ai-chatbot/kb/${kbId}/articles/${docId}`,
    input,
  );
  return data.data;
}

export async function getArticle(kbId: string, docId: string): Promise<KbDocument> {
  const { data } = await customApiClient.get<ApiResponse<KbDocument>>(
    `/api/ai-chatbot/kb/${kbId}/articles/${docId}`,
  );
  return data.data;
}

// ── Bot CRUD ──

export interface FetchBotsParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export async function fetchBots(params?: FetchBotsParams) {
  const { data } = await customApiClient.get<ApiResponse<{ data: Chatbot[]; total: number }>>("/api/ai-chatbot/bots", { params });
  return data.data;
}

export async function fetchBot(id: string) {
  const { data } = await customApiClient.get<ApiResponse<Chatbot>>(`/api/ai-chatbot/bots/${id}`);
  return data.data;
}

export async function createBot(input: { name: string; kb_id?: string | null }) {
  const { data } = await customApiClient.post<ApiResponse<Chatbot>>("/api/ai-chatbot/bots", input);
  return data.data;
}

export async function updateBot(id: string, input: { name?: string; kb_id?: string | null }) {
  const { data } = await customApiClient.put<ApiResponse<Chatbot>>(`/api/ai-chatbot/bots/${id}`, input);
  return data.data;
}

export async function deleteBot(id: string) {
  await customApiClient.delete(`/api/ai-chatbot/bots/${id}`);
}

export async function fetchBotInputFilter(botId: string): Promise<InputFilterConfig> {
  const { data } = await customApiClient.get<ApiResponse<InputFilterConfig>>(`/api/ai-chatbot/bots/${botId}/input-filter`);
  return data.data;
}

export async function updateBotInputFilter(botId: string, inputFilter: InputFilterConfig): Promise<InputFilterConfig> {
  const { data } = await customApiClient.put<ApiResponse<InputFilterConfig>>(
    `/api/ai-chatbot/bots/${botId}/input-filter`,
    { input_filter: inputFilter },
  );
  return data.data;
}

export async function uploadBotAvatar(botId: string, file: File): Promise<Chatbot> {
  const formData = new FormData();
  formData.append("avatar", file);
  const { data } = await customApiClient.post<ApiResponse<Chatbot>>(
    `/api/ai-chatbot/bots/${botId}/avatar`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data.data;
}

// ── Bot Personas ──

export interface BotPersona {
  id: string;
  bot_id: string;
  template_id: string;
  custom_name: string | null;
  custom_description: string | null;
  custom_prompt: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  template_name: string;
  template_description: string;
  template_prompt: string;
  template_avatar_url: string | null;
  template_fullbody_url: string | null;
  template_is_lesson_author?: boolean;
}

export async function fetchBotPersonas(botId: string): Promise<BotPersona[]> {
  const { data } = await customApiClient.get<ApiResponse<BotPersona[]>>(`/api/ai-chatbot/bots/${botId}/personas`);
  return data.data;
}

export async function updateBotPersona(
  botId: string,
  personaId: string,
  input: { custom_name?: string | null; custom_description?: string | null; custom_prompt?: string | null },
): Promise<BotPersona> {
  const { data } = await customApiClient.put<ApiResponse<BotPersona>>(
    `/api/ai-chatbot/bots/${botId}/personas/${personaId}`,
    input,
  );
  return data.data;
}

export async function resetBotPersona(botId: string, personaId: string): Promise<BotPersona> {
  const { data } = await customApiClient.post<ApiResponse<BotPersona>>(
    `/api/ai-chatbot/bots/${botId}/personas/${personaId}/reset`,
  );
  return data.data;
}

export async function addBotPersona(botId: string, templateId: string): Promise<BotPersona> {
  const { data } = await customApiClient.post<ApiResponse<BotPersona>>(
    `/api/ai-chatbot/bots/${botId}/personas`,
    { template_id: templateId },
  );
  return data.data;
}

export async function removeBotPersona(botId: string, personaId: string): Promise<void> {
  await customApiClient.delete(`/api/ai-chatbot/bots/${botId}/personas/${personaId}`);
}
