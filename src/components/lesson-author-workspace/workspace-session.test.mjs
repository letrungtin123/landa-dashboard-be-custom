import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const load = (path, replacements = {}) => {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const [from, url] of Object.entries(replacements)) source = source.replaceAll(`'${from}'`, JSON.stringify(url));
  return compile(source);
};
const contract = load('../../api/lesson-author-workspace.contract.ts');
const writeClient = load('../../api/workspace-write.ts', { './custom-client': compile('export const customApiClient = {};'), './lesson-author-workspace.contract': contract });
const readState = load('./workspace-read-state.ts', { '../../api/lesson-author-workspace.contract': contract });
const writeState = load('./workspace-write-state.ts', { '../../api/lesson-author-workspace.contract': contract, '../../api/workspace-write': writeClient });
const { WorkspaceReadError } = await import(contract);
const { WorkspaceWriteError } = await import(writeClient);
const { createWorkspaceSession } = await import(load('./workspace-session.ts', {
  '../../api/lesson-author-workspace.contract': contract, '../../api/workspace-write': writeClient,
  './workspace-read-state': readState, './workspace-write-state': writeState,
}));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const identity = { actorId: id(9000), tenantId: id(9001), workspaceId: id(9002), conversationId: id(9003), courseId: 'course-v1:TEST+SESSION+2026' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function settle() { for (let i = 0; i < 150; i++) await Promise.resolve(); }
function scheduler() {
  let timer = null;
  return { set(callback, delay) { assert.equal(timer, null, 'singleton polling timer'); timer = { callback, delay }; return timer; },
    clear(handle) { if (handle === timer) timer = null; },
    get delay() { return timer?.delay; },
    fire() { assert.ok(timer); const callback = timer.callback; timer = null; callback(); } };
}
function fixture(count = 3, eventDriven = false) {
  const calls = [], clock = scheduler();
  let head = 1, op = 10000, active = 0, peak = 0, denied = false, gate = null, editGate = null;
  let editFailure = null, detailOverride = null;
  const nodes = Array.from({ length: count }, (_, i) => ({ node_id: id(i + 1), parent_id: i ? id(1) : null,
    kind: i ? 'chapter' : 'course', canonical_path: `course.n${i}`, sort_order: i,
    content_state: 'content_ready', current_revision: 0, title: `Node ${i}`, user_modified: false, applied: false }));
  const contents = new Map(nodes.map(n => [n.node_id, { title: n.title, purpose: null, data: { objective: 'Actual stored objective' }, implementation_notes: null }]));
  const baselines = structuredClone(contents);
  const view = () => ({ workspace_id: identity.workspaceId, correlation_id: id(9004), content_locale: 'vi', contract_version: 1,
    status: 'drafting', last_event_sequence: head, updated_at: '2026-09-29T00:00:00Z' });
  async function read(kind, args, work) {
    calls.push([kind, ...args]); active++; peak = Math.max(peak, active);
    try { if (gate) await gate.promise; if (denied) throw new WorkspaceReadError('WORKSPACE_READ_FORBIDDEN', 403); return work(); }
    finally { active--; }
  }
  const reads = {
    status: options => read('status', [options], () => ({ ...view(), node_count: nodes.length, unit_count: 0, ready_unit_count: 0 })),
    graph: (cursor, options) => read('graph', [cursor, options], () => {
      if (cursor.snapshot_sequence !== undefined && cursor.snapshot_sequence !== head) throw new WorkspaceReadError('WORKSPACE_EVENT_RESNAPSHOT_REQUIRED');
      const start = cursor.after_node_id ? nodes.findIndex(n => n.node_id === cursor.after_node_id) + 1 : 0;
      const page = structuredClone(nodes.slice(start, start + 100)), more = start + page.length < nodes.length;
      return { ...view(), snapshot_sequence: head, overview_ready: true, structure_ready: true,
        total_nodes: nodes.length, nodes: page, has_more: more, next_after_node_id: more ? page.at(-1).node_id : null };
    }),
    events: (after, options) => read('events', [after, options], () => ({ ...view(),
      events: Array.from({ length: Math.min(100, Math.max(0, head - after)) }, (_, i) => ({ sequence: after + i + 1,
        event_kind: 'unit_ready', node_id: id(1), node_revision: nodes[0].current_revision, operation_id: id(8000 + i), created_at: '2026-09-29T00:00:00Z' })),
      next_sequence: Math.min(head, after + 100), has_more: after + 100 < head })),
    detail: (nodeId, revision, options) => read('detail', [nodeId, revision, options], () => {
      const node = nodes.find(n => n.node_id === nodeId);
      if (node.current_revision !== revision) throw new WorkspaceReadError('WORKSPACE_REVISION_CONFLICT');
      const d = { ...view(), node_id: nodeId, parent_id: node.parent_id, kind: node.kind, current_revision: revision,
        content_state: 'content_ready', content: structuredClone(contents.get(nodeId)), user_modified: node.user_modified,
        validation_contract: 'workspace-aggregate-edit-1' };
      return detailOverride ? detailOverride(d) : d;
    }),
  };
  const receipts = new Map();
  async function write(kind, nodeId, request, options) {
    calls.push([kind, nodeId, structuredClone(request), options]);
    if (editGate) await editGate.promise;
    if (editFailure) throw editFailure;
    if (receipts.has(request.operation_id)) return { ...receipts.get(request.operation_id), replayed: true };
    const node = nodes.find(n => n.node_id === nodeId);
    if (node.current_revision !== request.expected_revision) throw new WorkspaceWriteError('WORKSPACE_REVISION_CONFLICT');
    const content = kind === 'save' ? structuredClone(request.changes) : structuredClone(baselines.get(nodeId));
    head++; node.current_revision++; node.title = content.title; node.user_modified = kind === 'save'; contents.set(nodeId, content);
    const receipt = { workspace_id: identity.workspaceId, node_id: nodeId, correlation_id: id(9004), operation_id: request.operation_id,
      revision: node.current_revision, current_revision: node.current_revision, content_hash: 'a'.repeat(64),
      user_modified: node.user_modified, event_sequence: head, replayed: false };
    receipts.set(request.operation_id, receipt); return receipt;
  }
  const writes = { save: (...args) => write('save', ...args), reset: (...args) => write('reset', ...args) };
  const session = createWorkspaceSession(identity, { readClient: reads, writeClient: writes, scheduler: clock,
    operationId: () => id(op++), eventDriven });
  return { session, calls, clock, reads, writes, nodes, contents,
    get peak() { return peak; }, set gate(value) { gate = value; }, set editGate(value) { editGate = value; },
    set denied(value) { denied = value; }, set editFailure(value) { editFailure = value; }, set detailOverride(value) { detailOverride = value; },
    change(nodeId = id(1)) { head++; const node = nodes.find(n => n.node_id === nodeId); node.current_revision++; },
    advanceHead() { head++; },
  };
}
async function select(f, n = 1) { await f.session.selectNode(id(n)); await settle(); }

test('one inert reader serves multiple subscribers and repeated opens; visibility has one 1s/15s timer', async () => {
  const f = fixture(); f.session.subscribe(() => {}); f.session.subscribe(() => {});
  assert.equal(f.calls.length, 0);
  await Promise.all([f.session.open(), f.session.open()]);
  assert.equal(f.calls.filter(c => c[0] === 'status').length, 1); assert.equal(f.clock.delay, 1000);
  await f.session.open(); assert.equal(f.calls.filter(c => c[0] === 'status').length, 1);
  f.session.setVisible(false); assert.equal(f.clock.delay, 15000);
  f.session.setVisible(true); await settle(); assert.equal(f.clock.delay, 1000);
  assert.equal(f.calls.some(c => ['save', 'reset'].includes(c[0])), false); f.session.dispose();
});

test('session uses SSE while live and one bounded polling fallback while delivery is degraded', async () => {
  const f = fixture(3, true); await f.session.open();
  assert.equal(f.clock.delay, undefined);
  f.session.setDeliveryState('connecting'); assert.equal(f.clock.delay, 0);
  f.clock.fire(); await settle(); assert.equal(f.clock.delay, 1000);
  f.session.setDeliveryState('live'); assert.equal(f.clock.delay, undefined);
  f.session.setDeliveryState('reconnecting'); assert.equal(f.clock.delay, 0);
  f.session.setDeliveryState('blocked'); assert.equal(f.clock.delay, undefined);
  f.session.dispose();
});

test('controlled props keep invalid typing; close hides detail and draft, reopen preserves same-identity dirty text', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  const props = f.session.editorProps(id(1)); assert.equal(props.access, 'allowed');
  props.onChange({ ...props.draft, title: '' });
  assert.equal(f.session.editorProps(id(1)).draft.title, '');
  await assert.rejects(f.session.save(id(1), 0), /INPUT_INVALID/);
  f.session.close(); assert.equal(f.clock.delay, undefined);
  assert.equal(f.session.editorProps(id(1)).detail, null); assert.equal(f.session.editorProps(id(1)).draft, null);
  assert.notEqual(f.session.editorProps(id(1)).access, 'allowed');
  await f.session.open(); await settle();
  assert.equal(f.session.editorProps(id(1)).draft.title, '');
  assert.equal(f.session.editorProps(id(1)).baseRevision, 0); f.session.dispose();
});

