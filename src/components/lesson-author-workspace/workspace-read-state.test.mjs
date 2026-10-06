import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const contractUrl = compile(readFileSync(new URL('../../api/lesson-author-workspace.contract.ts', import.meta.url), 'utf8'));
const { WorkspaceReadError } = await import(contractUrl);
const source = readFileSync(new URL('./workspace-read-state.ts', import.meta.url), 'utf8');
const { createWorkspaceReadState, WORKSPACE_MAX_GRAPH_NODES, WORKSPACE_PLANNING_POLL_MS,
  WORKSPACE_TRANSIENT_RETRY_LIMIT, WORKSPACE_TRANSIENT_RETRY_MAX_MS } = await import(compile(source
  .replace("'../../api/lesson-author-workspace.contract'", JSON.stringify(contractUrl))));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { workspace_id: id(90000), correlation_id: id(90001), contract_version: 1, content_locale: 'vi',
  status: 'drafting', last_event_sequence: 1, updated_at: '2026-09-29T00:00:00.000Z' };
const content = { title: 'Nội dung', purpose: null, data: { text: 'Original' }, implementation_notes: null };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function clock() {
  let task = null;
  return { set(callback, delay) { assert.equal(task, null, 'one timer only'); task = { callback, delay }; return task; },
    clear(handle) { if (handle === task) task = null; },
    get delay() { return task?.delay; },
    fire() { assert.ok(task); const { callback } = task; task = null; callback(); } };
}
function fixture(count = 1, eventDriven = false) {
  const scheduler = clock();
  const calls = [];
  let head = 1, revision = 0, runStatus = 'drafting', structureReady = true;
  let nodes = Array.from({ length: count }, (_, i) => ({ node_id: id(i + 1), parent_id: i ? id(1) : null,
    kind: i ? 'chapter' : 'course', canonical_path: `course.n${i}`, sort_order: i, content_state: 'content_ready',
    current_revision: revision, title: `Title ${i}`, user_modified: false, applied: false }));
  const view = () => ({ ...base, status: runStatus, last_event_sequence: head });
  const client = {
    async status(options) { calls.push(['status', options]); return { ...view(), node_count: nodes.length, unit_count: 0, ready_unit_count: 0 }; },
    async graph(cursor, options) {
      calls.push(['graph', { ...cursor }, options]);
      if (cursor.snapshot_sequence !== undefined && cursor.snapshot_sequence !== head) throw new WorkspaceReadError('WORKSPACE_EVENT_RESNAPSHOT_REQUIRED');
      if (!structureReady) return { ...view(), snapshot_sequence: head, total_nodes: 0, overview_ready: false,
        structure_ready: false, nodes: [], has_more: false, next_after_node_id: null };
      const start = cursor.after_node_id ? nodes.findIndex(n => n.node_id === cursor.after_node_id) + 1 : 0;
      const page = nodes.slice(start, start + 100).map(n => ({ ...n }));
      const more = start + page.length < nodes.length;
      return { ...view(), snapshot_sequence: head, total_nodes: nodes.length, overview_ready: true,
        structure_ready: true, nodes: page, has_more: more, next_after_node_id: more ? page.at(-1).node_id : null };
    },
    async events(after, options) {
      calls.push(['events', after, options]);
      const events = Array.from({ length: Math.min(100, Math.max(0, head - after)) }, (_, i) => ({ sequence: after + i + 1,
        event_kind: 'node_revision_saved', node_id: id(1), node_revision: revision, operation_id: id(80000 + i), created_at: base.updated_at }));
      return { ...view(), events, next_sequence: after + events.length, has_more: after + events.length < head };
    },
    async detail(nodeId, expected, options) {
      calls.push(['detail', nodeId, expected, options]);
      const n = nodes.find(n => n.node_id === nodeId);
      if (expected !== n.current_revision) throw new WorkspaceReadError('WORKSPACE_REVISION_CONFLICT');
      return { ...view(), node_id: nodeId, parent_id: n.parent_id, kind: n.kind, content_state: n.content_state,
        current_revision: n.current_revision, content: { ...content, title: n.title }, user_modified: n.user_modified,
        validation_contract: 'workspace-aggregate-edit-1' };
    },
  };
  const store = createWorkspaceReadState(client, { scheduler, eventDriven });
  return { store, client, calls, scheduler,
    change(nextHead, nextRevision = revision) { head = nextHead; revision = nextRevision; nodes = nodes.map(n => ({ ...n, current_revision: revision })); },
    setNodes(value) { nodes = value; }, setStatus(value) { runStatus = value; },
    setStructureReady(value) { structureReady = value; },
    get nodes() { return nodes; },
  };
}
async function settle() { for (let i = 0; i < 50; i++) await Promise.resolve(); }

