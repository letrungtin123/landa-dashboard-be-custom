import type { WorkspaceContent, WorkspaceGraph, WorkspaceLocale, WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import { WorkspaceWriteError } from '../../api/workspace-write';
import type { WorkspaceApplyCode, WorkspaceApplyConflict } from '../../api/workspace-apply';
import type { createWorkspaceSession } from './workspace-session';

/** Course host copy and pure rules: overview auto-load, Apply scope and label,
 * the applied-revision overlay and the Save-then-Apply sequence. No React. */

export const workspaceCourseHostCopy = {
  en: { label: 'AI Instructional Design', title: 'AI Instructional Design · Course workspace', open: 'Open AI Instructional Design workspace', close: 'Close', loading: 'Loading the authorized workspace…',
    discovery_unavailable: 'Workspace discovery is not connected yet. The existing Lesson Author and document upload remain available.',
    no_workspace: 'No existing workspace is available for this course. Nothing has been created.',
    launch_invalid: 'The workspace response does not match this course. Access is blocked.',
    launch_changed: 'The server selected a different workspace. The previous local draft has been retained; reopen that workspace explicitly.',
    launch_failed: 'The workspace could not be opened. Check your access and try again.', retry: 'Check again', refresh: 'Reload saved state',
    overview: 'Load overview details', more: 'Load more overview details', readOnly: 'This workspace is currently read-only.',
    kept: 'Closing keeps local drafts in this page and does not stop generation. Leaving or reloading this page discards unsaved local drafts.',
    saved: 'The server confirmed this draft revision. It has not been applied to the course.', applied: 'The selected scope was added to the course draft. Publishing remains separate.',
    replay: 'Repeat the same unconfirmed operation', replayHint: 'Reload saved state first. Repeating uses the original operation ID and payload.',
    rebase: 'Keep my local edits against this saved revision', discard: 'Discard local edits', compare: 'Compare the saved content above with your local edits before choosing.',
    waiting: 'Waiting for an authorized detail read.', error: 'The action could not be completed. Reload saved state.', detail: 'Draft content', review: 'AI never adds content to the course by itself. A design is applied only after you review it.',
    readOnlyReview: 'AI design analysis for review.', appliedReview: 'This content has been added to the course and is now view-only.',
    editTitle: 'Edit name', aiInsight: 'AI design insight', sessions: 'Draft list', applying: 'Applying…' },
  vi: { label: 'AI Instructional Design', title: 'AI Instructional Design · Thiết kế khoá học', open: 'Mở bản thiết kế khoá học AI Instructional Design', close: 'Đóng', loading: 'Đang tải bản thiết kế khoá học được phép truy cập…',
    discovery_unavailable: 'Chưa kết nối API tìm bản thiết kế khoá học. Trợ lý soạn bài và tải tài liệu hiện tại vẫn sử dụng được.',
    no_workspace: 'Khóa học chưa có bản thiết kế khả dụng. Chưa tạo nội dung nào.',
    launch_invalid: 'Phản hồi bản thiết kế khoá học không khớp khóa học này. Truy cập đã bị chặn.',
    launch_changed: 'Máy chủ chọn bản thiết kế khoá học khác. Bản sửa cục bộ trước đó vẫn được giữ; hãy mở lại đúng bản thiết kế đó.',
    launch_failed: 'Chưa thể mở bản thiết kế khoá học. Kiểm tra quyền truy cập rồi thử lại.', retry: 'Kiểm tra lại', refresh: 'Tải lại trạng thái đã lưu',
    overview: 'Tải chi tiết tổng quan', more: 'Tải thêm chi tiết tổng quan', readOnly: 'Bản thiết kế khoá học hiện chỉ cho phép xem.',
    kept: 'Đóng vẫn giữ bản sửa cục bộ trong trang này và không dừng quá trình tạo nội dung. Rời hoặc tải lại trang sẽ mất bản sửa chưa lưu.',
    saved: 'Máy chủ đã xác nhận phiên bản bản thiết kế khoá học này. Chưa áp dụng vào khóa học.', applied: 'Đã đưa đúng phạm vi được chọn vào bản nháp khóa học. Xuất bản là thao tác riêng.',
    replay: 'Gửi lại đúng thao tác chưa xác nhận', replayHint: 'Tải lại trạng thái đã lưu trước. Gửi lại giữ nguyên mã thao tác và nội dung ban đầu.',
    rebase: 'Giữ bản sửa cục bộ trên phiên bản đã lưu này', discard: 'Bỏ bản sửa cục bộ', compare: 'So sánh nội dung đã lưu bên trên với bản sửa cục bộ trước khi chọn.',
    waiting: 'Đang chờ tải chi tiết có kiểm tra quyền.', error: 'Chưa thực hiện được thao tác. Hãy tải lại trạng thái đã lưu.', detail: 'Nội dung bản thiết kế khoá học', review: 'AI không tự đưa nội dung vào khoá học. Bản thiết kế chỉ được áp dụng sau khi bạn duyệt.',
    readOnlyReview: 'Phân tích thiết kế do AI đề xuất để bạn rà soát.', appliedReview: 'Nội dung này đã được đưa vào khóa học và hiện chỉ cho phép xem.',
    editTitle: 'Chỉnh sửa tên', aiInsight: 'Phân tích thiết kế AI', sessions: 'Danh sách bản thiết kế khoá học', applying: 'Đang áp dụng…' },
} as const;

/** Outcome of the last Apply shown in the node detail dialog. A running Apply
 * is the workspace flight (workspace-apply-flight.ts), which outlives the dialog. */
export type WorkspaceApplyUiState = 'idle' | 'done' | 'failed';
/** Edited or moved course parts the server listed for one Apply; replaced only after confirmation. */
export interface WorkspaceApplyConflictState { nodeId: string; code: WorkspaceApplyCode; conflict: WorkspaceApplyConflict }

export interface WorkspaceOverviewAutoLoadInput {
  open: boolean;
  workspaceId: string | null;
  sessionAvailable: boolean;
  loading: boolean;
  complete: boolean;
  writeBusy: boolean;
  hasError: boolean;
  readOpened: boolean;
  readAllowed: boolean;
  stale: boolean;
  overviewReady: boolean;
  structureReady: boolean;
  snapshotSequence: number | null;
  detailCount: number;
}

/** Returns one progress fingerprint for an authorized overview batch. The
 * caller records it before dispatch, so a failed/no-progress read cannot form
 * a render -> request -> error -> render hot loop. A new head or a larger
 * committed detail cache produces a new key and permits the next bounded
 * batch. */
export function workspaceOverviewAutoLoadAttempt(
  previousAttempt: string | null,
  input: WorkspaceOverviewAutoLoadInput,
): string | null {
  if (!input.open || !input.workspaceId || !input.sessionAvailable || input.loading || input.complete
    || input.writeBusy || input.hasError || !input.readOpened || !input.readAllowed || input.stale
    || !input.overviewReady || !input.structureReady || input.snapshotSequence == null) return null;
  const attempt = `${input.workspaceId}:${input.snapshotSequence}:${input.detailCount}`;
  return attempt === previousAttempt ? null : attempt;
}

const scopeApplyCopy = {
  en: {
    chapter: ['Apply entire chapter', 'Applying chapter…'], lesson: ['Apply entire section', 'Applying section…'],
    unit: ['Apply entire lesson', 'Applying lesson…'], component: ['Apply content', 'Applying content…'],
  },
  vi: {
    chapter: ['Áp dụng cả chương', 'Đang áp dụng cả chương…'], lesson: ['Áp dụng cả mục', 'Đang áp dụng cả mục…'],
    unit: ['Áp dụng cả bài học', 'Đang áp dụng cả bài học…'], component: ['Áp dụng nội dung', 'Đang áp dụng nội dung…'],
  },
} as const;
export function workspaceScopeApplyLabel(kind: WorkspaceNode['kind'], locale: WorkspaceLocale, busy = false): string {
  if (!['chapter', 'lesson', 'unit', 'component'].includes(kind)) return '';
  return scopeApplyCopy[locale][kind as 'chapter' | 'lesson' | 'unit' | 'component'][busy ? 1 : 0];
}

/** Browser-side scope discovery only. The server independently authorizes and
 * validates the exact selected hierarchy node; this helper never widens it. */
export function workspaceApplyScope(nodes: readonly WorkspaceNode[], selectedNodeId: string): WorkspaceNode | null {
  const selected = nodes.find(node => node.node_id === selectedNodeId);
  if (!selected) return null;
  return ['chapter', 'lesson', 'unit', 'component'].includes(selected.kind) ? selected : null;
}

export interface WorkspaceAppliedRevisionOverlay {
  workspaceId: string;
  revisions: Readonly<Record<string, number>>;
}

/** The committed Apply compiler materializes the selected subtree together
 * with its required hierarchy. Mirror that exact path rule only after the
 * POST has returned a durable receipt, and bind every optimistic flag to the
 * revision that was confirmed immediately before dispatch. */
export function workspaceAppliedScopeRevisions(nodes: readonly WorkspaceNode[], selectedNodeId: string): Record<string, number> {
  const selected = workspaceApplyScope(nodes, selectedNodeId);
  if (!selected?.canonical_path) return {};
  const within = (path: string, scope: string) => path === scope || path.startsWith(`${scope}.`);
  return Object.fromEntries(nodes.filter(node => node.kind !== 'course' && node.kind !== 'media_brief'
    && node.content_state === 'content_ready' && node.current_revision !== null
    && (within(node.canonical_path, selected.canonical_path) || within(selected.canonical_path, node.canonical_path)))
    .map(node => [node.node_id, node.current_revision!]));
}

/** Presentation-only reconciliation. The server graph remains authoritative;
 * a later revision can never inherit an older successful Apply flag. */
export function projectWorkspaceAppliedGraph(graph: WorkspaceGraph | null, overlay: WorkspaceAppliedRevisionOverlay | null): WorkspaceGraph | null {
  if (!graph || !overlay || overlay.workspaceId !== graph.workspace_id) return graph;
  let changed = false;
  const nodes = graph.nodes.map(node => {
    if (node.applied || node.current_revision === null || overlay.revisions[node.node_id] !== node.current_revision) return node;
    changed = true;
    return { ...node, applied: true };
  });
  return changed ? { ...graph, nodes } : graph;
}

export function workspaceNodeSupportsEditor(kind: WorkspaceNode['kind']): boolean {
  return kind === 'component';
}

export function workspaceNodeUsesHeaderTitleEditor(_kind: WorkspaceNode['kind']): boolean {
  return false;
}

export async function saveThenApplyWorkspaceScope(input: {
  session: Pick<ReturnType<typeof createWorkspaceSession>, 'getState' | 'setDraft' | 'save' | 'refreshForApply'>;
  selectedNodeId: string;
  draft?: WorkspaceContent;
  expectedRevision?: number;
  changed: boolean;
  assertCanWrite: () => void;
  apply: (scopeNodeId: string, expectedWorkspaceRevision: number) => Promise<void>;
}) {
  input.assertCanWrite();
  if (input.changed) {
    if (!input.draft || input.expectedRevision === undefined) throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID');
    input.session.setDraft(input.selectedNodeId, structuredClone(input.draft));
    await input.session.save(input.selectedNodeId, input.expectedRevision);
  }
  // Save/Reset/another Apply all advance the authoritative event head. Always
  // resnapshot immediately before Apply instead of reusing a visually current
  // but stale graph sequence from the modal.
  await input.session.refreshForApply();
  const confirmed = input.session.getState();
  const confirmedScope = workspaceApplyScope(confirmed.read.graph?.nodes ?? [], input.selectedNodeId);
  const confirmedWrite = confirmed.writes[input.selectedNodeId];
  if (!confirmedScope || confirmedScope.content_state !== 'content_ready' || !confirmed.read.status || !confirmed.read.graph
    || confirmed.read.stale || confirmed.writeBusy || confirmed.error
    || confirmed.read.status.last_event_sequence !== confirmed.read.graph.snapshot_sequence
    || input.changed && (confirmedWrite?.phase !== 'committed' || confirmedWrite.readRequired)) {
    throw new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED');
  }
  input.assertCanWrite();
  await input.apply(confirmedScope.node_id, confirmed.read.status.last_event_sequence);
  return confirmedScope;
}

/** Apply success belongs to the POST response: the applied nodes are marked at
 * once. The returned promise is the workspace reload, which the workspace's
 * Apply flight waits for (bounded) so the next Apply reads the new head. The
 * course refresh is independent background work and must never turn a
 * committed Apply into a visible failure. */
export function completeWorkspaceApplyUi(input: {
  markApplied: () => void;
  refreshWorkspace: () => Promise<void>;
  refreshCourse?: () => Promise<void> | void;
}): Promise<void> {
  input.markApplied();
  let workspace: Promise<void>;
  try { workspace = Promise.resolve(input.refreshWorkspace()); } catch (error) { workspace = Promise.reject(error); }
  if (input.refreshCourse) {
    try { void Promise.resolve(input.refreshCourse()).catch(() => undefined); } catch { /* Apply already committed; background refresh may retry later. */ }
  }
  return workspace;
}
