import { customApiClient } from './custom-client';
import { isWorkspaceId, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { WorkspaceReadScope } from './lesson-author-workspace';
import { readWorkspaceLocation, type WorkspaceLocation } from './workspace-apply-reason.logic';

/** "Chờ duyệt": assessment questions an AI ID run held for the author to check. */
export type WorkspaceReviewDecision = 'valid_assessment' | 'approved_replan';
export interface WorkspaceReviewCandidate { node_id: string; number: number; title: string | null }
export interface WorkspaceReviewItem {
  obligation_id: string;
  status: 'open' | 'resolved';
  decision: WorkspaceReviewDecision | null;
  resolved_at: string | null;
  location: WorkspaceLocation | null;
  required_kind: string;
  learning_objectives: readonly string[];
  evidence_fact_count: number;
  candidate_components: readonly WorkspaceReviewCandidate[];
}
export interface WorkspaceReviewList {
  workspace_id: string;
  review_required: boolean;
  total_count: number;
  open_count: number;
  resolved_count: number;
  has_more: boolean;
  items: readonly WorkspaceReviewItem[];
}
export interface WorkspaceReviewReceipt {
  obligation_id: string;
  decision: WorkspaceReviewDecision;
  replayed: boolean;
  open_count: number;
  total_count: number;
}

export type WorkspaceReviewCode = 'WORKSPACE_REVIEW_FORBIDDEN' | 'WORKSPACE_REVIEW_DISABLED' | 'WORKSPACE_REVIEW_INPUT_INVALID'
  | 'WORKSPACE_REVIEW_NOT_FOUND' | 'WORKSPACE_REVIEW_ITEM_NOT_FOUND' | 'WORKSPACE_REVIEW_STATE_INVALID'
  | 'WORKSPACE_REVIEW_ALREADY_RESOLVED' | 'WORKSPACE_REVIEW_COMPONENT_INVALID' | 'TENANT_DATA_LIMIT_REACHED'
  | 'TENANT_DATA_QUOTA_RECONCILING' | 'WORKSPACE_REVIEW_READ_UNAVAILABLE' | 'WORKSPACE_REVIEW_UNAVAILABLE';
const messages: Record<WorkspaceReviewCode, readonly [string, string]> = {
  WORKSPACE_REVIEW_FORBIDDEN: ['Bạn không có quyền duyệt bản thiết kế khoá học này.', 'You do not have permission to review this course design.'],
  WORKSPACE_REVIEW_DISABLED: ['Chức năng duyệt chưa được bật.', 'Reviewing is not enabled.'],
  WORKSPACE_REVIEW_INPUT_INVALID: ['Thông tin duyệt không hợp lệ. Hãy tải lại rồi thử lại.', 'The review request is invalid. Reload and try again.'],
  WORKSPACE_REVIEW_NOT_FOUND: ['Không tìm thấy bản thiết kế khoá học.', 'The course design was not found.'],
  WORKSPACE_REVIEW_ITEM_NOT_FOUND: ['Không tìm thấy mục cần duyệt này. Hãy tải lại danh sách.', 'This review item was not found. Reload the list.'],
  WORKSPACE_REVIEW_STATE_INVALID: ['Bản thiết kế này hiện không còn chờ duyệt. Hãy tải lại danh sách.', 'This course design is no longer waiting for review. Reload the list.'],
  WORKSPACE_REVIEW_ALREADY_RESOLVED: ['Mục này đã được duyệt rồi. Hãy tải lại danh sách để xem kết quả.', 'This item was already reviewed. Reload the list to see the result.'],
  WORKSPACE_REVIEW_COMPONENT_INVALID: ['Câu hỏi bạn chọn không thuộc bài học này hoặc chưa sẵn sàng. Hãy chọn lại.', 'The question you chose is not in this lesson or is not ready. Choose again.'],
  TENANT_DATA_LIMIT_REACHED: ['Không thể lưu thêm dữ liệu vì doanh nghiệp đã dùng hết dung lượng được cấp. Vui lòng xóa bớt dữ liệu hoặc liên hệ quản trị viên để tăng dung lượng.',
    'Nothing more can be saved because the organization has used all of its storage. Delete some data or ask an administrator for more storage.'],
  TENANT_DATA_QUOTA_RECONCILING: ['Hệ thống đang cập nhật dung lượng của doanh nghiệp. Vui lòng thử lại sau ít phút.', 'The organization storage is being updated. Please try again in a few minutes.'],
  WORKSPACE_REVIEW_READ_UNAVAILABLE: ['Chưa thể tải danh sách chờ duyệt. Vui lòng thử lại sau ít phút.', 'The review list could not be loaded. Please try again in a few minutes.'],
  WORKSPACE_REVIEW_UNAVAILABLE: ['Chưa thể lưu kết quả duyệt. Vui lòng thử lại sau ít phút.', 'The review could not be saved. Please try again in a few minutes.'],
};
const codes = new Set(Object.keys(messages));
export class WorkspaceReviewError extends Error {
  constructor(readonly code: WorkspaceReviewCode) { super(code); this.name = 'WorkspaceReviewError'; }
}
export function workspaceReviewMessage(code: WorkspaceReviewCode, locale: WorkspaceLocale): string {
  return messages[code][locale === 'en' ? 1 : 0];
}
/** Any thrown value as one plain message (unknown failures read as "could not save/load"). */
export function workspaceReviewErrorMessage(error: unknown, locale: WorkspaceLocale, operation: 'list' | 'resolve'): string {
  if (error instanceof WorkspaceReviewError) return workspaceReviewMessage(error.code, locale);
  return workspaceReviewMessage(operation === 'list' ? 'WORKSPACE_REVIEW_READ_UNAVAILABLE' : 'WORKSPACE_REVIEW_UNAVAILABLE', locale);
}

const LIST_MAX = 200;
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const invalid = (operation: 'list' | 'resolve'): never => {
  throw new WorkspaceReviewError(operation === 'list' ? 'WORKSPACE_REVIEW_READ_UNAVAILABLE' : 'WORKSPACE_REVIEW_UNAVAILABLE');
};
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

function readItem(value: unknown): WorkspaceReviewItem {
  const item = value as Record<string, unknown> | null;
  const decision = item?.decision;
  if (!item || !isWorkspaceId(item.obligation_id) || !['open', 'resolved'].includes(String(item.status))
    || (item.status === 'resolved') !== (decision === 'valid_assessment' || decision === 'approved_replan')
    || (item.status === 'open' ? item.resolved_at !== null : !text(item.resolved_at, 40) || !Number.isFinite(Date.parse(String(item.resolved_at))))
    || !text(item.required_kind, 32) || !count(item.evidence_fact_count)
    || !Array.isArray(item.learning_objectives) || item.learning_objectives.length > 24
    || item.learning_objectives.some(objective => !text(objective, 2000))
    || !Array.isArray(item.candidate_components) || item.candidate_components.length > 32) invalid('list');
  const candidates = (item!.candidate_components as unknown[]).map(entry => {
    const candidate = entry as Record<string, unknown> | null;
    if (!candidate || !isWorkspaceId(candidate.node_id) || !Number.isSafeInteger(candidate.number) || Number(candidate.number) < 1
      || !(candidate.title === null || text(candidate.title, 200))) invalid('list');
    return Object.freeze({ node_id: candidate!.node_id as string, number: Number(candidate!.number),
      title: typeof candidate!.title === 'string' && candidate!.title.trim() ? candidate!.title.trim() : null });
  });
  return Object.freeze({ obligation_id: item!.obligation_id as string, status: item!.status as WorkspaceReviewItem['status'],
    decision: (decision ?? null) as WorkspaceReviewDecision | null, resolved_at: (item!.resolved_at ?? null) as string | null,
    location: readWorkspaceLocation(item!.location), required_kind: item!.required_kind as string,
    learning_objectives: Object.freeze((item!.learning_objectives as string[]).map(objective => objective.trim()).filter(Boolean)),
    evidence_fact_count: Number(item!.evidence_fact_count), candidate_components: Object.freeze(candidates) });
}

/** Strict reader of the review list; a malformed answer is "could not load", never a partial list. */
export function readWorkspaceReviewList(value: unknown, workspaceId: string): WorkspaceReviewList {
  const list = value as Record<string, unknown> | null;
  if (!list || list.workspace_id !== workspaceId || typeof list.review_required !== 'boolean' || typeof list.has_more !== 'boolean'
    || !['total_count', 'open_count', 'resolved_count'].every(key => count(list[key]))
    || Number(list.open_count) + Number(list.resolved_count) !== Number(list.total_count)
    || !Array.isArray(list.items) || list.items.length > LIST_MAX || list.items.length > Number(list.total_count)) invalid('list');
  return Object.freeze({ workspace_id: workspaceId, review_required: list!.review_required as boolean,
    total_count: Number(list!.total_count), open_count: Number(list!.open_count), resolved_count: Number(list!.resolved_count),
    has_more: list!.has_more as boolean, items: Object.freeze((list!.items as unknown[]).map(readItem)) });
}

function failure(error: unknown, operation: 'list' | 'resolve'): WorkspaceReviewError {
  if (error instanceof WorkspaceReviewError) return error;
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' && codes.has(code) ? new WorkspaceReviewError(code as WorkspaceReviewCode)
    : new WorkspaceReviewError(operation === 'list' ? 'WORKSPACE_REVIEW_READ_UNAVAILABLE' : 'WORKSPACE_REVIEW_UNAVAILABLE');
}

const base = (scope: WorkspaceReadScope) => `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}`
  + `/conversations/${encodeURIComponent(scope.conversationId)}/workspaces/${encodeURIComponent(scope.workspaceId)}/review-items`;

export async function listWorkspaceReviewItems(scope: WorkspaceReadScope, locale: WorkspaceLocale, signal?: AbortSignal,
  transport: Pick<typeof customApiClient, 'get'> = customApiClient): Promise<WorkspaceReviewList> {
  try {
    const response = await transport.get(base(scope), { params: { ui_locale: locale }, signal, headers: { 'Cache-Control': 'no-cache' } });
    return readWorkspaceReviewList(response.data?.data, scope.workspaceId);
  } catch (error) { throw failure(error, 'list'); }
}

/** One decision; `operationId` makes a retry of the same click idempotent on the server. */
export async function resolveWorkspaceReviewItem(scope: WorkspaceReadScope, obligationId: string,
  input: { decision: WorkspaceReviewDecision; component_node_id?: string; operation_id: string }, locale: WorkspaceLocale,
  transport: Pick<typeof customApiClient, 'post'> = customApiClient): Promise<WorkspaceReviewReceipt> {
  if (!isWorkspaceId(obligationId) || !isWorkspaceId(input.operation_id)
    || (input.decision === 'valid_assessment') !== isWorkspaceId(input.component_node_id)) throw new WorkspaceReviewError('WORKSPACE_REVIEW_INPUT_INVALID');
  try {
    const response = await transport.post(`${base(scope)}/${encodeURIComponent(obligationId)}/resolve`, {
      decision: input.decision, operation_id: input.operation_id,
      ...(input.decision === 'valid_assessment' ? { component_node_id: input.component_node_id } : {}),
    }, { params: { ui_locale: locale } });
    const value = response.data?.data as Record<string, unknown> | undefined;
    if (!value || value.obligation_id !== obligationId || value.decision !== input.decision || value.status !== 'resolved'
      || typeof value.replayed !== 'boolean' || !count(value.open_count) || !count(value.total_count)) invalid('resolve');
    return Object.freeze({ obligation_id: obligationId, decision: input.decision, replayed: value!.replayed as boolean,
      open_count: Number(value!.open_count), total_count: Number(value!.total_count) });
  } catch (error) { throw failure(error, 'resolve'); }
}
