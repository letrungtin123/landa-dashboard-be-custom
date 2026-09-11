// ═══════════════════════════════════════════════════════════════
// Chat API — Conversations, Messages, SSE Stream, Assignments
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";
import { config } from "@/config/env";
import i18n from "@/i18n";
import { useLocaleStore } from "@/utils/locale-store";
import { useAuthStore } from "@/utils/store";
import { useTenantStore } from "@/utils/tenant-store";
import { scheduleTenantDataQuotaRefresh } from "@/utils/tenant-data-quota-refresh";

interface ApiResponse<T> { success: boolean; data: T; }

export type ChatTarget = "admin" | "learner" | "lesson_author";
const AI_TOKEN_LIMIT_REACHED_CODE = "AI_TOKEN_LIMIT_REACHED";
const AI_RAG_KB_NOT_ASSIGNED_CODE = "AI_RAG_KB_NOT_ASSIGNED";

// ── Types ──

export interface ActiveBot {
  id: string;
  tenant_id: string;
  target: ChatTarget;
  bot_id: string;
  bot_name: string;
  bot_avatar_url: string | null;
  bot_kb_id: string | null;
  bot_kb_name: string | null;
  ai_active_engine: "gemini_file_search" | "self_built_rag";
}

export interface BotPersona {
  id: string;
  bot_id: string;
  template_id: string;
  template_name: string;
  template_description: string;
  template_avatar_url: string | null;
  template_fullbody_url: string | null;
  custom_name: string | null;
  custom_description: string | null;
}

export interface BotAssignment {
  id: string;
  tenant_id: string;
  target: ChatTarget;
  bot_id: string;
  bot_name: string;
  bot_avatar_url: string | null;
  bot_kb_id?: string | null;
  bot_kb_name?: string | null;
  ai_active_engine?: "gemini_file_search" | "self_built_rag";
}

export interface KbAssignment {
  id: string;
  tenant_id: string;
  target: "lesson_author";
  kb_id: string;
  kb_name: string;
  kb_description: string | null;
  document_count: number;
  learned_count: number;
  learning_count: number;
  error_count: number;
  store_name: string | null;
  updated_at: string;
}

export interface PersonaAssignment {
  id: string;
  tenant_id: string;
  target: "lesson_author";
  bot_id: string;
  persona_id: string;
  persona_name: string;
  persona_avatar_url: string | null;
  persona_fullbody_url: string | null;
  updated_at: string;
}

export interface LessonAuthorSettings {
  active_bot: ActiveBot | null;
  active_kb: KbAssignment | null;
  active_persona: PersonaAssignment | null;
}

