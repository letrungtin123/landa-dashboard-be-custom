import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import {
  workspaceRecoveryFailure, type WorkspaceRecoveryClient, type WorkspaceRecoveryCode, type WorkspaceRecoveryView,
} from '../../api/workspace-recovery';
import {
  WORKSPACE_RECOVERY_DRAIN_POLL_LIMIT, WORKSPACE_RECOVERY_DRAIN_POLL_MS, workspaceRecoveryFetchKey, type WorkspaceRecoveryIntent,
} from './workspace-recovery.logic';

export interface WorkspaceRecoveryPending {
  intent: WorkspaceRecoveryIntent;
  /** One id per confirmed intent: an unconfirmed result is retried with the SAME id (the server replays it). */
  operationId: string;
  /** The workspace head the author saw when choosing; a newer head is refused by the server. */
  expectedHead: number;
  maxRewrites: number;
  /** The server answered with a refusal: only Close remains; a new attempt starts from fresh options. */
  settled: boolean;
}
export interface WorkspaceRecoveryState {
  view: WorkspaceRecoveryView | null;
  /** Turned off, not the owner, gone or unreadable: nothing is shown. */
  hidden: boolean;
  pending: WorkspaceRecoveryPending | null;
  busy: boolean;
  error: WorkspaceRecoveryCode | null;
  notice: 'started' | 'stopped' | null;
}
export interface WorkspaceRecoveryInputs { enabled: boolean; status: string | null; head: number | null }
interface Scheduler { set(callback: () => void, delay: number): unknown; clear(handle: unknown): void }

export const WORKSPACE_RECOVERY_NOTICE_MS = 6_000;
const HIDDEN_CODES: ReadonlySet<WorkspaceRecoveryCode> = new Set(['AUTH_REQUIRED', 'RECOVERY_DISABLED', 'RECOVERY_FORBIDDEN',
  'RECOVERY_NOT_FOUND', 'RECOVERY_INPUT_INVALID']);
const EMPTY: WorkspaceRecoveryState = Object.freeze({ view: null, hidden: false, pending: null, busy: false, error: null, notice: null });

/** Stop / Continue / Rewrite for ONE open draft of its owner. Reads GET …/recovery
 * when the run starts or ends and, while stopped, on each committed event;
 * checks again while a stopped run is still finishing a lesson (bounded). Every
 * POST carries one operation id: an unconfirmed result is retried with the same
 * id, so the server replays it instead of acting twice. After any answer the
 * workspace is re-read so polling/stream resume for a continued design. */
