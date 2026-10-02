import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import { isWorkspaceId, isWorkspaceSequence, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { WorkspaceReadScope } from './lesson-author-workspace';

export type WorkspaceApplyCode = 'WORKSPACE_APPLY_FORBIDDEN' | 'WORKSPACE_APPLY_DISABLED' | 'WORKSPACE_APPLY_INPUT_INVALID'
  | 'WORKSPACE_APPLY_NOT_READY' | 'WORKSPACE_APPLY_CONFLICT' | 'WORKSPACE_APPLY_VALIDATION_FAILED' | 'WORKSPACE_APPLY_UNAVAILABLE';
export class WorkspaceApplyError extends Error { constructor(readonly code: WorkspaceApplyCode, readonly outcome: 'rejected' | 'unknown') { super(code); } }
const messages: Record<WorkspaceApplyCode, readonly [string, string]> = {
  WORKSPACE_APPLY_FORBIDDEN: ['Bạn không có quyền đưa nội dung này vào khóa học.', 'You do not have permission to add this content to the course.'],
  WORKSPACE_APPLY_DISABLED: ['Chức năng đưa nội dung vào khóa học đang tạm khóa.', 'Adding draft content to the course is temporarily disabled.'],
  WORKSPACE_APPLY_INPUT_INVALID: ['Thông tin nội dung không hợp lệ. Hãy tải lại bản thảo rồi thử lại.', 'The content request is invalid. Reload the draft and try again.'],
  WORKSPACE_APPLY_NOT_READY: ['Nội dung này chưa sẵn sàng hoặc còn phụ thuộc vào một bài học khác.', 'This content is not ready or still depends on another lesson.'],
  WORKSPACE_APPLY_CONFLICT: ['Bản thảo hoặc khóa học vừa thay đổi. Hãy tải lại trước khi áp dụng.', 'The draft or course changed. Reload before applying.'],
  WORKSPACE_APPLY_VALIDATION_FAILED: ['Nội dung chưa đạt kiểm tra để đưa vào khóa học. Bản thảo vẫn được giữ nguyên.', 'The content did not pass the checks required to add it to the course. The draft is unchanged.'],
  WORKSPACE_APPLY_UNAVAILABLE: ['Chưa thể xác nhận nội dung đã được đưa vào khóa học. Hãy tải lại trạng thái trước khi thử lại.', 'The course update could not be confirmed. Reload its status before trying again.'],
};
export function workspaceApplyMessage(code: WorkspaceApplyCode, locale: WorkspaceLocale): string {
  return messages[code][locale === 'en' ? 1 : 0];
}
export interface WorkspaceApplyReceipt { receipt_id: string; workspace_id: string; node_id: string; correlation_id: string; revision_set_hash: string; created_block_count: number; updated_block_count: number; replayed: boolean; }
const codes = new Set<WorkspaceApplyCode>(['WORKSPACE_APPLY_FORBIDDEN','WORKSPACE_APPLY_DISABLED','WORKSPACE_APPLY_INPUT_INVALID','WORKSPACE_APPLY_NOT_READY','WORKSPACE_APPLY_CONFLICT','WORKSPACE_APPLY_VALIDATION_FAILED','WORKSPACE_APPLY_UNAVAILABLE']);
function invalid(): never { throw new WorkspaceApplyError('WORKSPACE_APPLY_INPUT_INVALID', 'rejected'); }
export function createWorkspaceApplyClient(scope: WorkspaceReadScope, transport: Pick<typeof customApiClient, 'post'> = customApiClient) {
  if (!isWorkspaceId(scope.workspaceId) || !isWorkspaceId(scope.conversationId) || !scope.courseId.trim() || scope.courseId.length > 255) invalid();
  const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}/conversations/${encodeURIComponent(scope.conversationId)}/workspaces/${encodeURIComponent(scope.workspaceId)}/nodes/`;
  return async (nodeId: string, operationId: string, expectedWorkspaceRevision: number, locale: WorkspaceLocale): Promise<WorkspaceApplyReceipt> => {
    if (!isWorkspaceId(nodeId) || !isWorkspaceId(operationId) || !isWorkspaceSequence(expectedWorkspaceRevision) || !['en','vi'].includes(locale)) invalid();
    try {
      const config: AxiosRequestConfig & { _retried: boolean } = { _retried: true, params: { ui_locale: locale } };
      const { data, status } = await transport.post(`${base}${encodeURIComponent(nodeId)}/apply`, { operation_id: operationId, expected_workspace_revision: expectedWorkspaceRevision }, config);
      const r = data?.data as WorkspaceApplyReceipt | undefined;
      if (data?.success !== true || !r || !isWorkspaceId(r.receipt_id) || r.workspace_id !== scope.workspaceId || r.node_id !== nodeId || !isWorkspaceId(r.correlation_id)
        || typeof r.revision_set_hash !== 'string' || !/^[0-9a-f]{64}$/.test(r.revision_set_hash) || !Number.isSafeInteger(r.created_block_count)
        || !Number.isSafeInteger(r.updated_block_count) || typeof r.replayed !== 'boolean') throw { response: { data, status } };
      return r;
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { code?: unknown } } })?.response;
      const code = response?.data?.code;
      if (typeof code === 'string' && codes.has(code as WorkspaceApplyCode)) throw new WorkspaceApplyError(code as WorkspaceApplyCode, code === 'WORKSPACE_APPLY_UNAVAILABLE' ? 'unknown' : 'rejected');
      throw new WorkspaceApplyError('WORKSPACE_APPLY_UNAVAILABLE', 'unknown');
    }
  };
}
