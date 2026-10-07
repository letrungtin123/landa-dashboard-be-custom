import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpenCheck, Eye, Network, Pencil, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { createWorkspaceReadClient } from '../../api/lesson-author-workspace';
import { createWorkspaceCreateClient } from '../../api/workspace-create';
import { workspaceSourceApi } from '../../api/workspace-sources';
import { createLessonAuthorUploadAttemptId } from '../../api/lesson-author-video-upload.logic';
import { createWorkspaceSourceState } from './workspace-source-state';
import { WorkspaceSourcePanel } from './workspace-source-panel';
import { WorkspaceSessionBrowser } from './workspace-session-browser';
import { listLessonAuthorSessions } from '../../api/workspace-sessions';
import { createWorkspaceWriteClient, WorkspaceWriteError, workspaceWriteMessage } from '../../api/workspace-write';
import { createWorkspaceApplyClient, workspaceApplyMessage, WorkspaceApplyError, type WorkspaceApplyCode } from '../../api/workspace-apply';
import { createWorkspaceStreamClient, type WorkspaceStreamState } from '../../api/workspace-stream';
import { createWorkspaceSourceStreamClient } from '../../api/workspace-source-stream';
import { fetchLessonAuthorChatSettings } from '../../api/custom-chat';
import { storageUrl } from '../../utils/storage-url';
import { workspaceReadMessage, type WorkspaceContent, type WorkspaceGraph, type WorkspaceLocale, type WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import { createWorkspaceSession } from './workspace-session';
import { WorkspaceDialogBody, WorkspaceNodeTypePill } from './workspace-dialog';
import { WorkspaceAuthorReviewCards, WorkspaceDetailContent, workspaceDetailStats } from './workspace-node-detail';
import { WorkspaceNodeEditor, updateWorkspaceEditorField } from './workspace-node-editor';
import { WorkspaceAiAvatar } from './workspace-ai-avatar';
import { createWorkspaceCourseHost, workspaceHostEnabled, workspaceHostKey,
  type WorkspaceLaunchContext, type WorkspaceLaunchResolver } from './workspace-host.logic';

/** Optional authorized launch adapter. Default is the actor-owned latest GET;
 * a missing/disabled backend fails closed and never triggers Create. */
const LaunchContext = createContext<WorkspaceLaunchResolver | undefined>(undefined);
// Export the actual context provider used by the hook, without global mutable IDs.
export const CourseWorkspaceLaunchProvider = LaunchContext.Provider;
const sessionIndex: WorkspaceLaunchResolver = async () => null;
const copy = {
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
    waiting: 'Waiting for an authorized detail read.', error: 'The action could not be completed. Reload saved state.', detail: 'Draft content', review: 'Review and edit committed draft content. Publishing remains separate.',
    readOnlyReview: 'AI design analysis for review.', appliedReview: 'This content has been added to the course and is now view-only.',
    editTitle: 'Edit name', aiInsight: 'AI design insight', sessions: 'Draft list' },
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
    waiting: 'Đang chờ tải chi tiết có kiểm tra quyền.', error: 'Chưa thực hiện được thao tác. Hãy tải lại trạng thái đã lưu.', detail: 'Nội dung bản thiết kế khoá học', review: 'Duyệt và sửa nội dung bản thiết kế khoá học đã ghi nhận. Xuất bản là thao tác riêng.',
    readOnlyReview: 'Phân tích thiết kế do AI đề xuất để bạn rà soát.', appliedReview: 'Nội dung này đã được đưa vào khóa học và hiện chỉ cho phép xem.',
    editTitle: 'Chỉnh sửa tên', aiInsight: 'Phân tích thiết kế AI', sessions: 'Danh sách bản thiết kế khoá học' },
} as const;
type Host = ReturnType<typeof createWorkspaceCourseHost>;
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
const realtimeEnabled = workspaceHostEnabled(import.meta.env.VITE_LESSON_AUTHOR_WORKSPACE_STREAM_ENABLED);

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

/** Apply success belongs to the POST response. Course/workspace refreshes are
 * independent reconciliation work and must never keep the modal button busy or
 * turn a committed Apply into a visible failure. */
