import type { WorkspaceReadClient, WorkspaceReadOptions } from '../../api/lesson-author-workspace';
import {
  WorkspaceReadError, workspaceReadFailure,
  type WorkspaceContent, type WorkspaceDetail, type WorkspaceGraph, type WorkspaceLocale,
  type WorkspaceNode, type WorkspaceStatus, type WorkspaceView,
} from '../../api/lesson-author-workspace.contract';

export const WORKSPACE_VISIBLE_POLL_MS = 1_000;
export const WORKSPACE_HIDDEN_POLL_MS = 15_000;
export const WORKSPACE_TERMINAL_RUN_STATES = ['ready', 'needs_action', 'failed', 'canceled'] as const;
export const WORKSPACE_PAGES_PER_TICK = 4;
export const WORKSPACE_MAX_GRAPH_NODES = 10_000;
export const WORKSPACE_MAX_DIRTY_NODES = 16;
export interface WorkspaceLocalDraft {
  baseRevision: number;
  content: WorkspaceContent;
  conflict: boolean;
}
export interface WorkspaceReadState {
  opened: boolean;
  visible: boolean;
  busy: boolean;
  access: 'unknown' | 'allowed' | 'blocked';
  status: WorkspaceStatus | null;
  /** Last COMPLETE snapshot only. Null means no committed graph has been read. */
  graph: WorkspaceGraph | null;
  stale: boolean;
  selectedNodeId: string | null;
  detail: WorkspaceDetail | null;
  detailStale: boolean;
  drafts: Readonly<Record<string, WorkspaceLocalDraft>>;
  error: WorkspaceReadError | null;
}
interface Scheduler {
  set(callback: () => void, delay: number): unknown;
  clear(handle: unknown): void;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function resnapshot(): never { throw new WorkspaceReadError('WORKSPACE_EVENT_RESNAPSHOT_REQUIRED'); }

/** Inert until open(). One serialized read pipeline; never mounts editors, writes
 * storage, generates, saves, resets or applies. The host owns visibility events
 * and MUST dispose this instance on actor/tenant/scope change. Dirty content is
 * memory-only and survives close/reopen, not a browser reload or dispose().
 */
export function createWorkspaceReadState(client: WorkspaceReadClient, options: {
  uiLocale?: WorkspaceLocale;
  scheduler?: Scheduler;
  /** When an authorized SSE owner is present, refreshes are driven only by
   * committed event hints and explicit user actions. The initial snapshot still
   * uses the ordinary authorized read APIs. */
  eventDriven?: boolean;
} = {}) {
  const scheduler: Scheduler = options.scheduler ?? {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let locale = options.uiLocale ?? 'vi';
  let state: Readonly<WorkspaceReadState> = freeze({ opened: false, visible: true, busy: false,
    access: 'unknown', status: null, graph: null, stale: true, selectedNodeId: null,
    detail: null, detailStale: false, drafts: {}, error: null });
  const listeners = new Set<() => void>();
  let timer: unknown;
  let scheduled = false;
  let flight: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let epoch = 0;
  let disposed = false;
  let urgent = false;
  let needsSnapshot = true;
  let identity: WorkspaceView | null = null;
  let candidate: { first: WorkspaceGraph; nodes: WorkspaceNode[]; after: string } | null = null;
  let replay: { after: number; target: number } | null = null;
  // A status head and its graph/event pages can briefly cross while the server
  // commits a transaction. Retry one fresh snapshot for that exact head, even
  // when the run has just become terminal; a persistent inconsistency still
  // surfaces after the bounded retry instead of creating an infinite loop.
  let autoResnapshotHead: number | null = null;
  let recoveryPending = false;
  let eventDriven = options.eventDriven === true;

  function publish(patch: Partial<WorkspaceReadState>) {
    state = freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try { listener(); } catch { /* A view callback must not turn a read into a retry. */ }
    }
  }
  function clearTimer() {
    if (scheduled) scheduler.clear(timer);
    scheduled = false;
  }
  function schedule(delay: number) {
    clearTimer();
    if (disposed || !state.opened || state.access === 'blocked' || eventDriven
      || WORKSPACE_TERMINAL_RUN_STATES.includes(state.status?.status as typeof WORKSPACE_TERMINAL_RUN_STATES[number])) return;
    scheduled = true;
    timer = scheduler.set(() => { scheduled = false; void pump(); }, delay);
  }
  function check(view: WorkspaceView) {
    if (identity && (view.workspace_id !== identity.workspace_id || view.correlation_id !== identity.correlation_id
      || view.content_locale !== identity.content_locale || view.contract_version !== identity.contract_version)) {
      throw new WorkspaceReadError('WORKSPACE_READ_CONTRACT_INVALID');
    }
    identity ??= view;
    if (state.graph && view.last_event_sequence < state.graph.snapshot_sequence) resnapshot();
  }
  function commitGraph(graph: WorkspaceGraph) {
    const byId = new Map(graph.nodes.map(n => [n.node_id, n]));
    const paths = new Set(graph.nodes.map(n => n.canonical_path));
    const parents: Partial<Record<WorkspaceNode['kind'], WorkspaceNode['kind']>> = {
      chapter: 'course', lesson: 'chapter', unit: 'lesson', component: 'unit', media_brief: 'unit',
    };
    if (byId.size !== graph.total_nodes || paths.size !== graph.total_nodes
      || graph.structure_ready && graph.nodes.filter(n => n.kind === 'course').length !== 1
      || graph.nodes.some(n => n.kind !== 'course' && byId.get(n.parent_id ?? '')?.kind !== parents[n.kind])) resnapshot();
    const drafts = Object.fromEntries(Object.entries(state.drafts).map(([id, draft]) => [id,
      { ...draft, conflict: byId.get(id)?.current_revision !== draft.baseRevision }]));
    const node = state.selectedNodeId ? byId.get(state.selectedNodeId) : undefined;
    const detailStale = !!state.selectedNodeId && (!node || !state.detail
      || state.detail.current_revision !== node.current_revision || state.detail.content_state !== node.content_state);
    needsSnapshot = false; candidate = null; replay = null;
    publish({ graph, stale: false, drafts, detailStale });
  }
  async function snapshot(read: WorkspaceReadOptions, guard: () => void) {
    for (let pageNumber = 0; pageNumber < WORKSPACE_PAGES_PER_TICK; pageNumber++) {
      const page = await client.graph(candidate
        ? { snapshot_sequence: candidate.first.snapshot_sequence, after_node_id: candidate.after } : {}, read);
      guard(); check(page);
      if (page.total_nodes > WORKSPACE_MAX_GRAPH_NODES) throw new WorkspaceReadError('WORKSPACE_READ_LIMIT');
      if (!candidate) {
        if (state.status && page.snapshot_sequence < state.status.last_event_sequence) resnapshot();
        candidate = { first: page, nodes: [], after: '' };
      }
      const { first, nodes, after } = candidate;
      if (page.snapshot_sequence !== first.snapshot_sequence || page.total_nodes !== first.total_nodes
        || page.overview_ready !== first.overview_ready || page.structure_ready !== first.structure_ready
        || page.status !== first.status || page.updated_at !== first.updated_at
        || page.nodes.some((n, i) => n.node_id <= (i ? page.nodes[i - 1].node_id : after))
        || page.nodes.length !== Math.min(100, first.total_nodes - nodes.length)) resnapshot();
      nodes.push(...page.nodes);
      if (page.has_more !== (nodes.length < first.total_nodes)) resnapshot();
      if (!page.has_more) {
        commitGraph({ ...first, nodes, has_more: false, next_after_node_id: null });
        return;
      }
      if (!page.next_after_node_id || page.next_after_node_id !== nodes[nodes.length - 1]?.node_id) resnapshot();
      candidate.after = page.next_after_node_id;
    }
    // Partial pages remain private until the next bounded tick completes them.
    publish({ stale: true });
  }
  async function delta(read: WorkspaceReadOptions, guard: () => void) {
    for (let pageNumber = 0; pageNumber < WORKSPACE_PAGES_PER_TICK; pageNumber++) {
      const after = replay?.after ?? state.graph!.snapshot_sequence;
      const page = await client.events(after, read);
      guard(); check(page);
      if (page.last_event_sequence < (state.status?.last_event_sequence ?? 0)
        || page.events.some((e, index) => e.sequence !== after + index + 1)
        || page.next_sequence !== after + page.events.length
        || page.events.length !== Math.min(100, page.last_event_sequence - after)
        || page.has_more !== (page.next_sequence < page.last_event_sequence)) resnapshot();
      if (!page.events.length && !replay) { publish({ stale: false }); return; }
      replay ??= { after, target: page.last_event_sequence };
      replay.after = page.next_sequence;
      publish({ stale: true });
      // A moving head cannot make this drain unbounded. Snapshot includes later commits.
      if (replay.after >= replay.target) { needsSnapshot = true; replay = null; return; }
    }
  }
  async function selectedDetail(read: WorkspaceReadOptions, guard: () => void) {
    const selected = state.selectedNodeId;
    if (!selected || state.stale || !state.graph) return;
    const node = state.graph.nodes.find(n => n.node_id === selected);
    if (!node) { publish({ detailStale: true, error: new WorkspaceReadError('WORKSPACE_NODE_NOT_FOUND') }); return; }
    if (!state.detailStale && state.detail?.node_id === selected) return;
    const detail = await client.detail(selected, node.current_revision, read);
    guard(); check(detail);
    if (state.selectedNodeId !== selected) return;
    if (detail.node_id !== selected || detail.current_revision !== node.current_revision
      || detail.kind !== node.kind || detail.parent_id !== node.parent_id || detail.content_state !== node.content_state) resnapshot();
    publish({ detail, detailStale: false });
  }
  async function tick(runEpoch: number, signal: AbortSignal) {
    const guard = () => {
      signal.throwIfAborted();
      if (disposed || runEpoch !== epoch) throw new DOMException('Aborted', 'AbortError');
    };
    const read = { signal, uiLocale: locale };
    try {
      publish({ busy: true, error: null });
      const status = await client.status(read);
      guard(); check(status);
      publish({ status, access: 'allowed', stale: state.stale || status.last_event_sequence !== state.graph?.snapshot_sequence });
      if (!needsSnapshot) {
        try { await delta(read, guard); }
        catch (error) {
          guard();
          if (workspaceReadFailure(error).code !== 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED') throw error;
          needsSnapshot = true; replay = null; candidate = null;
        }
      }
      if (needsSnapshot) await snapshot(read, guard);
      await selectedDetail(read, guard);
    } catch (error) {
      if (signal.aborted || disposed || runEpoch !== epoch) return;
      const failure = workspaceReadFailure(error);
      if (['WORKSPACE_EVENT_RESNAPSHOT_REQUIRED', 'WORKSPACE_REVISION_CONFLICT', 'WORKSPACE_NODE_NOT_FOUND',
        'WORKSPACE_READ_CONTRACT_INVALID'].includes(failure.code)) {
        needsSnapshot = true; candidate = null; replay = null;
      }
      if (failure.code === 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED' && state.access !== 'blocked') {
        const head = state.status?.last_event_sequence ?? state.graph?.snapshot_sequence ?? 0;
        if (autoResnapshotHead !== head) {
          autoResnapshotHead = head;
          recoveryPending = true;
          publish({ error: null, stale: true, detailStale: !!state.selectedNodeId });
          return;
        }
      }
      const blocked = ['AUTH_REQUIRED', 'WORKSPACE_READ_FORBIDDEN', 'WORKSPACE_NOT_FOUND',
        'WORKSPACE_READ_DISABLED', 'WORKSPACE_READ_INPUT_INVALID', 'WORKSPACE_READ_LIMIT',
        'WORKSPACE_READ_CONTRACT_INVALID'].includes(failure.code);
      publish({ error: failure, stale: true, detailStale: !!state.selectedNodeId,
        access: blocked ? 'blocked' : state.access });
    } finally {
      if (!disposed && runEpoch === epoch) publish({ busy: false });
    }
  }
  function pump(): Promise<void> {
    if (disposed || !state.opened) return Promise.resolve();
    if (flight) { urgent = true; return flight; }
    clearTimer(); urgent = false;
    controller = new AbortController();
    flight = tick(epoch, controller.signal).finally(() => {
      flight = null; controller = null;
      // A paged snapshot/replay is a bounded continuation of one received
      // event, not an idle polling timer. Complete it even when a run has just
      // become terminal, otherwise large committed graphs can remain partial.
      if (recoveryPending && !disposed && state.opened && state.access !== 'blocked') {
        recoveryPending = false;
        queueMicrotask(() => { if (!disposed && state.opened) void pump(); });
      } else if (eventDriven && (candidate || replay || urgent) && !disposed && state.opened && state.access !== 'blocked') {
        queueMicrotask(() => { if (!disposed && state.opened) void pump(); });
      } else {
        schedule(urgent ? 0 : state.visible ? WORKSPACE_VISIBLE_POLL_MS : WORKSPACE_HIDDEN_POLL_MS);
      }
    });
    return flight;
  }
  function close() {
    epoch++; clearTimer(); controller?.abort(); candidate = null; replay = null;
    urgent = false; recoveryPending = false; autoResnapshotHead = null;
    publish({ opened: false, busy: false });
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(visible = true): Promise<void> {
      if (disposed) return Promise.resolve();
      publish({ opened: true, visible, access: 'unknown' });
      return pump();
    },
    close,
    setVisible(visible: boolean) {
      if (disposed || state.visible === visible) return;
      publish({ visible });
      if (visible && state.opened) void pump();
      else if (!flight) schedule(WORKSPACE_HIDDEN_POLL_MS);
    },
    setUiLocale(value: WorkspaceLocale) {
      if (value !== 'en' && value !== 'vi') throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
      locale = value; // Content language is pinned by check(), never translated here.
    },
    refresh(): Promise<void> {
      if (disposed || !state.opened) return Promise.resolve();
      autoResnapshotHead = null; recoveryPending = false;
      publish({ access: 'unknown' });
      return pump();
    },
    /** Called only by the authenticated stream transport after it has accepted
     * a bounded, metadata-only committed event or a replay head. It never
     * dispatches a command and intentionally coalesces while one read is in
     * flight. */
    notifyCommittedEvent(sequence: number): Promise<void> {
      if (!Number.isSafeInteger(sequence) || sequence < 0) throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
      if (disposed || !state.opened || state.access === 'blocked') return Promise.resolve();
      if (sequence <= (state.status?.last_event_sequence ?? state.graph?.snapshot_sequence ?? 0) && !state.stale) return Promise.resolve();
      urgent = true;
      return pump();
    },
    /** Switch between commit-hint delivery and bounded polling without
     * creating a second reader. A degraded/reconnecting SSE transport must not
     * strand an active workspace until its next auth-lease reconnect. */
    setEventDriven(enabled: boolean) {
      if (disposed || eventDriven === enabled) return;
      eventDriven = enabled;
      if (enabled) { clearTimer(); return; }
      if (!state.opened || state.access === 'blocked'
        || WORKSPACE_TERMINAL_RUN_STATES.includes(state.status?.status as typeof WORKSPACE_TERMINAL_RUN_STATES[number])) return;
      if (flight) urgent = true;
      else schedule(0);
    },
    selectNode(nodeId: string | null): Promise<void> {
      if (disposed) return Promise.resolve();
      if (nodeId !== null && !state.graph?.nodes.some(n => n.node_id === nodeId)) throw new WorkspaceReadError('WORKSPACE_NODE_NOT_FOUND');
      publish({ selectedNodeId: nodeId, detail: null, detailStale: nodeId !== null });
      return state.access === 'blocked' ? Promise.resolve() : pump();
    },
    setLocalDraft(nodeId: string, content: WorkspaceContent) {
      if (disposed) return;
      const previous = state.drafts[nodeId];
      const detail = state.detail?.node_id === nodeId ? state.detail : null;
      if (!previous && (state.access !== 'allowed' || state.detailStale || detail?.current_revision == null)) {
        throw new WorkspaceReadError('WORKSPACE_REVISION_CONFLICT');
      }
      if (!previous && Object.keys(state.drafts).length >= WORKSPACE_MAX_DIRTY_NODES
        || new TextEncoder().encode(JSON.stringify(content)).byteLength > 2 * 1024 * 1024) throw new WorkspaceReadError('WORKSPACE_READ_LIMIT');
      publish({ drafts: { ...state.drafts, [nodeId]: { baseRevision: previous?.baseRevision ?? detail!.current_revision!,
        content: structuredClone(content), conflict: previous?.conflict ?? false } } });
    },
    discardLocalDraft(nodeId: string) {
      const drafts = { ...state.drafts }; delete drafts[nodeId]; publish({ drafts });
    },
    dispose() {
      close(); disposed = true; listeners.clear(); identity = null;
      state = freeze({ ...state, status: null, graph: null, detail: null, drafts: {}, selectedNodeId: null });
    },
  };
}
