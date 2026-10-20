import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import { isWorkspaceId, isWorkspaceSequence, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { WorkspaceReadScope } from './lesson-author-workspace';

/** Stop, continue and rewrite of an AI course design run (owner only, server-gated).
 * Every rule lives on the server; this client only validates the wire shapes. */
export type WorkspaceRecoveryCode = 'AUTH_REQUIRED' | 'RECOVERY_DISABLED' | 'RECOVERY_FORBIDDEN' | 'RECOVERY_INPUT_INVALID'
  | 'RECOVERY_NOT_FOUND' | 'RECOVERY_STATE_CHANGED' | 'RECOVERY_UNIT_HAS_CONTENT' | 'RECOVERY_NOTHING_TO_DO'
  | 'RECOVERY_LIMIT_REACHED' | 'RECOVERY_RUNTIME_CHANGED' | 'RECOVERY_OTHER_RUN_ACTIVE' | 'RECOVERY_IDEMPOTENCY_CONFLICT'
  | 'RUN_STOP_NOT_ACTIVE' | 'AI_CREDIT_INSUFFICIENT_FOR_RECOVERY' | 'RECOVERY_UNAVAILABLE';
/** Why an option is not offered now. Unknown future reasons stay plain strings and are never shown as text. */
export type WorkspaceRecoveryReason = 'RECOVERY_DISABLED' | 'RECOVERY_NOT_SUPPORTED' | 'RECOVERY_RUN_ACTIVE'
  | 'RECOVERY_DRAINING' | 'RECOVERY_RUN_COMPLETE' | 'RECOVERY_REVIEW_REQUIRED' | 'RECOVERY_PLANNING_INCOMPLETE'
  | 'RECOVERY_RUNTIME_CHANGED' | 'RECOVERY_UNIT_HAS_CONTENT' | 'RECOVERY_NOTHING_TO_DO' | 'RECOVERY_LIMIT_REACHED'
  | 'RECOVERY_UNAVAILABLE' | 'RUN_STOP_NOT_ACTIVE' | (string & {});
export type WorkspaceRecoveryRunStatus = 'planning' | 'executing' | 'finalizing' | 'ready' | 'needs_action' | 'canceled';
export interface WorkspaceRecoveryOption { available: boolean; reason: WorkspaceRecoveryReason | null }
export interface WorkspaceRecoveryView {
  run_id: string | null;
  run_status: WorkspaceRecoveryRunStatus | null;
  workspace_status: string;
  failure_code: string | null;
  /** Workspace event head the author saw; sent back as expected_workspace_revision. */
  event_head: number;
  /** Stopped, but a lesson that was already being written is still finishing. */
  draining: boolean;
  stop: WorkspaceRecoveryOption;
  resume: WorkspaceRecoveryOption & { task_count: number };
  regenerate: WorkspaceRecoveryOption & {
    max_rewrites_per_lesson: number;
    missing_unit_count: number;
    course: (WorkspaceRecoveryOption & { node_id: string; unit_count: number }) | null;
    chapters: ReadonlyArray<WorkspaceRecoveryOption & { node_id: string; chapter_key: string; unit_count: number }>;
    units: ReadonlyArray<WorkspaceRecoveryOption & { node_id: string; chapter_node_id: string | null; rewrites_used: number }>;
  };
}
export interface WorkspaceRecoveryResult {
  recovery_id: string | null;
  run_id: string;
  action: 'stop' | 'resume' | 'regenerate';
  reopened_task_count: number;
  workspace_status: string;
  replayed: boolean;
}
export class WorkspaceRecoveryError extends Error {
  /** unknown = the request may have been applied: retry with the SAME operation id (the server replays it). */
  constructor(readonly code: WorkspaceRecoveryCode, readonly outcome: 'rejected' | 'unknown') { super(code); }
}

const messages: Record<WorkspaceRecoveryCode, readonly [string, string]> = {
  AUTH_REQUIRED: ['Bạn cần đăng nhập lại để tiếp tục.', 'Please sign in again to continue.'],
  RECOVERY_DISABLED: ['Tính năng dừng, chạy tiếp và viết lại chưa được bật cho đơn vị của bạn.',
    'Stopping, continuing and rewriting are not turned on for your organization yet.'],
  RECOVERY_FORBIDDEN: ['Bạn không có quyền thực hiện thao tác này với bản thiết kế khoá học.',
    'You do not have permission to do this on this course design.'],
  RECOVERY_INPUT_INVALID: ['Yêu cầu không hợp lệ. Vui lòng tải lại trang rồi thử lại.',
    'The request is not valid. Please reload the page and try again.'],
  RECOVERY_NOT_FOUND: ['Không tìm thấy bản thiết kế khoá học hoặc phần nội dung này.',
    'This course design or this part of the content was not found.'],
  RECOVERY_STATE_CHANGED: ['Bản thiết kế vừa thay đổi. Vui lòng xem lại rồi thử lại.',
    'The course design has just changed. Please check it again and retry.'],
  RECOVERY_UNIT_HAS_CONTENT: ['Bài này đã có nội dung nên không cần viết lại.',
    'This lesson already has content, so it does not need to be rewritten.'],
  RECOVERY_NOTHING_TO_DO: ['Không còn phần nào cần chạy tiếp hoặc viết lại.', 'There is nothing left to continue or rewrite.'],
  RECOVERY_LIMIT_REACHED: ['Bài này đã được viết lại 3 lần. Bạn có thể tự soạn nội dung hoặc tạo bản thiết kế mới.',
    'This lesson has already been rewritten 3 times. You can write the content yourself or start a new design.'],
  RECOVERY_RUNTIME_CHANGED: ['Cài đặt AI đã thay đổi sau khi tạo bản thiết kế này nên không thể chạy tiếp. Vui lòng tạo bản thiết kế mới.',
    'The AI settings changed after this design was created, so it cannot continue. Please start a new design.'],
  RECOVERY_OTHER_RUN_ACTIVE: ['Bạn đang có một bản thiết kế khác của khoá học này đang chạy. Hãy chờ bản đó xong hoặc dừng nó trước.',
    'Another design of this course is still running. Wait for it to finish or stop it first.'],
  RECOVERY_IDEMPOTENCY_CONFLICT: ['Thao tác này đã được gửi trước đó với nội dung khác. Vui lòng tải lại rồi thử lại.',
    'This action was already sent with different details. Please reload and try again.'],
  RUN_STOP_NOT_ACTIVE: ['Bản thiết kế không còn đang chạy nên không cần dừng.',
    'The course design is no longer running, so there is nothing to stop.'],
  AI_CREDIT_INSUFFICIENT_FOR_RECOVERY: ['Không đủ điểm AI để viết lại. Vui lòng liên hệ quản trị viên để mua thêm điểm.',
    'There are not enough AI points to rewrite. Please contact your administrator to buy more points.'],
  RECOVERY_UNAVAILABLE: ['Chưa xác nhận được kết quả. Vui lòng thử lại sau ít phút.',
    'The result could not be confirmed. Please try again in a few minutes.'],
};
const codes = new Set(Object.keys(messages));
export function workspaceRecoveryMessage(code: WorkspaceRecoveryCode, locale: WorkspaceLocale): string {
  return messages[code][locale === 'en' ? 1 : 0];
}

const RUN_STATUSES = new Set(['planning', 'executing', 'finalizing', 'ready', 'needs_action', 'canceled']);
const WORKSPACE_STATUSES = new Set(['queued', 'designing', 'drafting', 'ready', 'needs_action', 'failed', 'canceled']);
const CODE = /^[A-Z][A-Z0-9_]{0,99}$/;
const MAX_ITEMS = 10_000;
function invalid(): never { throw new WorkspaceRecoveryError('RECOVERY_UNAVAILABLE', 'rejected'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
function option(value: unknown): WorkspaceRecoveryOption {
  const v = record(value);
  if (typeof v.available !== 'boolean' || !(v.reason === null || typeof v.reason === 'string' && CODE.test(v.reason))
    || v.available !== (v.reason === null)) invalid();
  return { available: v.available, reason: v.reason as WorkspaceRecoveryReason | null };
}

/** Strict read of GET …/recovery. A malformed view hides every action (fail closed). */
export function readWorkspaceRecoveryView(value: unknown): WorkspaceRecoveryView {
  const v = record(value);
  if (!(v.run_id === null || isWorkspaceId(v.run_id)) || !(v.run_status === null || RUN_STATUSES.has(String(v.run_status)))
    || !WORKSPACE_STATUSES.has(String(v.workspace_status)) || !(v.failure_code === null || typeof v.failure_code === 'string' && CODE.test(v.failure_code))
    || !isWorkspaceSequence(v.event_head) || typeof v.draining !== 'boolean') invalid();
  const resume = record(v.resume), regenerate = record(v.regenerate);
  if (!count(resume.task_count) || !count(regenerate.max_rewrites_per_lesson) || !count(regenerate.missing_unit_count)
    || !Array.isArray(regenerate.chapters) || regenerate.chapters.length > MAX_ITEMS
    || !Array.isArray(regenerate.units) || regenerate.units.length > MAX_ITEMS) invalid();
  const course = regenerate.course === null ? null : (() => {
    const c = record(regenerate.course);
    if (!isWorkspaceId(c.node_id) || !count(c.unit_count)) invalid();
    return { ...option(c), node_id: c.node_id, unit_count: c.unit_count as number };
  })();
  const chapters = (regenerate.chapters as unknown[]).map(raw => {
    const c = record(raw);
    if (!isWorkspaceId(c.node_id) || typeof c.chapter_key !== 'string' || !c.chapter_key || c.chapter_key.length > 200
      || !count(c.unit_count)) invalid();
    return { ...option(c), node_id: c.node_id, chapter_key: c.chapter_key, unit_count: c.unit_count as number };
  });
  const units = (regenerate.units as unknown[]).map(raw => {
    const u = record(raw);
    if (!isWorkspaceId(u.node_id) || !(u.chapter_node_id === null || isWorkspaceId(u.chapter_node_id)) || !count(u.rewrites_used)) invalid();
    return { ...option(u), node_id: u.node_id, chapter_node_id: u.chapter_node_id as string | null, rewrites_used: u.rewrites_used as number };
  });
  return {
    run_id: v.run_id as string | null, run_status: v.run_status as WorkspaceRecoveryRunStatus | null,
    workspace_status: String(v.workspace_status), failure_code: v.failure_code as string | null,
    event_head: v.event_head as number, draining: v.draining as boolean,
    stop: option(v.stop),
    resume: { ...option(resume), task_count: resume.task_count as number },
    regenerate: { ...option(regenerate), max_rewrites_per_lesson: regenerate.max_rewrites_per_lesson as number,
      missing_unit_count: regenerate.missing_unit_count as number, course, chapters, units },
  };
}

function readResult(value: unknown, action: WorkspaceRecoveryResult['action']): WorkspaceRecoveryResult {
  const v = record(value);
  if (!(v.recovery_id === null || isWorkspaceId(v.recovery_id)) || !isWorkspaceId(v.run_id) || v.action !== action
    || !count(v.reopened_task_count) || !WORKSPACE_STATUSES.has(String(v.workspace_status)) || typeof v.replayed !== 'boolean'
    || (action === 'stop') !== (v.recovery_id === null)) invalid();
  return { recovery_id: v.recovery_id as string | null, run_id: v.run_id, action, reopened_task_count: v.reopened_task_count as number,
    workspace_status: String(v.workspace_status), replayed: v.replayed };
}

/** HTTP failure -> typed error. Only a listed refusal is definite; anything else may have been applied. */
export function workspaceRecoveryFailure(error: unknown): WorkspaceRecoveryError {
  if (error instanceof WorkspaceRecoveryError) return error;
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  const code = response?.data?.code;
  if (typeof code === 'string' && codes.has(code)) {
    return new WorkspaceRecoveryError(code as WorkspaceRecoveryCode, code === 'RECOVERY_UNAVAILABLE' ? 'unknown' : 'rejected');
  }
  // The session guard in front of these routes answers with its own codes.
  if (response?.status === 401) return new WorkspaceRecoveryError('AUTH_REQUIRED', 'rejected');
  if (response?.status === 403) return new WorkspaceRecoveryError('RECOVERY_FORBIDDEN', 'rejected');
  if (response?.status === 404) return new WorkspaceRecoveryError('RECOVERY_NOT_FOUND', 'rejected');
  return new WorkspaceRecoveryError('RECOVERY_UNAVAILABLE', 'unknown');
}

export function createWorkspaceRecoveryClient(scope: WorkspaceReadScope,
  transport: Pick<typeof customApiClient, 'get' | 'post'> = customApiClient) {
  if (!isWorkspaceId(scope.workspaceId) || !isWorkspaceId(scope.conversationId) || !scope.courseId.trim()
    || scope.courseId.length > 255) throw new WorkspaceRecoveryError('RECOVERY_INPUT_INVALID', 'rejected');
  const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}/conversations/`
    + `${encodeURIComponent(scope.conversationId)}/workspaces/${encodeURIComponent(scope.workspaceId)}`;
  const config = (locale: WorkspaceLocale, signal?: AbortSignal): AxiosRequestConfig & { _retried: boolean } => {
    if (locale !== 'vi' && locale !== 'en') throw new WorkspaceRecoveryError('RECOVERY_INPUT_INVALID', 'rejected');
    return { _retried: true, params: { ui_locale: locale }, ...(signal ? { signal } : {}) };
  };
  async function post(path: string, body: Record<string, unknown>, action: WorkspaceRecoveryResult['action'],
    locale: WorkspaceLocale): Promise<WorkspaceRecoveryResult> {
    let data: { success?: unknown; data?: unknown } | undefined;
    try { ({ data } = await transport.post(`${base}${path}`, body, config(locale))); }
    catch (error) { throw workspaceRecoveryFailure(error); }
    // A 2xx the client cannot read may still have been applied: retry with the same operation id.
    try {
      if (data?.success !== true) invalid();
      return readResult(data.data, action);
    } catch { throw new WorkspaceRecoveryError('RECOVERY_UNAVAILABLE', 'unknown'); }
  }
  const command = (operationId: string, expectedWorkspaceRevision?: number) => {
    if (!isWorkspaceId(operationId) || expectedWorkspaceRevision !== undefined && !isWorkspaceSequence(expectedWorkspaceRevision)) {
      throw new WorkspaceRecoveryError('RECOVERY_INPUT_INVALID', 'rejected');
    }
    return expectedWorkspaceRevision === undefined ? { operation_id: operationId }
      : { operation_id: operationId, expected_workspace_revision: expectedWorkspaceRevision };
  };
  return {
    async describe(locale: WorkspaceLocale, signal?: AbortSignal): Promise<WorkspaceRecoveryView> {
      try {
        const { data } = await transport.get(`${base}/recovery`, config(locale, signal));
        if (data?.success !== true) invalid();
        return readWorkspaceRecoveryView(data.data);
      } catch (error) { throw workspaceRecoveryFailure(error); }
    },
    async stop(operationId: string, locale: WorkspaceLocale): Promise<WorkspaceRecoveryResult> {
      return post('/stop', command(operationId), 'stop', locale);
    },
    async resume(operationId: string, expectedWorkspaceRevision: number, locale: WorkspaceLocale): Promise<WorkspaceRecoveryResult> {
      return post('/resume', command(operationId, expectedWorkspaceRevision), 'resume', locale);
    },
    async regenerate(nodeId: string, operationId: string, expectedWorkspaceRevision: number,
      locale: WorkspaceLocale): Promise<WorkspaceRecoveryResult> {
      if (!isWorkspaceId(nodeId)) throw new WorkspaceRecoveryError('RECOVERY_INPUT_INVALID', 'rejected');
      return post(`/nodes/${encodeURIComponent(nodeId)}/regenerate`, command(operationId, expectedWorkspaceRevision),
        'regenerate', locale);
    },
  };
}
export type WorkspaceRecoveryClient = ReturnType<typeof createWorkspaceRecoveryClient>;
