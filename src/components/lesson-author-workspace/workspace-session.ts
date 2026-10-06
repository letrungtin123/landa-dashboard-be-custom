import type { WorkspaceReadClient, WorkspaceReadScope } from '../../api/lesson-author-workspace';
import { isWorkspaceId, readWorkspaceDetail, WorkspaceReadError, workspaceReadFailure,
  type WorkspaceContent, type WorkspaceDetail, type WorkspaceLocale, type WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import { WorkspaceWriteError, type WorkspaceWriteClient } from '../../api/workspace-write';
import { createWorkspaceReadState, type WorkspaceReadState } from './workspace-read-state';
import { createWorkspaceWriteState, type WorkspaceWriteState } from './workspace-write-state';
import type { WorkspaceNodeEditorProps } from './workspace-node-editor';

export interface WorkspaceSessionIdentity extends WorkspaceReadScope { actorId: string; tenantId: string }
export const WORKSPACE_SESSION_MAX_STORES = 16;
export const WORKSPACE_OVERVIEW_READS_PER_LOAD = 4;
export const WORKSPACE_OVERVIEW_MAX_NODES = 128;
export const WORKSPACE_OVERVIEW_MAX_BYTES = 8 * 1024 * 1024;
interface LocalDraft { content: WorkspaceContent; baseRevision: number; version: number }
interface Entry {
  store: ReturnType<typeof createWorkspaceWriteState>;
  unsubscribe: () => void;
  local: LocalDraft | null;
  submittedVersion: number | null;
  observed: WorkspaceDetail | null;
}
export interface WorkspaceSessionState {
  identity: Readonly<WorkspaceSessionIdentity>;
  disposed: boolean;
  read: Readonly<WorkspaceReadState>;
  writes: Readonly<Record<string, Readonly<WorkspaceWriteState>>>;
  drafts: Readonly<Record<string, Readonly<LocalDraft>>>;
  writeBusy: boolean;
  overview: { head: number | null; details: readonly WorkspaceDetail[]; complete: boolean; loading: boolean };
  delivery: 'polling' | 'connecting' | 'live' | 'reconnecting' | 'blocked' | 'unavailable' | 'closed';
  error: WorkspaceReadError | WorkspaceWriteError | null;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const identityKey = (v: WorkspaceSessionIdentity) => JSON.stringify([v.actorId.toLowerCase(), v.tenantId.toLowerCase(),
  v.courseId, v.conversationId.toLowerCase(), v.workspaceId.toLowerCase()]);

/** One host-owned instance per authenticated identity/scope; multiple views
 * subscribe to this SAME instance. Construction has no I/O. Only this reader
 * owns polling. The injected clients must be bound to the supplied scope.
 * No runtime host, flag, React component, editor, provider or Apply is activated.
 */
export function createWorkspaceSession(identity: WorkspaceSessionIdentity, dependencies: {
  readClient: WorkspaceReadClient;
  writeClient: WorkspaceWriteClient;
  uiLocale?: WorkspaceLocale;
  scheduler?: NonNullable<Parameters<typeof createWorkspaceReadState>[1]>['scheduler'];
  operationId?: () => string;
  /** Opt in only when the host owns an authenticated committed-event stream. */
  eventDriven?: boolean;
}) {
  if (![identity.actorId, identity.tenantId, identity.conversationId, identity.workspaceId].every(isWorkspaceId)
    || typeof identity.courseId !== 'string' || !identity.courseId.trim()) throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
  const bound = Object.freeze({ ...identity }), key = identityKey(bound);
  let locale = dependencies.uiLocale ?? 'vi';
  let disposed = false, epoch = 0, version = 0, syncing = false, writeBusy = false;
  let manual = new AbortController();
  let queue = Promise.resolve(), queued = 0;
  let opening: Promise<void> | null = null;
  let overviewFlight: Promise<void> | null = null;
  let detailFlight: { nodeId: string; promise: Promise<void> } | null = null;
  let overviewHead: number | null = null, overviewComplete = false;
  let error: WorkspaceReadError | WorkspaceWriteError | null = null;
  let readFault = false;
  let delivery: WorkspaceSessionState['delivery'] = dependencies.eventDriven ? 'connecting' : 'polling';
  const entries = new Map<string, Entry>();
  const details = new Map<string, WorkspaceDetail>();
  const overview = new Map<string, WorkspaceDetail>();
  const listeners = new Set<() => void>();
  let snapshot: Readonly<WorkspaceSessionState>;

  // Every GET, including overview and reconciliation, passes the same queue.
  // At most one request is in flight and at most four are admitted, not an
  // unbounded promise backlog when views repeatedly request the same data.
  function serial<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    if (disposed || signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (queued >= 4) return Promise.reject(new WorkspaceReadError('WORKSPACE_READ_LIMIT'));
    queued++;
    const generation = epoch;
    const run = queue.then(async () => {
      signal.throwIfAborted();
      if (disposed || generation !== epoch) throw new DOMException('Aborted', 'AbortError');
      const result = await work();
      signal.throwIfAborted();
      if (disposed || generation !== epoch) throw new DOMException('Aborted', 'AbortError');
      return result;
    });
    queue = run.then(() => undefined, () => undefined);
    return run.finally(() => { queued--; });
  }
  function checkedDetail(value: WorkspaceDetail, node: WorkspaceNode, head: number) {
    const d = readWorkspaceDetail(value), graph = reader.getState().graph;
    if (!graph || d.workspace_id !== bound.workspaceId || d.node_id !== node.node_id || d.correlation_id !== graph.correlation_id
      || d.content_locale !== graph.content_locale || d.current_revision !== node.current_revision
      || d.parent_id !== node.parent_id || d.kind !== node.kind || d.content_state !== node.content_state
      || d.last_event_sequence !== head || graph.snapshot_sequence !== head) {
      throw new WorkspaceReadError('WORKSPACE_REVISION_CONFLICT');
    }
    return freeze(structuredClone(d));
  }
  function detailMatchesNode(detail: WorkspaceDetail, node: WorkspaceNode, graph: NonNullable<WorkspaceReadState['graph']>) {
    return detail.workspace_id === graph.workspace_id && detail.correlation_id === graph.correlation_id
      && detail.content_locale === graph.content_locale && detail.node_id === node.node_id
      && detail.parent_id === node.parent_id && detail.kind === node.kind
      && detail.current_revision === node.current_revision && detail.content_state === node.content_state;
  }
  const client: WorkspaceReadClient = {
    status: options => serial(options.signal, () => dependencies.readClient.status(options)),
    events: (after, options) => serial(options.signal, () => dependencies.readClient.events(after, options)),
    graph: (cursor, options) => serial(options.signal, () => dependencies.readClient.graph(cursor, options)),
    detail: (nodeId, revision, options) => serial(options.signal, async () => {
      const value = await dependencies.readClient.detail(nodeId, revision, options);
      // Reader selection uses the same exact graph/head check as overview.
      const graph = reader.getState().graph, node = graph?.nodes.find(n => n.node_id === nodeId);
      if (!graph || !node) throw new WorkspaceReadError('WORKSPACE_NODE_NOT_FOUND');
      const result = checkedDetail(value, node, graph.snapshot_sequence);
      if (!options.signal.aborted && entries.has(nodeId)) details.set(nodeId, result);
      return result;
    }),
  };
  const reader = createWorkspaceReadState(client, { uiLocale: locale, scheduler: dependencies.scheduler,
    eventDriven: dependencies.eventDriven === true });
  function readable() {
    const r = reader.getState();
    return !disposed && r.opened && r.access === 'allowed' && !r.stale && !r.error && !!r.graph && !readFault;
  }
  function emit() {
    snapshot = freeze({ identity: bound, disposed, read: reader.getState(), writeBusy,
      writes: Object.fromEntries([...entries].map(([id, e]) => [id, e.store.getState()])),
      drafts: Object.fromEntries([...entries].filter(([, e]) => e.local).map(([id, e]) => [id, e.local!])),
      overview: { head: overviewHead, details: readable() ? [...overview.values()] : [],
        complete: readable() && overviewComplete, loading: !!overviewFlight }, delivery, error });
    for (const listener of listeners) { try { listener(); } catch { /* Views cannot retry I/O. */ } }
  }
  function clearCaches() { details.clear(); overview.clear(); overviewHead = null; overviewComplete = false; }
  function overviewNodes() {
    return (reader.getState().graph?.nodes ?? []).filter(n => n.kind === 'course' || n.kind === 'chapter')
      .sort((a, b) => (a.kind === 'course' ? -1 : b.kind === 'course' ? 1 : a.sort_order - b.sort_order || a.node_id.localeCompare(b.node_id)));
  }
  /** A unit commit advances the workspace event head but cannot mutate an
   * immutable course/chapter revision. Keep those exact-revision details and
   * invalidate only nodes whose identity or revision actually changed. */
  function reconcileOverview() {
    const graph = reader.getState().graph;
    if (!graph) { overview.clear(); overviewHead = null; overviewComplete = false; return; }
    const nodes = overviewNodes(), byId = new Map(nodes.map(node => [node.node_id, node]));
    for (const [nodeId, detail] of overview) {
      const node = byId.get(nodeId);
      if (!node || detail.workspace_id !== graph.workspace_id || detail.correlation_id !== graph.correlation_id
        || detail.content_locale !== graph.content_locale || detail.kind !== node.kind
        || detail.current_revision !== node.current_revision || detail.content_state !== node.content_state) overview.delete(nodeId);
    }
    overviewHead = graph.snapshot_sequence;
    overviewComplete = overview.size === nodes.length;
  }
  function invalidate() {
    for (const entry of entries.values()) if (!entry.store.getState().readRequired) entry.store.invalidateRead();
  }
  function failRead(failure: unknown) {
    error = workspaceReadFailure(failure); readFault = true; clearCaches(); invalidate(); emit();
  }
  function sync() {
    if (disposed || syncing) return;
    syncing = true;
    try {
      const r = reader.getState();
      if (!readable()) {
        // A status-head/graph-head crossing is an expected transient during a
        // commit. Retain exact-revision overview data privately so the next
        // authoritative graph can reconcile it; emit() still hides everything
        // while stale. Real loss of scope/authority clears the cache.
        const authorityLost = !r.opened || r.access === 'blocked' || !r.graph || !!r.error || readFault;
        if (authorityLost) { clearCaches(); invalidate(); }
      }
      else {
        const head = r.graph!.snapshot_sequence;
        reconcileOverview();
        for (const [id, entry] of entries) {
          const d = details.get(id), node = r.graph!.nodes.find(n => n.node_id === id), w = entry.store.getState();
          // Event-head advances caused by Apply do not mutate append-only node
          // revisions. Retain the exact detail while the graph proves the same
          // node identity/revision; this prevents a modal skeleton/remount.
          if (!d || !node || !detailMatchesNode(d, node, r.graph!)) {
            details.delete(id); if (!w.readRequired) entry.store.invalidateRead();
          } else if (!writeBusy && (entry.observed !== d || w.readRequired)) {
            entry.store.observeDetail(d);
            entry.observed = d;
            const updated = entry.store.getState();
            if (updated.phase === 'committed' && entry.local?.version === entry.submittedVersion
              && (updated.operation?.kind === 'save' && !updated.draft
                || updated.operation?.kind === 'reset' && updated.receipt?.revision === d.current_revision
                  && updated.receipt.user_modified === false && d.user_modified === false)) entry.local = null;
          }
        }
      }
      emit();
    } finally { syncing = false; }
    // The underlying reader may reuse detail after an unchanged-head reconnect.
    // One lazy GET re-authorizes the selected editor, without another poller.
    const selected = reader.getState().selectedNodeId;
    if (readable() && !reader.getState().busy && !writeBusy && selected && entries.has(selected)
      && !details.has(selected) && !detailFlight) void loadNode(selected);
  }
  const unsubscribeReader = reader.subscribe(sync);
  function active() { if (disposed) throw new WorkspaceWriteError('WORKSPACE_EDIT_STATE_INVALID'); }
  function graphNode(nodeId: string) {
    if (!readable()) throw new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED');
    const node = reader.getState().graph!.nodes.find(n => n.node_id === nodeId);
    if (!node) throw new WorkspaceReadError('WORKSPACE_NODE_NOT_FOUND');
    return node;
  }
  function entryFor(nodeId: string): Entry {
    active(); const found = entries.get(nodeId); if (found) return found;
    graphNode(nodeId);
    if (entries.size >= WORKSPACE_SESSION_MAX_STORES) {
      const clean = [...entries].find(([id, e]) => {
        const w = e.store.getState();
        return id !== reader.getState().selectedNodeId && id !== detailFlight?.nodeId && !e.local && !w.draft
          && w.phase !== 'sending' && w.phase !== 'unknown' && !(w.receipt && w.readRequired);
      });
      if (!clean) throw new WorkspaceReadError('WORKSPACE_READ_LIMIT');
      clean[1].unsubscribe(); clean[1].store.dispose(); entries.delete(clean[0]); details.delete(clean[0]);
    }
    const graph = reader.getState().graph!;
    const store = createWorkspaceWriteState(dependencies.writeClient, { workspaceId: bound.workspaceId, nodeId,
      correlationId: graph.correlation_id, contentLocale: graph.content_locale }, { uiLocale: locale, operationId: dependencies.operationId });
    // observeDetail() publishes several internal write-store fields before the
    // session has reconciled its parallel local draft. Coalesce that nested
    // notification into sync()'s final emit so consumers never observe a
    // one-render false conflict (the visible modal/button "double jump").
    const entry: Entry = { store, unsubscribe: store.subscribe(() => { if (!syncing) emit(); }), local: null, submittedVersion: null, observed: null };
    entries.set(nodeId, entry); emit(); return entry;
  }
  async function loadNode(nodeId: string): Promise<void> {
    const generation = epoch;
    if (detailFlight) {
      await detailFlight.promise;
      if (!disposed && generation === epoch && readable() && entries.has(nodeId) && !details.has(nodeId)) return loadNode(nodeId);
      return;
    }
    const run = Promise.resolve().then(async () => {
      if (!readable() || generation !== epoch) return;
      const node = graphNode(nodeId), head = reader.getState().graph!.snapshot_sequence;
      try {
        const d = await client.detail(nodeId, node.current_revision, { signal: manual.signal, uiLocale: locale });
        if (disposed || generation !== epoch) return;
        details.set(nodeId, checkedDetail(d, node, head));
      } catch (failure) {
        if (!disposed && generation === epoch) failRead(failure);
      }
    }).finally(() => {
      detailFlight = null;
      if (!disposed && generation === epoch) sync();
    });
    detailFlight = { nodeId, promise: run }; return run;
  }
  async function refresh() {
    active(); if (!reader.getState().opened) return;
    readFault = false; error = null;
    // Manual refresh re-authorizes status/events but must not discard immutable
    // exact-revision details. sync() reconciles both caches against the next
    // authoritative graph and invalidates only identities/revisions that
    // actually changed. Clearing here caused one click to fan out into every
    // course/chapter detail GET and made complete overviews skeleton again.
    await reader.refresh();
    if (readable()) {
      const selected = reader.getState().selectedNodeId;
      if (selected && !details.has(selected)) await loadNode(selected);
    }
    sync();
  }
  async function refreshForApply(targetSequence?: number) {
    active(); if (!reader.getState().opened) return;
    readFault = false; error = null;
    // Do not clear immutable exact-revision detail/overview caches. sync()
    // reconciles them against the new authoritative graph and invalidates only
    // identities or revisions that actually changed. A committed-event refresh
    // also preserves the last authorized presentation while the status/graph
    // heads catch up; reader.refresh() deliberately drops access to "unknown"
    // and made the open detail modal unmount/remount after every action.
    const currentSequence = reader.getState().graph?.snapshot_sequence;
    if (currentSequence == null) await reader.refresh();
    else await reader.notifyCommittedEvent(targetSequence ?? currentSequence + 1);
    if (readable()) {
      const selected = reader.getState().selectedNodeId;
      if (selected && !details.has(selected)) await loadNode(selected);
    }
    sync();
  }
  function localChange(nodeId: string, content: WorkspaceContent) {
    const entry = entryFor(nodeId), w = entry.store.getState();
    // Temporarily invalid text stays controlled locally; Save performs the
    // stricter write-client validation. Do not lose an empty-title keystroke.
    const copy = structuredClone(content);
    if (!copy || typeof copy.title !== 'string' || !Object.prototype.hasOwnProperty.call(copy, 'data')
      || Object.keys(copy).length !== 4 || !['title', 'purpose', 'data', 'implementation_notes'].every(k => Object.prototype.hasOwnProperty.call(copy, k))
      || bytes(copy) > 2 * 1024 * 1024) throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID');
    const baseRevision = entry.local?.baseRevision ?? w.draft?.baseRevision ?? w.detail?.current_revision;
    if (baseRevision == null) throw new WorkspaceWriteError('WORKSPACE_NODE_NOT_READY');
    entry.local = freeze({ content: copy, baseRevision, version: ++version });
    if (error instanceof WorkspaceWriteError
      && (error.code === 'WORKSPACE_EDIT_VALIDATION_REQUIRED' || error.code === 'WORKSPACE_EDIT_INPUT_INVALID')) error = null;
    emit();
  }
  async function write(nodeId: string, action: 'save' | 'reset' | 'replay', expectedRevision?: number) {
    active(); if (writeBusy) throw new WorkspaceWriteError('WORKSPACE_EDIT_BUSY');
    graphNode(nodeId);
    const entry = entryFor(nodeId), w = entry.store.getState();
    if (w.readRequired) throw new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED');
    if (action !== 'replay' && (expectedRevision !== w.detail?.current_revision
      || action === 'save' && entry.local?.baseRevision !== expectedRevision)) throw new WorkspaceWriteError('WORKSPACE_REVISION_CONFLICT');
    if (action === 'save') {
      if (!entry.local) throw new WorkspaceWriteError('WORKSPACE_EDIT_INPUT_INVALID');
      entry.store.setDraft(entry.local.content); entry.submittedVersion = entry.local.version;
    }
    if (action === 'reset') entry.submittedVersion = entry.local?.version ?? null;
    writeBusy = true; emit();
    const generation = epoch;
    try {
      await (action === 'save' ? entry.store.save() : action === 'reset'
        ? entry.store.reset({ confirmed: true, expectedRevision: expectedRevision! }) : entry.store.replay());
    } finally {
      writeBusy = false;
      // A dispatched write invalidates only the target revision. Retaining the
      // exact detail cache keeps the modal mounted while the authoritative
      // graph/detail readback catches up; editorProps() keeps it read-only.
      // Clearing every cache here made unrelated editors conflict and caused
      // the selected detail body to flash through its skeleton state.
      if (!disposed) { error = entry.store.getState().error; emit(); }
    }
    // close() never cancels a dispatched write. Keep its receipt, and defer
    // authorized reconciliation until reopen if the popup closed meanwhile.
    if (!disposed && generation === epoch && reader.getState().opened && entry.store.getState().phase === 'committed') {
      const receipt = entry.store.getState().receipt!;
      await refreshForApply(receipt.event_sequence);
      if (readable() && reader.getState().graph!.snapshot_sequence < receipt.event_sequence) await refreshForApply();
      if (readable() && !details.has(nodeId)) await loadNode(nodeId);
      sync();
    }
  }
  function close() {
    if (disposed) return;
    epoch++; manual.abort(); manual = new AbortController(); opening = null;
    reader.close(); clearCaches(); invalidate(); emit();
  }
  function dispose() {
    if (disposed) return;
    close(); disposed = true; unsubscribeReader(); reader.dispose();
    for (const entry of entries.values()) { entry.unsubscribe(); entry.store.dispose(); }
    entries.clear(); clearCaches(); listeners.clear(); writeBusy = false; emit();
  }
  emit();
  return {
    getState: () => snapshot,
    subscribe(listener: () => void) { active(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(currentIdentity: WorkspaceSessionIdentity = bound, visible = true): Promise<void> {
      active();
      if (identityKey(currentIdentity) !== key) { dispose(); throw new WorkspaceWriteError('WORKSPACE_EDIT_FORBIDDEN'); }
      if (opening) return opening;
      if (reader.getState().opened) { reader.setVisible(visible); return Promise.resolve(); }
      readFault = false; error = null;
      const generation = epoch;
      const run = Promise.resolve().then(async () => {
        if (disposed || generation !== epoch) return;
        await reader.open(visible);
        if (!disposed && generation === epoch && reader.getState().access === 'unknown') await reader.refresh();
        if (readable() && reader.getState().selectedNodeId) await loadNode(reader.getState().selectedNodeId!);
      }).finally(() => { if (opening === run) opening = null; });
      opening = run; return run;
    },
    close, dispose, refresh, refreshForApply,
    notifyCommittedEvent(sequence: number) {
      active();
      return reader.notifyCommittedEvent(sequence).then(() => { sync(); });
    },
    setDeliveryState(next: WorkspaceSessionState['delivery']) {
      active();
      // Live SSE owns wakeups. Connecting/reconnecting/unavailable transports
      // degrade to the existing bounded polling; blocked auth must not retry.
      reader.setEventDriven(next === 'live' || next === 'blocked');
      if (delivery !== next) { delivery = next; emit(); }
    },
    setVisible(visible: boolean) { active(); reader.setVisible(visible); },
    setUiLocale(value: WorkspaceLocale) {
      active(); reader.setUiLocale(value); locale = value;
      for (const e of entries.values()) e.store.setUiLocale(value); emit();
    },
    async selectNode(nodeId: string | null) {
      active(); if (nodeId !== null) entryFor(nodeId);
      await reader.selectNode(nodeId); sync();
    },
    setDraft: localChange,
    save: (nodeId: string, expectedRevision: number) => write(nodeId, 'save', expectedRevision),
    /** Call only from an explicit confirmed Reset, e.g. the editor's onReset. */
    reset: (nodeId: string, confirmation: { confirmed: true; expectedRevision: number }) => {
      if (confirmation?.confirmed !== true) throw new WorkspaceWriteError('WORKSPACE_EDIT_RESET_CONFIRMATION_REQUIRED');
      return write(nodeId, 'reset', confirmation.expectedRevision);
    },
    replay: (nodeId: string) => write(nodeId, 'replay'),
    rebaseDraft(nodeId: string, expectedRevision: number) {
      const entry = entryFor(nodeId), w = entry.store.getState(); graphNode(nodeId);
      if (writeBusy || w.readRequired || w.phase === 'unknown' || w.detail?.current_revision !== expectedRevision) throw new WorkspaceWriteError('WORKSPACE_REVISION_CONFLICT');
      if (w.draft) entry.store.rebaseDraft(expectedRevision);
      if (entry.local) entry.local = freeze({ ...entry.local, baseRevision: expectedRevision, version: ++version }); emit();
    },
    discardDraft(nodeId: string) {
      const entry = entryFor(nodeId); entry.store.discardDraft(); entry.local = null; emit();
    },
    /** Controlled props only; this type import does not mount the editor. */
    editorProps(nodeId: string): WorkspaceNodeEditorProps {
      const entry = entries.get(nodeId), w = entry?.store.getState(), r = reader.getState();
      const graph = r.graph, node = graph?.nodes.find(candidate => candidate.node_id === nodeId);
      // A transient status/graph crossing may make writes unavailable, but an
      // exact immutable detail remains safe to display. Write methods still
      // require readable() and therefore cannot use stale authority.
      const scoped = !!w?.detail && !!graph && !!node && r.opened && r.access === 'allowed' && !readFault && !r.error
        && w.detail.workspace_id === graph.workspace_id && w.detail.correlation_id === graph.correlation_id
        && w.detail.content_locale === graph.content_locale && w.detail.node_id === node.node_id
        && w.detail.parent_id === node.parent_id && w.detail.kind === node.kind;
      const authoritative = scoped && detailMatchesNode(w!.detail!, node!, graph!);
      const reconcilingOwnWrite = !!scoped && !!w?.readRequired
        && (w.phase === 'sending' || w.phase === 'committed')
        && w.operation?.nodeId === nodeId;
      // A previous revision is presentation-only during this node's own
      // acknowledged write. It is never accepted by graphNode()/write(), and
      // busy below prevents stale controls from dispatching another action.
      const allowed = authoritative || reconcilingOwnWrite;
      const local = entry?.local;
      return { detail: allowed ? w!.detail : null, draft: allowed ? local?.content ?? w?.draft?.content ?? w!.detail?.content ?? null : null,
        baseRevision: local?.baseRevision ?? w?.draft?.baseRevision ?? w?.detail?.current_revision ?? null,
        access: allowed ? 'allowed' : r.access === 'blocked' || readFault ? 'blocked' : 'unknown', locale,
        busy: writeBusy || reconcilingOwnWrite || r.stale || r.busy,
        conflict: !reconcilingOwnWrite && (!!w?.readRequired || w?.phase === 'unknown' || !!w?.draft?.conflict
          || !!local && local.baseRevision !== w?.detail?.current_revision),
        onChange: value => localChange(nodeId, value),
        onSave: (value, revision) => { localChange(nodeId, value); void write(nodeId, 'save', revision).catch(failure => {
          if (!disposed) { error = failure instanceof WorkspaceWriteError ? failure : new WorkspaceWriteError('WORKSPACE_EDIT_UNAVAILABLE', 'unknown'); emit(); }
        }); },
        onReset: revision => { void write(nodeId, 'reset', revision).catch(failure => {
          if (!disposed) { error = failure instanceof WorkspaceWriteError ? failure : new WorkspaceWriteError('WORKSPACE_EDIT_UNAVAILABLE', 'unknown'); emit(); }
        }); },
      };
    },
    /** Explicit bounded batch. Call again for remaining course/chapter details.
     * Complete means the metadata cache was read, NOT instructional acceptance. */
    loadOverview(): Promise<void> {
      active(); if (overviewFlight) return overviewFlight;
      const generation = epoch;
      const run = Promise.resolve().then(async () => {
        try {
          if (!readable()) throw new WorkspaceReadError('WORKSPACE_READ_UNAVAILABLE');
          const graph = reader.getState().graph!, head = graph.snapshot_sequence;
          const nodes = overviewNodes();
          if (!graph.overview_ready || !graph.structure_ready) { overviewComplete = false; return; }
          if (nodes.length > WORKSPACE_OVERVIEW_MAX_NODES) throw new WorkspaceReadError('WORKSPACE_READ_LIMIT');
          reconcileOverview();
          for (const node of nodes.filter(n => !overview.has(n.node_id)).slice(0, WORKSPACE_OVERVIEW_READS_PER_LOAD)) {
            if (!readable() || generation !== epoch) return;
            const d = await client.detail(node.node_id, node.current_revision, { signal: manual.signal, uiLocale: locale });
            if (disposed || generation !== epoch) return;
            checkedDetail(d, node, head);
            if (bytes([...overview.values(), d]) > WORKSPACE_OVERVIEW_MAX_BYTES) throw new WorkspaceReadError('WORKSPACE_READ_LIMIT');
            overview.set(node.node_id, d);
            overviewComplete = overview.size === nodes.length;
            emit();
          }
          overviewComplete = overview.size === nodes.length;
        } catch (failure) { if (!disposed && generation === epoch) failRead(failure); }
      }).finally(() => { overviewFlight = null; if (!disposed && generation === epoch) sync(); });
      overviewFlight = run; emit(); return run;
    },
  };
}
