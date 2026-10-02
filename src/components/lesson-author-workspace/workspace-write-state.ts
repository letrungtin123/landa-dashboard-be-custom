import { readWorkspaceDetail, isWorkspaceId, type WorkspaceContent, type WorkspaceDetail, type WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { WorkspaceWriteError, workspaceWriteFailure, validateWorkspaceChanges, readWorkspaceWriteReceipt,
  type WorkspaceWriteClient, type WorkspaceWriteReceipt, type WorkspaceSaveRequest, type WorkspaceResetRequest } from '../../api/workspace-write';

interface Draft { baseRevision: number; content: WorkspaceContent; version: number; conflict: boolean }
export type WorkspaceWriteOperation = {
  kind: 'save'; nodeId: string; request: WorkspaceSaveRequest; draftVersion: number;
} | { kind: 'reset'; nodeId: string; request: WorkspaceResetRequest; draftVersion: number | null };
export interface WorkspaceWriteState {
  phase: 'idle' | 'sending' | 'committed' | 'rejected' | 'unknown';
  detail: WorkspaceDetail | null;
  draft: Draft | null;
  operation: WorkspaceWriteOperation | null;
  receipt: WorkspaceWriteReceipt | null;
  error: WorkspaceWriteError | null;
  readRequired: boolean;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
/** One node per instance. Host supplies authorized reads and explicit actions;
 * no subscriptions to polling, timers, storage, generation or Apply exist here.
 * Dispose on actor/tenant/scope change. A committed receipt is NOT current
 * content: a subsequent authorized detail read must reconcile it.
 */
export function createWorkspaceWriteState(client: WorkspaceWriteClient, identity: {
  workspaceId: string; nodeId: string; correlationId: string; contentLocale: WorkspaceLocale;
}, options: { uiLocale?: WorkspaceLocale; operationId?: () => string } = {}) {
  if (![identity.workspaceId, identity.nodeId, identity.correlationId].every(isWorkspaceId)
    || !['en', 'vi'].includes(identity.contentLocale)) throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID');
  const bound = Object.freeze({ ...identity });
  let locale = options.uiLocale ?? 'vi', version = 0, disposed = false;
  let flight: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let uncertain = false;
  const usedIds = new Set<string>();
  const newId = options.operationId ?? (() => globalThis.crypto.randomUUID());
  let state: Readonly<WorkspaceWriteState> = freeze({ phase: 'idle', detail: null, draft: null,
    operation: null, receipt: null, error: null, readRequired: true });
  const listeners = new Set<() => void>();
  function publish(patch: Partial<WorkspaceWriteState>) {
    if (disposed) return;
    state = freeze({ ...state, ...patch });
    for (const listener of listeners) { try { listener(); } catch { /* A view cannot change a write outcome. */ } }
  }
  function active() { if (disposed) throw new WorkspaceWriteError('WORKSPACE_EDIT_STATE_INVALID'); }
  function ready() {
    active();
    if (flight) throw new WorkspaceWriteError('WORKSPACE_EDIT_BUSY');
    if (state.readRequired || !state.detail) throw new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED');
    if (state.detail.content_state !== 'content_ready' || state.detail.current_revision === null) throw new WorkspaceWriteError('WORKSPACE_NODE_NOT_READY');
    if (!['drafting', 'ready', 'needs_action'].includes(state.detail.status) && !uncertain) throw new WorkspaceWriteError('WORKSPACE_EDIT_STATE_INVALID');
    return state.detail.current_revision;
  }
  function allocateId() {
    let id: string;
    try { id = newId(); } catch { throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID'); }
    if (!isWorkspaceId(id) || usedIds.has(id.toLowerCase())) throw new WorkspaceWriteError('WORKSPACE_EDIT_IDEMPOTENCY_CONFLICT');
    usedIds.add(id.toLowerCase()); return id;
  }
  function send(operation: WorkspaceWriteOperation): Promise<void> {
    controller = new AbortController();
    const signal = controller.signal;
    // Defer until flight is assigned so observer callbacks cannot reenter Save.
    flight = Promise.resolve().then(async () => {
      if (disposed) return;
      publish({ phase: 'sending', operation, receipt: null, error: null, readRequired: true });
      if (disposed) return;
      try {
        const response = operation.kind === 'save'
          ? await client.save(operation.nodeId, operation.request, { signal, uiLocale: locale })
          : await client.reset(operation.nodeId, operation.request, { signal, uiLocale: locale });
        if (disposed) return;
        const receipt = readWorkspaceWriteReceipt(response, { workspaceId: bound.workspaceId, nodeId: bound.nodeId,
          operationId: operation.request.operation_id, expectedRevision: operation.request.expected_revision, operation: operation.kind });
        if (receipt.correlation_id.toLowerCase() !== bound.correlationId.toLowerCase()) throw new WorkspaceWriteError('WORKSPACE_EDIT_RECEIPT_INVALID', 'unknown');
        uncertain = false;
        publish({ phase: 'committed', receipt, readRequired: true });
      } catch (error) {
        if (disposed) return;
        const failure = workspaceWriteFailure(error);
        uncertain ||= failure.outcome === 'unknown';
        const rejectedWithoutMutation = failure.outcome === 'rejected'
          && (failure.code === 'WORKSPACE_EDIT_VALIDATION_REQUIRED' || failure.code === 'WORKSPACE_EDIT_INPUT_INVALID');
        // A rejection of a replay cannot prove the earlier uncertain POST failed.
        // A typed validation/input rejection proves that no revision was
        // committed. Keep the exact authorized detail writable so the author
        // can correct the form instead of getting trapped behind Reload.
        publish({ phase: uncertain ? 'unknown' : 'rejected', error: failure,
          readRequired: uncertain || !rejectedWithoutMutation });
      }
    }).finally(() => { flight = null; controller = null; });
    return flight;
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { active(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    setUiLocale(value: WorkspaceLocale) {
      active(); if (!['en', 'vi'].includes(value)) throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID'); locale = value;
    },
    /** Read-only reconciliation never silently rebases dirty text or resolves an unknown POST. */
    observeDetail(value: WorkspaceDetail) {
      active();
      let detail: WorkspaceDetail;
      try { detail = readWorkspaceDetail(value); }
      catch (error) { publish({ readRequired: true }); throw error; }
      if (detail.workspace_id.toLowerCase() !== bound.workspaceId.toLowerCase() || detail.node_id.toLowerCase() !== bound.nodeId.toLowerCase()
        || detail.correlation_id.toLowerCase() !== bound.correlationId.toLowerCase() || detail.content_locale !== bound.contentLocale) {
        publish({ readRequired: true }); throw new WorkspaceWriteError('WORKSPACE_EDIT_FORBIDDEN');
      }
      if (state.detail && (detail.last_event_sequence < state.detail.last_event_sequence
        || (detail.current_revision ?? -1) < (state.detail.current_revision ?? -1))) return;
      const receipt = state.receipt;
      if (receipt && (detail.last_event_sequence < receipt.event_sequence || (detail.current_revision ?? -1) < receipt.current_revision)) return;
      let draft = state.draft;
      const operation = state.operation;
      // The server is authoritative and may canonicalize Course Outline data
      // (for example sanitized HTML) before persisting it. Exact receipt
      // revision plus the unchanged submitted draft version proves this read
      // acknowledges our write; byte equality with the raw browser request is
      // neither required nor correct. A newer local version is still retained.
      if (!flight && receipt && operation && draft?.version === operation.draftVersion
        && detail.current_revision === receipt.revision && (operation.kind === 'save'
          ? receipt.user_modified === true && detail.user_modified === true
          : receipt.user_modified === false && detail.user_modified === false)) draft = null;
      else if (draft) draft = { ...draft, conflict: detail.current_revision !== draft.baseRevision };
      publish({ detail: structuredClone(detail), draft, readRequired: !!flight });
    },
    /** Permission/source read failures invalidate eligibility without deleting local work. */
    invalidateRead() { active(); publish({ readRequired: true }); },
    setDraft(content: WorkspaceContent) {
      active(); validateWorkspaceChanges(content, true);
      const baseRevision = state.draft?.baseRevision ?? state.detail?.current_revision;
      if (baseRevision == null) throw new WorkspaceWriteError('WORKSPACE_NODE_NOT_READY');
      publish({ draft: { baseRevision, content: structuredClone(content), version: ++version,
        conflict: state.draft?.conflict ?? false } });
    },
    /** Explicit author decision after comparing the latest read with preserved local text. */
    rebaseDraft(expectedRevision: number) {
      const revision = ready();
      if (uncertain || revision !== expectedRevision || !state.draft) throw new WorkspaceWriteError('WORKSPACE_REVISION_CONFLICT');
      publish({ draft: { ...state.draft, baseRevision: revision, conflict: false, version: ++version } });
    },
    discardDraft() {
      active(); if (flight || uncertain) throw new WorkspaceWriteError('WORKSPACE_EDIT_BUSY');
      publish({ draft: null });
    },
    save(): Promise<void> {
      const revision = ready();
      if (uncertain) throw new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED');
      const draft = state.draft;
      if (!draft) throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID');
      if (draft.conflict || draft.baseRevision !== revision) throw new WorkspaceWriteError('WORKSPACE_REVISION_CONFLICT');
      return send(freeze({ kind: 'save', nodeId: bound.nodeId, draftVersion: draft.version,
        request: { operation_id: allocateId(), expected_revision: draft.baseRevision, changes: structuredClone(draft.content) } }));
    },
    reset(confirmation: { confirmed: true; expectedRevision: number }): Promise<void> {
      const revision = ready();
      if (uncertain) throw new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED');
      if (confirmation?.confirmed !== true) throw new WorkspaceWriteError('WORKSPACE_EDIT_RESET_CONFIRMATION_REQUIRED');
      if (confirmation.expectedRevision !== revision) throw new WorkspaceWriteError('WORKSPACE_REVISION_CONFLICT');
      return send(freeze({ kind: 'reset', nodeId: bound.nodeId, draftVersion: state.draft?.version ?? null,
        request: { operation_id: allocateId(), expected_revision: revision } }));
    },
    /** Explicit only, AFTER a fresh read. Payload/revision/operation ID stay identical. */
    replay(): Promise<void> {
      ready();
      if (!uncertain || !state.operation) throw new WorkspaceWriteError('WORKSPACE_EDIT_STATE_INVALID');
      return send(state.operation);
    },
    dispose() {
      if (disposed) return;
      disposed = true; controller?.abort(); listeners.clear(); usedIds.clear();
      // Aborting the HTTP wait is not a rollback; the host must reconcile on reopening.
      state = freeze({ ...state, detail: null, draft: null, operation: null, receipt: null, readRequired: true });
    },
  };
}