test('inert construction, visible 1s / hidden 15s, immediate reopen and no invented progress', async () => {
  const f = fixture();
  assert.equal(f.calls.length, 0); assert.equal(f.store.getState().status, null);
  await f.store.open();
  assert.equal(f.scheduler.delay, 1000); assert.equal(f.store.getState().status.ready_unit_count, 0);
  assert.equal(f.store.getState().graph.status, 'drafting');
  f.store.setVisible(false); assert.equal(f.scheduler.delay, 15000);
  f.scheduler.fire(); await settle(); assert.equal(f.scheduler.delay, 15000);
  const before = f.calls.length; f.store.setVisible(true); await settle();
  assert.ok(f.calls.length > before); assert.equal(f.scheduler.delay, 1000);
  f.store.close(); assert.equal(f.scheduler.delay, undefined);
  await f.store.open(); assert.equal(f.calls.at(-1)[0], 'events');
  assert.equal(f.calls.filter(c => c[0] === 'detail').length, 0);
  f.store.dispose(); assert.equal(f.scheduler.delay, undefined);
});

test('terminal workspace status stops background polling while explicit refresh remains available', async () => {
  const f = fixture(); f.setStatus('needs_action');
  await f.store.open();
  assert.equal(f.store.getState().status.status, 'needs_action');
  assert.equal(f.scheduler.delay, undefined, 'terminal status must not keep a 1s timer alive');
  const before = f.calls.filter(call => call[0] === 'status').length;
  await f.store.refresh();
  assert.equal(f.calls.filter(call => call[0] === 'status').length, before + 1);
  assert.equal(f.scheduler.delay, undefined); f.store.dispose();
});

test('event-driven mode has no idle timer, coalesces committed hints, and drains a terminal large snapshot', async () => {
  const f = fixture(1001, true);
  await f.store.open(); await settle();
  assert.equal(f.scheduler.delay, undefined);
  assert.equal(f.store.getState().graph.nodes.length, 1001);
  const statusBefore = f.calls.filter(call => call[0] === 'status').length;
  await f.store.notifyCommittedEvent(1);
  assert.equal(f.calls.filter(call => call[0] === 'status').length, statusBefore, 'same committed head is ignored');
  f.change(2, 1); await f.store.notifyCommittedEvent(2); await settle();
  assert.equal(f.store.getState().graph.snapshot_sequence, 2);
  assert.equal(f.scheduler.delay, undefined, 'event delivery never installs visible/hidden polling');
  f.store.dispose();
});

test('event-driven reader degrades to one bounded poller and stops it immediately when SSE recovers', async () => {
  const f = fixture(1, true);
  await f.store.open(); assert.equal(f.scheduler.delay, undefined);
  f.store.setEventDriven(false);
  assert.equal(f.scheduler.delay, 0, 'degraded transport requests an immediate reconciliation');
  f.scheduler.fire(); await settle();
  assert.equal(f.scheduler.delay, 1000, 'visible degraded workspace keeps exactly one bounded timer');
  f.store.setEventDriven(true);
  assert.equal(f.scheduler.delay, undefined, 'live SSE owns wakeups again');
  f.store.dispose();
});

