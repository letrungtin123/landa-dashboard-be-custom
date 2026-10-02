import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import { isWorkspaceId, isWorkspaceSequence, type WorkspaceContent, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { WorkspaceReadScope } from './lesson-author-workspace';

export type WorkspaceChanges = Partial<WorkspaceContent>;
export interface WorkspaceSaveRequest {
  operation_id: string;
  expected_revision: number;
  changes: WorkspaceChanges;
}
export type WorkspaceResetRequest = Omit<WorkspaceSaveRequest, 'changes'>;
export interface WorkspaceWriteReceipt {
  workspace_id: string;
  node_id: string;
  operation_id: string;
  correlation_id: string;
  revision: number;
  current_revision: number;
  content_hash: string;
  user_modified: boolean;
  event_sequence: number;
  replayed: boolean;
}
export interface WorkspaceWriteOptions { uiLocale: WorkspaceLocale; signal?: AbortSignal }
export interface WorkspaceWriteClient {
  save(nodeId: string, request: WorkspaceSaveRequest, options: WorkspaceWriteOptions): Promise<WorkspaceWriteReceipt>;
  reset(nodeId: string, request: WorkspaceResetRequest, options: WorkspaceWriteOptions): Promise<WorkspaceWriteReceipt>;
}
const COPY = {
  AUTH_REQUIRED: ['Chưa xác thực.', 'Authentication is required.'],
  WORKSPACE_EDIT_FORBIDDEN: ['Bạn không có quyền sửa bản thảo này.', 'You do not have permission to edit this draft.'],
  WORKSPACE_EDIT_DISABLED: ['Chỉnh sửa bản thảo chưa được bật.', 'Draft editing is not enabled.'],
  WORKSPACE_EDIT_INPUT_INVALID: ['Thông tin chỉnh sửa không hợp lệ.', 'The edit request is invalid.'],
  WORKSPACE_EDIT_NOT_FOUND: ['Không tìm thấy mục nội dung.', 'The content node was not found.'],
  WORKSPACE_REVISION_CONFLICT: ['Nội dung đã thay đổi. Hãy tải lại và so sánh bản sửa chưa lưu.', 'The content changed. Reload and compare your unsaved edits.'],
  WORKSPACE_EDIT_IDEMPOTENCY_CONFLICT: ['Mã thao tác đã được dùng cho chỉnh sửa khác. Hãy tải lại trạng thái.', 'This operation ID was used for another edit. Reload the state.'],
  WORKSPACE_NODE_NOT_READY: ['Nội dung chưa sẵn sàng để sửa.', 'This content is not ready for editing.'],
  WORKSPACE_EDIT_STATE_INVALID: ['Bản thảo không còn cho phép chỉnh sửa.', 'This draft no longer allows editing.'],
  WORKSPACE_SOURCE_CHANGED: ['Nguồn đã thay đổi. Hãy tải lại trạng thái; bản sửa cục bộ vẫn được giữ.', 'The source changed. Reload the state; local edits are preserved.'],
  WORKSPACE_EDIT_VALIDATION_REQUIRED: ['Bản sửa chưa đạt kiểm tra nội dung. Chưa lưu thay đổi.', 'Content validation failed. No changes were saved.'],
  WORKSPACE_EDIT_UNAVAILABLE: ['Chưa xác nhận được kết quả. Hãy tải lại trước khi gửi lại cùng thao tác.', 'The outcome is unconfirmed. Reload before explicitly replaying the same operation.'],
  WORKSPACE_EDIT_RECEIPT_INVALID: ['Phản hồi lưu không hợp lệ; chưa xác nhận được kết quả.', 'The write response is invalid; the outcome is unconfirmed.'],
  WORKSPACE_EDIT_READ_REQUIRED: ['Hãy tải lại nội dung trước khi tiếp tục.', 'Reload the content before continuing.'],
  WORKSPACE_EDIT_BUSY: ['Đang xử lý một thao tác chỉnh sửa.', 'An edit operation is already in progress.'],
  WORKSPACE_EDIT_RESET_CONFIRMATION_REQUIRED: ['Cần xác nhận đặt lại bản thảo.', 'Confirm the draft reset first.'],
} as const;
export type WorkspaceWriteCode = keyof typeof COPY;
export class WorkspaceWriteError extends Error {
  constructor(readonly code: WorkspaceWriteCode, readonly outcome: 'rejected' | 'unknown' = 'rejected',
    readonly status?: number, readonly requestId?: string) { super(code); this.name = 'WorkspaceWriteError'; }
}
export function workspaceWriteMessage(code: WorkspaceWriteCode, locale: WorkspaceLocale): string {
  return COPY[code][locale === 'en' ? 1 : 0];
}
const STATUS_BY_CODE: Partial<Record<WorkspaceWriteCode, number>> = {
  AUTH_REQUIRED: 401, WORKSPACE_EDIT_FORBIDDEN: 403, WORKSPACE_EDIT_DISABLED: 503,
  WORKSPACE_EDIT_INPUT_INVALID: 400, WORKSPACE_EDIT_NOT_FOUND: 404, WORKSPACE_REVISION_CONFLICT: 409,
  WORKSPACE_EDIT_IDEMPOTENCY_CONFLICT: 409, WORKSPACE_NODE_NOT_READY: 409, WORKSPACE_EDIT_STATE_INVALID: 409,
  WORKSPACE_SOURCE_CHANGED: 409, WORKSPACE_EDIT_VALIDATION_REQUIRED: 422, WORKSPACE_EDIT_UNAVAILABLE: 503,
};
export function workspaceWriteFailure(error: unknown): WorkspaceWriteError {
  if (error instanceof WorkspaceWriteError) return error;
  const response = (error as { response?: { status?: number; data?: Record<string, unknown> } } | null)?.response;
  const code = response?.data?.code;
  // Only the exact typed rejection contract proves this attempt was rejected.
  if (response && typeof code === 'string' && Object.prototype.hasOwnProperty.call(STATUS_BY_CODE, code)
    && response.status === STATUS_BY_CODE[code as WorkspaceWriteCode] && response.data?.success === false) {
    return new WorkspaceWriteError(code as WorkspaceWriteCode, code === 'WORKSPACE_EDIT_UNAVAILABLE' ? 'unknown' : 'rejected',
      response.status, isWorkspaceId(response.data.request_id) ? response.data.request_id : undefined);
  }
  return new WorkspaceWriteError('WORKSPACE_EDIT_UNAVAILABLE', 'unknown', response?.status);
}
function invalid(): never { throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID'); }
const PROTECTED = new Set(['__proto__', 'prototype', 'constructor', 'source_fact_ids', 'source_refs',
  'primary_evidence_scope_ids', 'supporting_evidence_scope_ids', 'learning_objective_refs', 'primary_concept_ids',
  'source_concept_ids', 'component_plan_id', 'parent_id', 'node_id', 'workspace_id', 'tenant_id', 'course_id', 'sort_order']);
function json(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > 48) invalid();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || seen.has(value)) invalid();
  seen.add(value);
  if (Array.isArray(value)) { for (const item of value) json(item, depth + 1, seen); }
  else {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) invalid();
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (PROTECTED.has(key) || !('value' in descriptor) || !descriptor.enumerable) invalid();
      json(descriptor.value, depth + 1, seen);
    }
  }
  seen.delete(value);
}
/** Local structural checks only; backend source/registry/content acceptance remains authoritative. */
export function validateWorkspaceChanges(value: unknown, complete = false): asserts value is WorkspaceChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  json(value);
  const v = value as Record<string, unknown>, keys = Object.keys(v);
  if (!keys.length || keys.some(k => !['title', 'purpose', 'data', 'implementation_notes'].includes(k))
    || complete && keys.length !== 4) invalid();
  if ('title' in v && (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 500)) invalid();
  for (const key of ['purpose', 'implementation_notes']) {
    if (key in v && v[key] !== null && (typeof v[key] !== 'string' || (v[key] as string).length > 8000)) invalid();
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 2 * 1024 * 1024) invalid();
}
export function readWorkspaceWriteReceipt(value: unknown, target: {
  workspaceId: string; nodeId: string; operationId: string; expectedRevision: number; operation: 'save' | 'reset';
}): WorkspaceWriteReceipt {
  const v = value as WorkspaceWriteReceipt | null;
  if (!v || !isWorkspaceId(v.workspace_id) || v.workspace_id.toLowerCase() !== target.workspaceId.toLowerCase()
    || !isWorkspaceId(v.node_id) || v.node_id.toLowerCase() !== target.nodeId.toLowerCase()
    || !isWorkspaceId(v.operation_id) || v.operation_id.toLowerCase() !== target.operationId.toLowerCase()
    || !isWorkspaceId(v.correlation_id) || !isWorkspaceSequence(v.revision) || v.revision !== target.expectedRevision + 1
    || !isWorkspaceSequence(v.current_revision) || v.current_revision < v.revision
    || typeof v.replayed !== 'boolean' || !v.replayed && v.current_revision !== v.revision
    || typeof v.content_hash !== 'string' || !/^[0-9a-f]{64}$/.test(v.content_hash)
    || typeof v.user_modified !== 'boolean' || target.operation === 'reset' && v.user_modified
    || !isWorkspaceSequence(v.event_sequence) || v.event_sequence < 1) {
    throw new WorkspaceWriteError('WORKSPACE_EDIT_RECEIPT_INVALID', 'unknown');
  }
  return v;
}

