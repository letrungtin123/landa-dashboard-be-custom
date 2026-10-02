import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import { isWorkspaceId, type WorkspaceLocale } from './lesson-author-workspace.contract';
import { readWorkspaceLaunchResult } from './workspace-launch';
import type { WorkspaceHostScope } from '../components/lesson-author-workspace/workspace-host.logic';

export interface WorkspaceCreateRequest { operation_id: string; source_document_ids: string[]; content_locale: WorkspaceLocale }
export class WorkspaceCreateError extends Error {
  constructor(readonly outcome: 'rejected' | 'unknown', readonly code: string) { super(code); }
}
/** A response code is not proof that an attempted create had no effect. Only
 * pre-admission/gate failures and explicit conflicts are definite rejections. */
export function workspaceCreateFailure(error: unknown): WorkspaceCreateError {
  if (error instanceof WorkspaceCreateError) return error;
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } })?.response;
  const raw = response?.data?.code;
  const code = typeof raw === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(raw) ? raw : 'WORKSPACE_CREATE_UNCONFIRMED';
  const rejected = response?.status === 400 || response?.status === 401 || response?.status === 403 || response?.status === 409
    || code === 'WORKSPACE_EXECUTION_DISABLED';
  return new WorkspaceCreateError(rejected ? 'rejected' : 'unknown', code);
}
export function createWorkspaceCreateClient(scope: WorkspaceHostScope, transport: Pick<typeof customApiClient, 'post'> = customApiClient) {
  return async (conversationId: string, request: WorkspaceCreateRequest, uiLocale: WorkspaceLocale) => {
    if (![scope.actorId, scope.tenantId, conversationId, request.operation_id].every(isWorkspaceId)
      || !scope.courseId.trim() || scope.courseId.length > 255 || Array.from(scope.courseId).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127) || ['.', '..'].includes(scope.courseId)
      || !['en', 'vi'].includes(uiLocale) || !['en', 'vi'].includes(request.content_locale)
      || Object.keys(request).sort().join(',') !== 'content_locale,operation_id,source_document_ids'
      || !Array.isArray(request.source_document_ids) || request.source_document_ids.length < 1 || request.source_document_ids.length > 5
      || !request.source_document_ids.every(isWorkspaceId) || new Set(request.source_document_ids.map(id => id.toLowerCase())).size !== request.source_document_ids.length) {
      throw new WorkspaceCreateError('rejected', 'WORKSPACE_CREATE_INPUT_INVALID');
    }
    // One POST only, including 401. Do not cancel a dispatched operation on
    // close: losing its receipt must not be mistaken for cancelling generation.
    const config: AxiosRequestConfig & { _retried: boolean } = { _retried: true, params: { ui_locale: uiLocale } };
    try {
      const { data } = await transport.post(`/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}`
        + `/conversations/${encodeURIComponent(conversationId)}/workspaces`, structuredClone(request), config);
      if (data?.success !== true) throw { response: { data } };
      const result = readWorkspaceLaunchResult(data.data, scope.courseId);
      if (result.conversation_id !== conversationId || result.content_locale !== request.content_locale) throw new WorkspaceCreateError('unknown', 'WORKSPACE_CREATE_UNCONFIRMED');
      return result;
    } catch (error) { throw workspaceCreateFailure(error); }
  };
}