test('event-driven reader reconciles unsealed planning until structure commits without requiring F5', async () => {
  const f = fixture(1, true); f.setStructureReady(false);
  await f.store.open();
  assert.equal(f.store.getState().graph.structure_ready, false);
  assert.equal(f.scheduler.delay, WORKSPACE_PLANNING_POLL_MS,
    'one bounded planning poll remains while SSE has no architecture progress events');
  const statusBefore = f.calls.filter(call => call[0] === 'status').length;
  f.scheduler.fire(); await settle();
  assert.equal(f.calls.filter(call => call[0] === 'status').length, statusBefore + 1);
  assert.equal(f.scheduler.delay, WORKSPACE_PLANNING_POLL_MS);
  f.setStructureReady(true); f.change(2, 1);
  f.scheduler.fire(); await settle();
  assert.equal(f.store.getState().graph.structure_ready, true);
  assert.equal(f.store.getState().graph.snapshot_sequence, 2);
  assert.equal(f.scheduler.delay, undefined, 'sealed graph returns ownership to SSE-only wakeups');
  f.store.dispose();
});

test('event-driven terminal workspace retries a failed reconciliation after SSE already advanced', async () => {
  const f = fixture(1, true); await f.store.open();
  const events = f.client.events; let failOnce = true;
  f.setStatus('needs_action'); f.change(2, 1);
  f.client.events = async (...args) => {
    if (failOnce) { failOnce = false; throw new WorkspaceReadError('WORKSPACE_READ_UNAVAILABLE', 503); }
    return events(...args);
  };
  await f.store.notifyCommittedEvent(2);
  assert.equal(f.store.getState().status.status, 'needs_action');
  assert.equal(f.store.getState().graph.snapshot_sequence, 1);
  assert.equal(f.store.getState().stale, true);
  assert.equal(f.scheduler.delay, 1_000,
    'terminal status and a sealed old graph must not suppress the bounded reconciliation retry');
  f.scheduler.fire(); await settle();
  assert.equal(f.store.getState().graph.snapshot_sequence, 2);
  assert.equal(f.store.getState().stale, false);
  assert.equal(f.store.getState().error, null);
  assert.equal(f.scheduler.delay, undefined, 'a reconciled terminal graph returns to zero polling');
  f.store.dispose();
});

test('SSE recovery cannot clear a pending sealed-graph retry', async () => {
  const f = fixture(1, true); await f.store.open();
  const status = f.client.status; let failOnce = true;
  f.change(2, 1);
  f.client.status = async (...args) => {
    if (failOnce) { failOnce = false; throw new WorkspaceReadError('WORKSPACE_READ_UNAVAILABLE', 503); }
    return status(...args);
  };
  await f.store.notifyCommittedEvent(2);
  assert.equal(f.scheduler.delay, 1_000);
  f.store.setEventDriven(false);
  f.store.setEventDriven(true);
  assert.equal(f.scheduler.delay, 0, 'live transport must immediately reconcile stale read state');
  f.scheduler.fire(); await settle();
  assert.equal(f.store.getState().graph.snapshot_sequence, 2);
  assert.equal(f.store.getState().stale, false);
  assert.equal(f.scheduler.delay, undefined);
  f.store.dispose();
});

test('1,001 metadata nodes use exact keyset pages, bounded ticks, and atomic publication', async () => {
  const f = fixture(1001);
  await f.store.open();
  assert.equal(f.store.getState().graph, null);
  assert.equal(f.calls.filter(c => c[0] === 'graph').length, 4);
  await f.store.refresh(); assert.equal(f.store.getState().graph, null);
  await f.store.refresh();
  assert.equal(f.store.getState().graph.nodes.length, 1001);
  const pages = f.calls.filter(c => c[0] === 'graph');
  assert.equal(pages.length, 11); assert.deepEqual(pages[0][1], {});
  for (let i = 1; i < pages.length; i++) assert.deepEqual(pages[i][1], { snapshot_sequence: 1, after_node_id: id(i * 100) });
  assert.ok(Object.isFrozen(f.store.getState().graph.nodes));
  f.store.dispose();
});

