import { customApiClient } from './custom-client';
import { isWorkspaceId, WorkspaceReadError, workspaceReadFailure } from './lesson-author-workspace.contract';
import type { WorkspaceLaunchResolver } from '../components/lesson-author-workspace/workspace-host.logic';
import type { WorkspaceLaunchContext } from '../components/lesson-author-workspace/workspace-host.logic';

export function readWorkspaceLaunchResult(value: unknown, courseId: string): WorkspaceLaunchContext {
  const v = value as Record<string, unknown> | null;
  if (!v || !isWorkspaceId(v.workspace_id) || !isWorkspaceId(v.conversation_id) || !isWorkspaceId(v.correlation_id)
    || !['en', 'vi'].includes(v.content_locale as string)
    || !['queued', 'designing', 'drafting', 'ready', 'needs_action', 'failed', 'canceled'].includes(v.status as string)
    || v.can_edit !== undefined && typeof v.can_edit !== 'boolean'
    || v.course_id !== undefined && v.course_id !== courseId) throw new WorkspaceReadError('WORKSPACE_READ_CONTRACT_INVALID');
  return { course_id: courseId, workspace_id: v.workspace_id, conversation_id: v.conversation_id,
    content_locale: v.content_locale as 'en' | 'vi', correlation_id: v.correlation_id, can_edit: v.can_edit === true };
}

/** Existing, actor-owned workspace discovery only. Uses the shared API client's
 * same-origin base, Bearer/tenant auth and GET refresh behavior. Never creates.
 * Missing server edit capability is read-only, not an inferred permission. */
export function createWorkspaceLaunchResolver(transport: Pick<typeof customApiClient, 'get'> = customApiClient): WorkspaceLaunchResolver {
  return async ({ courseId, actorId, tenantId, uiLocale, signal }) => {
    signal.throwIfAborted();
    if (!isWorkspaceId(actorId) || !isWorkspaceId(tenantId) || typeof courseId !== 'string' || !courseId.trim()
      || courseId.length > 255 || ['.', '..'].includes(courseId)
      || Array.from(courseId).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      || !['en', 'vi'].includes(uiLocale)) throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
    try {
      const { data } = await transport.get(`/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(courseId)}/workspaces/latest`, {
        params: { ui_locale: uiLocale }, signal, headers: { 'Cache-Control': 'no-cache' },
      });
      signal.throwIfAborted();
      if (!data || data.success !== true) throw { response: { data } };
      const value = data.data;
      if (value === null) return null;
      return readWorkspaceLaunchResult(value, courseId);
    } catch (error) {
      signal.throwIfAborted(); throw workspaceReadFailure(error);
    }
  };
}