test('stale/revoked reads invalidate existing write stores and hide editors without dropping drafts', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  f.session.setDraft(id(1), { ...f.session.editorProps(id(1)).draft, title: 'Local' });
  f.denied = true; await f.session.refresh();
  assert.equal(f.session.getState().writes[id(1)].readRequired, true);
  assert.equal(f.session.editorProps(id(1)).access, 'blocked');
  await assert.rejects(f.session.save(id(1), 0), /READ_REQUIRED/);
  assert.equal(f.session.getState().drafts[id(1)].content.title, 'Local');
  f.denied = false; await f.session.refresh(); await settle();
  assert.equal(f.session.editorProps(id(1)).access, 'allowed');
  f.change(); await f.session.refresh(); await settle();
  assert.equal(f.session.editorProps(id(1)).conflict, true);
  assert.equal(f.session.editorProps(id(1)).baseRevision, 0); f.session.dispose();
});

test('Apply refresh preserves exact selected detail across an unrelated event-head advance', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  const before = f.session.editorProps(id(1)).detail;
  f.calls.length = 0; f.advanceHead(); await f.session.refreshForApply(); await settle();
  assert.equal(f.session.editorProps(id(1)).access, 'allowed');
  assert.deepEqual(f.session.editorProps(id(1)).detail, before);
  assert.equal(f.calls.filter(call => call[0] === 'detail').length, 0);
  f.session.dispose();
});