export function createWorkspaceRecoveryState(deps: {
  client: WorkspaceRecoveryClient;
  locale: () => WorkspaceLocale;
  onCommitted: (head: number | null) => Promise<void> | void;
  onRunsChanged?: () => void;
  operationId: () => string;
  scheduler?: Scheduler;
}) {
  const scheduler: Scheduler = deps.scheduler ?? {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let state: WorkspaceRecoveryState = EMPTY;
  let inputs: WorkspaceRecoveryInputs = { enabled: false, status: null, head: null };
  const listeners = new Set<() => void>();
  let lastKey: string | null = null;
  let tick = 0;
  let reading: AbortController | null = null;
  let drainTimer: unknown = null;
  let drainPolls = 0;
  let noticeTimer: unknown = null;
  let advancedHead: number | null = null;
  let disposed = false;

  function publish(patch: Partial<WorkspaceRecoveryState>) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try { listener(); } catch { /* A view callback never changes a request. */ }
    }
  }
  function clearDrain() { if (drainTimer !== null) scheduler.clear(drainTimer); drainTimer = null; }
  function clearNotice() { if (noticeTimer !== null) scheduler.clear(noticeTimer); noticeTimer = null; }
  function key() {
    return workspaceRecoveryFetchKey({ enabled: inputs.enabled && !state.hidden && !disposed, workspaceId: 'open',
      status: inputs.status, head: inputs.head, tick, stopKnown: state.view?.stop.available === true });
  }
  function reset() {
    reading?.abort(); reading = null; clearDrain(); clearNotice();
    lastKey = null; drainPolls = 0; advancedHead = null;
    if (state !== EMPTY) { state = EMPTY; for (const listener of listeners) { try { listener(); } catch { /* view only */ } } }
  }
  function scheduleDrain() {
    clearDrain();
    if (drainPolls >= WORKSPACE_RECOVERY_DRAIN_POLL_LIMIT) return;
    drainTimer = scheduler.set(() => { drainTimer = null; drainPolls += 1; tick += 1; read(); }, WORKSPACE_RECOVERY_DRAIN_POLL_MS);
  }
  function afterView(view: WorkspaceRecoveryView) {
    clearDrain();
    if (!view.draining) drainPolls = 0;
    else scheduleDrain();
    // The options saw a newer committed head than the open draft: let the reader catch up once.
    if (inputs.head !== null && view.event_head > inputs.head && advancedHead !== view.event_head) {
      advancedHead = view.event_head;
      void Promise.resolve(deps.onCommitted(view.event_head)).catch(() => undefined);
    }
    // Knowing Stop only removes the per-event key part: it never calls for another read.
    lastKey = key();
  }
  function read() {
    const next = key();
    if (next === null) { reading?.abort(); reading = null; clearDrain(); lastKey = null; return; }
    if (next === lastKey) return;
    lastKey = next;
    reading?.abort();
    const controller = new AbortController();
    reading = controller;
    void deps.client.describe(deps.locale(), controller.signal).then(view => {
      if (controller.signal.aborted || disposed || reading !== controller) return;
      reading = null;
      publish({ view });
      afterView(view);
    }, failure => {
      if (controller.signal.aborted || disposed || reading !== controller) return;
      reading = null;
      const reason = workspaceRecoveryFailure(failure);
      // A passing outage keeps the last options; the next event or check reads again.
      if (HIDDEN_CODES.has(reason.code) || reason.outcome === 'rejected') { clearDrain(); publish({ hidden: true, view: null }); return; }
      lastKey = null;
      if (state.view?.draining) scheduleDrain();
    });
  }
  function refreshAfterAnswer() {
    tick += 1;
    void Promise.resolve(deps.onCommitted(null)).catch(() => undefined);
    try { deps.onRunsChanged?.(); } catch { /* A notice refresh never changes the result. */ }
    read();
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Owner/open state and the read-model status + head of the open draft. */
    update(next: WorkspaceRecoveryInputs) {
      if (disposed) return;
      const enabledChanged = next.enabled !== inputs.enabled;
      inputs = { ...next };
      if (!next.enabled) { if (enabledChanged) reset(); return; }
      read();
    },
    /** Opens the confirmation for an action the last read offered. */
    begin(intent: WorkspaceRecoveryIntent): boolean {
      const view = state.view;
      if (disposed || state.busy || state.pending || !view || !inputs.enabled) return false;
      let operationId: string;
      try { operationId = deps.operationId(); } catch { publish({ error: 'RECOVERY_UNAVAILABLE' }); return false; }
      publish({ error: null, pending: { intent, operationId, expectedHead: view.event_head,
        maxRewrites: view.regenerate.max_rewrites_per_lesson, settled: false } });
      return true;
    },
    async confirm(): Promise<void> {
      const pending = state.pending;
      if (disposed || !pending || pending.settled || state.busy) return;
      publish({ busy: true, error: null });
      const { intent, operationId, expectedHead } = pending;
      const locale = deps.locale();
      try {
        if (intent.kind === 'stop') await deps.client.stop(operationId, locale);
        else if (intent.kind === 'resume') await deps.client.resume(operationId, expectedHead, locale);
        else await deps.client.regenerate(intent.nodeId, operationId, expectedHead, locale);
        if (disposed) return;
        clearNotice();
        publish({ busy: false, pending: null, notice: intent.kind === 'stop' ? 'stopped' : 'started' });
        noticeTimer = scheduler.set(() => { noticeTimer = null; publish({ notice: null }); }, WORKSPACE_RECOVERY_NOTICE_MS);
        refreshAfterAnswer();
      } catch (failure) {
        if (disposed) return;
        const reason = workspaceRecoveryFailure(failure);
        const definite = reason.outcome === 'rejected';
        publish({ busy: false, error: reason.code,
          pending: state.pending?.operationId === operationId && definite ? { ...state.pending, settled: true } : state.pending });
        if (definite) refreshAfterAnswer();
      }
    },
    close() { if (!disposed && !state.busy) publish({ pending: null, error: null }); },
    dispose() { if (disposed) return; reset(); disposed = true; listeners.clear(); },
  };
}
export type WorkspaceRecoveryController = ReturnType<typeof createWorkspaceRecoveryState>;
