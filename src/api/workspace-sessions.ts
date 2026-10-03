import { customApiClient } from './custom-client';
import { isWorkspaceId, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { WorkspaceLaunchContext } from '../components/lesson-author-workspace/workspace-host.logic';

export interface LessonAuthorSessionSummary {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  workspace: WorkspaceLaunchContext | null;
}

export interface LessonAuthorSessionDeleteImpact {
  conversation_id: string;
  total_nodes: number;
  applied_nodes: number;
  unapplied_nodes: number;
  active: boolean;
}

const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime());

function readSession(value: unknown, courseId: string): LessonAuthorSessionSummary {
  const row = value as Record<string, unknown> | null;
  if (!row || !isWorkspaceId(row.conversation_id) || typeof row.title !== 'string' || !row.title.trim()
    || row.title.length > 200 || !validDate(row.created_at) || !validDate(row.updated_at)) throw new Error('LESSON_AUTHOR_SESSION_CONTRACT_INVALID');
  let workspace: WorkspaceLaunchContext | null = null;
  if (row.workspace !== null) {
    const w = row.workspace as Record<string, unknown> | null;
    if (!w || !isWorkspaceId(w.workspace_id) || w.conversation_id !== row.conversation_id
      || !isWorkspaceId(w.correlation_id) || !['vi', 'en'].includes(String(w.content_locale))
      || typeof w.status !== 'string' || w.can_edit !== true) throw new Error('LESSON_AUTHOR_SESSION_CONTRACT_INVALID');
    workspace = Object.freeze({ course_id: courseId, workspace_id: w.workspace_id as string,
      conversation_id: row.conversation_id, correlation_id: w.correlation_id as string,
      content_locale: w.content_locale as WorkspaceLocale, can_edit: true });
  }
  return Object.freeze({ conversation_id: row.conversation_id, title: row.title.trim(),
    created_at: new Date(row.created_at).toISOString(), updated_at: row.updated_at, workspace });
}

const base = (courseId: string) => `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(courseId)}`;

export async function listLessonAuthorSessions(courseId: string, locale: WorkspaceLocale, signal?: AbortSignal) {
  const response = await customApiClient.get(`${base(courseId)}/sessions`, {
    params: { limit: 20, ui_locale: locale }, signal, headers: { 'Cache-Control': 'no-cache' },
  });
  const payload = response.data?.data as { items?: unknown; next_cursor?: unknown } | undefined;
  if (!payload || !Array.isArray(payload.items) || payload.items.length > 20
    || payload.next_cursor !== null && typeof payload.next_cursor !== 'string') throw new Error('LESSON_AUTHOR_SESSION_CONTRACT_INVALID');
  return Object.freeze({ items: Object.freeze(payload.items.map(item => readSession(item, courseId))), next_cursor: payload.next_cursor as string | null });
}

export async function renameLessonAuthorSession(courseId: string, conversationId: string, title: string, expectedUpdatedAt: string, locale: WorkspaceLocale) {
  const response = await customApiClient.patch(`${base(courseId)}/sessions/${conversationId}`,
    { title, expected_updated_at: expectedUpdatedAt }, { params: { ui_locale: locale } });
  const value = response.data?.data as Record<string, unknown> | undefined;
  if (!value || value.conversation_id !== conversationId || typeof value.title !== 'string' || !validDate(value.updated_at)) {
    throw new Error('LESSON_AUTHOR_SESSION_CONTRACT_INVALID');
  }
  return { conversation_id: conversationId, title: value.title, updated_at: value.updated_at as string };
}

export async function getLessonAuthorSessionDeleteImpact(courseId: string, conversationId: string, locale: WorkspaceLocale): Promise<LessonAuthorSessionDeleteImpact> {
  const response = await customApiClient.get(`${base(courseId)}/sessions/${conversationId}/delete-impact`, { params: { ui_locale: locale } });
  const value = response.data?.data as Record<string, unknown> | undefined;
  if (!value || value.conversation_id !== conversationId || !['total_nodes', 'applied_nodes', 'unapplied_nodes'].every(key => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)
    || typeof value.active !== 'boolean') throw new Error('LESSON_AUTHOR_SESSION_CONTRACT_INVALID');
  return value as unknown as LessonAuthorSessionDeleteImpact;
}

export async function deleteLessonAuthorSession(courseId: string, conversationId: string, locale: WorkspaceLocale): Promise<{ job_id: string }> {
  const response = await customApiClient.delete(`${base(courseId)}/sessions/${conversationId}`, { params: { ui_locale: locale } });
  const value = response.data?.data as Record<string, unknown> | undefined;
  if (!value || !isWorkspaceId(value.job_id)) throw new Error('LESSON_AUTHOR_SESSION_CONTRACT_INVALID');
  return { job_id: value.job_id as string };
}
