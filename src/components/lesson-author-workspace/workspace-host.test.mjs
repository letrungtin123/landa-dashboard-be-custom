/* global URL, structuredClone */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const modules = new Map();
const h = React.createElement;
let editorProps, dialogProps;
const ui = {
  Dialog: ({ open, children }) => open ? h('div', { role: 'dialog' }, children) : null,
  DialogContent: ({ children }) => h('section', null, children),
  DialogTitle: ({ children }) => h('h2', null, children),
  DialogDescription: ({ children }) => h('p', null, children),
  Button: ({ children, disabled }) => h('button', { disabled }, children),
  Input: props => h('input', props),
};
// Actual host/controller/session. Only auth/network/UI boundaries are replaced;
// SSR does not claim browser geometry, focus, navigation or live backend coverage.
function load(relative) {
  const url = new URL(relative, import.meta.url);
  if (modules.has(url.href)) return modules.get(url.href);
  const module = { exports: {} };
  const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.VITE_LESSON_AUTHOR_WORKSPACE_ENABLED', 'undefined')
    .replaceAll('import.meta.env.VITE_LESSON_AUTHOR_WORKSPACE_STREAM_ENABLED', 'undefined');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (name === './custom-client') return { customApiClient: {} };
    if (name.endsWith('/workspace-stream')) return { createWorkspaceStreamClient: () => ({ start() {}, close() {} }) };
    if (name.endsWith('/workspace-source-stream')) return { createWorkspaceSourceStreamClient: () => ({ start() {}, close() {} }) };
    if (name.endsWith('/workspace-sources')) return { workspaceSourceApi: {} };
    if (name.endsWith('/custom-chat')) return { fetchLessonAuthorChatSettings: async () => ({ active_bot: null, active_kb: null, active_persona: null }) };
    if (name.endsWith('/storage-url')) return { storageUrl: value => value || '' };
    if (name === './workspace-source-panel') return { WorkspaceSourcePanel: () => h('div', null, 'Sources') };
    if (name === './workspace-ai-avatar') return { WorkspaceAiAvatar: () => h('span', null, 'AI') };
    if (name === '@/utils/store') return { useAuthStore: select => select({ user: null, isAuthenticated: false, hasPermission: () => false }) };
    if (name === '@/utils/tenant-store') return { useTenantStore: select => select({ activeTenantId: null }) };
    if (name === 'react-i18next') return { useTranslation: () => ({ i18n: { language: 'en' } }) };
    if (name.startsWith('../ui/')) return ui;
    if (name === './workspace-dialog') return {
      WorkspaceNodeTypePill: ({ node }) => h('span', null, node.kind),
      WorkspaceDialogBody: props => {
      dialogProps = props;
      const selected = props.state.opened && props.state.access === 'allowed' ? props.state.graph?.nodes.find(n => n.node_id === props.state.selectedNodeId) : null;
      return h('section', null, props.toolbar, props.renderNodeDetail(selected ?? null));
    } };
    if (name === './workspace-node-detail') return {
      WorkspaceDetailContent: ({ detail }) => h('p', null, detail.content?.title),
      WorkspaceAuthorReviewCards: () => h('section', null, 'AI review'),
      workspaceDetailStats: () => ({ sectionCount: 0, lessonCount: 0, interactionCount: 0, componentTypes: [] }),
    };
    if (name === './workspace-node-editor') return { WorkspaceNodeEditor: props => { editorProps = props; return h('div', null, 'Controlled editor'); } };
    if (name.startsWith('.')) {
      const tsUrl = new URL(name + '.ts', url);
      const tsxUrl = new URL(name + '.tsx', url);
      return load((existsSync(tsUrl) ? tsUrl : tsxUrl).href);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(url.href, module.exports);
  return module.exports;
}
const { createWorkspaceCourseHost, workspaceHostEnabled, readWorkspaceLaunch, workspaceHostKey } = load('./workspace-host.logic.ts');
const { createWorkspaceSession } = load('./workspace-session.ts');
const { WorkspaceReadError } = load('../../api/lesson-author-workspace.contract.ts');
const { workspaceApplyMessage } = load('../../api/workspace-apply.ts');
const { WorkspaceCourseHostOverlay, useCourseWorkspaceHost, workspaceApplyScope, workspaceScopeApplyLabel,
  workspaceNodeSupportsEditor, workspaceNodeUsesHeaderTitleEditor, saveThenApplyWorkspaceScope,
  completeWorkspaceApplyUi, workspaceOverviewAutoLoadAttempt, workspaceAppliedScopeRevisions,
  projectWorkspaceAppliedGraph } = load('./workspace-course-host.tsx');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { actorId: id(1), tenantId: id(2), courseId: 'course-v1:TEST+HOST+2026' };
const launch = { course_id: scope.courseId, conversation_id: id(3), workspace_id: id(4), content_locale: 'en', can_edit: true };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function settle() { for (let i = 0; i < 100; i++) await Promise.resolve(); }

test('Apply failures use localized nontechnical messages', () => {
  for (const code of ['WORKSPACE_APPLY_NOT_READY', 'WORKSPACE_APPLY_CONFLICT', 'WORKSPACE_APPLY_VALIDATION_FAILED', 'WORKSPACE_APPLY_UNAVAILABLE']) {
    for (const locale of ['en', 'vi']) {
      const message = workspaceApplyMessage(code, locale);
      assert.ok(message.length > 20);
      assert.doesNotMatch(message, /WORKSPACE_|APPLY_/);
    }
  }
});

test('overview auto-load advances only with committed progress and stops permanently on read failure', () => {
  const base = { open: true, workspaceId: id(4), sessionAvailable: true, loading: false, complete: false,
    writeBusy: false, hasError: false, readOpened: true, readAllowed: true, stale: false,
    overviewReady: true, structureReady: true, snapshotSequence: 7, detailCount: 0 };
  const first = workspaceOverviewAutoLoadAttempt(null, base);
  assert.equal(first, `${id(4)}:7:0`);
  assert.equal(workspaceOverviewAutoLoadAttempt(first, base), null, 'same no-progress batch must not retry');
  const second = workspaceOverviewAutoLoadAttempt(first, { ...base, detailCount: 4 });
  assert.equal(second, `${id(4)}:7:4`, 'a successful bounded batch admits the next batch');
  assert.equal(workspaceOverviewAutoLoadAttempt(second, { ...base, detailCount: 4, hasError: true }), null,
    'a read failure cannot create a render/request hot loop');
  assert.equal(workspaceOverviewAutoLoadAttempt(second, { ...base, detailCount: 4, loading: true }), null);
  assert.equal(workspaceOverviewAutoLoadAttempt(second, { ...base, detailCount: 4, complete: true }), null);
  assert.equal(workspaceOverviewAutoLoadAttempt(second, { ...base, detailCount: 4, snapshotSequence: 8 }),
    `${id(4)}:8:4`, 'a new authoritative graph head is independently eligible');
});

test('development skeleton preview is compile-time gated and owns no generation or workspace client', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../../pages/dev-ai-id-mindmap-skeleton.tsx', import.meta.url), 'utf8');
  assert.match(app, /import\.meta\.env\.DEV.*AI_ID_MINDMAP_SKELETON_PREVIEW_PATH/);
  assert.match(preview, /__dev\/ai-id-mindmap-skeleton/);
  assert.match(preview, /WorkspacePendingSkeleton locale="vi" stage="mindmap"/);
  assert.match(preview, /useTheme\(\)/);
  assert.match(preview, /setTheme\('light'\)/);
  assert.match(preview, /setTheme\('dark'\)/);
  assert.doesNotMatch(preview, /createWorkspace|launch\(|generate|axios|fetch\(|customApiClient/);
});
function fixture(options = {}) {
  const { nodePatch = {}, detailPatch = {}, ...hostOptions } = options;
  const calls = [], resolvers = [], timers = new Map();
  let denied = false, created = 0, guard;
  const base = { workspace_id: id(4), correlation_id: id(5), contract_version: 1, content_locale: 'en',
    status: 'ready', last_event_sequence: 1, updated_at: '2026-09-29T00:00:00Z' };
  const node = { node_id: id(6), parent_id: null, kind: 'course', canonical_path: 'course', sort_order: 0,
    content_state: 'content_ready', current_revision: 0, component_type: null, media_type: null,
    title: 'Saved title', user_modified: false, applied: false, ...nodePatch };
  const root = { node_id: id(5), parent_id: null, kind: 'course', canonical_path: 'course', sort_order: 0,
    content_state: 'content_ready', current_revision: 0, component_type: null, media_type: null,
    title: 'Course', user_modified: false, applied: false };
  const graphNodes = node.kind === 'course' ? [node] : [root, node];
  const detail = { ...base, ...node, content: { title: 'Saved title', purpose: null, data: { objective: 'Stored outcome' }, implementation_notes: null },
    validation_contract: 'workspace-aggregate-edit-1', ...detailPatch };
  async function read(kind, data) {
    calls.push(kind); if (denied) throw new WorkspaceReadError('WORKSPACE_READ_FORBIDDEN', 403); return structuredClone(data);
  }
  const host = createWorkspaceCourseHost(scope, {
    enabled: true, authorized: true, locale: 'en',
    resolve: async input => { resolvers.push(input); return launch; },
    createSession: (identity, canWrite) => {
      created++; guard = canWrite;
      assert.deepEqual(identity, { ...scope, conversationId: launch.conversation_id, workspaceId: launch.workspace_id });
      return createWorkspaceSession(identity, {
        scheduler: { set(fn, delay) { assert.equal(timers.size, 0, 'only one polling timer'); const token = {}; timers.set(token, { fn, delay }); return token; }, clear(token) { timers.delete(token); } },
        uiLocale: 'en',
        readClient: {
          status: () => read('status', { ...base, node_count: graphNodes.length, unit_count: 0, ready_unit_count: 0 }),
          graph: () => read('graph', { ...base, snapshot_sequence: 1, overview_ready: true, structure_ready: true, total_nodes: graphNodes.length, nodes: graphNodes, has_more: false, next_after_node_id: null }),
          events: () => read('events', { ...base, events: [], next_sequence: 1, has_more: false }),
          detail: () => read('detail', detail),
        },
        writeClient: { save: async () => { calls.push('save'); throw Error('unexpected write'); }, reset: async () => { calls.push('reset'); throw Error('unexpected write'); } },
      });
    }, ...hostOptions,
  });
  return { host, node, detail, calls, resolvers, timers, get created() { return created; }, get guard() { return guard; }, deny() { denied = true; } };
}
test('only an explicit true string enables host; disabled and unauthorized are inert', async () => {
  for (const value of [undefined, null, false, true, '', 'false', '1', 'TRUE']) assert.equal(workspaceHostEnabled(value), false);
  assert.equal(workspaceHostEnabled('true'), true);
  for (const options of [{ enabled: false }, { authorized: false }]) {
    const f = fixture(options); await f.host.launch(); assert.equal(f.resolvers.length, 0); assert.equal(f.created, 0); assert.equal(f.host.getState().open, false); f.host.dispose();
  }
});
test('launch contract rejects mismatched course, fabricated/non-UUID IDs, unknown locale and nonboolean edit grant', () => {
  for (const patch of [{ course_id: 'other' }, { workspace_id: 'local' }, { conversation_id: 'fake' }, { content_locale: 'fr' }, { can_edit: 'true' }]) {
    assert.throws(() => readWorkspaceLaunch({ ...launch, ...patch }, scope));
  }
  const result = readWorkspaceLaunch({ ...launch, extra: 'not forwarded' }, scope);
  assert.deepEqual(result, launch); assert.ok(Object.isFrozen(result));
  assert.notEqual(workspaceHostKey(scope), workspaceHostKey({ ...scope, actorId: id(9) }));
  assert.notEqual(workspaceHostKey(scope), workspaceHostKey({ ...scope, tenantId: id(9) }));
});
test('Apply keeps the exact selected chapter/section/lesson/component scope', () => {
  const shape = { sort_order: 0, current_revision: 2, component_type: null, media_type: null,
    title: 'Node', user_modified: false, applied: false };
  const chapter = { ...shape, node_id: id(20), parent_id: id(19), kind: 'chapter', canonical_path: 'chapter_1', content_state: 'content_ready' };
  const lesson = { ...shape, node_id: id(21), parent_id: chapter.node_id, kind: 'lesson', canonical_path: 'chapter_1.lesson_1', content_state: 'content_ready' };
  const unit = { ...shape, node_id: id(22), parent_id: lesson.node_id, kind: 'unit', canonical_path: 'chapter_1.lesson_1.unit_1', content_state: 'content_ready' };
  const component = { ...shape, node_id: id(23), parent_id: unit.node_id, kind: 'component', canonical_path: 'chapter_1.lesson_1.unit_1.component_1', content_state: 'content_ready', component_type: 'html' };
  const media = { ...shape, node_id: id(24), parent_id: unit.node_id, kind: 'media_brief', canonical_path: 'chapter_1.lesson_1.unit_1.media_1', content_state: 'content_ready', media_type: 'video' };
  const sibling = { ...shape, node_id: id(25), parent_id: id(19), kind: 'chapter', canonical_path: 'chapter_2', content_state: 'content_ready' };
  const root = { ...shape, node_id: id(19), parent_id: null, kind: 'course', canonical_path: 'course', content_state: 'content_ready' };
  const nodes = [root, chapter, lesson, unit, component, media, sibling];
  assert.equal(workspaceApplyScope(nodes, component.node_id), component);
  assert.equal(workspaceApplyScope(nodes, unit.node_id), unit);
  assert.equal(workspaceApplyScope(nodes, chapter.node_id), chapter);
  assert.equal(workspaceApplyScope(nodes, lesson.node_id), lesson);
  assert.equal(workspaceApplyScope(nodes, nodes[0].node_id), null);
  assert.equal(workspaceApplyScope(nodes, id(99)), null);
  assert.deepEqual(Object.keys(workspaceAppliedScopeRevisions(nodes, chapter.node_id)).sort(),
    [chapter.node_id, lesson.node_id, unit.node_id, component.node_id].sort(), 'chapter receipt covers its exact materialized subtree');
  assert.deepEqual(Object.keys(workspaceAppliedScopeRevisions(nodes, component.node_id)).sort(),
    [chapter.node_id, lesson.node_id, unit.node_id, component.node_id].sort(), 'component receipt includes only its required hierarchy');
  const graph = { workspace_id: id(4), nodes, marker: 'preserved' };
  const projected = projectWorkspaceAppliedGraph(graph, { workspaceId: id(4), revisions: workspaceAppliedScopeRevisions(nodes, chapter.node_id) });
  assert.equal(projected.nodes.find(node => node.node_id === component.node_id).applied, true);
  assert.equal(projected.nodes.find(node => node.node_id === media.node_id).applied, false);
  assert.equal(projected.nodes.find(node => node.node_id === sibling.node_id).applied, false);
  assert.equal(projectWorkspaceAppliedGraph({ ...graph, nodes: nodes.map(node => node.node_id === component.node_id ? { ...node, current_revision: 3 } : node) },
    { workspaceId: id(4), revisions: { [component.node_id]: 2 } }).nodes.find(node => node.node_id === component.node_id).applied, false,
  'a newer revision cannot inherit an older Apply receipt');
  assert.deepEqual(['chapter', 'lesson', 'unit', 'component'].map(kind => workspaceScopeApplyLabel(kind, 'vi')),
    ['Áp dụng cả chương', 'Áp dụng cả mục', 'Áp dụng cả bài học', 'Áp dụng nội dung']);
  assert.deepEqual(['course', 'chapter', 'lesson', 'unit', 'component', 'media_brief'].map(workspaceNodeSupportsEditor),
    [false, true, true, true, true, false]);
  assert.deepEqual(['course', 'chapter', 'lesson', 'unit', 'component', 'media_brief'].map(workspaceNodeUsesHeaderTitleEditor),
    [false, true, true, true, false, false]);
});
test('dirty component is saved and authoritatively reconciled before exact component Apply', async () => {
  const unit = { node_id: id(22), parent_id: id(21), kind: 'unit', content_state: 'content_ready' };
  const component = { node_id: id(23), parent_id: unit.node_id, kind: 'component', content_state: 'content_ready' };
  const order = [];
  let state = { read: { stale: false, status: { last_event_sequence: 3 }, graph: { snapshot_sequence: 3, nodes: [unit, component] } },
    writes: {}, writeBusy: false, error: null };
  const session = {
    getState: () => state,
    setDraft: (nodeId, draft) => { order.push(['draft', nodeId, draft.title]); },
    save: async (nodeId, revision) => {
      order.push(['save', nodeId, revision]);
      state = { ...state, read: { ...state.read, status: { last_event_sequence: 4 }, graph: { ...state.read.graph, snapshot_sequence: 4 } },
        writes: { [nodeId]: { phase: 'committed', readRequired: false } } };
    },
    refreshForApply: async () => { order.push(['refresh']); },
  };
  await saveThenApplyWorkspaceScope({ session, selectedNodeId: component.node_id,
    draft: { title: 'Edited', purpose: null, data: {}, implementation_notes: null }, expectedRevision: 2, changed: true,
    assertCanWrite: () => order.push(['guard']), apply: async (scopeId, sequence) => order.push(['apply', scopeId, sequence]) });
  assert.deepEqual(order, [['guard'], ['draft', component.node_id, 'Edited'], ['save', component.node_id, 2], ['refresh'], ['guard'], ['apply', component.node_id, 4]]);
});
test('unknown or failed Save never dispatches Apply; a clean confirmed draft skips Save', async () => {
  const unit = { node_id: id(22), parent_id: id(21), kind: 'unit', content_state: 'content_ready' };
  const component = { node_id: id(23), parent_id: unit.node_id, kind: 'component', content_state: 'content_ready' };
  const base = { read: { stale: false, status: { last_event_sequence: 3 }, graph: { snapshot_sequence: 3, nodes: [unit, component] } },
    writes: {}, writeBusy: false, error: null };
  let applied = 0, saved = 0;
  const failed = { getState: () => base, setDraft() {}, save: async () => { saved++; throw Error('unknown'); }, refreshForApply: async () => {} };
  await assert.rejects(saveThenApplyWorkspaceScope({ session: failed, selectedNodeId: component.node_id,
    draft: { title: 'Edited', purpose: null, data: {}, implementation_notes: null }, expectedRevision: 2, changed: true,
    assertCanWrite() {}, apply: async () => { applied++; } }));
  assert.equal(saved, 1); assert.equal(applied, 0);
  const clean = { getState: () => base, setDraft() { throw Error('unexpected'); }, save: async () => { throw Error('unexpected'); }, refreshForApply: async () => {} };
  await saveThenApplyWorkspaceScope({ session: clean, selectedNodeId: component.node_id,
    draft: { title: 'Saved', purpose: null, data: {}, implementation_notes: null }, expectedRevision: 2, changed: false,
    assertCanWrite() {}, apply: async (scopeId, sequence) => { applied++; assert.equal(scopeId, component.node_id); assert.equal(sequence, 3); } });
  assert.equal(applied, 1);
});
test('committed Apply exits busy state before background workspace and course refreshes settle', async () => {
  const workspace = deferred(), course = deferred(); const order = [];
  completeWorkspaceApplyUi({ markApplied: () => order.push('done'),
    refreshWorkspace: () => { order.push('workspace'); return workspace.promise; },
    refreshCourse: () => { order.push('course'); return course.promise; } });
  assert.deepEqual(order, ['done', 'workspace', 'course']);
  workspace.resolve(); course.resolve(); await settle();
});
test('missing, empty, invalid or failed discovery never creates a session or fallback request', async () => {
  for (const [resolve, issue] of [[undefined, 'discovery_unavailable'], [async () => null, 'no_workspace'],
    [async () => ({ ...launch, course_id: 'other' }), 'launch_invalid'], [async () => { throw Error('private backend detail'); }, 'launch_failed']]) {
    const f = fixture({ resolve }); await f.host.launch(); assert.equal(f.host.getState().issue, issue);
    assert.equal(f.created, 0); assert.deepEqual(f.calls, []); assert.equal(f.host.canWrite(), false); f.host.dispose();
  }
});
test('responsive triggers coalesce; close/reopen preserves drafts, reauthorizes exact selection and shares one reader', async () => {
  const f = fixture();
  try {
    const first = f.host.launch(); assert.equal(f.host.launch(), first); await first; await f.host.launch();
    const session = f.host.getSession();
    assert.equal(f.created, 1); assert.equal(f.resolvers.length, 1); assert.equal(f.timers.size, 0, 'terminal runs do not idle-poll');
    await session.selectNode(f.node.node_id); session.setDraft(f.node.node_id, { ...f.detail.content, title: 'Local draft' });
    f.host.setVisible(false); assert.equal(f.timers.size, 0);
    f.host.close(); assert.equal(f.timers.size, 0); assert.equal(f.host.canWrite(), false);
    assert.equal(session.getState().drafts[f.node.node_id].content.title, 'Local draft');
    await f.host.launch(); assert.equal(f.host.getSession(), session); assert.equal(f.created, 1);
    assert.deepEqual(f.resolvers[1].previous, launch); assert.equal(f.resolvers[0].previous, null);
    assert.equal(session.getState().drafts[f.node.node_id].content.title, 'Local draft');
    assert.equal(f.timers.size, 0); f.host.setVisible(true); await settle(); assert.equal(f.timers.size, 0);
    assert.ok(f.calls.every(c => ['status', 'events', 'graph', 'detail'].includes(c)));
  } finally { f.host.dispose(); }
  assert.equal(f.timers.size, 0); assert.equal(f.host.getSession(), null); assert.equal(f.host.getState().workspace, null);
});
test('close before dispatch, late discovery and disposal cannot resurrect a host', async () => {
  const early = fixture(); const earlyRun = early.host.launch(); early.host.close(); await earlyRun;
  assert.equal(early.resolvers.length, 0); early.host.dispose();
  for (const dispose of [false, true]) {
    const gate = deferred(); let signal;
    const f = fixture({ resolve: input => { signal = input.signal; return gate.promise; } });
    const run = f.host.launch(); await Promise.resolve();
    if (dispose) f.host.dispose(); else f.host.close();
    assert.equal(signal.aborted, true); gate.resolve(launch); await run;
    assert.equal(f.created, 0); assert.equal(f.host.getState().open, false); f.host.dispose();
  }
});
test('reopen never silently switches workspace underneath local drafts', async () => {
  let selection = launch;
  const f = fixture({ resolve: async () => selection });
  try {
    await f.host.launch(); const session = f.host.getSession(); await session.selectNode(f.node.node_id);
    session.setDraft(f.node.node_id, { ...f.detail.content, title: 'Keep me' }); f.host.close();
    selection = { ...launch, workspace_id: id(10) }; await f.host.launch();
    assert.equal(f.host.getState().issue, 'launch_changed'); assert.equal(f.host.canWrite(), false);
    assert.equal(f.created, 1); assert.equal(session.getState().drafts[f.node.node_id].content.title, 'Keep me');
    selection = launch; await f.host.launch(); assert.equal(f.host.getState().issue, null);
  } finally { f.host.dispose(); }
});
test('revalidated server edit grant gates writes; locale update does not replace session', async () => {
  let selection = launch;
  const f = fixture({ resolve: async () => selection });
  try {
    await f.host.launch(); assert.equal(f.guard(), true); const session = f.host.getSession();
    f.host.setUiLocale('vi'); assert.equal(session.editorProps(f.node.node_id).locale, 'vi');
    assert.equal(f.host.getSession(), session); f.host.close(); assert.equal(f.guard(), false);
    selection = { ...launch, can_edit: false }; await f.host.launch();
    assert.equal(f.guard(), false); assert.throws(() => f.host.assertCanWrite()); assert.equal(f.created, 1);
  } finally { f.host.dispose(); }
});
const render = (f, locale = 'en') => { editorProps = null; dialogProps = null; return renderToStaticMarkup(h(WorkspaceCourseHostOverlay, { host: f.host, state: f.host.getState(), locale })); };
test('default-off hook produces no trigger or overlay', () => {
  function Probe() { const host = useCourseWorkspaceHost(scope.courseId, true); return h('div', null, host.trigger, host.overlay); }
  assert.equal(renderToStaticMarkup(h(Probe)), '<div></div>');
});
for (const locale of ['en', 'vi']) test(`${locale}: missing discovery renders honest shell, no composer/Create/Apply`, async () => {
  const f = fixture({ resolve: undefined }); await f.host.launch();
  const html = render(f, locale); assert.match(html, /role="dialog"/);
  assert.ok(html.includes(locale === 'en' ? 'Workspace discovery is not connected yet' : 'Chưa kết nối API tìm bản thiết kế khoá học'));
  assert.doesNotMatch(html, /textarea|contenteditable|<button[^>]*>(Create|Apply|Tạo|Áp dụng)<\/button>/);
  assert.doesNotMatch(html, /workspace_id|conversation_id/); f.host.close(); assert.equal(render(f, locale), ''); f.host.dispose();
});
test('aggregate analysis remains read-only; blocked reads and closed host hide it', async () => {
  const f = fixture();
  try {
    await f.host.launch(); const session = f.host.getSession(); await session.selectNode(f.node.node_id);
    assert.match(render(f), /Saved title/); assert.equal(editorProps, null);
    assert.equal(dialogProps.overviewDetails.length, 0); await session.loadOverview(); render(f); assert.equal(dialogProps.overviewDetails.length, 1);
    f.deny(); await session.refresh(); assert.doesNotMatch(render(f), /Controlled editor|Saved title/);
    assert.equal(editorProps, null); assert.deepEqual(session.getState().drafts, {});
    f.host.close(); assert.equal(render(f), '');
  } finally { f.host.dispose(); }
});
test('chapter title editor is available before Apply and remains mounted view-only after Apply', async () => {
  for (const applied of [false, true]) {
    const f = fixture({ nodePatch: { kind: 'chapter', parent_id: id(5), canonical_path: 'course.chapter_1', sort_order: 1, applied },
      detailPatch: { kind: 'chapter', parent_id: id(5), canonical_path: 'course.chapter_1', sort_order: 1, applied } });
    try {
      await f.host.launch(); await f.host.getSession().selectNode(f.node.node_id); render(f);
      assert.ok(editorProps, 'chapter uses the typed title editor');
      assert.equal(editorProps.readOnly, applied);
      assert.equal(editorProps.titleInHeader, true);
      assert.ok(editorProps.reviewContent, 'AI review cards stay mounted below the header');
      assert.equal(typeof editorProps.onApply, 'function');
      assert.equal(editorProps.applyDisabled, applied);
    } finally { f.host.dispose(); }
  }
});
test('server read-only launch renders authorized preview without edit controls', async () => {
  const f = fixture({ resolve: async () => ({ ...launch, can_edit: false }) });
  try {
    await f.host.launch(); await f.host.getSession().selectNode(f.node.node_id);
    const html = render(f); assert.match(html, /currently read-only/); assert.match(html, /Saved title/); assert.equal(editorProps, null);
  } finally { f.host.dispose(); }
});
test('course editor mounts two responsive triggers but one host, without replacing legacy chat/upload layout', () => {
  const page = readFileSync(new URL('../../pages/course-editor.tsx', import.meta.url), 'utf8');
  assert.equal((page.match(/useCourseWorkspaceHost\(\s*courseId/g) ?? []).length, 1);
  assert.equal((page.match(/\{workspaceHost.trigger\}/g) ?? []).length, 2);
  assert.equal((page.match(/\{workspaceHost.overlay\}/g) ?? []).length, 1);
  assert.match(page, /workspaceLaunch\?: WorkspaceLaunchResolver/);
  const host = readFileSync(new URL('./workspace-course-host.tsx', import.meta.url), 'utf8');
  assert.match(host, /VITE_LESSON_AUTHOR_WORKSPACE_ENABLED/);
  assert.match(host, /WorkspaceNodeTypePill node=\{node\} locale=\{locale\}/);
  assert.doesNotMatch(host, /component_type\.replace/);
  assert.doesNotMatch(host, /localStorage|sessionStorage|setInterval|setTimeout|fetch\(/);
  assert.match(host, /createWorkspaceReadClient\(identity\)/); assert.match(host, /createWorkspaceWriteClient\(identity\)/);
  assert.doesNotMatch(host, /data-\[state=open\]:slide-in-from-bottom-2|data-\[state=open\]:zoom-in-\[0\.98\]/,
    'detail reconciliation must not replay a transform animation after Apply');
  assert.match(host, /data-\[state=open\]:animate-none data-\[state=closed\]:animate-none/);
  assert.match(host, /h-\[calc\(100dvh-2rem\)\] max-h-none/,
    'detail modal owns a stable viewport height while Apply changes its internal controls');
  assert.doesNotMatch(host, /max-h-\[(?:90|92)dvh\]/,
    'content-dependent modal height made its centered frame jump after Apply reconciliation');
  assert.doesNotMatch(host, /className=\{`relative z-\[10070\]/,
    'detail modal must not override the fixed viewport positioning supplied by DialogContent');
  const editor = readFileSync(new URL('./workspace-node-editor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /key=\{`\$\{detail\.workspace_id\}:\$\{detail\.node_id\}`\}/);
  assert.doesNotMatch(editor, /key=\{`\$\{detail\.workspace_id\}:\$\{detail\.node_id\}:\$\{detail\.current_revision\}`\}/);
});
test('AI Instructional Design setup is a dedicated horizontal source workspace, not a free-text chat surface', () => {
  const host = readFileSync(new URL('./workspace-course-host.tsx', import.meta.url), 'utf8');
  const source = readFileSync(new URL('./workspace-source-panel.tsx', import.meta.url), 'utf8');
  assert.match(host, /motion\.div/);
  assert.match(host, /h-\[100dvh\] w-screen max-h-none max-w-none/);
  assert.doesNotMatch(host, /md:aspect-video/);
  assert.match(host, /WorkspaceSourcePanel/);
  assert.match(source, /Tạo nội dung bài học/);
  assert.match(source, /className="sr-only" type="file"/);
  assert.doesNotMatch(source, /<select/);
});
test('the legacy floating widget cannot switch into the AI Instructional Design lesson-author surface', () => {
  const widget = readFileSync(new URL('../chat-widget/chat-widget.tsx', import.meta.url), 'utf8');
  assert.match(widget, /const \[surface\] = useState<ChatSurface>\('admin'\);/);
  assert.doesNotMatch(widget, /handleSwitchLessonAuthor/);
  assert.doesNotMatch(widget, /lessonAuthorBot/);
  assert.match(widget, /const adminBot = await fetchActiveBot\('admin'\);/);
});
