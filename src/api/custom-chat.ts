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

export interface ReportChatFilter {
  date_from?: string;
  date_to?: string;
  group_id?: string;
  subgroup_id?: string;
  team_id?: string;
}

export type ReportMetricId = 'total_learners' | 'active_learners' | 'completion_rate' | 'total_enrollments' | 'incomplete_enrollments';
export type ReportMetricUnit = 'count' | 'percentage';

export interface ReportMetricFact {
  id: ReportMetricId;
  unit: ReportMetricUnit;
  current: number;
  previous: number | null;
  delta_absolute: number | null;
  delta_percent: number | null;
  delta_percentage_points: number | null;
}

export interface ReportAnalyticsSignal {
  id: string;
  category: 'enrollment' | 'completion' | 'activity' | 'course';
  severity: 'attention' | 'warning' | 'neutral';
  threshold_version: string;
  evidence: {
    metric_id?: ReportMetricId;
    course_id?: string;
    course_name?: string;
    current?: number;
    previous?: number;
    delta_absolute?: number;
    delta_percentage_points?: number;
    affected_course_count?: number;
    enrollment_count?: number;
    completion_rate?: number;
  };
}

export interface ReportSnapshotV2 {
  version: 2;
  generated_at: string;
  timezone: string;
  filter: Required<Pick<ReportChatFilter, 'date_from' | 'date_to'>> & ReportChatFilter;
  scope_display?: { group_name?: string; subgroup_name?: string; team_name?: string };
  comparison: { date_from: string; date_to: string; basis: string };
  comparison_display?: Record<'vi' | 'en', {
    title: string;
    date_label: string;
    delta_suffix: string;
  }>;
  enrollment_trend_context?: { granularity?: 'day' | 'week' | 'month' };
  factual_metrics: ReportMetricFact[];
  signals: ReportAnalyticsSignal[];
  signal_threshold_version: string;
  completion_status_distribution?: { not_started: number; in_progress: number; completed: number };
  course_portfolio?: Array<{
    course_id: string;
    name: string;
    total_enrollments: number;
    completed_enrollments: number;
    incomplete_enrollments: number;
    completion_rate: number;
  }>;
  course_detail?: {
    course_id: string;
    name: string;
    total_enrollments: number;
    completed_enrollments: number;
    incomplete_enrollments: number;
    not_started_enrollments: number;
    in_progress_enrollments: number;
    completion_rate: number;
  };
  availability: { state: 'available' | 'empty' | 'no_accessible_scope'; limitations: string[] };
}

export interface ReportNarrative {
  selected_signal_ids: string[];
  interpretation: string[];
  recommended_actions: Array<{ signal_id: string | null; priority: 'high' | 'medium' | 'low'; action: string }>;
  limitations: string[];
}

export type ReportStreamStatus = 'collecting' | 'analyzing';

export type ReportPdfExportPhase = 'validating' | 'narrative' | 'rendering' | 'ready' | 'failed';

export interface ReportPdfExportJob {
  id: string;
  phase: ReportPdfExportPhase;
  locale: 'vi' | 'en';
  fileName: string | null;
  expiresAt: string | null;
  errorCode: string | null;
  updatedAt: string;
}

export class ReportPdfExportApiError extends Error {
  constructor(message: string, public readonly code: string | null = null) {
    super(message);
    this.name = 'ReportPdfExportApiError';
  }
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
  source_ref?: string | null;
  heading_path?: string | null;
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
  source_refs?: string[];
}

export interface LessonAuthorLessonProposal {
  title: string;
  units: LessonAuthorUnitProposal[];
  source_refs?: string[];
}

export interface LessonAuthorChapterProposal {
  title: string;
  lessons: LessonAuthorLessonProposal[];
  source_refs?: string[];
}

export type LessonAuthorIntentOperation =
  | "answer"
  | "course_blueprint"
  | "create"
  | "rename"
  | "update_content"
  | "delete"
  | "move"
  | "clarify";

export type LessonAuthorTargetType = "course" | "chapter" | "lesson" | "unit" | "component";

export interface LessonAuthorOperationPlan {
  version: 1;
  operation: LessonAuthorIntentOperation;
  target_type: LessonAuthorTargetType;
  target_block_id: string;
  target_path: string;
  target_display_name: string;
  target_updated_at: string;
  requested_title?: string | null;
  destination_block_id?: string | null;
  fields: Array<"title" | "content" | "components" | "sort_order">;
  confidence: number;
  requires_confirmation: boolean;
  target_source: "mention" | "explicit_reference" | "conversation_context" | "none";
  signals: string[];
  ambiguity_reasons: string[];
  target_snapshot?: string | null;
}

