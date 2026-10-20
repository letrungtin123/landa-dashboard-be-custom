/* global Buffer, URL */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Stop / Continue / Rewrite: pure rules, the request controller (fake server,
// manual clock) and the dialog slots rendered with real React SSR.
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const contractUrl = compile(read('../../api/lesson-author-workspace.contract.ts'));
const apiUrl = compile(read('../../api/workspace-recovery.ts')
  .replace("'./custom-client'", JSON.stringify(compile('export const customApiClient = {};')))
  .replace("'./lesson-author-workspace.contract'", JSON.stringify(contractUrl)));
const logicUrl = compile(read('./workspace-recovery.logic.ts'));
const { WorkspaceRecoveryError } = await import(apiUrl);
const {
  workspaceRecoveryBanner, workspaceRecoveryChapterAction, workspaceRecoveryUnitAction, workspaceRecoveryConfirmText,
  workspaceRecoveryCopy, workspaceRecoveryFetchKey, workspaceRecoveryCanStop, WORKSPACE_RECOVERY_DRAIN_POLL_LIMIT,
  WORKSPACE_RECOVERY_DRAIN_POLL_MS,
} = await import(logicUrl);
const { createWorkspaceRecoveryState } = await import(compile(read('./workspace-recovery-state.ts')
  .replace("'../../api/workspace-recovery'", JSON.stringify(apiUrl))
  .replace("'./workspace-recovery.logic'", JSON.stringify(logicUrl))));

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const option = (reason = null) => ({ available: reason === null, reason });
function view(overrides = {}) {
  return {
    run_id: id(20), run_status: 'needs_action', workspace_status: 'needs_action', failure_code: 'RUN_STOPPED_BY_AUTHOR',
    event_head: 42, draining: false, stop: option('RUN_STOP_NOT_ACTIVE'), resume: { ...option('RECOVERY_NOTHING_TO_DO'), task_count: 0 },
    regenerate: { ...option(), max_rewrites_per_lesson: 3, missing_unit_count: 2,
      course: { ...option(), node_id: id(30), unit_count: 2 },
      chapters: [{ ...option(), node_id: id(31), chapter_key: 'chapter-1', unit_count: 2 },
        { ...option('RECOVERY_LIMIT_REACHED'), node_id: id(32), chapter_key: 'chapter-2', unit_count: 0 }],
      units: [{ ...option(), node_id: id(41), chapter_node_id: id(31), rewrites_used: 1 },
        { ...option('RECOVERY_LIMIT_REACHED'), node_id: id(42), chapter_node_id: id(32), rewrites_used: 3 }] },
    ...overrides,
  };
}
const running = () => view({ run_status: 'executing', workspace_status: 'drafting', failure_code: null, stop: option(),
  resume: { ...option('RECOVERY_RUN_ACTIVE'), task_count: 0 },
  regenerate: { ...view().regenerate, ...option('RECOVERY_RUN_ACTIVE'), course: null, chapters: [], units: [] } });

test('labels are exactly the agreed words, in plain VI/EN without codes or technical terms', () => {
  assert.equal(workspaceRecoveryCopy.vi.rewriteChapter, 'Viết lại chương');
  assert.equal(workspaceRecoveryCopy.en.rewriteChapter, 'Rewrite chapter');
  assert.equal(workspaceRecoveryCopy.vi.rewriteLesson, 'Viết lại bài này');
  assert.equal(workspaceRecoveryCopy.vi.resume, 'Chạy tiếp');
  assert.equal(workspaceRecoveryCopy.vi.rewrite, 'Viết lại');
  assert.equal(workspaceRecoveryCopy.vi.stop, 'Dừng');
  for (const locale of ['vi', 'en']) {
    const copy = workspaceRecoveryCopy[locale];
    const texts = Object.values(copy).flatMap(value => typeof value === 'function' ? [value(2), value(1, 3)] : [value]);
    assert.deepEqual(Object.keys(copy), Object.keys(workspaceRecoveryCopy.vi), 'VI and EN have the same keys');
    for (const text of texts) {
      assert.doesNotMatch(String(text), /[A-Z]{2,}_[A-Z_]+|workspace|revision|hash|lock|snapshot|run_id|epoch|token/i, String(text));
    }
  }
});

test('stopped design: banner, chapter and lesson actions come only from the server options', () => {
  const vi = workspaceRecoveryBanner(view(), 'vi');
  assert.match(vi.message, /^Bạn đã dừng việc tạo nội dung\. .* Còn 2 bài học chưa có nội dung\.$/);
  assert.equal(vi.resume, null);
  assert.deepEqual(vi.rewriteAll, { kind: 'regenerate', scope: 'course', nodeId: id(30), unitCount: 2, rewritesUsed: null });
  assert.equal(vi.rewriteAllLabel, 'Viết lại 2 bài học còn thiếu');
  const failed = workspaceRecoveryBanner(view({ failure_code: 'ORCHESTRATION_V2_UNIT_FALLBACK_INVALID',
    resume: { ...option(), task_count: 2 } }), 'en');
  assert.match(failed.message, /^Creating content stopped before the end\./);
  assert.doesNotMatch(failed.message, /ORCHESTRATION/);
  assert.deepEqual(failed.resume, { kind: 'resume', taskCount: 2 });
  const draining = workspaceRecoveryBanner(view({ draining: true, regenerate: { ...view().regenerate, ...option('RECOVERY_DRAINING'),
    course: { ...view().regenerate.course, ...option('RECOVERY_DRAINING') } } }), 'vi');
  assert.equal(draining.draining, true);
  assert.equal(draining.rewriteAll, null);
  assert.match(draining.message, /^Đang dừng…/);
  const changed = workspaceRecoveryBanner(view({ resume: { ...option('RECOVERY_RUNTIME_CHANGED'), task_count: 0 },
    regenerate: { ...view().regenerate, ...option('RECOVERY_RUNTIME_CHANGED'), course: { ...view().regenerate.course,
      ...option('RECOVERY_RUNTIME_CHANGED') } } }), 'en');
  assert.equal(changed.rewriteAll, null);
  assert.match(changed.note, /AI settings changed/);
  // Assessment review has its own review panel; a running or finished run shows no banner.
  assert.equal(workspaceRecoveryBanner(view({ resume: { ...option('RECOVERY_REVIEW_REQUIRED'), task_count: 0 },
    regenerate: { ...view().regenerate, ...option('RECOVERY_REVIEW_REQUIRED') } }), 'vi'), null);
  assert.equal(workspaceRecoveryBanner(running(), 'vi'), null);
  assert.equal(workspaceRecoveryBanner(null, 'vi'), null);
  assert.equal(workspaceRecoveryCanStop(running()), true);
  assert.equal(workspaceRecoveryCanStop(view()), false);

  assert.deepEqual(workspaceRecoveryChapterAction(view(), id(31).toUpperCase(), 'vi').intent,
    { kind: 'regenerate', scope: 'chapter', nodeId: id(31), unitCount: 2, rewritesUsed: null });
  assert.deepEqual(workspaceRecoveryChapterAction(view(), id(32), 'vi'), { intent: null, note: workspaceRecoveryCopy.vi.chapterLimit });
  assert.equal(workspaceRecoveryChapterAction(view(), id(99), 'vi'), null, 'chapters without missing lessons show nothing');
  assert.equal(workspaceRecoveryChapterAction(view({ draining: true }), id(31), 'vi'), null);
  assert.deepEqual(workspaceRecoveryUnitAction(view(), id(41), 'en').intent,
    { kind: 'regenerate', scope: 'unit', nodeId: id(41), unitCount: 1, rewritesUsed: 1 });
  assert.deepEqual(workspaceRecoveryUnitAction(view(), id(42), 'en'), { intent: null, note: workspaceRecoveryCopy.en.lessonLimit });
  assert.equal(workspaceRecoveryUnitAction(view(), id(43), 'en'), null, 'a lesson with content offers nothing');
  assert.equal(workspaceRecoveryUnitAction(running(), id(41), 'en'), null);
});

test('confirmation words: what happens, AI points, the rewrite limit', () => {
  const unit = workspaceRecoveryConfirmText({ kind: 'regenerate', scope: 'unit', nodeId: id(41), unitCount: 1, rewritesUsed: 1 }, 3, 'vi');
  assert.deepEqual([unit.title, unit.confirm, unit.note], ['Viết lại bài này?', 'Viết lại bài này', 'Đã viết lại 1/3 lần.']);
  assert.match(unit.body, /điểm AI/);
  const chapter = workspaceRecoveryConfirmText({ kind: 'regenerate', scope: 'chapter', nodeId: id(31), unitCount: 2, rewritesUsed: null }, 3, 'en');
  assert.deepEqual([chapter.title, chapter.confirm], ['Rewrite 2 lessons?', 'Rewrite chapter']);
  assert.match(chapter.body, /AI points/);
  assert.equal(workspaceRecoveryConfirmText({ kind: 'resume', taskCount: 1 }, 3, 'vi').confirm, 'Chạy tiếp');
  assert.match(workspaceRecoveryConfirmText({ kind: 'resume', taskCount: 1 }, 3, 'vi').body, /không dùng điểm AI/);
  assert.equal(workspaceRecoveryConfirmText({ kind: 'stop' }, 3, 'vi').confirm, 'Dừng');
});

test('options are re-read when the run starts or ends and, while stopped, on each new event', () => {
  const key = patch => workspaceRecoveryFetchKey({ enabled: true, workspaceId: id(2), status: 'needs_action', head: 5, tick: 0,
    stopKnown: false, ...patch });
  assert.equal(key({ enabled: false }), null);
  assert.equal(key({ status: null }), null);
  assert.notEqual(key({ head: 6 }), key({}), 'a stopped draft re-reads on a new event');
  assert.equal(key({ status: 'drafting', head: 6, stopKnown: true }), key({ status: 'drafting', head: 9, stopKnown: true }),
    'a running draft whose Stop is known is not re-read per event');
  assert.notEqual(key({ status: 'drafting', head: 6 }), key({ status: 'drafting', head: 7 }), 'until Stop is known it is');
  assert.notEqual(key({ tick: 1 }), key({}));
});

/** In-memory server with the real event-head rule (two tabs share it). */
function fakeServer(initial) {
  const calls = [];
  let current = initial;
  let failNext = null;
  const answer = action => ({ recovery_id: action === 'stop' ? null : id(500 + calls.length), run_id: id(20), action,
    reopened_task_count: action === 'stop' ? 0 : 2, workspace_status: 'drafting', replayed: false });
  const done = new Set();
  const command = async (action, operationId, expectedHead, nodeId) => {
    calls.push([action, operationId, expectedHead, nodeId]);
    if (failNext) { const error = failNext; failNext = null; throw error; }
    if (done.has(operationId)) return { ...answer(action), replayed: true };
    if (action !== 'stop' && expectedHead !== current.event_head) throw new WorkspaceRecoveryError('RECOVERY_STATE_CHANGED', 'rejected');
    done.add(operationId);
    current = action === 'stop' ? view({ draining: true, event_head: current.event_head }) : running();
    current = { ...current, event_head: initial.event_head + done.size };
    return answer(action);
  };
  return {
    calls, set(next) { current = next; }, failOnce(error) { failNext = error; },
    client: {
      async describe(locale, signal) { calls.push(['describe', locale, !!signal]); return current; },
      stop: (operationId) => command('stop', operationId),
      resume: (operationId, expectedHead) => command('resume', operationId, expectedHead),
      regenerate: (nodeId, operationId, expectedHead) => command('regenerate', operationId, expectedHead, nodeId),
    },
  };
}
function clock() {
  const tasks = new Map();
  let next = 0;
  return { set(callback, delay) { const handle = ++next; tasks.set(handle, { callback, delay }); return handle; },
    clear(handle) { tasks.delete(handle); },
    delays() { return [...tasks.values()].map(task => task.delay); },
    fire(delay) {
      const entry = [...tasks.entries()].find(([, task]) => task.delay === delay);
      assert.ok(entry, `timer ${delay}`); tasks.delete(entry[0]); entry[1].callback();
    } };
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
let operationCounter = 900;
function controller(server, extra = {}) {
  const committed = [], runs = [];
  const scheduler = clock();
  const value = createWorkspaceRecoveryState({ client: server.client, locale: () => 'vi', operationId: () => id(++operationCounter), scheduler,
    onCommitted: head => { committed.push(head); }, onRunsChanged: () => runs.push('runs'), ...extra });
  return { value, committed, runs, scheduler };
}
const describes = server => server.calls.filter(call => call[0] === 'describe').length;

test('controller: nothing is read until enabled; disabled or forbidden hides everything for good', async () => {
  const server = fakeServer(view());
  const { value } = controller(server);
  value.update({ enabled: false, status: 'needs_action', head: 42 });
  await settle();
  assert.equal(describes(server), 0);
  value.update({ enabled: true, status: 'needs_action', head: 42 });
  value.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  assert.equal(describes(server), 1, 'the same inputs never read twice');
  assert.equal(value.getState().view.event_head, 42);

  const hiddenServer = fakeServer(view());
  hiddenServer.client.describe = async () => { throw { response: { status: 503, data: { code: 'RECOVERY_DISABLED' } } }; };
  const hidden = controller(hiddenServer).value;
  hidden.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  assert.deepEqual([hidden.getState().hidden, hidden.getState().view], [true, null]);
  hidden.update({ enabled: true, status: 'needs_action', head: 43 });
  await settle();
  assert.equal(hidden.begin({ kind: 'stop' }), false);
});

test('controller: rewrite sends the head the author saw, then re-reads the draft and the options', async () => {
  const server = fakeServer(view());
  const { value, committed, runs, scheduler } = controller(server);
  value.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  assert.equal(value.begin({ kind: 'regenerate', scope: 'chapter', nodeId: id(31), unitCount: 2, rewritesUsed: null }), true);
  assert.equal(value.begin({ kind: 'stop' }), false, 'one confirmation at a time');
  const pending = value.getState().pending;
  assert.deepEqual([pending.expectedHead, pending.maxRewrites, pending.settled], [42, 3, false]);
  await value.confirm();
  await settle();
  assert.deepEqual(server.calls.find(call => call[0] === 'regenerate'), ['regenerate', pending.operationId, 42, id(31)]);
  assert.deepEqual([value.getState().pending, value.getState().notice, value.getState().busy], [null, 'started', false]);
  assert.deepEqual(committed, [null, 43], 'the draft is re-read now, then up to the head the options saw');
  assert.deepEqual(runs, ['runs']);
  assert.equal(describes(server), 2);
  assert.equal(value.getState().view.run_status, 'executing');
  scheduler.fire(6_000);
  assert.equal(value.getState().notice, null);
});

test('controller: an unconfirmed answer keeps the SAME operation for the retry; a refusal only allows closing', async () => {
  const server = fakeServer(view({ resume: { ...option(), task_count: 1 } }));
  const { value } = controller(server);
  value.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  value.begin({ kind: 'resume', taskCount: 1 });
  const operation = value.getState().pending.operationId;
  server.failOnce(new WorkspaceRecoveryError('RECOVERY_UNAVAILABLE', 'unknown'));
  await value.confirm();
  assert.deepEqual([value.getState().error, value.getState().pending.settled, value.getState().pending.operationId],
    ['RECOVERY_UNAVAILABLE', false, operation]);
  await value.confirm();
  assert.deepEqual(server.calls.filter(call => call[0] === 'resume').map(call => call[1]), [operation, operation]);
  assert.equal(value.getState().pending, null);

  const refused = fakeServer(view());
  const second = controller(refused).value;
  second.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  second.begin({ kind: 'regenerate', scope: 'course', nodeId: id(30), unitCount: 2, rewritesUsed: null });
  refused.failOnce(new WorkspaceRecoveryError('AI_CREDIT_INSUFFICIENT_FOR_RECOVERY', 'rejected'));
  await second.confirm();
  assert.deepEqual([second.getState().error, second.getState().pending.settled], ['AI_CREDIT_INSUFFICIENT_FOR_RECOVERY', true]);
  const sent = refused.calls.filter(call => call[0] === 'regenerate').length;
  await second.confirm();
  assert.equal(refused.calls.filter(call => call[0] === 'regenerate').length, sent, 'a settled refusal is never re-sent');
  second.close();
  assert.deepEqual([second.getState().pending, second.getState().error], [null, null]);
});

test('controller: two tabs on the same stopped design: one rewrite wins, the other is refused and re-reads', async () => {
  const server = fakeServer(view());
  const [a, b] = [controller(server).value, controller(server).value];
  for (const tab of [a, b]) tab.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  a.begin({ kind: 'regenerate', scope: 'chapter', nodeId: id(31), unitCount: 2, rewritesUsed: null });
  b.begin({ kind: 'regenerate', scope: 'chapter', nodeId: id(31), unitCount: 2, rewritesUsed: null });
  await Promise.all([a.confirm(), b.confirm()]);
  await settle();
  assert.equal(a.getState().pending, null);
  assert.deepEqual([b.getState().error, b.getState().pending.settled], ['RECOVERY_STATE_CHANGED', true]);
  assert.equal(b.getState().view.run_status, 'executing', 'the loser re-read the options and now sees the running design');
});

test('controller: stop while a lesson is still being written checks again until it finished (bounded)', async () => {
  const server = fakeServer(running());
  const { value, scheduler, committed } = controller(server);
  value.update({ enabled: true, status: 'drafting', head: 42 });
  await settle();
  value.update({ enabled: true, status: 'drafting', head: 43 });
  await settle();
  assert.equal(describes(server), 1, 'a running draft with a known Stop is not re-read per event');
  value.begin({ kind: 'stop' });
  await value.confirm();
  await settle();
  assert.equal(value.getState().notice, 'stopped');
  assert.equal(value.getState().view.draining, true);
  assert.ok(scheduler.delays().includes(WORKSPACE_RECOVERY_DRAIN_POLL_MS));
  server.set(view({ event_head: 44, resume: { ...option(), task_count: 1 } }));
  scheduler.fire(WORKSPACE_RECOVERY_DRAIN_POLL_MS);
  await settle();
  assert.equal(value.getState().view.draining, false);
  assert.ok(!scheduler.delays().includes(WORKSPACE_RECOVERY_DRAIN_POLL_MS));
  assert.ok(committed.includes(44), 'the reader is told about the head reached while draining');

  const endless = fakeServer(view({ draining: true }));
  const bounded = controller(endless);
  bounded.value.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  for (let index = 0; index < WORKSPACE_RECOVERY_DRAIN_POLL_LIMIT; index++) {
    bounded.scheduler.fire(WORKSPACE_RECOVERY_DRAIN_POLL_MS);
    await settle();
  }
  assert.deepEqual(bounded.scheduler.delays(), [], 'draining checks stop after the limit');
  assert.equal(describes(endless), WORKSPACE_RECOVERY_DRAIN_POLL_LIMIT + 1);
});

test('controller: closing or switching drafts drops late answers and timers', async () => {
  let release;
  const server = fakeServer(view({ draining: true }));
  const { value, scheduler } = controller(server);
  value.update({ enabled: true, status: 'needs_action', head: 42 });
  await settle();
  assert.ok(scheduler.delays().length);
  server.client.describe = (_locale, signal) => new Promise(resolve => { release = () => resolve(view()); assert.ok(signal); });
  value.update({ enabled: true, status: 'needs_action', head: 43 });
  value.update({ enabled: false, status: 'needs_action', head: 43 });
  release();
  await settle();
  assert.equal(value.getState().view, null);
  assert.deepEqual(scheduler.delays(), []);
  value.dispose();
  value.update({ enabled: true, status: 'needs_action', head: 44 });
  assert.equal(value.getState().view, null);
});

// Dialog slots, rendered with the same inert UI boundaries as workspace-view.test.mjs.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const h = React.createElement;
const element = tag => ({ children, className }) => h(tag, { className }, children);
const ui = {
  Dialog: ({ open, children }) => open ? h('div', { role: 'dialog' }, children) : null,
  DialogContent: element('section'), DialogClose: ({ children }) => children, DialogTitle: element('h2'), DialogDescription: element('p'),
  Badge: element('span'), Button: React.forwardRef(({ children, onClick }, ref) => h('button', { ref, onClick }, children)),
  Tabs: element('div'), TabsList: element('nav'), TabsTrigger: element('button'), TabsContent: element('div'),
};
const flow = {
  Position: { Left: 'left', Right: 'right' }, MarkerType: { ArrowClosed: 'arrowclosed' }, Handle: () => null, Background: () => null,
  Controls: () => null, MiniMap: () => null, Panel: element('div'), BaseEdge: () => null, getSmoothStepPath: () => ['M 0 0'],
  ReactFlowProvider: element('div'), useNodesState: initial => [initial, () => {}, () => {}], useEdgesState: initial => [initial, () => {}, () => {}],
  ReactFlow: props => h('div', null, props.nodes.map(n => h(props.nodeTypes[n.type], { key: n.id, data: n.data }))),
};
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = specifier => {
    if (specifier.endsWith('.css')) return {};
    if (specifier.startsWith('../ui/')) return ui;
    if (specifier === '@xyflow/react') return flow;
    if (specifier === 'framer-motion') return { motion: { div: ({ children, ...props }) => h('div', props, children) } };
    if (specifier === 'react-markdown' || specifier === 'rehype-raw') return { __esModule: true, default: () => null };
    if (specifier.endsWith('DiagramPreviewInteractive')) return { __esModule: true, default: () => null };
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), specifier);
      return load(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(filename, module.exports);
  return module.exports;
}
const { WorkspaceDialog } = load(path.join(directory, 'workspace-dialog.tsx'));
const base = { workspace_id: id(2), correlation_id: id(3), contract_version: 1, content_locale: 'vi', status: 'needs_action',
  last_event_sequence: 42, updated_at: '2026-10-20T00:00:00Z' };
const graphNode = (nodeId, kind, parent, contentState = 'content_ready') => ({ node_id: nodeId, parent_id: parent, kind,
  canonical_path: `p.${nodeId}`, sort_order: 0, content_state: contentState, current_revision: contentState === 'content_ready' ? 1 : null,
  component_type: null, media_type: null, title: `Title ${kind}`, user_modified: false, applied: false });
const nodes = [graphNode(id(30), 'course', null), graphNode(id(31), 'chapter', id(30)), graphNode(id(35), 'lesson', id(31)),
  graphNode(id(41), 'unit', id(35), 'planned')];
const graph = { ...base, snapshot_sequence: 42, overview_ready: true, structure_ready: true, total_nodes: nodes.length, nodes,
  has_more: false, next_after_node_id: null };
const status = { ...base, node_count: 4, unit_count: 1, ready_unit_count: 0, failure_code: 'RUN_STOPPED_BY_AUTHOR', failure_stage: 'generate_unit' };
const state = { opened: true, visible: true, busy: false, access: 'allowed', status, graph, stale: false, selectedNodeId: null,
  detail: null, detailStale: false, drafts: {}, error: null };
const slots = {
  headerActions: h('button', null, 'HEADER-STOP'), recoveryBanner: h('p', null, 'RECOVERY-BANNER'), recoveryActions: h('span', null, 'RECOVERY-ACTIONS'),
  renderChapterAction: chapter => h('span', null, `CHAPTER-ACTION:${chapter.node_id}`),
  renderNodeAction: n => n.kind === 'unit' ? h('span', null, `UNIT-ACTION:${n.node_id}`) : null,
};
const render = (patch, locale = 'vi', extra = slots) => renderToStaticMarkup(h(WorkspaceDialog, { open: true, locale,
  state: { ...state, ...patch }, onSelectNode() {}, onOpenChange() {}, ...extra }));

test('dialog: Stop in the header, the stopped notice above the tabs, chapter and lesson actions on their cards', () => {
  const html = render({});
  assert.match(html, /HEADER-STOP/);
  assert.match(html, /RECOVERY-BANNER/);
  assert.match(html, new RegExp(`CHAPTER-ACTION:${id(31)}`));
  assert.match(html, new RegExp(`UNIT-ACTION:${id(41)}`));
  assert.doesNotMatch(html, /UNIT-ACTION:.*UNIT-ACTION/, 'only lessons get the card action');
  const plain = render({}, 'vi', {});
  assert.doesNotMatch(plain, /HEADER-STOP|RECOVERY-BANNER|CHAPTER-ACTION|UNIT-ACTION/, 'no slots, unchanged dialog');
});

for (const locale of ['vi', 'en']) test(`${locale}: before any content the terminal panel carries the actions instead of the "new draft" hint`, () => {
  const html = render({ graph: null }, locale);
  assert.match(html, /RECOVERY-ACTIONS/);
  assert.doesNotMatch(html, locale === 'vi' ? /Sau khi xử lý nguyên nhân/ : /After resolving the cause/);
  assert.doesNotMatch(html, /RECOVERY-BANNER/, 'the panel already shows the actions');
  assert.match(html, locale === 'vi' ? /Bạn đã dừng việc tạo nội dung/ : /You stopped creating content/);
  assert.doesNotMatch(html, locale === 'vi' ? /Bước gặp lỗi/ : /Failed step/, 'an author stop is not a failed step');
  assert.doesNotMatch(html, /RUN_STOPPED_BY_AUTHOR/);
  const noActions = render({ graph: null }, locale, {});
  assert.match(noActions, locale === 'vi' ? /Sau khi xử lý nguyên nhân/ : /After resolving the cause/,
    'without recovery the old guidance stays');
});

test('activity log names Stop, Continue and Rewrite in plain VI/EN words', () => {
  const vi = read('../../i18n/locales/vi.ts');
  const en = read('../../i18n/locales/en.ts');
  const label = (file, code) => new RegExp(`"lesson_author\\.workspace\\.${code}": "([^"]+)"`).exec(file)?.[1];
  const codes = ['run_stopped', 'run_resumed', 'lessons_rewritten'];
  for (const code of codes) {
    for (const [locale, file] of [['vi', vi], ['en', en]]) {
      const text = label(file, code);
      assert.ok(text && text.length > 10, `${locale} ${code}`);
      assert.doesNotMatch(text, /[A-Z][A-Z0-9]*_[A-Z0-9_]+|\b(AI ID|workspace|run|revision|hash|token|task)\b/i, `${locale} ${code}: ${text}`);
      if (locale === 'vi') assert.doesNotMatch(text, /\b(session|course|lesson|chapter|rewrite|stop)\b/i, text);
    }
  }
  assert.equal(label(vi, 'run_stopped'), 'đã dừng việc AI tạo nội dung của phiên thiết kế khoá học');
  assert.equal(label(vi, 'run_resumed'), 'đã cho AI chạy tiếp các bước kiểm tra còn dang dở của phiên thiết kế khoá học');
  assert.equal(label(vi, 'lessons_rewritten'), 'đã cho AI viết lại các bài học còn thiếu của phiên thiết kế khoá học');
});
