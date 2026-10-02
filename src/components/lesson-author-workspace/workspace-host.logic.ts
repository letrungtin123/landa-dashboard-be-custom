import { isWorkspaceId, WorkspaceReadError, type WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { WorkspaceWriteError } from '../../api/workspace-write';
import type { createWorkspaceSession, WorkspaceSessionIdentity, WorkspaceSessionState } from './workspace-session';

export interface WorkspaceHostScope { actorId: string; tenantId: string; courseId: string }
/** Must be returned by an authorized server discovery/selection API. No route,
 * URL parameter, localStorage ID or client-generated ID is a launch source. */
export interface WorkspaceLaunchContext {
  course_id: string;
  conversation_id: string;
  workspace_id: string;
  content_locale: WorkspaceLocale;
  can_edit: boolean;
  correlation_id?: string;
}
export type WorkspaceLaunchResolver = (input: WorkspaceHostScope & {
  uiLocale: WorkspaceLocale;
  signal: AbortSignal;
  /** Re-authorize this exact previous server selection on reopen. */
  previous: Readonly<WorkspaceLaunchContext> | null;
}) => Promise<WorkspaceLaunchContext | null>;
export type WorkspaceHostIssue = 'discovery_unavailable' | 'no_workspace' | 'launch_invalid' | 'launch_changed' | 'launch_failed';
type Session = ReturnType<typeof createWorkspaceSession>;
export interface WorkspaceHostState {
  scopeKey: string;
  open: boolean;
  loading: boolean;
  launch: Readonly<WorkspaceLaunchContext> | null;
  workspace: Readonly<WorkspaceSessionState> | null;
  issue: WorkspaceHostIssue | null;
}
export const workspaceHostKey = (scope: WorkspaceHostScope) => JSON.stringify([scope.actorId, scope.tenantId, scope.courseId]);
export const workspaceHostEnabled = (flag: unknown) => flag === 'true';
export function readWorkspaceLaunch(value: unknown, scope: WorkspaceHostScope): WorkspaceLaunchContext {
  const v = value as WorkspaceLaunchContext | null;
  if (!v || v.course_id !== scope.courseId || !isWorkspaceId(v.conversation_id) || !isWorkspaceId(v.workspace_id)
    || !['vi', 'en'].includes(v.content_locale) || typeof v.can_edit !== 'boolean'
    || v.correlation_id !== undefined && !isWorkspaceId(v.correlation_id)) throw new WorkspaceReadError('WORKSPACE_READ_CONTRACT_INVALID');
  return Object.freeze({ course_id: v.course_id, conversation_id: v.conversation_id,
    workspace_id: v.workspace_id, content_locale: v.content_locale, can_edit: v.can_edit,
    ...(v.correlation_id === undefined ? {} : { correlation_id: v.correlation_id }) });
}

/** Owns one session, not another polling loop. Safe to construct while disabled.
 * Resolver absence is explicit: this module invents no discovery/create route.
 */
export function createWorkspaceCourseHost(scope: WorkspaceHostScope, dependencies: {
  enabled: boolean;
  authorized: boolean;
  locale: WorkspaceLocale;
  resolve?: WorkspaceLaunchResolver;
  createSession: (identity: WorkspaceSessionIdentity, canWrite: () => boolean) => Session;
}) {
  const bound = Object.freeze({ ...scope });
  const eligible = dependencies.enabled && dependencies.authorized && isWorkspaceId(bound.actorId)
    && isWorkspaceId(bound.tenantId) && !!bound.courseId;
  let locale = dependencies.locale, disposed = false, generation = 0, visible = true;
  let pending: Promise<void> | null = null, abort: AbortController | null = null;
  let session: Session | null = null, unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();
  let state: Readonly<WorkspaceHostState> = Object.freeze({ scopeKey: workspaceHostKey(bound), open: false, loading: false,
    launch: null, workspace: null, issue: null });
  function publish(patch: Partial<WorkspaceHostState>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) { try { listener(); } catch { /* View errors cannot dispatch work. */ } }
  }
  function canWrite() { return !disposed && eligible && state.open && !state.loading && state.launch?.can_edit === true && !state.issue; }
  function close() {
    generation++; abort?.abort(); abort = null; pending = null;
    session?.close(); publish({ open: false, loading: false });
  }
  async function activate(value: WorkspaceLaunchContext, token: number) {
    const launch = readWorkspaceLaunch(value, bound);
    if (state.launch && (launch.workspace_id !== state.launch.workspace_id || launch.conversation_id !== state.launch.conversation_id
      || launch.content_locale !== state.launch.content_locale || launch.correlation_id !== state.launch.correlation_id)) {
      publish({ issue: 'launch_changed' }); return;
    }
    publish({ launch, loading: false, issue: null });
    if (!session) {
      session = dependencies.createSession({ ...bound, workspaceId: launch.workspace_id, conversationId: launch.conversation_id }, canWrite);
      unsubscribe = session.subscribe(() => { if (!disposed) publish({ workspace: session!.getState() }); });
    }
    session.setUiLocale(locale);
    publish({ workspace: session.getState() }); // Immediate honest shell; no progress synthesized.
    if (!state.open) return; // A late Create receipt cannot reopen a closed dialog.
    await session.open(undefined, visible);
    if (disposed || token !== generation) return;
    const read = session.getState().read;
    const contentLocale = read.graph?.content_locale ?? read.status?.content_locale;
    const correlation = read.graph?.correlation_id ?? read.status?.correlation_id;
    if (contentLocale && contentLocale !== launch.content_locale
      || launch.correlation_id && correlation && correlation !== launch.correlation_id) { session.close(); publish({ issue: 'launch_invalid' }); }
    publish({ workspace: session.getState() });
  }
  return {
    getState: () => state,
    getSession: () => disposed ? null : session,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    canWrite,
    /** Accept only the validated response to an explicit Create. No fabricated
     * launch identifiers and no extra latest lookup between receipt and read. */
    async acceptCreated(value: WorkspaceLaunchContext) {
      if (disposed || !eligible) return;
      const token = ++generation; abort?.abort(); abort = null; pending = null;
      try { await activate(value, token); }
      catch { session?.close(); publish({ issue: 'launch_invalid', loading: false }); }
    },
    launch(): Promise<void> {
      if (disposed || !eligible) return Promise.resolve();
      if (pending) return pending;
      if (state.open && session && !state.issue) return Promise.resolve();
      publish({ open: true, loading: true, issue: null });
      const token = ++generation;
      abort = new AbortController(); const signal = abort.signal;
      const run = Promise.resolve().then(async () => {
        try {
          if (disposed || token !== generation || signal.aborted) return;
          if (!dependencies.resolve) { publish({ issue: 'discovery_unavailable' }); return; }
          const value = await dependencies.resolve({ ...bound, uiLocale: locale, signal, previous: state.launch });
          if (disposed || token !== generation || signal.aborted) return;
          if (!value) { publish({ issue: 'no_workspace' }); return; }
          try { readWorkspaceLaunch(value, bound); }
          catch { publish({ issue: 'launch_invalid' }); return; }
          await activate(value, token);
        } catch { if (!disposed && token === generation) { session?.close(); publish({ issue: 'launch_failed' }); } }
        finally {
          if (!disposed && token === generation) publish({ loading: false });
          if (pending === run) pending = null;
        }
      });
      pending = run; return run;
    },
    close,
    setVisible(value: boolean) { visible = value; if (!disposed) session?.setVisible(value); },
    setUiLocale(value: WorkspaceLocale) { locale = value; if (!disposed) session?.setUiLocale(value); },
    assertCanWrite() { if (!canWrite()) throw new WorkspaceWriteError('WORKSPACE_EDIT_FORBIDDEN'); },
    dispose() {
      if (disposed) return;
      close(); disposed = true; unsubscribe?.(); session?.dispose(); session = null; listeners.clear();
      state = Object.freeze({ ...state, open: false, workspace: null, launch: null });
    },
  };
}