export interface ChatConversation {
  id: string;
  tenant_id: string;
  bot_id: string;
  persona_id: string;
  user_id: string;
  target?: ChatTarget;
  course_id?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  persona_name?: string;
  persona_avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RagMessageSource {
  document_id?: string;
  document_name: string;
  source_page?: number | null;
  source_section?: string | null;
  score?: number | null;
  vector_score?: number | null;
  keyword_score?: number | null;
  method?: string | null;
  methods?: string[];
}

export type LessonAuthorComponentType = 'html' | 'problem' | 'la_faq' | 'la_sortable' | 'la_crossword' | 'la_diagram' | string;

export interface LessonAuthorComponentProposal {
  type: LessonAuthorComponentType;
  title: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

export interface LessonAuthorUnitProposal {
  title: string;
  html?: string;
  components?: LessonAuthorComponentProposal[];
}

export interface LessonAuthorLessonProposal {
  title: string;
  units: LessonAuthorUnitProposal[];
}

export interface LessonAuthorChapterProposal {
  title: string;
  lessons: LessonAuthorLessonProposal[];
}

export interface LessonAuthorProposal {
  summary: string;
  chapters: LessonAuthorChapterProposal[];
}

export interface LessonAuthorProposalEvent {
  type: "proposal";
  job_id: string;
  proposal: LessonAuthorProposal;
}

export interface OutlineMention {
  block_id: string;
  block_type: string;
  display_name: string;
  path: string;
  unit_id?: string | null;
  ancestor_ids?: string[];
  ancestor_types?: string[];
}

export interface LessonAuthorSourceDocument {
  document_id: string;
  kb_id: string;
  name: string;
  type?: string;
  status?: string;
  source_info?: { name?: string; size?: number; extension?: string; mime_type?: string } | null;
}

export interface AppliedLessonAuthorJob {
  job_id: string;
  course_id: string;
  created_block_ids: string[];
  updated_block_ids: string[];
  created_count: number;
  updated_count: number;
}

// ── Bot Assignments ──

export async function fetchAssignments(): Promise<BotAssignment[]> {
  const { data } = await customApiClient.get<ApiResponse<BotAssignment[]>>("/api/ai-chatbot/bots/assignments");
  return data.data;
}

export async function assignBot(target: ChatTarget, bot_id: string): Promise<void> {
  await customApiClient.put("/api/ai-chatbot/bots/assignments", { target, bot_id });
}

export async function unassignBot(target: ChatTarget): Promise<void> {
  await customApiClient.delete(`/api/ai-chatbot/bots/assignments/${target}`);
}

export async function fetchLessonAuthorSettings(): Promise<LessonAuthorSettings> {
  const { data } = await customApiClient.get<ApiResponse<LessonAuthorSettings>>("/api/ai-chatbot/lesson-author/settings");
  return data.data;
}

export async function fetchLessonAuthorChatSettings(): Promise<LessonAuthorSettings> {
  const { data } = await customApiClient.get<ApiResponse<LessonAuthorSettings>>("/api/ai-chatbot/chat/lesson-author/settings");
  return data.data;
}

export async function fetchLessonAuthorSourceDocuments(params?: {
  search?: string;
  limit?: number;
}): Promise<LessonAuthorSourceDocument[]> {
  const { data } = await customApiClient.get<ApiResponse<LessonAuthorSourceDocument[]>>(
    "/api/ai-chatbot/chat/lesson-author/source-documents",
    { params },
  );
  return data.data;
}

export async function assignLessonAuthorKb(kb_id: string): Promise<void> {
  await customApiClient.put("/api/ai-chatbot/lesson-author/kb-assignment", { kb_id });
}

export async function unassignLessonAuthorKb(): Promise<void> {
  await customApiClient.delete("/api/ai-chatbot/lesson-author/kb-assignment");
}

export async function applyLessonAuthorJob(jobId: string): Promise<AppliedLessonAuthorJob> {
  const { data } = await customApiClient.post<ApiResponse<AppliedLessonAuthorJob>>(
    `/api/ai-chatbot/lesson-author/jobs/${jobId}/apply`,
  );
  return data.data;
}

// ── Active Bot ──

export async function fetchActiveBot(target: ChatTarget = "admin"): Promise<ActiveBot | null> {
  const { data } = await customApiClient.get<ApiResponse<ActiveBot | null>>("/api/ai-chatbot/chat/active-bot", {
    params: { target },
  });
  return data.data;
}

export async function fetchActiveBotPersonas(target: ChatTarget = "admin"): Promise<BotPersona[]> {
  const { data } = await customApiClient.get<ApiResponse<BotPersona[]>>("/api/ai-chatbot/chat/active-bot/personas", {
    params: { target },
  });
  return data.data;
}

// ── Conversations ──

export interface ChatConversationOptions {
  target?: ChatTarget;
  courseId?: string;
}

export async function fetchConversations(options: ChatConversationOptions = {}): Promise<ChatConversation[]> {
  const { data } = await customApiClient.get<ApiResponse<ChatConversation[]>>("/api/ai-chatbot/chat/conversations", {
    params: options,
  });
  return data.data;
}

export async function createConversation(
  personaId: string,
  options: ChatConversationOptions = {},
): Promise<ChatConversation> {
  const { data } = await customApiClient.post<ApiResponse<ChatConversation>>(
    "/api/ai-chatbot/chat/conversations",
    { persona_id: personaId, courseId: options.courseId, target: options.target },
    { params: { target: options.target } },
  );
  return data.data;
}

export async function deleteConversation(id: string): Promise<void> {
  await customApiClient.delete(`/api/ai-chatbot/chat/conversations/${id}`);
}

// ── Messages (cursor-based pagination) ──

export interface PaginatedMessages {
  messages: ChatMessage[];
  has_more: boolean;
  next_cursor: string | null;
}

export async function fetchMessages(conversationId: string, cursor?: string): Promise<PaginatedMessages> {
  const params = cursor ? { cursor } : {};
  const { data } = await customApiClient.get<ApiResponse<PaginatedMessages>>(
    `/api/ai-chatbot/chat/conversations/${conversationId}/messages`,
    { params },
  );
  return data.data;
}

function streamText(key: string): string {
  return i18n.t(key, { lng: useLocaleStore.getState().locale });
}

function normalizeStreamErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err || '');
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return streamText('chatWidget.connectionFailed');
  }
  return message || streamText('chatWidget.connectionError');
}