export interface LessonAuthorProposal {
  summary: string;
  chapters: LessonAuthorChapterProposal[];
  operation_plan?: LessonAuthorOperationPlan;
}

export interface LessonAuthorProposalEvent {
  type: "proposal";
  job_id: string;
  proposal: LessonAuthorProposal;
  /** Present for chapter drafts created from a course blueprint. */
  blueprint_id?: string;
  blueprint_chapter_index?: number;
}

export interface LessonAuthorBlueprintLesson {
  title: string;
  objective: string;
  learning_activities: string[];
  assessment: string;
  units: LessonAuthorBlueprintUnit[];
  source_refs?: string[];
}

export interface LessonAuthorBlueprintComponentPlan {
  type: LessonAuthorComponentType;
  title: string;
  rationale: string;
}

export interface LessonAuthorBlueprintMediaPlan {
  type: 'video' | 'static_infographic';
  title: string;
  content_outline: string;
  rationale: string;
}

export interface LessonAuthorBlueprintUnit {
  title: string;
  component_plan: LessonAuthorBlueprintComponentPlan[];
  source_refs?: string[];
  source_fact_ids?: string[];
  media_plan?: LessonAuthorBlueprintMediaPlan;
}

export interface LessonAuthorBlueprintChapter {
  title: string;
  objective: string;
  lessons: LessonAuthorBlueprintLesson[];
  source_refs?: string[];
}

export interface LessonAuthorBlueprintQualityReport {
  score: number;
  status: "ready_for_review" | "needs_review";
  checks: Array<{ key: string; passed: boolean }>;
  review_notes: string[];
  source_evidence?: {
    structure_source: string | null;
    structure_confidence: number | null;
    structure_node_count: number;
    known_source_ref_count: number;
    covered_source_ref_count: number;
    source_coverage_ratio: number | null;
    warnings: string[];
  };
}

export interface LessonAuthorBlueprint {
  title: string;
  summary: string;
  target_audience: string;
  prerequisites: string[];
  learning_outcomes: string[];
  assessment_strategy: string;
  assumptions: string[];
  chapters: LessonAuthorBlueprintChapter[];
}

export interface LessonAuthorBlueprintEvent {
  type: "blueprint";
  blueprint_id: string;
  blueprint: LessonAuthorBlueprint;
  quality_report: LessonAuthorBlueprintQualityReport;
  locale?: "vi" | "en";
  applied_chapter_indexes?: number[];
  status?: "proposed" | "superseded" | "archived" | "failed";
  error_reason?: string | null;
}

export interface LessonAuthorProgressEvent {
  type: "progress";
  stage: string;
  detail?: string;
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
  blueprint_id?: string | null;
  blueprint_chapter_index?: number | null;
}

export type LessonAuthorTranscriptionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired' | 'committed';

// Video upload includes client-to-backend transfer plus a server-side stream to
// private storage. It must not inherit the short timeout used by normal JSON APIs.
const LESSON_AUTHOR_VIDEO_UPLOAD_TIMEOUT_MS = 15 * 60_000;