test('manual refresh preserves exact overview and selected detail without a detail request fan-out', async () => {
  const f = fixture(); await f.session.open(); await f.session.loadOverview(); await select(f);
  const beforeDetail = f.session.editorProps(id(1)).detail;
  const beforeOverview = f.session.getState().overview.details;
  assert.equal(f.session.getState().overview.complete, true);
  assert.equal(beforeOverview.length, 3);
  f.calls.length = 0;
  await f.session.refresh(); await settle();
  assert.equal(f.calls.filter(call => call[0] === 'detail').length, 0,
    'unchanged exact-revision cache must not reload every course/chapter detail');
  assert.equal(f.session.getState().overview.complete, true);
  assert.deepEqual(f.session.getState().overview.details, beforeOverview);
  assert.deepEqual(f.session.editorProps(id(1)).detail, beforeDetail);
  f.session.dispose();
});

test('committed Save refreshes authorized reads and clears only the matching unchanged draft', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  const draft = { ...f.session.editorProps(id(1)).draft, title: 'Saved title' }; f.session.setDraft(id(1), draft);
  f.calls.length = 0; await f.session.save(id(1), 0); await settle();
  assert.equal(f.calls.filter(c => c[0] === 'save').length, 1);
  assert.ok(f.calls.some(c => c[0] === 'status')); assert.ok(f.calls.some(c => c[0] === 'detail' && c[2] === 1));
  assert.equal(f.session.getState().drafts[id(1)], undefined);
  assert.equal(f.session.editorProps(id(1)).detail.current_revision, 1);
  assert.equal(f.session.editorProps(id(1)).draft.title, 'Saved title');
  assert.equal(f.session.getState().writes[id(1)].receipt.revision, 1); f.session.dispose();
});

