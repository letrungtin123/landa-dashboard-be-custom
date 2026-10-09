import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import { isWorkspaceId, isWorkspaceSequence, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { WorkspaceReadScope } from './lesson-author-workspace';

export type WorkspaceApplyCode = 'WORKSPACE_APPLY_FORBIDDEN' | 'WORKSPACE_APPLY_DISABLED' | 'WORKSPACE_APPLY_INPUT_INVALID'
  | 'WORKSPACE_APPLY_NOT_READY' | 'WORKSPACE_APPLY_CONFLICT' | 'WORKSPACE_APPLY_VALIDATION_FAILED' | 'WORKSPACE_APPLY_UNAVAILABLE'
  | 'WORKSPACE_APPLY_COURSE_BUSY' | 'WORKSPACE_APPLY_COURSE_EDITED' | 'WORKSPACE_APPLY_COURSE_STRUCTURE_CHANGED';
export type WorkspaceApplyConflictKind = 'chapter' | 'lesson' | 'unit' | 'component';
/** Course parts changed after an earlier Apply (server-listed, bounded). */
export interface WorkspaceApplyConflict {
  items: ReadonlyArray<{ node_id: string; kind: WorkspaceApplyConflictKind; title: string }>;
  total: number;
  /** Present only when the parts may be replaced after the author confirms. */
  overwrite_confirmation: string | null;
}
export class WorkspaceApplyError extends Error {
  constructor(readonly code: WorkspaceApplyCode, readonly outcome: 'rejected' | 'unknown', readonly conflict: WorkspaceApplyConflict | null = null) { super(code); }
}
const messages: Record<WorkspaceApplyCode, readonly [string, string]> = {
  WORKSPACE_APPLY_FORBIDDEN: ['Bạn không có quyền đưa nội dung này vào khóa học.', 'You do not have permission to add this content to the course.'],
  WORKSPACE_APPLY_DISABLED: ['Chức năng đưa nội dung vào khóa học đang tạm khóa.', 'Adding draft content to the course is temporarily disabled.'],
  WORKSPACE_APPLY_INPUT_INVALID: ['Thông tin nội dung không hợp lệ. Hãy tải lại bản thiết kế khoá học rồi thử lại.', 'The content request is invalid. Reload the draft and try again.'],
  WORKSPACE_APPLY_NOT_READY: ['Nội dung này chưa sẵn sàng hoặc còn phụ thuộc vào một bài học khác.', 'This content is not ready or still depends on another lesson.'],
  WORKSPACE_APPLY_CONFLICT: ['Bản thiết kế khoá học hoặc dữ liệu khóa học vừa thay đổi. Hãy tải lại trước khi áp dụng.', 'The draft or course changed. Reload before applying.'],
  WORKSPACE_APPLY_VALIDATION_FAILED: ['Nội dung chưa đạt kiểm tra để đưa vào khóa học. Bản thiết kế khoá học vẫn được giữ nguyên.', 'The content did not pass the checks required to add it to the course. The draft is unchanged.'],
  WORKSPACE_APPLY_UNAVAILABLE: ['Chưa thể xác nhận nội dung đã được đưa vào khóa học. Hãy tải lại trạng thái trước khi thử lại.', 'The course update could not be confirmed. Reload its status before trying again.'],
  WORKSPACE_APPLY_COURSE_BUSY: ['Có người khác đang đưa nội dung vào khoá học này. Vui lòng thử lại sau ít phút.',
    'Someone else is adding content to this course right now. Please try again in a few minutes.'],
  WORKSPACE_APPLY_COURSE_EDITED: ['Khoá học đã được chỉnh sửa sau khi trợ lý AI soạn nội dung. Bạn có muốn thay các phần này bằng nội dung mới không?',
    'The course was edited after the AI assistant drafted this content. Do you want to replace these parts with the new content?'],
  WORKSPACE_APPLY_COURSE_STRUCTURE_CHANGED: ['Một số phần của khoá học đã bị xoá hoặc chuyển chỗ sau lần đưa nội dung trước, nên không thể đưa nội dung mới vào đúng vị trí. Hãy tạo một bản thiết kế mới cho các phần này.',
    'Some parts of the course were deleted or moved after content was last added, so the new content cannot be put in the right place. Create a new course design for these parts.'],
};
export function workspaceApplyMessage(code: WorkspaceApplyCode, locale: WorkspaceLocale): string {
  return messages[code][locale === 'en' ? 1 : 0];
}
export interface WorkspaceApplyReceipt { receipt_id: string; workspace_id: string; node_id: string; correlation_id: string; revision_set_hash: string; created_block_count: number; updated_block_count: number; replayed: boolean; }
const codes = new Set<WorkspaceApplyCode>(Object.keys(messages) as WorkspaceApplyCode[]);
const conflictCodes = new Set<WorkspaceApplyCode>(['WORKSPACE_APPLY_COURSE_EDITED', 'WORKSPACE_APPLY_COURSE_STRUCTURE_CHANGED']);
const kinds = new Set(['chapter', 'lesson', 'unit', 'component']);
const TOKEN = /^[0-9a-f]{64}$/;
function invalid(): never { throw new WorkspaceApplyError('WORKSPACE_APPLY_INPUT_INVALID', 'rejected'); }

/** Strict: a malformed list is treated as no list (the plain message still shows). */
export function readWorkspaceApplyConflict(code: WorkspaceApplyCode, value: unknown): WorkspaceApplyConflict | null {
  if (!conflictCodes.has(code)) return null;
  const c = value as Record<string, unknown> | null;
  if (!c || !Array.isArray(c.items) || c.items.length > 50 || !Number.isSafeInteger(c.total) || Number(c.total) < c.items.length) return null;
  const items = c.items.map(item => item as Record<string, unknown> | null);
  if (items.some(item => !item || !isWorkspaceId(item.node_id) || !kinds.has(String(item.kind)) || typeof item.title !== 'string' || item.title.length > 200)) return null;
  const token = c.overwrite_confirmation;
  if (code === 'WORKSPACE_APPLY_COURSE_EDITED' ? typeof token !== 'string' || !TOKEN.test(token) : token !== null) return null;
  return Object.freeze({ items: Object.freeze(items.map(item => Object.freeze({ node_id: item!.node_id as string,
    kind: item!.kind as WorkspaceApplyConflictKind, title: (item!.title as string).trim() }))), total: Number(c.total),
  overwrite_confirmation: (token as string | null) ?? null });
}

export function createWorkspaceApplyClient(scope: WorkspaceReadScope, transport: Pick<typeof customApiClient, 'post'> = customApiClient) {
  if (!isWorkspaceId(scope.workspaceId) || !isWorkspaceId(scope.conversationId) || !scope.courseId.trim() || scope.courseId.length > 255) invalid();
  const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}/conversations/${encodeURIComponent(scope.conversationId)}/workspaces/${encodeURIComponent(scope.workspaceId)}/nodes/`;
  return async (nodeId: string, operationId: string, expectedWorkspaceRevision: number, locale: WorkspaceLocale,
    overwriteConfirmation?: string): Promise<WorkspaceApplyReceipt> => {
    if (!isWorkspaceId(nodeId) || !isWorkspaceId(operationId) || !isWorkspaceSequence(expectedWorkspaceRevision) || !['en','vi'].includes(locale)
      || overwriteConfirmation !== undefined && !TOKEN.test(overwriteConfirmation)) invalid();
    try {
      const config: AxiosRequestConfig & { _retried: boolean } = { _retried: true, params: { ui_locale: locale } };
      const { data, status } = await transport.post(`${base}${encodeURIComponent(nodeId)}/apply`, { operation_id: operationId,
        expected_workspace_revision: expectedWorkspaceRevision, ...(overwriteConfirmation ? { overwrite_confirmation: overwriteConfirmation } : {}) }, config);
      const r = data?.data as WorkspaceApplyReceipt | undefined;
      if (data?.success !== true || !r || !isWorkspaceId(r.receipt_id) || r.workspace_id !== scope.workspaceId || r.node_id !== nodeId || !isWorkspaceId(r.correlation_id)
        || typeof r.revision_set_hash !== 'string' || !/^[0-9a-f]{64}$/.test(r.revision_set_hash) || !Number.isSafeInteger(r.created_block_count)
        || !Number.isSafeInteger(r.updated_block_count) || typeof r.replayed !== 'boolean') throw { response: { data, status } };
      return r;
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { code?: unknown; conflict?: unknown } } })?.response;
      const code = response?.data?.code;
      if (typeof code === 'string' && codes.has(code as WorkspaceApplyCode)) {
        throw new WorkspaceApplyError(code as WorkspaceApplyCode, code === 'WORKSPACE_APPLY_UNAVAILABLE' ? 'unknown' : 'rejected',
          readWorkspaceApplyConflict(code as WorkspaceApplyCode, response?.data?.conflict));
      }
      throw new WorkspaceApplyError('WORKSPACE_APPLY_UNAVAILABLE', 'unknown');
    }
  };
}
