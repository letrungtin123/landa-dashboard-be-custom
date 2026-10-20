import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { createWorkspaceReadClient } from '../../api/lesson-author-workspace';
import { createWorkspaceCreateClient } from '../../api/workspace-create';
import { workspaceSourceApi } from '../../api/workspace-sources';
import { createLessonAuthorUploadAttemptId } from '../../api/lesson-author-video-upload.logic';
import { secureRandomUuid } from '../../utils/random-uuid';
import { createWorkspaceSourceState } from './workspace-source-state';
import { WorkspaceSourcePanel } from './workspace-source-panel';
import { WorkspaceLaunchBriefPanel, WorkspaceLaunchBriefSummary } from './workspace-launch-brief-panel';
import { WorkspaceLaunchTabs } from './workspace-launch-tabs';
import { workspaceSessionLaunchBrief } from './workspace-launch-brief.logic';
import { WorkspaceSessionBrowser } from './workspace-session-browser';
import { listLessonAuthorSessions, type LessonAuthorActiveRun } from '../../api/workspace-sessions';
import { useLessonAuthorActiveRuns } from '@/hooks/queries/use-lesson-author-sessions';
import { WorkspaceActiveRunNotice } from './workspace-active-run-banner';
import { WorkspaceReviewPanel } from './workspace-review-panel';
import { workspaceReviewRequired } from './workspace-review.logic';
import { workspaceActiveRunNotice, workspaceReadOnlyNotice } from './workspace-sharing';
import { createWorkspaceWriteClient, WorkspaceWriteError, workspaceWriteMessage } from '../../api/workspace-write';
import type { WorkspaceApplyError } from '../../api/workspace-apply';
import { createWorkspaceStreamClient, type WorkspaceStreamState } from '../../api/workspace-stream';
import { createWorkspaceSourceStreamClient } from '../../api/workspace-source-stream';
import { fetchLessonAuthorChatSettings } from '../../api/custom-chat';
import { storageUrl } from '../../utils/storage-url';
import { workspaceReadMessage, type WorkspaceLocale, type WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import { createWorkspaceSession } from './workspace-session';
import { WorkspaceDialogBody } from './workspace-dialog';
import { WorkspaceAiAvatar } from './workspace-ai-avatar';
import type { WorkspaceLaunchContext, WorkspaceLaunchResolver } from '../../api/workspace-launch.contract';
import { createWorkspaceCourseHost, workspaceHostEnabled, workspaceHostKey } from './workspace-host.logic';
import { useWorkspaceRecovery } from './workspace-recovery-controls';
import {
  projectWorkspaceAppliedGraph, workspaceCourseHostCopy, workspaceOverviewAutoLoadAttempt,
  type WorkspaceAppliedRevisionOverlay, type WorkspaceApplyConflictState, type WorkspaceApplyUiState,
} from './workspace-course-host.logic';
import { WorkspaceCourseNodeDialog } from './workspace-course-node-dialog';

/** Optional authorized launch adapter. Default is the actor-owned latest GET;
 * a missing/disabled backend fails closed and never triggers Create. */
const LaunchContext = createContext<WorkspaceLaunchResolver | undefined>(undefined);
// Export the actual context provider used by the hook, without global mutable IDs.
export const CourseWorkspaceLaunchProvider = LaunchContext.Provider;
const sessionIndex: WorkspaceLaunchResolver = async () => null;
type Host = ReturnType<typeof createWorkspaceCourseHost>;
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
const realtimeEnabled = workspaceHostEnabled(import.meta.env.VITE_LESSON_AUTHOR_WORKSPACE_STREAM_ENABLED);

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
        // Save/reset operation ids: the write state's default (crypto.randomUUID)
        // throws on plain http addresses.
        return createWorkspaceSession(identity, { uiLocale: locale, readClient: createWorkspaceReadClient(identity), eventDriven: realtimeEnabled,
          operationId: secureRandomUuid,
          writeClient: {
            save: (...args) => { assertWriteScope(); return writes.save(...args); },
            reset: (...args) => { assertWriteScope(); return writes.reset(...args); },
          } });
      },
    });
    const sourceController = createWorkspaceSourceState(scope, {
      api: workspaceSourceApi, create: createWorkspaceCreateClient(scope), authorized,
      visible: () => controller.getState().open && controller.getState().issue === 'no_workspace' && !controller.getState().launch && !controller.getState().loading,
      // AI course design upload needs only course editing (never the chatbot configuration module).
      canUpload: () => authorized(),
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
    trigger: current ? <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" aria-label={workspaceCourseHostCopy[locale].open}
      onClick={() => { void current.launch(); }}><Sparkles className="h-4 w-4" aria-hidden />{workspaceCourseHostCopy[locale].label}</Button> : null,
    overlay: current ? <WorkspaceCourseHostOverlayMount host={current} courseId={courseId!} tenantId={tenantId ?? null} locale={locale} sources={sources}
      onCourseApplied={() => onCourseAppliedRef.current?.()} /> : null,
  };
}

