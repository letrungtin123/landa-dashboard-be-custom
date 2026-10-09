import { customApiClient } from './custom-client';
import { isWorkspaceId, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { WorkspaceLaunchContext } from '../components/lesson-author-workspace/workspace-host.logic';

/** Sessions are shared with every course editor of the tenant; only the
 * creator continues one (server decides; these flags only shape the UI). */
export interface LessonAuthorSessionPermissions {
  can_continue: boolean;
  can_rename: boolean;
  can_delete: boolean;
  can_apply: boolean;
}

export interface LessonAuthorSessionSummary {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  owner: { user_id: string; display_name: string };
  is_mine: boolean;
  permissions: LessonAuthorSessionPermissions;
  workspace: WorkspaceLaunchContext | null;
}

export type LessonAuthorSessionScope = 'all' | 'mine';

export interface LessonAuthorActiveRun {
  conversation_id: string;
  title: string;
  owner: { user_id: string; display_name: string };
  is_mine: boolean;
  started_at: string;
}

export interface LessonAuthorSessionDeleteImpact {
  conversation_id: string;
  total_nodes: number;
  applied_nodes: number;
  unapplied_nodes: number;
  active: boolean;
}

const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime());
const invalid = (): never => { throw new Error('LESSON_AUTHOR_SESSION_CONTRACT_INVALID'); };

function readOwner(value: unknown): { user_id: string; display_name: string } {
  const owner = value as Record<string, unknown> | null;
  if (!owner || !isWorkspaceId(owner.user_id) || typeof owner.display_name !== 'string' || owner.display_name.length > 160) invalid();
  return Object.freeze({ user_id: owner!.user_id as string, display_name: (owner!.display_name as string).trim() });
}

function readPermissions(value: unknown): LessonAuthorSessionPermissions {
  const p = value as Record<string, unknown> | null;
  if (!p || !['can_continue', 'can_rename', 'can_delete', 'can_apply'].every(key => typeof p[key] === 'boolean')) invalid();
  return Object.freeze({ can_continue: p!.can_continue as boolean, can_rename: p!.can_rename as boolean,
    can_delete: p!.can_delete as boolean, can_apply: p!.can_apply as boolean });
}

export function readLessonAuthorSession(value: unknown, courseId: string): LessonAuthorSessionSummary {
  const row = value as Record<string, unknown> | null;
  if (!row || !isWorkspaceId(row.conversation_id) || typeof row.title !== 'string' || !row.title.trim()
    || row.title.length > 200 || !validDate(row.created_at) || !validDate(row.updated_at) || typeof row.is_mine !== 'boolean') invalid();
  const owner = readOwner(row!.owner);
  const permissions = readPermissions(row!.permissions);
  // Only the creator continues a session; the flags must agree with ownership.
  if (permissions.can_continue !== row!.is_mine) invalid();
  let workspace: WorkspaceLaunchContext | null = null;
  if (row!.workspace !== null) {
    const w = row!.workspace as Record<string, unknown> | null;
    if (!w || !isWorkspaceId(w.workspace_id) || w.conversation_id !== row!.conversation_id
      || !isWorkspaceId(w.correlation_id) || !['vi', 'en'].includes(String(w.content_locale))
      || typeof w.status !== 'string' || w.can_edit !== permissions.can_continue) invalid();
    workspace = Object.freeze({ course_id: courseId, workspace_id: w!.workspace_id as string,
      conversation_id: row!.conversation_id as string, correlation_id: w!.correlation_id as string,
      content_locale: w!.content_locale as WorkspaceLocale, can_edit: w!.can_edit as boolean });
  }
  return Object.freeze({ conversation_id: row!.conversation_id as string, title: (row!.title as string).trim(),
    created_at: new Date(row!.created_at as string).toISOString(), updated_at: row!.updated_at as string,
    owner, is_mine: row!.is_mine as boolean, permissions, workspace });
}

export function readLessonAuthorActiveRun(value: unknown): LessonAuthorActiveRun {
  const row = value as Record<string, unknown> | null;
  if (!row || !isWorkspaceId(row.conversation_id) || typeof row.title !== 'string' || row.title.length > 200
    || typeof row.is_mine !== 'boolean' || !validDate(row.started_at)) invalid();
  return Object.freeze({ conversation_id: row!.conversation_id as string, title: (row!.title as string).trim(),
    owner: readOwner(row!.owner), is_mine: row!.is_mine as boolean, started_at: new Date(row!.started_at as string).toISOString() });
}

const base = (courseId: string) => `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(courseId)}`;

export async function listLessonAuthorSessions(courseId: string, locale: WorkspaceLocale, signal?: AbortSignal,
  scope: LessonAuthorSessionScope = 'all') {
  const response = await customApiClient.get(`${base(courseId)}/sessions`, {
    params: { limit: 20, scope, ui_locale: locale }, signal, headers: { 'Cache-Control': 'no-cache' },
  });
  const payload = response.data?.data as { items?: unknown; next_cursor?: unknown } | undefined;
  if (!payload || !Array.isArray(payload.items) || payload.items.length > 20
    || payload.next_cursor !== null && typeof payload.next_cursor !== 'string') invalid();
  return Object.freeze({ items: Object.freeze((payload!.items as unknown[]).map(item => readLessonAuthorSession(item, courseId))),
    next_cursor: payload!.next_cursor as string | null });
}

/** Sessions of this course whose generation is still running (banner). */
export async function listLessonAuthorActiveRuns(courseId: string, locale: WorkspaceLocale, signal?: AbortSignal): Promise<readonly LessonAuthorActiveRun[]> {
  const response = await customApiClient.get(`${base(courseId)}/sessions/active-runs`, {
    params: { ui_locale: locale }, signal, headers: { 'Cache-Control': 'no-cache' },
  });
  const payload = response.data?.data as { items?: unknown } | undefined;
  if (!payload || !Array.isArray(payload.items) || payload.items.length > 10) invalid();
  return Object.freeze((payload!.items as unknown[]).map(readLessonAuthorActiveRun));
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