export function completeWorkspaceApplyUi(input: {
  markApplied: () => void;
  refreshWorkspace: () => Promise<void>;
  refreshCourse?: () => Promise<void> | void;
}) {
  input.markApplied();
  for (const refresh of [input.refreshWorkspace, input.refreshCourse].filter(Boolean) as Array<() => Promise<void> | void>) {
    try { void Promise.resolve(refresh()).catch(() => undefined); } catch { /* Apply already committed; background refresh may retry later. */ }
  }
}

/** Called once by Course Editor. Both responsive triggers share this controller.
 * Exact string flag only; absent/false never creates a controller or API call. */
export function useCourseWorkspaceHost(courseId: string | undefined, ready: boolean,
  launchResolver?: WorkspaceLaunchResolver, onCourseApplied?: () => Promise<void> | void) {
  const { i18n } = useTranslation();
  const locale: WorkspaceLocale = /^en(?:[-_]|$)/i.test(i18n.language) ? 'en' : 'vi';
  const user = useAuthStore(s => s.user);
  const authenticated = useAuthStore(s => s.isAuthenticated && !s.isLoggingOut);
  const permitted = useAuthStore(s => s.hasPermission('courses', 'can_edit'));
  const activeTenant = useTenantStore(s => s.activeTenantId);
  const tenantId = user?.role === 'superadmin' ? activeTenant : user?.tenant_id;
  const provided = useContext(LaunchContext), resolver = launchResolver ?? provided ?? sessionIndex;
  const enabled = workspaceHostEnabled(import.meta.env.VITE_LESSON_AUTHOR_WORKSPACE_ENABLED);
  const eligible = enabled && ready && authenticated && permitted && !!courseId && !!tenantId
    && !!user && ['staff', 'superuser', 'superadmin'].includes(user.role);
  const key = workspaceHostKey({ actorId: user?.id ?? '', tenantId: tenantId ?? '', courseId: courseId ?? '' });
  const [host, setHost] = useState<Host | null>(null);
  const [sources, setSources] = useState<ReturnType<typeof createWorkspaceSourceState> | null>(null);
  const onCourseAppliedRef = useRef(onCourseApplied);
  useEffect(() => { onCourseAppliedRef.current = onCourseApplied; }, [onCourseApplied]);
  useEffect(() => {
    if (!eligible || !user || !tenantId || !courseId) { setHost(null); setSources(null); return; }
    const scope = { actorId: user.id, tenantId, courseId };
    const authorized = () => {
      const auth = useAuthStore.getState();
      const currentTenant = auth.user?.role === 'superadmin' ? useTenantStore.getState().activeTenantId : auth.user?.tenant_id;
      return auth.isAuthenticated && !auth.isLoggingOut && auth.user?.id === scope.actorId && currentTenant === scope.tenantId
        && auth.hasPermission('courses', 'can_edit');
    };
    const controller = createWorkspaceCourseHost(scope, {
      enabled: true, authorized: true, locale, resolve: resolver,
      createSession: (identity, canWrite) => {
        const writes = createWorkspaceWriteClient(identity);
        const assertWriteScope = () => {
          // Check live auth as well as effect cleanup: an old event handler must
          // never dispatch under newly switched actor/tenant credentials.
          const auth = useAuthStore.getState();
          const tenant = auth.user?.role === 'superadmin' ? useTenantStore.getState().activeTenantId : auth.user?.tenant_id;
          if (!canWrite() || !auth.isAuthenticated || auth.isLoggingOut || auth.user?.id !== identity.actorId
            || tenant !== identity.tenantId || !auth.hasPermission('courses', 'can_edit')) throw new WorkspaceWriteError('WORKSPACE_EDIT_FORBIDDEN');
        };
        return createWorkspaceSession(identity, { uiLocale: locale, readClient: createWorkspaceReadClient(identity), eventDriven: realtimeEnabled,
          writeClient: {
            save: (...args) => { assertWriteScope(); return writes.save(...args); },
            reset: (...args) => { assertWriteScope(); return writes.reset(...args); },
          } });
      },
    });
    const sourceController = createWorkspaceSourceState(scope, {
      api: workspaceSourceApi, create: createWorkspaceCreateClient(scope), authorized,
      visible: () => controller.getState().open && controller.getState().issue === 'no_workspace' && !controller.getState().launch && !controller.getState().loading,
      canUpload: () => authorized() && useAuthStore.getState().hasPermission('ai_chatbot', 'can_view') && useAuthStore.getState().hasPermission('ai_chatbot', 'can_add'),
      operationId: createLessonAuthorUploadAttemptId, locale, onCreated: value => controller.acceptCreated(value),
      stream: createWorkspaceSourceStreamClient,
    });
    setHost(controller);
    setSources(sourceController);
    return () => { sourceController.dispose(); controller.dispose(); };
    // Locale changes update the same session below; they never discard drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, key, resolver]);
  useEffect(() => { host?.setUiLocale(locale); }, [host, locale]);
  useEffect(() => { sources?.setUiLocale(locale); }, [sources, locale]);
  useEffect(() => {
    if (!host) return;
    const visibility = () => host.setVisible(document.visibilityState !== 'hidden');
    visibility(); document.addEventListener('visibilitychange', visibility);
    const unloading = (event: BeforeUnloadEvent) => {
      const state = host.getState().workspace;
      if (sources?.getState().busy || sources?.getState().unknown || state && (Object.keys(state.drafts).length || state.writeBusy || Object.values(state.writes).some(w => w.phase === 'unknown'))) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unloading);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('beforeunload', unloading); };
  }, [host, sources]);
  // Do not subscribe CourseEditor itself to workspace progress. The editor can
  // contain a large outline and unit form; only the modal mount below observes
  // workspace state. This synchronous identity read cannot schedule work.
  const current = eligible && host && host.getState().scopeKey === key ? host : null;
  return {
    trigger: current ? <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" aria-label={copy[locale].open}
      onClick={() => { void current.launch(); }}><Sparkles className="h-4 w-4" aria-hidden />{copy[locale].label}</Button> : null,
    overlay: current ? <WorkspaceCourseHostOverlayMount host={current} courseId={courseId!} locale={locale} sources={sources}
      onCourseApplied={() => onCourseAppliedRef.current?.()} /> : null,
  };
}

function WorkspaceCourseHostOverlayMount({ host, courseId, locale, sources, onCourseApplied }: { host: Host; courseId: string; locale: WorkspaceLocale;
  sources: ReturnType<typeof createWorkspaceSourceState> | null; onCourseApplied?: () => Promise<void> | void }) {
  const state = useSyncExternalStore(host.subscribe, host.getState, emptySnapshot);
  return state ? <WorkspaceCourseHostOverlay host={host} courseId={courseId} state={state} locale={locale} sources={sources}
    onCourseApplied={onCourseApplied} /> : null;
}

/** Exactly one Fetch/SSE connection for the open authorized workspace. The
 * bridge only gives the session committed sequence hints; it cannot write,
 * generate, replay commands, or accept content on behalf of the server. */
function useWorkspaceRealtimeBridge({ host, session, launch, locale, open }: {
  host: Host;
  session: ReturnType<Host['getSession']>;
  launch: Readonly<WorkspaceLaunchContext> | null;
  locale: WorkspaceLocale;
  open: boolean;
}) {
  useEffect(() => {
    if (!realtimeEnabled || !open || !launch || !session) return;
    const stream = createWorkspaceStreamClient({ courseId: launch.course_id, conversationId: launch.conversation_id,
      workspaceId: launch.workspace_id, locale }, {
      active: () => host.getState().open && host.getState().launch?.workspace_id === launch.workspace_id && host.getSession() === session,
      onEvent: event => { void session.notifyCommittedEvent(event.sequence).catch(() => undefined); },
      onState: (next: WorkspaceStreamState) => session.setDeliveryState(next),
      onFault: () => session.setDeliveryState('unavailable'),
    });
    stream.start();
    return () => stream.close();
  }, [host, launch, locale, open, session]);
}

/** A single Portal/focus-trap/scroll-lock for every state of an AI Instructional Design open.
 * Do not replace this shell while discovery turns into source selection or a
 * workspace begins producing committed nodes. */
function WorkspaceModalShell({ host, children }: { host: Host; children: ReactNode }) {
  return <Dialog open onOpenChange={open => { if (!open) host.close(); }}>
    <DialogContent showCloseButton={false} onOpenAutoFocus={event => event.preventDefault()}
      overlayClassName="z-[10040]"
      className="z-[10050] flex h-[100dvh] w-screen max-h-none max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-2xl">
      {children}
    </DialogContent>
  </Dialog>;
}

export function WorkspaceCourseHostOverlay({ host, courseId, state, locale, sources, onCourseApplied }: { host: Host; courseId: string; state: ReturnType<Host['getState']>; locale: WorkspaceLocale;
  sources?: ReturnType<typeof createWorkspaceSourceState> | null; onCourseApplied?: () => Promise<void> | void }) {
  const c = copy[locale], session = host.getSession(), workspace = state.workspace;
  const [actionError, setActionError] = useState(false);
  // Normal product entry has no selected launch and therefore starts at the
  // session index. A pre-resolved host (embedded recovery/tests) may render its
  // already-authorized workspace directly without a one-frame session flash.
  const [view, setView] = useState<'sessions' | 'source' | 'workspace'>(() => state.launch || state.issue ? 'workspace' : 'sessions');
  const [applyState, setApplyState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [applyError, setApplyError] = useState<WorkspaceApplyCode | null>(null);
  const [editingTitleNodeId, setEditingTitleNodeId] = useState<string | null>(null);
  const [appliedOverlay, setAppliedOverlay] = useState<WorkspaceAppliedRevisionOverlay | null>(null);
  const [assistantAvatarSrc, setAssistantAvatarSrc] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<{ id: string; title: string } | null>(null);
  const titleLookupRef = useRef<string | null>(null);
  const overviewAttemptRef = useRef<string | null>(null);
  const sourceState = useSyncExternalStore(sources?.subscribe ?? emptySubscribe, sources?.getState ?? emptySnapshot, emptySnapshot);
  useWorkspaceRealtimeBridge({ host, session, launch: state.launch, locale, open: state.open && view === 'workspace' });
  useEffect(() => {
    if (!state.open) return;
    let active = true;
    void fetchLessonAuthorChatSettings().then(settings => {
      if (!active) return;
      const avatar = settings.active_persona?.persona_avatar_url || settings.active_bot?.bot_avatar_url;
      setAssistantAvatarSrc(avatar ? storageUrl(avatar) : null);
    }).catch(() => { if (active) setAssistantAvatarSrc(null); });
    return () => { active = false; };
  }, [state.open]);
  useEffect(() => { if (!state.open) { setView('sessions'); setActiveConversation(null); titleLookupRef.current = null; } }, [state.open]);
  useEffect(() => {
    const workspaceId = state.launch?.workspace_id ?? null;
    setAppliedOverlay(current => current && current.workspaceId !== workspaceId ? null : current);
  }, [state.launch?.workspace_id]);
  useEffect(() => { if (state.launch && view === 'source') setView('workspace'); }, [state.launch, view]);
  useEffect(() => {
    const conversation = sourceState?.conversation;
    if (conversation?.id && conversation.title?.trim()) setActiveConversation({ id: conversation.id, title: conversation.title.trim() });
  }, [sourceState?.conversation]);
  useEffect(() => {
    const conversationId = state.launch?.conversation_id;
    if (!state.open || !conversationId || activeConversation?.id === conversationId || titleLookupRef.current === conversationId) return;
    titleLookupRef.current = conversationId;
    const abort = new AbortController();
    void listLessonAuthorSessions(courseId, locale, abort.signal).then(result => {
      const match = result.items.find(item => item.conversation_id === conversationId);
      if (match) setActiveConversation({ id: conversationId, title: match.title });
    }).catch(() => undefined).finally(() => { if (titleLookupRef.current === conversationId) titleLookupRef.current = null; });
    return () => abort.abort();
  }, [activeConversation?.id, courseId, locale, state.launch?.conversation_id, state.open]);
  const act = (work: () => unknown) => { setActionError(false); try { void Promise.resolve(work()).catch(() => setActionError(true)); } catch { setActionError(true); } };
  const refreshWorkspace = () => {
    // A failed/incomplete detail batch may be explicitly retried. A healthy
    // terminal workspace keeps its exact-revision overview cache, preventing
    // the refresh button from reissuing every course/chapter detail request.
    if (workspace?.error && !workspace.overview.complete) overviewAttemptRef.current = null;
    return session?.refresh();
  };
  useEffect(() => {
    if (!state.open) { overviewAttemptRef.current = null; return; }
    const attempt = workspaceOverviewAutoLoadAttempt(overviewAttemptRef.current, {
      open: state.open,
      workspaceId: state.launch?.workspace_id ?? null,
      sessionAvailable: !!session,
      loading: workspace?.overview.loading ?? false,
      complete: workspace?.overview.complete ?? false,
      writeBusy: workspace?.writeBusy ?? false,
      hasError: !!workspace?.error,
      readOpened: workspace?.read.opened ?? false,
      readAllowed: workspace?.read.access === 'allowed',
      stale: workspace?.read.stale ?? true,
      overviewReady: workspace?.read.graph?.overview_ready ?? false,
      structureReady: workspace?.read.graph?.structure_ready ?? false,
      snapshotSequence: workspace?.read.graph?.snapshot_sequence ?? null,
      detailCount: workspace?.overview.details.length ?? 0,
    });
    if (!attempt || !session) return;
    overviewAttemptRef.current = attempt;
    void session.loadOverview().catch(() => undefined);
  }, [session, state.open, state.launch?.workspace_id, workspace?.error, workspace?.overview.complete,
    workspace?.overview.loading, workspace?.overview.details.length, workspace?.read.graph?.snapshot_sequence,
    workspace?.read.graph?.overview_ready, workspace?.read.graph?.structure_ready, workspace?.read.opened,
    workspace?.read.access, workspace?.read.stale, workspace?.writeBusy]);
  const authoritativeRead = workspace?.read ?? null;
  const presentationRead = useMemo(() => {
    if (!authoritativeRead) return null;
    const graph = projectWorkspaceAppliedGraph(authoritativeRead.graph, appliedOverlay);
    return graph === authoritativeRead.graph ? authoritativeRead : { ...authoritativeRead, graph };
  }, [authoritativeRead, appliedOverlay]);
  if (!state.open) return null;
  if (!state.loading && view === 'sessions') return <WorkspaceModalShell host={host}><WorkspaceSessionBrowser
    courseId={courseId} locale={locale} assistantAvatarSrc={assistantAvatarSrc}
    onClose={() => host.close()}
    onOpen={async (launch, title) => { setActionError(false); setActiveConversation({ id: launch.conversation_id, title }); try { await host.acceptCreated(launch); setView('workspace'); } catch { setActionError(true); } }}
    onSource={(conversationId, title) => {
      setActionError(false);
      if (!sources || !host.clearSelection()) { setActionError(true); return; }
      setActiveConversation(conversationId && title ? { id: conversationId, title } : null);
      if (conversationId) sources.resumeSession(conversationId); else sources.beginNewSession();
      setView('source');
    }} /></WorkspaceModalShell>;
  if (!session || !workspace || state.loading || state.issue) return <WorkspaceModalShell host={host}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16, ease: 'easeOut' }} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b bg-card px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex min-w-0 items-start gap-3"><WorkspaceAiAvatar src={assistantAvatarSrc} compact /><div className="min-w-0"><DialogTitle className="text-base font-semibold">{c.title}</DialogTitle><DialogDescription className="mt-1 line-clamp-2">{state.issue === 'no_workspace' ? c.review : c[state.issue ?? 'launch_failed']}</DialogDescription></div></div>
          <div className="flex shrink-0 gap-2">{view === 'source' && <Button type="button" variant="outline" size="sm" onClick={() => setView('sessions')}>{c.sessions}</Button>}<Button type="button" variant="outline" size="sm" onClick={() => host.close()}>{c.close}</Button></div>
        </header>
        {state.loading && <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden px-4 py-5 sm:px-5 lg:grid-cols-[1.45fr_0.8fr]" role="status"><div className="animate-pulse space-y-4 rounded-lg border border-border/70 bg-card p-5"><div className="h-5 w-2/5 rounded bg-muted" /><div className="h-16 rounded-lg bg-muted" /><div className="space-y-2"><div className="h-12 rounded-lg bg-muted" /><div className="h-12 rounded-lg bg-muted" /><div className="h-12 rounded-lg bg-muted" /></div></div><div className="hidden animate-pulse rounded-lg border border-border/70 bg-muted/20 p-5 lg:block"><div className="h-4 w-1/2 rounded bg-muted" /><div className="mt-4 h-24 rounded-lg bg-muted" /></div></div>}
        {!state.loading && state.issue === 'no_workspace' && !state.launch && sources && <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto px-4 py-5 sm:px-5 lg:grid-cols-[1.45fr_0.8fr]"><WorkspaceSourcePanel controller={sources} locale={locale} /><aside className="hidden rounded-lg border border-border/70 bg-muted/20 p-5 lg:block"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">AI Instructional Design</p><h3 className="mt-3 text-lg font-semibold">{locale === 'vi' ? 'Bản thiết kế khoá học có kiểm soát' : 'A controlled course draft'}</h3><ol className="mt-6 space-y-4 text-sm text-muted-foreground"><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>{locale === 'vi' ? 'Chọn đúng một tài liệu nguồn đã sẵn sàng.' : 'Choose one ready source document.'}</li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>{locale === 'vi' ? 'Tạo bản thiết kế khoá học và theo dõi tiến độ trong Tổng quan, Mindmap.' : 'Create the draft and follow its Overview and Mindmap progress.'}</li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>{locale === 'vi' ? 'Duyệt, sửa và Áp dụng theo phạm vi khi nội dung sẵn sàng.' : 'Review, edit and apply only ready scopes.'}</li></ol></aside></div>}
        {!state.loading && state.issue !== 'no_workspace' && <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5 text-center"><p role="status" className="max-w-lg text-sm text-muted-foreground">{c[state.issue ?? 'launch_failed']}</p><Button type="button" disabled={sourceState?.busy} onClick={() => { void host.launch(); }}>{c.retry}</Button></div>}
      </motion.div>
  </WorkspaceModalShell>;
  const failure = workspace.error;
  // A transient snapshot-head race is recovered by the reader itself. Do not
  // turn that internal consistency mechanism into a no-tech user warning or a
  // redundant toolbar row while the bounded recovery is in progress.
  const presentableFailure = failure?.code === 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED' ? null : failure;
  const message = presentableFailure ? presentableFailure instanceof WorkspaceWriteError
    ? workspaceWriteMessage(presentableFailure.code, locale) : workspaceReadMessage(presentableFailure.code, locale) : null;
  const toolbar = (!state.launch?.can_edit || message || actionError) ? <div className="space-y-2 text-sm">
    {(message || actionError) && <Button type="button" variant="outline" size="sm" disabled={workspace.read.busy || workspace.writeBusy} onClick={() => act(refreshWorkspace)}>{c.refresh}</Button>}
    {!state.launch?.can_edit && <p role="status">{c.readOnly}</p>}
    {message && <p role="alert">{message}</p>}{actionError && <p role="alert">{c.error}</p>}
  </div> : undefined;
  const renderDetail = (node: WorkspaceNode | null) => {
    if (!node) return null;
    const editor = session.editorProps(node.node_id), write = workspace.writes[node.node_id];
    const detail = editor.access === 'allowed' ? editor.detail : null;
    const stats = presentationRead?.graph ? workspaceDetailStats(node, presentationRead.graph.nodes) : undefined;
    const editorCapable = host.canWrite() && !!detail && workspaceNodeSupportsEditor(detail.kind)
      && detail.content_state === 'content_ready' && detail.current_revision !== null;
    const hierarchyTitle = !!detail && workspaceNodeUsesHeaderTitleEditor(detail.kind);
    // The graph marks an exact revision/hash as applied. The local done state
    // closes the write window immediately, before the background read catches up.
    const appliedReadOnly = node.applied || applyState === 'done';
    const applyScope = workspaceApplyScope(presentationRead?.graph?.nodes ?? [], node.node_id);
    const canApply = host.canWrite() && !!detail && !!applyScope && applyScope.content_state === 'content_ready'
      && !appliedReadOnly && !!state.launch && !!workspace.read.status && !workspace.read.stale && !workspace.writeBusy;
    const apply = async (draft?: NonNullable<typeof editor.draft>, expectedRevision?: number, changed = false) => {
      if (!canApply || !state.launch || !workspace.read.status || !applyScope) return;
      setActionError(false); setApplyError(null); setApplyState('busy');
      try {
        const client = createWorkspaceApplyClient({ courseId: state.launch.course_id, conversationId: state.launch.conversation_id, workspaceId: state.launch.workspace_id });
        const confirmedScope = await saveThenApplyWorkspaceScope({ session, selectedNodeId: node.node_id, draft, expectedRevision, changed,
          assertCanWrite: () => host.assertCanWrite(),
          apply: async (scopeNodeId, sequence) => { await client(scopeNodeId, crypto.randomUUID(), sequence, locale); } });
        const confirmedGraph = session.getState().read.graph;
        const confirmedRevisions = workspaceAppliedScopeRevisions(confirmedGraph?.nodes ?? [], confirmedScope.node_id);
        completeWorkspaceApplyUi({ markApplied: () => {
          setAppliedOverlay(current => ({ workspaceId: state.launch!.workspace_id,
            revisions: { ...(current?.workspaceId === state.launch!.workspace_id ? current.revisions : {}), ...confirmedRevisions } }));
          setApplyState('done');
        },
          refreshWorkspace: () => session.refreshForApply(), refreshCourse: onCourseApplied });
      } catch (error) {
        if (error instanceof WorkspaceApplyError) { setApplyError(error.code); setApplyState('failed'); }
        else { setActionError(true); setApplyState('failed'); }
      }
    };
    const readOnlyDetail = !!detail && !workspaceNodeSupportsEditor(detail.kind);
    const DetailIcon = detail?.component_type === 'la_diagram' ? Network : readOnlyDetail ? Eye : BookOpenCheck;
    const editingTitle = hierarchyTitle && editingTitleNodeId === node.node_id && !appliedReadOnly && !!editor.draft;
    const visibleTitle = hierarchyTitle && editor.draft?.title ? editor.draft.title : detail?.content?.title ?? c.detail;
    return <Dialog open onOpenChange={open => { if (!open) { setApplyState('idle'); setEditingTitleNodeId(null); act(() => session.selectNode(null)); } }}>
      <DialogContent showCloseButton={false} overlayClassName="z-[10060]"
        onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
        className={`z-[10070] flex h-[calc(100dvh-2rem)] max-h-none flex-col overflow-hidden rounded-2xl border-border/70 bg-background p-0 shadow-[0_30px_100px_-24px_rgba(2,6,23,0.75)] duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none ${detail?.component_type === 'la_diagram' ? 'w-[calc(100vw-2rem)] max-w-none' : detail?.kind === 'component' ? 'w-[calc(100vw-1rem)] max-w-[min(96vw,90rem)]' : 'w-[calc(100vw-1rem)] max-w-5xl'}`}>
        <div className="relative flex shrink-0 items-start justify-between gap-4 overflow-hidden border-b border-border/70 bg-gradient-to-r from-primary/[0.08] via-card to-card px-5 py-4 sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -left-12 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex min-w-0 items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm"><DetailIcon className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2">
              {editingTitle ? <><DialogTitle className="sr-only">{visibleTitle}</DialogTitle><Input autoFocus aria-label={c.editTitle}
                className="h-9 min-w-[16rem] flex-1 bg-background/90 text-base font-bold sm:min-w-[24rem] sm:text-lg" value={editor.draft!.title}
                maxLength={500} lang={detail!.content_locale} onChange={event => {
                  const next = updateWorkspaceEditorField(detail!, editor.draft!, 0, event.target.value);
                  if (next) { setApplyState('idle'); act(() => { host.assertCanWrite(); editor.onChange(next); }); }
                }} /></> : <DialogTitle className="max-w-full truncate text-base font-bold tracking-tight sm:text-lg">{visibleTitle}</DialogTitle>}
              {hierarchyTitle && !appliedReadOnly && editor.draft && !editingTitle && <Button type="button" variant="ghost" size="icon"
                className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-primary" aria-label={c.editTitle}
                onClick={() => setEditingTitleNodeId(node.node_id)}><Pencil className="h-3.5 w-3.5" aria-hidden /></Button>}
              <WorkspaceNodeTypePill node={node} locale={locale} />
            </div><DialogDescription className="mt-1.5 max-w-3xl text-xs leading-5 sm:text-sm">{appliedReadOnly ? c.appliedReview : readOnlyDetail ? c.readOnlyReview : c.review}</DialogDescription></div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 rounded-xl border border-border/70 bg-background/70 shadow-sm backdrop-blur transition-transform hover:scale-105" aria-label={c.close}
            onClick={() => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => session.selectNode(null)); }}><X className="h-4 w-4" /><span className="sr-only">{c.close}</span></Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!detail && <div className="min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-muted/30 to-background px-4 py-5 sm:px-6" role="status" aria-label={c.waiting}>
            <div className="mx-auto max-w-5xl animate-pulse space-y-4" aria-hidden>
              <div className="grid gap-3 md:grid-cols-2"><div className="h-28 rounded-2xl border border-border/60 bg-card/80" /><div className="h-28 rounded-2xl border border-border/60 bg-card/80" /></div>
              <div className="h-48 rounded-2xl border border-border/60 bg-card/80 p-5"><div className="h-3 w-1/4 rounded bg-muted" /><div className="mt-5 h-3 w-full rounded bg-muted/80" /><div className="mt-3 h-3 w-11/12 rounded bg-muted/70" /><div className="mt-3 h-3 w-3/4 rounded bg-muted/60" /></div>
            </div><span className="sr-only">{c.waiting}</span>
          </div>}
          {detail && !editorCapable && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
            className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-muted/30 to-background px-4 py-4 sm:px-6 sm:py-6"><div className="mx-auto max-w-5xl"><WorkspaceDetailContent detail={detail} locale={locale} stats={stats} /></div></motion.div>}
          {detail && !editorCapable && canApply && <div className="flex shrink-0 justify-end border-t border-border/70 bg-card/95 px-5 py-4 shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl">
            <Button type="button" className="h-10 gap-2 rounded-xl px-5 shadow-md shadow-primary/20" disabled={applyState === 'busy'} onClick={() => { void apply(); }}>
              <Sparkles className="h-4 w-4" />{workspaceScopeApplyLabel(node.kind, locale, applyState === 'busy')}
            </Button>
          </div>}
          {editorCapable && <WorkspaceNodeEditor {...editor}
            onChange={value => { setApplyState('idle'); act(() => { host.assertCanWrite(); editor.onChange(value); }); }}
            onSave={(value, revision) => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => { host.assertCanWrite(); editor.onSave(value, revision); }); }}
            onReset={revision => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => { host.assertCanWrite(); editor.onReset(revision); }); }}
            onApply={applyScope ? (value, revision, changed) => { setEditingTitleNodeId(null); void apply(value, revision, changed); } : undefined}
            applyLabel={workspaceScopeApplyLabel(node.kind, locale)} applyingLabel={workspaceScopeApplyLabel(node.kind, locale, true)}
            applyBusy={applyState === 'busy'} applyDisabled={!canApply} readOnly={appliedReadOnly}
            titleInHeader={hierarchyTitle} reviewContent={hierarchyTitle
              ? <WorkspaceDetailContent detail={detail!} locale={locale} stats={stats} />
              : detail?.kind === 'component' ? <WorkspaceAuthorReviewCards detail={detail} locale={locale} /> : undefined} />}
          {editorCapable && !appliedReadOnly && editor.conflict && write?.phase !== 'unknown' && !workspace.writeBusy && !write?.readRequired && detail.current_revision !== null && <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p>{c.compare}</p><Button type="button" variant="outline" onClick={() => act(() => session.rebaseDraft(node.node_id, detail.current_revision!))}>{c.rebase}</Button>
            <Button type="button" variant="outline" onClick={() => act(() => session.discardDraft(node.node_id))}>{c.discard}</Button></div>}
          {editorCapable && !appliedReadOnly && write?.phase === 'unknown' && <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p>{c.replayHint}</p>
            <Button type="button" disabled={write.readRequired || workspace.writeBusy} onClick={() => act(() => session.replay(node.node_id))}>{c.replay}</Button></div>}
          {(write?.phase === 'committed' || applyState === 'done' || applyState === 'failed') && <div
            className={`pointer-events-none absolute right-5 top-[5.25rem] z-30 max-w-md rounded-xl border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-xl ${applyState === 'failed' ? 'border-destructive/35 text-destructive' : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'}`}
            role={applyState === 'failed' ? 'alert' : 'status'}>
            {applyState === 'failed' ? (applyError ? workspaceApplyMessage(applyError, locale) : c.error)
              : applyState === 'done' ? c.applied : c.saved}
          </div>}
          {(message || actionError) && <div className="mx-5 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><p role="alert">{message ?? c.error}</p><Button type="button" variant="outline" size="sm" disabled={workspace.read.busy || workspace.writeBusy} onClick={() => act(refreshWorkspace)}>{c.refresh}</Button></div>}
        </div>
      </DialogContent>
    </Dialog>;
  };
  return <WorkspaceModalShell host={host}><WorkspaceDialogBody open={state.open} onOpenChange={open => { if (!open) host.close(); }} state={presentationRead!} locale={locale}
    onSelectNode={nodeId => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => session.selectNode(nodeId)); }} overviewDetails={workspace.overview.details} toolbar={toolbar} renderNodeDetail={renderDetail}
    assistantAvatarSrc={assistantAvatarSrc}
    draftTitle={state.launch && activeConversation?.id === state.launch.conversation_id ? activeConversation.title : null}
    onRefresh={() => act(refreshWorkspace)} /></WorkspaceModalShell>;
}