test('Save and Reset retain one mounted presentation detail through authoritative readback', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  const observations = [];
  const unsubscribe = f.session.subscribe(() => {
    const props = f.session.editorProps(id(1));
    observations.push({ visible: !!props.detail, access: props.access, busy: props.busy, conflict: props.conflict });
  });
  f.session.setDraft(id(1), { ...f.session.editorProps(id(1)).draft, title: 'Stable modal' });
  const saveStart = observations.length;
  await f.session.save(id(1), 0); await settle();
  const saveStates = observations.slice(saveStart);
  assert.ok(saveStates.some(state => state.busy));
  assert.ok(saveStates.every(state => state.visible && state.access === 'allowed'));
  assert.ok(saveStates.filter(state => state.busy).every(state => !state.conflict));

  const resetStart = observations.length;
  await f.session.reset(id(1), { confirmed: true, expectedRevision: 1 }); await settle();
  const resetStates = observations.slice(resetStart);
  assert.ok(resetStates.some(state => state.busy));
  assert.ok(resetStates.every(state => state.visible && state.access === 'allowed'));
  assert.ok(resetStates.filter(state => state.busy).every(state => !state.conflict));
  unsubscribe(); f.session.dispose();
});

test('typed validation rejection keeps the exact revision editable and clears its message on correction', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  f.session.setDraft(id(1), { ...f.session.editorProps(id(1)).draft, title: 'Rejected draft' });
  f.editFailure = new WorkspaceWriteError('WORKSPACE_EDIT_VALIDATION_REQUIRED', 'rejected', 422, id(777));
  await f.session.save(id(1), 0); await settle();
  let props = f.session.editorProps(id(1));
  assert.equal(props.access, 'allowed'); assert.equal(props.conflict, false); assert.equal(props.busy, false);
  assert.equal(f.session.getState().error.code, 'WORKSPACE_EDIT_VALIDATION_REQUIRED');
  props.onChange({ ...props.draft, title: 'Corrected draft' });
  props = f.session.editorProps(id(1));
  assert.equal(props.conflict, false); assert.equal(f.session.getState().error, null);
  f.session.dispose();
});

test('Reset clears unchanged local draft only after baseline readback and preserves newer typing', async () => {
  for (const changed of [false, true]) {
    const f = fixture(); await f.session.open(); await select(f);
    const original = f.session.editorProps(id(1)).draft;
    f.session.setDraft(id(1), { ...original, title: 'Unsaved old draft' });
    const wait = deferred(); f.editGate = wait;
    const resetting = f.session.reset(id(1), { confirmed: true, expectedRevision: 0 }); await settle();
    assert.equal(f.session.getState().drafts[id(1)].content.title, 'Unsaved old draft');
    if (changed) f.session.setDraft(id(1), { ...original, title: 'Newer typing' });
    wait.resolve(); await resetting; await settle();
    assert.equal(f.session.editorProps(id(1)).detail.user_modified, false);
    if (changed) { assert.equal(f.session.editorProps(id(1)).draft.title, 'Newer typing'); assert.equal(f.session.editorProps(id(1)).conflict, true); }
    else { assert.equal(f.session.getState().drafts[id(1)], undefined); assert.equal(f.session.editorProps(id(1)).draft.title, original.title); }
    f.session.dispose();
  }
});