test('graph conflict discards staged pages, retains last graph and dirty text, then restarts', async () => {
  const f = fixture(); await f.store.open(); await f.store.selectNode(id(1));
  f.store.setLocalDraft(id(1), { ...content, title: 'Unsaved' });
  const old = f.store.getState().graph;
  const extra = fixture(501).nodes;
  f.setNodes(extra); f.change(2, 1);
  await f.store.refresh();
  assert.equal(f.store.getState().graph, old);
  f.change(3, 2); await f.store.refresh();
  await settle();
  assert.equal(f.store.getState().error, null, 'a transient crossed head is retried internally once');
  assert.equal(f.store.getState().stale, true);
  assert.equal(f.store.getState().graph, old);
  assert.equal(f.store.getState().drafts[id(1)].content.title, 'Unsaved');
  await f.store.refresh(); await f.store.refresh();
  assert.equal(f.store.getState().graph.snapshot_sequence, 3);
  assert.equal(f.store.getState().graph.nodes.length, 501);
  assert.equal(f.store.getState().drafts[id(1)].conflict, true);
  assert.equal(f.store.getState().drafts[id(1)].baseRevision, 0);
  f.store.close(); await f.store.open();
  assert.equal(f.store.getState().drafts[id(1)].content.title, 'Unsaved'); f.store.dispose();
});

test('bounded event pagination does not advance committed cursor or re-fetch unchanged details', async () => {
  const f = fixture(); await f.store.open(); await f.store.selectNode(id(1));
  f.calls.length = 0; f.change(1002, 1);
  await f.store.refresh();
  assert.deepEqual(f.calls.filter(c => c[0] === 'events').map(c => c[1]), [1, 101, 201, 301]);
  assert.equal(f.store.getState().graph.snapshot_sequence, 1);
  await f.store.refresh(); await f.store.refresh();
  assert.equal(f.store.getState().graph.snapshot_sequence, 1002);
  assert.equal(f.store.getState().detail.current_revision, 1);
  f.calls.length = 0; await f.store.refresh();
  assert.deepEqual(f.calls.map(c => c[0]), ['status', 'events']); f.store.dispose();
});

test('retention gaps and duplicate/out-of-order pages trigger snapshot, never inferred node state', async () => {
  for (const mode of ['retention', 'duplicate', 'order', 'tail']) {
    const f = fixture(); await f.store.open(); f.change(3, 2);
    const events = f.client.events;
    f.client.events = async (...args) => {
      if (mode === 'retention') throw new WorkspaceReadError('WORKSPACE_EVENT_RESNAPSHOT_REQUIRED', 409);
      const page = await events(...args);
      if (mode === 'duplicate') page.events[1].sequence = page.events[0].sequence;
      if (mode === 'order') page.events.reverse();
      if (mode === 'tail') page.events.pop();
      return page;
    };
    await f.store.refresh();
    assert.equal(f.store.getState().graph.snapshot_sequence, 3);
    assert.equal(f.store.getState().graph.nodes[0].current_revision, 2);
    assert.equal(f.store.getState().error, null); f.store.dispose();
  }
});

test('slow reads, visibility changes and repeated refresh never overlap or leak late close responses', async () => {
  const f = fixture(); const wait = deferred(); let active = 0, peak = 0;
  const status = f.client.status;
  f.client.status = async options => { active++; peak = Math.max(peak, active); await wait.promise; active--; return status(options); };
  const first = f.store.open(); f.store.refresh(); f.store.setVisible(false); f.store.setVisible(true);
  assert.equal(active, 1); assert.equal(f.scheduler.delay, undefined);
  f.store.close(); f.store.open();
  wait.resolve(); await first;
  assert.equal(f.store.getState().graph, null, 'old epoch cannot commit');
  assert.equal(f.scheduler.delay, 0);
  f.scheduler.fire(); await settle();
  assert.equal(peak, 1); assert.equal(f.store.getState().graph.nodes.length, 1); f.store.dispose();
});