function WorkspaceCourseHostOverlayMount({ host, courseId, tenantId, locale, sources, onCourseApplied }: { host: Host; courseId: string; tenantId: string | null; locale: WorkspaceLocale;
  sources: ReturnType<typeof createWorkspaceSourceState> | null; onCourseApplied?: () => Promise<void> | void }) {
  const state = useSyncExternalStore(host.subscribe, host.getState, emptySnapshot);
  const activeRuns = useLessonAuthorActiveRuns({ tenantId, courseId, locale, enabled: !!state?.open });
  const refreshRuns = activeRuns.refetch;
  return state ? <WorkspaceCourseHostOverlay host={host} courseId={courseId} state={state} locale={locale} sources={sources}
    activeRuns={activeRuns.data} onCourseApplied={onCourseApplied} tenantId={tenantId} onRunsChanged={() => { void refreshRuns(); }} /> : null;
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

export function WorkspaceCourseHostOverlay({ host, courseId, state, locale, sources, activeRuns, onCourseApplied, tenantId = null, onRunsChanged }: { host: Host; courseId: string; state: ReturnType<Host['getState']>; locale: WorkspaceLocale;
  sources?: ReturnType<typeof createWorkspaceSourceState> | null; activeRuns?: readonly LessonAuthorActiveRun[]; onCourseApplied?: () => Promise<void> | void;
  /** Active tenant of the review list key ("Chờ duyệt"). */
  tenantId?: string | null;
  onRunsChanged?: () => void }) {
  const c = workspaceCourseHostCopy[locale], session = host.getSession(), workspace = state.workspace;
  const [actionError, setActionError] = useState(false);
  // Normal product entry has no selected launch and therefore starts at the
  // session index. A pre-resolved host (embedded recovery/tests) may render its
  // already-authorized workspace directly without a one-frame session flash.
  const [view, setView] = useState<'sessions' | 'source' | 'workspace'>(() => state.launch || state.issue ? 'workspace' : 'sessions');
  const [applyState, setApplyState] = useState<WorkspaceApplyUiState>('idle');
  const [applyError, setApplyError] = useState<WorkspaceApplyError | null>(null);
  const [editingTitleNodeId, setEditingTitleNodeId] = useState<string | null>(null);
  const [appliedOverlay, setAppliedOverlay] = useState<WorkspaceAppliedRevisionOverlay | null>(null);
  const [assistantAvatarSrc, setAssistantAvatarSrc] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<{ id: string; title: string; ownerName?: string; mine?: boolean } | null>(null);
  const [applyConflict, setApplyConflict] = useState<WorkspaceApplyConflictState | null>(null);
  const runNotice = workspaceActiveRunNotice(activeRuns ?? [], view === 'workspace' ? state.launch?.conversation_id ?? null : null, locale);
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
    if (conversation?.id && conversation.title?.trim()) setActiveConversation({ id: conversation.id, title: conversation.title.trim(), mine: true });
  }, [sourceState?.conversation]);
  useEffect(() => {
    const conversationId = state.launch?.conversation_id;
    if (!state.open || !conversationId || activeConversation?.id === conversationId || titleLookupRef.current === conversationId) return;
    titleLookupRef.current = conversationId;
    const abort = new AbortController();
    void listLessonAuthorSessions(courseId, locale, abort.signal).then(result => {
      const match = result.items.find(item => item.conversation_id === conversationId);
      if (match) setActiveConversation({ id: conversationId, title: match.title, ownerName: match.owner.display_name, mine: match.is_mine });
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
  // Stop / Continue / Rewrite: owner of an open, readable draft only (the server checks again).
  const recovery = useWorkspaceRecovery({
    // "unknown" is a re-authorizing read (Reload): keep the options and any open confirmation meanwhile.
    enabled: state.open && view === 'workspace' && !!session && host.canWrite() && !!workspace && workspace.read.access !== 'blocked',
    scope: state.launch ? { courseId: state.launch.course_id, conversationId: state.launch.conversation_id,
      workspaceId: state.launch.workspace_id } : null,
    locale, status: workspace?.read.status?.status ?? null, head: workspace?.read.status?.last_event_sequence ?? null,
    onCommitted: target => session?.refreshForApply(target ?? undefined), onRunsChanged,
  });
  const recoveryUnitAction = recovery.unitAction;
  const renderRecoveryNodeAction = useCallback((node: WorkspaceNode) => node.kind === 'unit'
    ? recoveryUnitAction(node.node_id, 'card') : null, [recoveryUnitAction]);
  if (!state.open) return null;
  if (!state.loading && view === 'sessions') return <WorkspaceModalShell host={host}><WorkspaceSessionBrowser
    courseId={courseId} locale={locale} assistantAvatarSrc={assistantAvatarSrc} banner={<WorkspaceActiveRunNotice text={runNotice} />}
    onClose={() => host.close()}
    onOpen={async (launch, item) => { setActionError(false); setActiveConversation({ id: launch.conversation_id, title: item.title, ownerName: item.owner.display_name, mine: item.is_mine }); try { await host.acceptCreated(launch); setView('workspace'); } catch { setActionError(true); } }}
    onSource={(conversationId, title) => {
      setActionError(false);
      if (!sources || !host.clearSelection()) { setActionError(true); return; }
      setActiveConversation(conversationId && title ? { id: conversationId, title, mine: true } : null);
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
        {!state.loading && state.issue === 'no_workspace' && !state.launch && sources && <WorkspaceLaunchTabs sources={sources} tenantId={tenantId} locale={locale}>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto px-4 py-5 sm:px-5 lg:grid-cols-[1.45fr_0.8fr]"><WorkspaceSourcePanel controller={sources} locale={locale} /><WorkspaceLaunchBriefPanel controller={sources} /></div>
        </WorkspaceLaunchTabs>}
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
  // Someone else's shared session opens read-only: view and Apply, no editing or continuing.
  const otherOwner = !!state.launch && activeConversation?.id === state.launch.conversation_id && activeConversation.mine === false;
  const toolbar = (!state.launch?.can_edit || message || actionError || runNotice) ? <div className="space-y-2 text-sm">
    <WorkspaceActiveRunNotice text={runNotice} />
    {(message || actionError) && <Button type="button" variant="outline" size="sm" disabled={workspace.read.busy || workspace.writeBusy} onClick={() => act(refreshWorkspace)}>{c.refresh}</Button>}
    {!state.launch?.can_edit && <p role="status">{otherOwner ? workspaceReadOnlyNotice(activeConversation?.ownerName ?? null, locale) : c.readOnly}</p>}
    {message && <p role="alert">{message}</p>}{actionError && <p role="alert">{c.error}</p>}
  </div> : undefined;
  const renderDetail = (node: WorkspaceNode | null) => node ? <WorkspaceCourseNodeDialog node={node} host={host} session={session}
    workspace={workspace} state={state} presentationRead={presentationRead} locale={locale} recovery={recovery} onCourseApplied={onCourseApplied}
    message={message} actionError={actionError} setActionError={setActionError} act={act} refreshWorkspace={refreshWorkspace}
    applyState={applyState} setApplyState={setApplyState} applyError={applyError} setApplyError={setApplyError}
    applyConflict={applyConflict} setApplyConflict={setApplyConflict} setAppliedOverlay={setAppliedOverlay}
    editingTitleNodeId={editingTitleNodeId} setEditingTitleNodeId={setEditingTitleNodeId} /> : null;
  return <WorkspaceModalShell host={host}><WorkspaceDialogBody open={state.open} onOpenChange={open => { if (!open) host.close(); }} state={presentationRead!} locale={locale}
    onSelectNode={nodeId => { setApplyState('idle'); setEditingTitleNodeId(null); act(() => session.selectNode(nodeId)); }} overviewDetails={workspace.overview.details} toolbar={toolbar} renderNodeDetail={renderDetail}
    overviewNotice={state.launch && workspaceReviewRequired(presentationRead?.status) ? <WorkspaceReviewPanel locale={locale} tenantId={tenantId}
      scope={{ courseId: state.launch.course_id, conversationId: state.launch.conversation_id, workspaceId: state.launch.workspace_id }}
      canResolve={host.canApply()} /> : undefined}
    overviewHeader={<WorkspaceLaunchBriefSummary brief={workspaceSessionLaunchBrief(presentationRead)} />}
    assistantAvatarSrc={assistantAvatarSrc}
    draftTitle={state.launch && activeConversation?.id === state.launch.conversation_id ? activeConversation.title : null}
    onRefresh={() => act(refreshWorkspace)}
    headerActions={recovery.headerAction} recoveryBanner={recovery.banner} recoveryActions={recovery.actions}
    renderChapterAction={chapter => recovery.chapterAction(chapter.node_id)} renderNodeAction={renderRecoveryNodeAction} />
    {recovery.dialog}</WorkspaceModalShell>;
}