test('Reset rejection/unknown preserves local drafts and never resends on polling/reopen', async () => {
  for (const failure of [new WorkspaceWriteError('WORKSPACE_SOURCE_CHANGED'), new Error('lost reply')]) {
    const f = fixture(); await f.session.open(); await select(f);
    f.session.setDraft(id(1), { ...f.session.editorProps(id(1)).draft, title: 'Keep me' }); f.editFailure = failure;
    await f.session.reset(id(1), { confirmed: true, expectedRevision: 0 });
    f.session.close(); await f.session.open(); await settle();
    assert.equal(f.session.editorProps(id(1)).draft.title, 'Keep me');
    assert.equal(f.calls.filter(c => c[0] === 'reset').length, 1); f.session.dispose();
  }
});

test('sixteen dirty stores fail closed at capacity; no dirty/unknown entry is evicted', async () => {
  const f = fixture(18); await f.session.open();
  for (let n = 1; n <= 16; n++) {
    await select(f, n); f.session.setDraft(id(n), { ...f.session.editorProps(id(n)).draft, title: `Dirty ${n}` });
  }
  await assert.rejects(f.session.selectNode(id(17)), /READ_LIMIT/);
  assert.equal(Object.keys(f.session.getState().writes).length, 16);
  assert.equal(Object.keys(f.session.getState().drafts).length, 16);
  f.session.discardDraft(id(1)); await select(f, 17);
  assert.equal(Object.keys(f.session.getState().writes).length, 16);
  for (let n = 2; n <= 16; n++) assert.equal(f.session.getState().drafts[id(n)].content.title, `Dirty ${n}`);
  f.session.dispose();
});

test('overview is explicit, course/chapter only, four GETs per load, exact-revision cached and never synthesized', async () => {
  const f = fixture(7); await f.session.open();
  const progressive = [];
  const unsubscribe = f.session.subscribe(() => {
    const count = f.session.getState().overview.details.length;
    if (count && progressive.at(-1) !== count) progressive.push(count);
  });
  assert.equal(f.calls.filter(c => c[0] === 'detail').length, 0);
  await Promise.all([f.session.loadOverview(), f.session.loadOverview()]);
  assert.equal(f.calls.filter(c => c[0] === 'detail').length, 4);
  assert.deepEqual(progressive.slice(0, 4), [1, 2, 3, 4], 'each authorized detail is published immediately');
  assert.equal(f.session.getState().overview.complete, false);
  await f.session.loadOverview(); assert.equal(f.session.getState().overview.details.length, 7);
  assert.equal(f.session.getState().overview.complete, true);
  await f.session.loadOverview(); assert.equal(f.calls.filter(c => c[0] === 'detail').length, 7);
  assert.ok(f.calls.filter(c => c[0] === 'detail').every(c => c[2] === 0));
  assert.equal(Object.keys(f.session.getState().writes).length, 0);
  f.change(id(2)); await f.session.notifyCommittedEvent(2);
  assert.equal(f.session.getState().overview.details.length, 6, 'unchanged exact revisions survive an unrelated head advance');
  assert.equal(f.session.getState().overview.complete, false);
  await f.session.loadOverview(); assert.equal(f.session.getState().overview.details.find(d => d.node_id === id(2)).current_revision, 1);
  unsubscribe();
  f.session.dispose();
});

test('polling, node detail and overview share one sequential GET queue, including hidden polling', async () => {
  const f = fixture(7); await f.session.open(); const wait = deferred(); f.gate = wait;
  const overview = f.session.loadOverview(); await settle();
  f.clock.fire(); const selection = f.session.selectNode(id(2)); f.session.setVisible(false);
  await settle(); assert.equal(f.peak, 1);
  f.gate = null; wait.resolve(); await overview; await selection; await settle();
  // Selection during a running tick requests one immediate coalesced read.
  if (f.clock.delay === 0) { f.clock.fire(); await settle(); }
  assert.equal(f.peak, 1); assert.equal(f.clock.delay, 15000); f.session.dispose();
});