test('detail revision 409 resnapshots and reloads lazily without changing the draft baseline', async () => {
  const f = fixture(); await f.store.open(); await f.store.selectNode(id(1));
  f.store.setLocalDraft(id(1), { ...content, title: 'My edit' });
  const detail = f.client.detail;
  let once = true;
  f.client.detail = async (...args) => {
    if (once) { once = false; f.change(2, 1); throw new WorkspaceReadError('WORKSPACE_REVISION_CONFLICT', 409); }
    return detail(...args);
  };
  await f.store.selectNode(id(1));
  assert.equal(f.store.getState().error.code, 'WORKSPACE_REVISION_CONFLICT');
  await f.store.refresh();
  assert.equal(f.store.getState().detail.current_revision, 1);
  assert.equal(f.store.getState().drafts[id(1)].baseRevision, 0);
  assert.equal(f.store.getState().drafts[id(1)].content.title, 'My edit');
  assert.equal(f.store.getState().drafts[id(1)].conflict, true); f.store.dispose();
});

test('selection race drops the old detail and fetches only the newest selection', async () => {
  const f = fixture(2); await f.store.open();
  const wait = deferred(), detail = f.client.detail;
  f.client.detail = async (...args) => { if (args[0] === id(1)) await wait.promise; return detail(...args); };
  const first = f.store.selectNode(id(1)); await settle();
  f.store.selectNode(id(2)); wait.resolve(); await first;
  assert.equal(f.store.getState().detail, null);
  f.scheduler.fire(); await settle();
  assert.equal(f.store.getState().detail.node_id, id(2)); f.store.dispose();
});

test('network errors preserve graph, recover without generation and do not strand lazy details', async () => {
  const f = fixture(); await f.store.open(); const graph = f.store.getState().graph;
  const status = f.client.status;
  f.client.status = async () => { throw new Error('offline / private'); };
  await f.store.selectNode(id(1));
  assert.equal(f.store.getState().graph, graph); assert.equal(f.store.getState().stale, true);
  assert.equal(f.store.getState().error.message, 'WORKSPACE_READ_UNAVAILABLE');
  assert.equal(f.scheduler.delay, 1000);
  f.client.status = status; await f.store.refresh();
  assert.equal(f.store.getState().stale, false);
  assert.equal(f.store.getState().detail.node_id, id(1)); f.store.dispose();
});

test('repeated read outages back off exponentially and stop automatic 503 pressure', async () => {
  const f = fixture();
  f.client.status = async () => { throw new WorkspaceReadError('WORKSPACE_READ_UNAVAILABLE', 503); };
  await f.store.open();
  assert.equal(f.scheduler.delay, 1_000);
  for (let failure = 2; failure <= WORKSPACE_TRANSIENT_RETRY_LIMIT; failure += 1) {
    f.scheduler.fire(); await settle();
    if (failure < WORKSPACE_TRANSIENT_RETRY_LIMIT) {
      assert.equal(f.scheduler.delay,
        Math.min(WORKSPACE_TRANSIENT_RETRY_MAX_MS, 1_000 * (2 ** Math.min(failure - 1, 6))));
    }
  }
  assert.equal(f.store.getState().access, 'blocked');
  assert.equal(f.scheduler.delay, undefined, 'bounded retry exhaustion must stop automatic reads');
  f.store.dispose();
});