export interface LessonAuthorTranscriptionJob {
  id: string;
  conversation_id: string | null;
  original_file_name: string;
  transcript_file_name: string;
  status: LessonAuthorTranscriptionStatus;
  transcript_language: string | null;
  transcript_char_count: number | null;
  kb_document_id: string | null;
  can_add_to_kb: boolean;
  can_retry: boolean;
  error_reason: string | null;
  created_at: string;
  updated_at: string;
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

export async function uploadLessonAuthorVideoTranscript(
  conversationId: string,
  file: File,
  locale: 'vi' | 'en',
  idempotencyKey: string,
  onProgress?: (percent: number) => void,
): Promise<{ job: LessonAuthorTranscriptionJob; already_exists: boolean }> {
  const body = new FormData();
  body.append('video', file);
  body.append('locale', locale);
  body.append('idempotency_key', idempotencyKey);
  const { data } = await customApiClient.post<ApiResponse<{ job: LessonAuthorTranscriptionJob; already_exists: boolean }>>(
    `/api/ai-chatbot/chat/lesson-author/conversations/${conversationId}/transcriptions`,
    body,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: LESSON_AUTHOR_VIDEO_UPLOAD_TIMEOUT_MS,
      onUploadProgress: event => {
        if (!event.total) return;
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    },
  );
  return data.data;
}

export async function commitLessonAuthorVideoTranscript(
  conversationId: string,
  jobId: string,
  locale: 'vi' | 'en',
): Promise<{ job: LessonAuthorTranscriptionJob; created: boolean }> {
  const { data } = await customApiClient.post<ApiResponse<{ job: LessonAuthorTranscriptionJob; created: boolean }>>(
    `/api/ai-chatbot/chat/lesson-author/conversations/${conversationId}/transcriptions/${jobId}/commit`,
    { locale },
  );
  return data.data;
}

export async function downloadLessonAuthorVideoTranscript(
  conversationId: string,
  jobId: string,
): Promise<Blob> {
  const { data } = await customApiClient.get<Blob>(
    `/api/ai-chatbot/chat/lesson-author/conversations/${conversationId}/transcriptions/${jobId}/download`,
    { responseType: 'blob' },
  );
  return data;
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

export async function deleteConversation(id: string, target: ChatTarget = 'admin'): Promise<void> {
  await customApiClient.delete(`/api/ai-chatbot/chat/conversations/${id}`, {
    params: { target },
  });
}

// ── Messages (cursor-based pagination) ──

export interface PaginatedMessages {
  messages: ChatMessage[];
  has_more: boolean;
  next_cursor: string | null;
}

export async function fetchMessages(
  conversationId: string,
  cursor?: string,
  target: ChatTarget = 'admin',
): Promise<PaginatedMessages> {
  const params = { target, ...(cursor ? { cursor } : {}) };
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
    mode?: "chat" | "course_blueprint" | "draft_lesson" | "auto";
    outline_mentions?: OutlineMention[];
    source_documents?: LessonAuthorSourceDocument[];
    blueprint_id?: string;
    blueprint_chapter_index?: number;
    input_mode?: "text" | "voice";
    report_filters?: ReportChatFilter;
    onProposal?: (event: LessonAuthorProposalEvent) => void;
    onBlueprint?: (event: LessonAuthorBlueprintEvent) => void;
    onProgress?: (event: LessonAuthorProgressEvent) => void;
    onReportStatus?: (status: ReportStreamStatus) => void;
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

  const streamUrl = new URL(
    `${config.customApiUrl}/api/ai-chatbot/chat/conversations/${conversationId}/messages`,
    typeof window !== 'undefined' ? window.location.origin : undefined,
  );
  streamUrl.searchParams.set('target', options.target ?? 'admin');
  if (options.courseId) streamUrl.searchParams.set('courseId', options.courseId);
  const url = streamUrl.toString();
  let receivedDone = false;
  let receivedError = false;

  const emitDone = () => {
    if (receivedDone || receivedError) return;
    receivedDone = true;
    scheduleTenantDataQuotaRefresh(quotaTenantId);
    onDone();
  };

  const emitError = (message: string) => {
    if (receivedDone || receivedError) return;
    receivedError = true;
    onError(message);
  };

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
          blueprint_id: options.blueprint_id,
          blueprint_chapter_index: options.blueprint_chapter_index,
          input_mode: options.input_mode,
          report_filters: options.report_filters,
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
        emitError(message);
        return;
      }

      // This endpoint streams outside customApiClient. A 2xx response means
      // the server accepted the message write; refresh once now and again when
      // the streamed assistant result is finalized below.
      scheduleTenantDataQuotaRefresh(quotaTenantId);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (line: string) => {
        const normalizedLine = line.trimEnd();
        if (!normalizedLine.startsWith('data: ')) return;
        try {
          const event = JSON.parse(normalizedLine.slice(6));
          if (event.type === 'chunk' && typeof event.text === 'string') onChunk(event.text);
          else if (event.type === 'done') emitDone();
          else if (event.type === 'error') {
            emitError(normalizeStreamErrorPayload(event, 'chatWidget.unknownError'));
          }
          else if (event.type === 'proposal') options.onProposal?.(event);
          else if (event.type === 'blueprint') options.onBlueprint?.(event);
          else if (event.type === 'progress') options.onProgress?.(event);
          else if (event.type === 'report_status' && (event.stage === 'collecting' || event.stage === 'analyzing')) options.onReportStatus?.(event.stage);
        } catch { /* skip malformed line */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) processLine(line);
      }

      // A final SSE event can remain in the decoder/buffer when the stream closes.
      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) processLine(line);
      }

      // Safety: if stream ended without done/error event, still notify once.
      emitDone();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        emitError(normalizeStreamErrorMessage(err));
      }
    }
  })();

  return controller;
}