test('overview head/revision race fails closed, invalidates writes and never publishes a mixed cache', async () => {
  const f = fixture(3); await f.session.open(); await select(f);
  f.session.setDraft(id(1), { ...f.session.editorProps(id(1)).draft, title: 'Preserve' });
  let count = 0;
  f.detailOverride = d => ++count === 2 ? { ...d, last_event_sequence: d.last_event_sequence + 1 } : d;
  await f.session.loadOverview();
  assert.equal(f.session.getState().error.code, 'WORKSPACE_REVISION_CONFLICT');
  assert.equal(f.session.getState().overview.details.length, 0);
  assert.equal(f.session.getState().writes[id(1)].readRequired, true);
  assert.equal(f.session.getState().drafts[id(1)].content.title, 'Preserve');
  f.detailOverride = null; await f.session.refresh(); await settle(); f.session.dispose();
});

test('overview node and payload bounds report limits rather than truncating a successful overview', async () => {
  const f = fixture(129); await f.session.open(); await f.session.loadOverview();
  assert.equal(f.session.getState().error.code, 'WORKSPACE_READ_LIMIT');
  assert.equal(f.session.getState().overview.complete, false);
  assert.equal(f.calls.filter(c => c[0] === 'detail').length, 0); f.session.dispose();
  const g = fixture(7);
  for (const c of g.contents.values()) c.data = 'x'.repeat(1_800_000);
  await g.session.open(); await g.session.loadOverview(); await g.session.loadOverview();
  assert.equal(g.session.getState().error.code, 'WORKSPACE_READ_LIMIT');
  assert.equal(g.session.getState().overview.complete, false); g.session.dispose();
});

test('close/reopen during delayed reads cannot apply old responses; identity change disposes everything', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  f.session.setDraft(id(1), { ...f.session.editorProps(id(1)).draft, title: 'Same identity only' });
  const wait = deferred(); f.gate = wait;
  const loading = f.session.loadOverview(); await settle();
  f.session.close(); const opening = f.session.open(); f.gate = null; wait.resolve();
  await loading; await opening; await settle();
  assert.equal(f.session.editorProps(id(1)).draft.title, 'Same identity only');
  assert.throws(() => f.session.open({ ...identity, actorId: id(12345) }), /FORBIDDEN/);
  assert.equal(f.session.getState().disposed, true); assert.deepEqual(f.session.getState().drafts, {});
  assert.equal(f.session.editorProps(id(1)).detail, null); assert.equal(f.clock.delay, undefined);
});

test('closing a dispatched write retains result and local work; reopen reconciles through GET only', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  f.session.setDraft(id(1), { ...f.session.editorProps(id(1)).draft, title: 'Saved while closed' });
  const wait = deferred(); f.editGate = wait;
  const saving = f.session.save(id(1), 0); await settle(); f.session.close();
  wait.resolve(); await saving;
  assert.equal(f.session.getState().writes[id(1)].phase, 'committed');
  assert.equal(f.session.editorProps(id(1)).detail, null);
  await f.session.open(); await settle();
  assert.equal(f.session.editorProps(id(1)).draft.title, 'Saved while closed');
  assert.equal(f.session.getState().drafts[id(1)], undefined);
  assert.equal(f.calls.filter(c => c[0] === 'save').length, 1); f.session.dispose();
});

test('editor callbacks match controlled props and locale switch cannot translate stored content', async () => {
  const f = fixture(); await f.session.open(); await select(f);
  f.session.setUiLocale('en'); let props = f.session.editorProps(id(1));
  assert.equal(props.locale, 'en'); assert.equal(props.detail.content_locale, 'vi');
  const edited = { ...props.draft, title: 'Controlled callback' }; props.onChange(edited);
  props = f.session.editorProps(id(1)); props.onSave(props.draft, props.baseRevision); await settle();
  assert.equal(f.calls.filter(c => c[0] === 'save').length, 1);
  assert.equal(f.session.editorProps(id(1)).detail.content.title, 'Controlled callback');
  f.session.editorProps(id(1)).onReset(1); await settle();
  assert.equal(f.calls.filter(c => c[0] === 'reset').length, 1);
  assert.equal(f.session.editorProps(id(1)).detail.content.title, 'Node 0'); f.session.dispose();
});