test('revoked auth, missing/disabled workspace and oversize graph stop automatic reads', async () => {
  for (const code of ['AUTH_REQUIRED', 'WORKSPACE_READ_FORBIDDEN', 'WORKSPACE_NOT_FOUND', 'WORKSPACE_READ_DISABLED']) {
    const f = fixture(); await f.store.open(); const graph = f.store.getState().graph;
    f.client.status = async () => { throw new WorkspaceReadError(code); };
    await f.store.refresh();
    assert.equal(f.store.getState().access, 'blocked'); assert.equal(f.scheduler.delay, undefined);
    assert.equal(f.store.getState().graph, graph); f.store.dispose();
  }
  const f = fixture(); const graph = f.client.graph;
  f.client.graph = async (...args) => ({ ...await graph(...args), total_nodes: WORKSPACE_MAX_GRAPH_NODES + 1 });
  await f.store.open(); assert.equal(f.store.getState().error.code, 'WORKSPACE_READ_LIMIT');
  assert.equal(f.store.getState().graph, null); assert.equal(f.scheduler.delay, undefined); f.store.dispose();
});

test('locale switching affects only read UI locale; changed content locale is rejected', async () => {
  const f = fixture(); await f.store.open();
  f.store.setUiLocale('en'); await f.store.refresh();
  assert.equal(f.calls.at(-1).at(-1).uiLocale, 'en');
  assert.equal(f.store.getState().graph.content_locale, 'vi');
  const status = f.client.status;
  f.client.status = async (...args) => ({ ...await status(...args), content_locale: 'en' });
  await f.store.refresh();
  assert.equal(f.store.getState().error.code, 'WORKSPACE_READ_CONTRACT_INVALID');
  assert.equal(f.store.getState().graph.content_locale, 'vi'); f.store.dispose();
});

test('incomplete graph topology and repeated page cursor cannot replace the last complete graph', async () => {
  const f = fixture(); await f.store.open(); const old = f.store.getState().graph;
  f.change(2); f.setNodes([{ ...f.nodes[0], kind: 'chapter', parent_id: id(333) }]);
  await f.store.refresh(); await settle();
  assert.equal(f.store.getState().graph, old); assert.equal(f.store.getState().error.code, 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED');
  f.store.dispose();
  const g = fixture(201); const readGraph = g.client.graph;
  g.client.graph = async (_cursor, options) => readGraph({}, options);
  await g.store.open(); await settle();
  assert.equal(g.store.getState().graph, null); assert.equal(g.store.getState().error.code, 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED'); g.store.dispose();
});

test('terminal crossed snapshot head self-recovers once without polling or exposing a transient error', async () => {
  const f = fixture(1, true); f.setStatus('ready');
  const graph = f.client.graph; let first = true;
  f.client.graph = async (...args) => {
    if (first) { first = false; throw new WorkspaceReadError('WORKSPACE_EVENT_RESNAPSHOT_REQUIRED', 409); }
    return graph(...args);
  };
  await f.store.open(); await settle();
  assert.equal(f.store.getState().status.status, 'ready');
  assert.equal(f.store.getState().graph.snapshot_sequence, 1);
  assert.equal(f.store.getState().stale, false);
  assert.equal(f.store.getState().error, null);
  assert.equal(f.calls.filter(call => call[0] === 'status').length, 2);
  assert.equal(f.scheduler.delay, undefined, 'terminal event-driven recovery must not create a poll timer');
  f.store.dispose();
});

test('local draft limits, explicit discard and disposal are independent of server modified flag', async () => {
  const f = fixture(17); await f.store.open();
  for (let n = 1; n <= 16; n++) { await f.store.selectNode(id(n)); f.store.setLocalDraft(id(n), content); }
  await f.store.selectNode(id(17)); assert.throws(() => f.store.setLocalDraft(id(17), content), /READ_LIMIT/);
  assert.equal(f.store.getState().graph.nodes[0].user_modified, false);
  f.store.discardLocalDraft(id(1)); f.store.setLocalDraft(id(17), content);
  assert.equal(Object.keys(f.store.getState().drafts).length, 16);
  f.store.dispose(); assert.deepEqual(f.store.getState().drafts, {}); assert.equal(f.store.getState().graph, null);
  const count = f.calls.length; await f.store.open(); assert.equal(f.calls.length, count);
});