export async function downloadReportChatPdf(conversationId: string, assistantMessageId: string): Promise<Blob> {
  const { accessToken, user } = useAuthStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
  if (user?.role === 'superadmin') {
    const { activeTenantId } = useTenantStore.getState();
    if (activeTenantId) headers['X-Tenant-Id'] = activeTenantId;
  }
  const response = await fetch(
    `${config.customApiUrl}/api/ai-chatbot/chat/conversations/${encodeURIComponent(conversationId)}/report-pdf?target=admin`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ assistant_message_id: assistantMessageId }),
    },
  );
  if (!response.ok) {
    let message = i18n.t('chatWidget.unknownError');
    try {
      const payload = await response.json();
      message = normalizeStreamErrorPayload(payload, 'chatWidget.unknownError');
    } catch {
      // Keep the localized fallback when the server returns a non-JSON error.
    }
    throw new Error(message);
  }
  return response.blob();
}

function getReportPdfHeaders(includeContentType = false): Record<string, string> {
  const { accessToken, user } = useAuthStore.getState();
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (includeContentType) headers['Content-Type'] = 'application/json';
  if (user?.role === 'superadmin') {
    const { activeTenantId } = useTenantStore.getState();
    if (activeTenantId) headers['X-Tenant-Id'] = activeTenantId;
  }
  return headers;
}

async function throwReportPdfApiError(response: Response): Promise<never> {
  let message = i18n.t('chatWidget.unknownError');
  let code: string | null = null;
  try {
    const payload = await response.json() as { code?: unknown; message?: unknown; error?: unknown };
    if (typeof payload.code === 'string') code = payload.code;
    if (typeof payload.message === 'string' && payload.message.trim()) message = payload.message;
    else if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error;
  } catch {
    // Keep the localized generic fallback for malformed responses.
  }
  throw new ReportPdfExportApiError(message, code);
}

function readAttachmentFileName(header: string | null, fallback: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Fall through to the plain filename value.
    }
  }
  const plain = header?.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
  return plain || fallback;
}

export async function startReportPdfExportJob(
  conversationId: string,
  assistantMessageId: string,
): Promise<ReportPdfExportJob> {
  const response = await fetch(
    `${config.customApiUrl}/api/ai-chatbot/chat/conversations/${encodeURIComponent(conversationId)}/report-pdf/jobs?target=admin`,
    {
      method: 'POST',
      headers: getReportPdfHeaders(true),
      body: JSON.stringify({ assistant_message_id: assistantMessageId }),
    },
  );
  if (!response.ok) return throwReportPdfApiError(response);
  const payload = await response.json() as ApiResponse<ReportPdfExportJob>;
  return payload.data;
}

export async function getReportPdfExportJob(
  conversationId: string,
  assistantMessageId: string,
  jobId: string,
): Promise<ReportPdfExportJob> {
  const query = new URLSearchParams({ target: 'admin', assistant_message_id: assistantMessageId });
  const response = await fetch(
    `${config.customApiUrl}/api/ai-chatbot/chat/conversations/${encodeURIComponent(conversationId)}/report-pdf/jobs/${encodeURIComponent(jobId)}?${query.toString()}`,
    { headers: getReportPdfHeaders() },
  );
  if (!response.ok) return throwReportPdfApiError(response);
  const payload = await response.json() as ApiResponse<ReportPdfExportJob>;
  return payload.data;
}

export async function downloadReportPdfExportJob(
  conversationId: string,
  assistantMessageId: string,
  jobId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams({ target: 'admin', assistant_message_id: assistantMessageId });
  const response = await fetch(
    `${config.customApiUrl}/api/ai-chatbot/chat/conversations/${encodeURIComponent(conversationId)}/report-pdf/jobs/${encodeURIComponent(jobId)}/download?${query.toString()}`,
    { headers: getReportPdfHeaders() },
  );
  if (!response.ok) return throwReportPdfApiError(response);
  return {
    blob: await response.blob(),
    fileName: readAttachmentFileName(response.headers.get('Content-Disposition'), 'learning-report.pdf'),
  };
}