function normalizeStreamErrorPayload(payload: unknown, fallbackKey: string): string {
  const data = payload as { code?: unknown; message?: unknown; error?: unknown };
  if (data?.code === AI_TOKEN_LIMIT_REACHED_CODE) return streamText('chatWidget.aiTokenLimitReached');
  if (data?.code === AI_RAG_KB_NOT_ASSIGNED_CODE) return streamText('chatWidget.aiRagKbNotAssigned');
  const rawMessage = data?.message ?? data?.error;
  if (useLocaleStore.getState().locale === 'vi' && typeof rawMessage === 'string' && rawMessage.trim()) {
    return rawMessage;
  }
  return streamText(fallbackKey);
}

/**
 * Send message and stream SSE response.
 * Returns an AbortController so caller can cancel.
 */
export function sendMessageStream(
  conversationId: string,
  content: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
  options: ChatConversationOptions & {
    mode?: "chat" | "draft_lesson" | "auto";
    outline_mentions?: OutlineMention[];
    source_documents?: LessonAuthorSourceDocument[];
    input_mode?: "text" | "voice";
    onProposal?: (event: LessonAuthorProposalEvent) => void;
  } = {},
): AbortController {
  const controller = new AbortController();

  // Build headers with auth token
  const { accessToken, user } = useAuthStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
  let quotaTenantId = user?.tenant_id ?? null;
  if (user?.role === 'superadmin') {
    const { activeTenantId } = useTenantStore.getState();
    if (activeTenantId) {
      headers['X-Tenant-Id'] = activeTenantId;
      quotaTenantId = activeTenantId;
    }
  }

  const url = `${config.customApiUrl}/api/ai-chatbot/chat/conversations/${conversationId}/messages`;

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content,
          target: options.target,
          courseId: options.courseId,
          locale: useLocaleStore.getState().locale === 'en' ? 'en' : 'vi',
          mode: options.mode,
          outline_mentions: options.outline_mentions,
          source_documents: options.source_documents,
          input_mode: options.input_mode,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = streamText('chatWidget.serverConnectionFailed');
        try {
          const payload = await response.json();
          message = normalizeStreamErrorPayload(payload, 'chatWidget.serverConnectionFailed');
        } catch {
          // Keep fallback message.
        }
        onError(message);
        return;
      }

      // This endpoint streams outside customApiClient. A 2xx response means
      // the server accepted the message write; refresh once now and again when
      // the streamed assistant result is finalized below.
      scheduleTenantDataQuotaRefresh(quotaTenantId);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedDone = false;
      let receivedError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'chunk') onChunk(event.text);
            else if (event.type === 'done') {
              receivedDone = true;
              scheduleTenantDataQuotaRefresh(quotaTenantId);
              onDone();
            }
            else if (event.type === 'error') {
              receivedError = true;
              onError(normalizeStreamErrorPayload(event, 'chatWidget.unknownError'));
            }
            else if (event.type === 'proposal') options.onProposal?.(event);
          } catch { /* skip malformed line */ }
        }
      }

      // Safety: if stream ended without done/error event, still notify
      if (!receivedDone && !receivedError) {
        scheduleTenantDataQuotaRefresh(quotaTenantId);
        onDone();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onError(normalizeStreamErrorMessage(err));
      }
    }
  })();

  return controller;
}