/** Exactly one POST per explicit invocation. _retried suppresses the shared
 * client's 401 replay while retaining its Bearer/tenant/baseURL conventions.
 * An abort/timeout after dispatch does NOT mean the server rolled back.
 */
export function createWorkspaceWriteClient(scope: WorkspaceReadScope,
  transport: Pick<typeof customApiClient, 'post'> = customApiClient): WorkspaceWriteClient {
  if (!isWorkspaceId(scope.workspaceId) || !isWorkspaceId(scope.conversationId)
    || typeof scope.courseId !== 'string' || !scope.courseId.trim() || scope.courseId.length > 255
    || Array.from(scope.courseId).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    || ['.', '..'].includes(scope.courseId)) invalid();
  const workspaceId = scope.workspaceId;
  const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}`
    + `/conversations/${encodeURIComponent(scope.conversationId)}/workspaces/${encodeURIComponent(workspaceId)}/nodes/`;
  async function write(operation: 'save' | 'reset', nodeId: string,
    request: WorkspaceSaveRequest | WorkspaceResetRequest, options: WorkspaceWriteOptions) {
    if (!isWorkspaceId(nodeId) || !request || typeof request !== 'object' || Array.isArray(request)
      || !isWorkspaceId(request.operation_id) || !isWorkspaceSequence(request.expected_revision)
      || request.expected_revision === Number.MAX_SAFE_INTEGER || !['en', 'vi'].includes(options.uiLocale)
      || Object.keys(request).some(k => !['operation_id', 'expected_revision', ...(operation === 'save' ? ['changes'] : [])].includes(k))) invalid();
    if (operation === 'save') validateWorkspaceChanges((request as WorkspaceSaveRequest).changes);
    const body = structuredClone(request);
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 2 * 1024 * 1024 + 1024) invalid();
    if (options.signal?.aborted) throw new WorkspaceWriteError('WORKSPACE_EDIT_UNAVAILABLE', 'rejected');
    const config: AxiosRequestConfig & { _retried: boolean } = {
      params: { ui_locale: options.uiLocale }, signal: options.signal, _retried: true,
    };
    try {
      const { data, status } = await transport.post(`${base}${encodeURIComponent(nodeId)}/${operation}`, body, config);
      if (data?.success !== true) throw { response: { data, status } };
      return readWorkspaceWriteReceipt(data.data, { workspaceId, nodeId, operationId: body.operation_id,
        expectedRevision: body.expected_revision, operation });
    } catch (error) { throw workspaceWriteFailure(error); }
  }
  return { save: (nodeId, request, options) => write('save', nodeId, request, options),
    reset: (nodeId, request, options) => write('reset', nodeId, request, options) };
}
