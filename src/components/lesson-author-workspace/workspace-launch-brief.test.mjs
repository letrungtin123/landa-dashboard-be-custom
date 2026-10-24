import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Real launch brief rules, contract parser, Create client, source controller
// and start-screen components. Only i18n, UI primitives and the network are
// replaced. SSR proves markup and copy; it
// does not claim browser layout, focus or live backend coverage.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const h = React.createElement;
const env = { locale: 'vi', notesRead: false };
const locales = {};
function t(key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[env.locale]);
  assert.equal(typeof value, 'string', `missing ${env.locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
const mocks = {
  './custom-client': { customApiClient: {} },
  'react-i18next': { useTranslation: () => ({ t }) },
  '@/components/course-editor/AiAuthorNotes': { useCourseAuthorNotes: () => { env.notesRead = true; return null; } },
  '../ui/button': { Button: ({ children, disabled, onClick, ...props }) => h('button', { disabled, onClick, ...props }, children) },
  '../ui/textarea': { Textarea: props => h('textarea', props) },
  // Portals render nothing in SSR: the delete confirmation is shown inline.
  '../ui/dialog': { Dialog: ({ open, children }) => open ? h('div', { role: 'dialog' }, children) : null, DialogContent: ({ children }) => h('section', null, children),
    DialogTitle: ({ children }) => h('h2', null, children), DialogDescription: ({ children }) => h('p', null, children) },
  'lucide-react': new Proxy({}, { get: () => () => h('i') }),
  './workspace-source-stream': {},
  '../../api/workspace-source-stream': {},
};
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const source = readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier === './vi') return locales.viModule;
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      const target = [`${base}.ts`, `${base}.tsx`, base].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile());
      return load(target);
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  loaded.set(file, module.exports);
  return module.exports;
}
for (const name of ['vi', 'en']) {
  const exports = load(path.join(src, `i18n/locales/${name}.ts`));
  if (name === 'vi') locales.viModule = exports;
  locales[name] = exports[name];
}
const logic = load(path.join(directory, 'workspace-launch-brief.logic.ts'));
const contract = load(path.join(src, 'api/lesson-author-workspace.contract.ts'));
const launchContract = load(path.join(src, 'api/workspace-launch.contract.ts'));
const { createWorkspaceCreateClient, workspaceCreateFailure } = load(path.join(src, 'api/workspace-create.ts'));
const { createWorkspaceSourceState } = load(path.join(directory, 'workspace-source-state.ts'));
const { WorkspaceLaunchBriefPanel, WorkspaceLaunchBriefSummary } = load(path.join(directory, 'workspace-launch-brief-panel.tsx'));
const { WorkspaceSourcePanel } = load(path.join(directory, 'workspace-source-panel.tsx'));

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const draft = (overrides = {}) => ({ ...logic.DEFAULT_WORKSPACE_LAUNCH_BRIEF, ...overrides });
const design = draft({ learner_audience: '  Nhân viên mới  ', course_purpose: '\nHiểu công ty trong tuần đầu\t' });

test('request fields per mode: texts only for design, trimmed; keep-as-is sends the mode alone', () => {
  assert.deepEqual(logic.DEFAULT_WORKSPACE_LAUNCH_BRIEF, { design_mode: 'instructional_design', learner_audience: '', course_purpose: '' });
  assert.deepEqual(logic.workspaceLaunchBriefFields(design),
    { design_mode: 'instructional_design', learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty trong tuần đầu' });
  assert.deepEqual(logic.workspaceLaunchBriefFields({ ...design, design_mode: 'preserve_source' }), { design_mode: 'preserve_source' },
    'typed texts are kept on screen but never sent for keep-as-is');
  assert.deepEqual(logic.workspaceLaunchBriefFields(draft({ design_mode: 'preserve_source' })), { design_mode: 'preserve_source' });
  for (const incomplete of [draft(), draft({ learner_audience: 'A' }), draft({ course_purpose: 'B' }),
    draft({ learner_audience: '   ', course_purpose: 'B' }), draft({ learner_audience: 'A', course_purpose: '\n\t ' }),
    draft({ design_mode: null, learner_audience: 'A', course_purpose: 'B' }), draft({ design_mode: 'other', learner_audience: 'A', course_purpose: 'B' })]) {
    assert.equal(logic.workspaceLaunchBriefFields(incomplete), null);
  }
});

test('length caps are 300 and 500 after trimming', () => {
  const at = (audience, purpose) => logic.workspaceLaunchBriefFields(draft({ learner_audience: audience, course_purpose: purpose }));
  assert.ok(at('a'.repeat(300), 'b'.repeat(500)));
  assert.ok(at(` ${'a'.repeat(300)} `, ` ${'b'.repeat(500)} `), 'surrounding spaces do not count');
  assert.equal(at('a'.repeat(301), 'b'), null);
  assert.equal(at('a', 'b'.repeat(501)), null);
  assert.equal(contract.WORKSPACE_LEARNER_AUDIENCE_MAX, 300);
  assert.equal(contract.WORKSPACE_COURSE_PURPOSE_MAX, 500);
});

test('Create is enabled only with a ready document and a complete brief, with one plain reason otherwise', () => {
  const block = (document, value) => logic.workspaceCreateBlock({ document, draft: value });
  assert.equal(block('ready', design), null);
  assert.equal(block('ready', draft({ design_mode: 'preserve_source' })), null, 'keep-as-is needs no texts');
  assert.deepEqual(block('none', draft()), { kind: 'missing', items: ['document', 'learners', 'purpose'] });
  assert.deepEqual(block('ready', draft({ learner_audience: 'A' })), { kind: 'missing', items: ['purpose'] });
  assert.deepEqual(block('ready', draft({ course_purpose: 'B', learner_audience: ' ' })), { kind: 'missing', items: ['learners'] });
  assert.deepEqual(block('ready', draft({ design_mode: null })), { kind: 'missing', items: ['mode'] });
  assert.deepEqual(block('none', draft({ design_mode: 'preserve_source' })), { kind: 'missing', items: ['document'] });
  assert.deepEqual(block('processing', design), { kind: 'document_not_ready' });
  assert.deepEqual(block('processing', draft()), { kind: 'missing', items: ['learners', 'purpose'] }, 'fields come first');
  assert.deepEqual(block('ready', draft({ learner_audience: 'a'.repeat(301), course_purpose: 'B' })), { kind: 'too_long', field: 'learners', max: 300 });
  assert.deepEqual(block('ready', draft({ learner_audience: 'A', course_purpose: 'b'.repeat(501) })), { kind: 'too_long', field: 'purpose', max: 500 });
  for (const locale of ['vi', 'en']) {
    env.locale = locale;
    const text = value => { const copy = logic.workspaceCreateBlockCopy(value);
      return t(copy.key, { max: copy.max, items: copy.itemKeys?.map(key => t(key)).join(', ') }); };
    const missing = text(block('none', draft()));
    assert.equal(missing, locale === 'vi' ? 'Còn thiếu: tài liệu đã sẵn sàng, Đối tượng học, Mục đích khoá học.'
      : 'Still needed: a ready document, Learners, Course purpose.');
    assert.match(text(block('ready', draft({ learner_audience: 'a'.repeat(301), course_purpose: 'B' }))), /300/);
    assert.ok(text(block('processing', design)).length > 20);
  }
});

test('Create client sends design_mode always and the texts only for design; anything else is rejected before the POST', async () => {
  const scope = { actorId: id(1), tenantId: id(2), courseId: 'course-v1:TEST+BRIEF+2026' };
  const posts = [];
  const client = createWorkspaceCreateClient(scope, { post: async (...args) => { posts.push(args); return { data: { success: true,
    data: { workspace_id: id(10), conversation_id: id(6), correlation_id: id(11), content_locale: 'vi', status: 'designing' } } }; } });
  const base = { operation_id: id(9), source_document_ids: [id(7)], content_locale: 'vi' };
  await client(id(6), { ...base, design_mode: 'preserve_source' }, 'vi');
  await client(id(6), { ...base, design_mode: 'instructional_design', learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' }, 'vi');
  assert.deepEqual(posts.map(call => call[1]), [{ ...base, design_mode: 'preserve_source' },
    { ...base, design_mode: 'instructional_design', learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' }]);
  for (const bad of [base, { ...base, design_mode: 'other' },
    { ...base, design_mode: 'preserve_source', learner_audience: 'A', course_purpose: 'B' },
    { ...base, design_mode: 'preserve_source', learner_audience: null },
    { ...base, design_mode: 'instructional_design', learner_audience: 'A' },
    { ...base, design_mode: 'instructional_design', learner_audience: ' A', course_purpose: 'B' },
    { ...base, design_mode: 'instructional_design', learner_audience: '', course_purpose: 'B' },
    { ...base, design_mode: 'instructional_design', learner_audience: 'a'.repeat(301), course_purpose: 'B' },
    { ...base, design_mode: 'instructional_design', learner_audience: 'A', course_purpose: 'b'.repeat(501) },
    { ...base, design_mode: 'preserve_source', tenant_id: id(99) },
    { source_document_ids: [id(7)], content_locale: 'vi', design_mode: 'preserve_source' }]) {
    await assert.rejects(client(id(6), bad, 'vi'), { outcome: 'rejected', code: 'WORKSPACE_CREATE_INPUT_INVALID' });
  }
  assert.equal(posts.length, 2, 'invalid briefs never reach the server');
});

test('brief validation codes are definite rejections with plain messages; unknown codes keep the generic handling', () => {
  for (const code of launchContract.WORKSPACE_LAUNCH_BRIEF_ERROR_CODES) {
    for (const status of [400, 422]) {
      const failure = workspaceCreateFailure({ response: { status, data: { code } } });
      assert.equal(failure.outcome, 'rejected'); assert.equal(failure.code, code);
    }
    for (const locale of ['vi', 'en']) {
      env.locale = locale;
      const text = t(logic.workspaceLaunchBriefErrorKey(code));
      assert.ok(text.length > 20); assert.doesNotMatch(text, /LESSON_AUTHOR|_|\b(?:400|401|403|409|422)\b/);
    }
  }
  assert.equal(launchContract.isWorkspaceLaunchBriefErrorCode('LESSON_AUTHOR_LAUNCH_OTHER'), false);
  assert.equal(workspaceCreateFailure({ response: { status: 422, data: { code: 'LESSON_AUTHOR_LAUNCH_OTHER' } } }).outcome, 'unknown');
  assert.equal(workspaceCreateFailure({ response: { status: 400, data: { code: 'LESSON_AUTHOR_LAUNCH_OTHER' } } }).outcome, 'rejected');
});

function controllerFixture({ canDelete = false, documents = [{ document_id: id(7), kb_id: id(4), name: 'Nguon.pdf', status: 'learned' }] } = {}) {
  const scope = { actorId: id(1), tenantId: id(2), courseId: 'course-v1:TEST+BRIEF+2026' };
  const settings = { active_bot: { target: 'lesson_author', tenant_id: id(2), bot_id: id(3), ai_active_engine: 'self_built_rag' },
    active_kb: { target: 'lesson_author', tenant_id: id(2), kb_id: id(4) },
    active_persona: { target: 'lesson_author', tenant_id: id(2), bot_id: id(3), persona_id: id(5) } };
  const conv = { id: id(6), user_id: id(1), tenant_id: id(2), course_id: scope.courseId, target: 'lesson_author', bot_id: id(3) };
  const counts = { reads: 0, creates: 0 }, requests = [];
  let reply = null;
  const api = { settings: async () => { counts.reads++; return settings; }, documents: async () => documents,
    conversations: async () => [conv], createConversation: async () => conv };
  const controller = createWorkspaceSourceState(scope, { api, authorized: () => true, visible: () => true, canUpload: () => true, canDelete: () => canDelete,
    operationId: () => id(9), locale: 'vi', wait: async () => {}, onCreated: () => {}, stream: () => ({ start() {}, close() {} }),
    create: async (...args) => { counts.creates++; requests.push(args[1]);
      if (reply) throw reply;
      return { workspace_id: id(10), conversation_id: id(6), course_id: scope.courseId, content_locale: 'vi', correlation_id: id(11) }; } });
  return { controller, counts, requests, fail: error => { reply = error; } };
}

test('controller: an incomplete brief never dispatches or reads; keep-as-is drops typed texts; design sends trimmed texts', async () => {
  const f = controllerFixture();
  await f.controller.refresh(); f.controller.select(id(7));
  const reads = f.counts.reads;
  await f.controller.create();
  assert.equal(f.counts.creates, 0); assert.equal(f.counts.reads, reads, 'no preflight for an incomplete brief');
  f.controller.setBrief({ learner_audience: ' Nhân viên mới ', course_purpose: ' Hiểu công ty ' });
  f.controller.setBrief({ design_mode: 'preserve_source' });
  await f.controller.create();
  assert.deepEqual(f.requests[0], { operation_id: id(9), source_document_ids: [id(7)], content_locale: 'vi', design_mode: 'preserve_source' });
  f.controller.setBrief({ design_mode: 'instructional_design' });
  assert.equal(f.controller.getState().brief.learner_audience, ' Nhân viên mới ', 'switching back keeps what was typed');
  await f.controller.create();
  assert.deepEqual(f.requests[1], { operation_id: id(9), source_document_ids: [id(7)], content_locale: 'vi',
    design_mode: 'instructional_design', learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' });
  assert.ok(Object.isFrozen(f.controller.getState().operation)); assert.ok(Object.isFrozen(f.controller.getState().brief));
  f.controller.setBrief({ design_mode: 'something_else' });
  assert.equal(f.controller.getState().brief.design_mode, 'instructional_design', 'unknown modes are ignored');
});

test('controller: a brief refusal keeps the screen usable and clears when the author edits; other refusals keep the old behaviour', async () => {
  const f = controllerFixture();
  await f.controller.refresh(); f.controller.select(id(7));
  f.controller.setBrief({ learner_audience: 'A', course_purpose: 'B' });
  f.fail(Object.assign(Error('400'), { response: { status: 400, data: { code: 'LESSON_AUTHOR_LAUNCH_AUDIENCE_REQUIRED' } } }));
  await f.controller.create();
  let state = f.controller.getState();
  assert.equal(state.issue, 'brief_rejected'); assert.equal(state.briefError, 'LESSON_AUTHOR_LAUNCH_AUDIENCE_REQUIRED');
  assert.equal(state.ready, true); assert.equal(state.unknown, false); assert.equal(state.busy, false);
  f.controller.setBrief({ learner_audience: 'Nhân viên mới' });
  state = f.controller.getState();
  assert.equal(state.issue, null); assert.equal(state.briefError, null);
  f.fail(Object.assign(Error('409'), { response: { status: 409, data: { code: 'WORKSPACE_CONFLICT' } } }));
  await f.controller.create();
  state = f.controller.getState();
  assert.equal(state.issue, 'rejected'); assert.equal(state.ready, false); assert.equal(state.briefError, null);
  const unknown = controllerFixture();
  await unknown.controller.refresh(); unknown.controller.select(id(7));
  unknown.controller.setBrief({ learner_audience: 'A', course_purpose: 'B' });
  unknown.fail(Object.assign(Error('500'), { response: { status: 500, data: {} } }));
  await unknown.controller.create();
  assert.equal(unknown.controller.getState().unknown, true);
  unknown.controller.setBrief({ learner_audience: 'Changed' });
  assert.equal(unknown.controller.getState().brief.learner_audience, 'A', 'an unknown outcome freezes the brief that was sent');
});

test('AI points refusals (429) are definite: the start screen shows the plain points message and stays usable', async () => {
  const copy = {
    AI_CREDIT_INSUFFICIENT_FOR_RUN: {
      vi: 'Không đủ điểm AI để tạo khoá học. Liên hệ quản trị viên để mua thêm điểm.',
      en: 'Not enough AI points to create this course. Contact your administrator to buy more points.',
    },
    AI_CREDIT_LIMIT_REACHED: {
      vi: 'Đã dùng hết điểm AI của tháng này. Liên hệ quản trị viên để mua thêm điểm.',
      en: "This month's AI points are used up. Contact your administrator to buy more points.",
    },
  };
  for (const [code, text] of Object.entries(copy)) {
    assert.equal(launchContract.isWorkspaceLaunchBriefErrorCode(code), true);
    const failure = workspaceCreateFailure({ response: { status: 429, data: { code } } });
    assert.equal(failure.outcome, 'rejected'); assert.equal(failure.code, code);
    for (const locale of ['vi', 'en']) { env.locale = locale; assert.equal(t(logic.workspaceLaunchBriefErrorKey(code)), text[locale]); }
  }
  env.locale = 'vi';
  assert.equal(workspaceCreateFailure({ response: { status: 429, data: { code: 'AI_TOKEN_LIMIT_REACHED' } } }).outcome, 'unknown',
    'other 429 answers keep the old handling');
  const f = controllerFixture();
  await f.controller.refresh(); f.controller.select(id(7));
  f.controller.setBrief({ learner_audience: 'A', course_purpose: 'B' });
  f.fail(Object.assign(Error('429'), { response: { status: 429, data: { code: 'AI_CREDIT_INSUFFICIENT_FOR_RUN' } } }));
  await f.controller.create();
  const state = f.controller.getState();
  assert.equal(state.issue, 'brief_rejected'); assert.equal(state.briefError, 'AI_CREDIT_INSUFFICIENT_FOR_RUN');
  assert.equal(state.ready, true); assert.equal(state.unknown, false); assert.equal(state.busy, false);
  const html = renderToStaticMarkup(h(WorkspaceSourcePanel, { controller: f.controller, locale: 'vi' }));
  assert.match(html, /role="alert">Không đủ điểm AI để tạo khoá học\. Liên hệ quản trị viên để mua thêm điểm\.<\/p>/);
  assert.doesNotMatch(html, /AI_CREDIT/);
});

const view = { workspace_id: id(1), correlation_id: id(2), contract_version: 1, content_locale: 'vi', status: 'drafting',
  last_event_sequence: 0, updated_at: '2026-10-14T00:00:00.000Z' };
const status = brief => ({ ...view, node_count: 0, unit_count: 0, ready_unit_count: 0, ...(brief === undefined ? {} : { launch_brief: brief }) });
const graph = brief => ({ ...view, snapshot_sequence: 0, overview_ready: false, structure_ready: false, total_nodes: 0, nodes: [],
  has_more: false, next_after_node_id: null, ...(brief === undefined ? {} : { launch_brief: brief }) });

test('launch_brief on reads: absent and null are old sessions; a present brief must be exact', () => {
  const designBrief = { design_mode: 'instructional_design', learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' };
  assert.equal(contract.readWorkspaceLaunchBrief(undefined), null);
  assert.equal(contract.readWorkspaceLaunchBrief(null), null);
  assert.deepEqual(contract.readWorkspaceLaunchBrief(designBrief), designBrief);
  assert.deepEqual(contract.readWorkspaceLaunchBrief({ design_mode: 'preserve_source', learner_audience: null, course_purpose: null }),
    { design_mode: 'preserve_source', learner_audience: null, course_purpose: null });
  assert.deepEqual(contract.readWorkspaceLaunchBrief({ design_mode: 'preserve_source' }),
    { design_mode: 'preserve_source', learner_audience: null, course_purpose: null }, 'null texts may be omitted');
  assert.deepEqual(contract.readWorkspaceLaunchBrief({ ...designBrief, learner_audience: '😀'.repeat(300) }).learner_audience, '😀'.repeat(300),
    'reads count characters, not UTF-16 units');
  for (const bad of [{ design_mode: 'other' }, {}, [], 'preserve_source', { ...designBrief, learner_audience: null },
    { ...designBrief, course_purpose: '  ' }, { ...designBrief, learner_audience: 'a'.repeat(301) }, { ...designBrief, course_purpose: 'b'.repeat(501) },
    { ...designBrief, extra: true }, { design_mode: 'preserve_source', learner_audience: 'A', course_purpose: null },
    { design_mode: 'preserve_source', learner_audience: '', course_purpose: null }]) {
    assert.throws(() => contract.readWorkspaceLaunchBrief(bad), { code: 'WORKSPACE_READ_CONTRACT_INVALID' });
    assert.throws(() => contract.readWorkspaceStatus(status(bad)), { code: 'WORKSPACE_READ_CONTRACT_INVALID' });
  }
  for (const brief of [undefined, null, designBrief, { design_mode: 'preserve_source' }]) {
    assert.doesNotThrow(() => contract.readWorkspaceStatus(status(brief)));
    assert.doesNotThrow(() => contract.readWorkspaceGraph(graph(brief)));
    assert.doesNotThrow(() => contract.readWorkspaceEvents({ ...view, ...(brief === undefined ? {} : { launch_brief: brief }), events: [], next_sequence: 0, has_more: false }, 0));
    assert.doesNotThrow(() => contract.readWorkspaceDetail({ ...view, ...(brief === undefined ? {} : { launch_brief: brief }), node_id: id(3), parent_id: null,
      kind: 'course', content_state: 'planned', current_revision: null, content: null, user_modified: false, validation_contract: null }));
  }
  assert.equal(logic.workspaceSessionLaunchBrief(null), null);
  assert.equal(logic.workspaceSessionLaunchBrief({ status: status(undefined), graph: graph(undefined) }), null, 'older server');
  assert.equal(logic.workspaceSessionLaunchBrief({ status: status(null), graph: graph(designBrief) }), null, 'status is authoritative');
  assert.deepEqual(logic.workspaceSessionLaunchBrief({ status: status(designBrief), graph: null }), designBrief);
  assert.deepEqual(logic.workspaceSessionLaunchBrief({ status: status(undefined), graph: graph({ design_mode: 'preserve_source' }) }),
    { design_mode: 'preserve_source', learner_audience: null, course_purpose: null });
});

test('VI and EN have the same launch brief keys, the owner wording and no codes or abbreviations', () => {
  const keys = value => Object.keys(value).sort();
  assert.deepEqual(keys(locales.vi.aiIdLaunchBrief), keys(locales.en.aiIdLaunchBrief));
  const vi = locales.vi.aiIdLaunchBrief, en = locales.en.aiIdLaunchBrief;
  assert.equal(vi.modeDesignTitle, 'Thiết kế bài giảng từ tài liệu thô');
  assert.equal(en.modeDesignTitle, 'Design lessons from raw material');
  assert.equal(vi.modePreserveTitle, 'Giữ nguyên nội dung tài liệu');
  assert.equal(en.modePreserveTitle, 'Keep the material as it is');
  assert.equal(vi.modeDesignBody, 'AI phân tích tài liệu, chọn lọc nội dung, diễn giải dễ hiểu và tạo câu hỏi luyện tập.');
  assert.equal(en.modeDesignBody, 'AI analyses the material, selects what matters, explains it simply and creates practice questions.');
  assert.match(vi.modePreserveBody, /nội dung giữ nguyên từng chữ, không thêm gì\.$/);
  assert.match(en.modePreserveBody, /the text stays word for word, nothing is added\.$/);
  assert.equal(vi.learnersLabel, 'Đối tượng học'); assert.equal(en.learnersLabel, 'Learners');
  assert.equal(vi.purposeLabel, 'Mục đích khoá học'); assert.equal(en.purposeLabel, 'Course purpose');
  assert.equal(vi.learnersPlaceholder, 'Ví dụ: Nhân viên mới ở mọi phòng ban, chưa biết gì về công ty');
  assert.equal(en.purposePlaceholder, 'For example: help new staff understand the company, its products, its structure and how we work in their first week');
  assert.equal(vi.summaryMode, 'Chế độ');
  for (const text of [...Object.values(vi), ...Object.values(en)]) {
    assert.doesNotMatch(text, /LESSON_AUTHOR|design_mode|preserve_source|instructional_design|\bAPI\b|\bID\b|\bSME\b|\bKB\b|workspace|e\.g\.|VD:/i);
  }
  const used = ['workspace-launch-brief-panel.tsx', 'workspace-source-panel.tsx', 'workspace-launch-brief.logic.ts']
    .flatMap(file => [...readFileSync(path.join(directory, file), 'utf8').matchAll(/'aiIdLaunchBrief\.(\w+)'/g)].map(match => match[1]));
  for (const key of new Set(used)) for (const locale of ['vi', 'en']) assert.equal(typeof locales[locale].aiIdLaunchBrief[key], 'string', `${locale} ${key}`);
});

function panelFixture(overrides = {}) {
  const f = controllerFixture();
  if (overrides.brief) f.controller.setBrief(overrides.brief);
  return f;
}

test('start screen right column: two radio choices with design selected, required fields with counters, no course description', () => {
  env.locale = 'vi';
  env.notesRead = false;
  const f = panelFixture();
  const html = renderToStaticMarkup(h(WorkspaceLaunchBriefPanel, { controller: f.controller }));
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.match(html, /<fieldset[^>]*>\s*<legend/);
  assert.match(html, /<input type="radio"[^>]*checked=""[^>]*value="instructional_design"/);
  assert.doesNotMatch(html, /<input[^>]*checked=""[^>]*value="preserve_source"/);
  assert.ok(html.includes('Thiết kế bài giảng từ tài liệu thô') && html.includes('Giữ nguyên nội dung tài liệu'));
  assert.match(html, /maxLength="300"/); assert.match(html, /maxLength="500"/);
  assert.equal((html.match(/aria-required="true"/g) ?? []).length, 2);
  assert.ok(html.includes('placeholder="Ví dụ: Nhân viên mới ở mọi phòng ban, chưa biết gì về công ty"'));
  assert.ok(html.includes('0/300 ký tự') && html.includes('0/500 ký tự'));
  // Owner 2026-10-16: the course description is no longer AI ID context, so the start screen neither reads nor shows it.
  assert.equal(env.notesRead, false);
  assert.doesNotMatch(html, /Bối cảnh|mô tả khoá học/);
  assert.doesNotMatch(html, /<textarea[^>]*disabled/);
  for (const key of ['contextLabel', 'contextHint', 'contextEmpty', 'contextLoading', 'contextFailed', 'contextRetry', 'showMore', 'showLess']) {
    for (const locale of ['vi', 'en']) assert.equal(locales[locale].aiIdLaunchBrief[key], undefined, `${locale} ${key}`);
  }

  env.locale = 'en';
  f.controller.setBrief({ design_mode: 'preserve_source', learner_audience: 'Typed' });
  const keep = renderToStaticMarkup(h(WorkspaceLaunchBriefPanel, { controller: f.controller }));
  assert.match(keep, /<input[^>]*checked=""[^>]*value="preserve_source"/);
  assert.doesNotMatch(keep, /<textarea/); assert.doesNotMatch(keep, /course description/i);
  env.locale = 'vi';
});

test('Create button stays in the left column, disabled with a one-line reason until the brief is complete', async () => {
  env.locale = 'vi';
  const f = panelFixture();
  await f.controller.refresh(); f.controller.select(id(7));
  const render = () => renderToStaticMarkup(h(WorkspaceSourcePanel, { controller: f.controller, locale: 'vi' }));
  let html = render();
  assert.match(html, /<button disabled=""[^>]*aria-describedby="([^"]+)"[^>]*><i><\/i>Tạo nội dung bài học<\/button><p id="\1"/,
    'the reason sits under the button and describes it');
  assert.ok(html.includes('Còn thiếu: Đối tượng học, Mục đích khoá học.'));
  f.controller.setBrief({ learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' });
  html = render();
  assert.doesNotMatch(html, /Còn thiếu/);
  assert.doesNotMatch(html, /<button disabled=""[^>]*>[^<]*<i><\/i>Tạo nội dung bài học/);
  f.fail(Object.assign(Error('400'), { response: { status: 400, data: { code: 'LESSON_AUTHOR_LAUNCH_BRIEF_TOO_LONG' } } }));
  await f.controller.create();
  assert.ok(render().includes(locales.vi.aiIdLaunchBrief.errorTooLong));
  const host = ['workspace-course-host.tsx', 'workspace-course-node-dialog.tsx', 'workspace-course-host.logic.ts']
    .map(file => readFileSync(path.join(directory, file), 'utf8')).join('\n');
  assert.match(host, /<WorkspaceSourcePanel controller=\{sources\} locale=\{locale\} \/><WorkspaceLaunchBriefPanel controller=\{sources\} \/>/);
  assert.match(host, /grid-cols-1 gap-5 overflow-y-auto px-4 py-5 sm:px-5 lg:grid-cols-\[1\.45fr_0\.8fr\]/, 'columns stack on phones with 16px gutters');
  assert.doesNotMatch(host, /Bản thiết kế khoá học có kiểm soát/, 'the static steps card is replaced');
  assert.match(host, /overviewHeader=\{<WorkspaceLaunchBriefSummary brief=\{workspaceSessionLaunchBrief\(presentationRead\)\} \/>\}/);
  const dialog = readFileSync(path.join(directory, 'workspace-dialog.tsx'), 'utf8');
  assert.match(dialog, /\{canRead && overviewHeader\}/);
});

test('session overview shows the brief read-only, and nothing for sessions created before it existed', () => {
  env.locale = 'vi';
  assert.equal(renderToStaticMarkup(h(WorkspaceLaunchBriefSummary, { brief: null })), '');
  const html = renderToStaticMarkup(h(WorkspaceLaunchBriefSummary, { brief: {
    design_mode: 'instructional_design', learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' } }));
  assert.match(html, /<dt[^>]*>Chế độ: <\/dt><dd[^>]*>Thiết kế bài giảng từ tài liệu thô<\/dd>/);
  assert.match(html, /<dt[^>]*>Đối tượng học: <\/dt><dd[^>]*>Nhân viên mới<\/dd>/);
  assert.match(html, /<dt[^>]*>Mục đích khoá học: <\/dt><dd[^>]*>Hiểu công ty<\/dd>/);
  const keep = renderToStaticMarkup(h(WorkspaceLaunchBriefSummary, { brief: { design_mode: 'preserve_source', learner_audience: null, course_purpose: null } }));
  assert.match(keep, /Chế độ: <\/dt><dd[^>]*>Giữ nguyên nội dung tài liệu/);
  assert.doesNotMatch(keep, /Đối tượng học|Mục đích khoá học/);
  env.locale = 'en';
  assert.match(renderToStaticMarkup(h(WorkspaceLaunchBriefSummary, { brief: { design_mode: 'preserve_source', learner_audience: null, course_purpose: null } })),
    /Mode: <\/dt><dd[^>]*>Keep the material as it is/);
  env.locale = 'vi';
});

test('Create client: use_organization_context is optional, a boolean, and true only with the design mode', async () => {
  const scope = { actorId: id(1), tenantId: id(2), courseId: 'course-v1:TEST+BRIEF+2026' };
  const posts = [];
  const client = createWorkspaceCreateClient(scope, { post: async (...args) => { posts.push(args); return { data: { success: true,
    data: { workspace_id: id(10), conversation_id: id(6), correlation_id: id(11), content_locale: 'vi', status: 'designing' } } }; } });
  const base = { operation_id: id(9), source_document_ids: [id(7)], content_locale: 'vi' };
  const designed = { ...base, design_mode: 'instructional_design', learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' };
  await client(id(6), { ...designed, use_organization_context: true }, 'vi');
  await client(id(6), { ...designed, use_organization_context: false }, 'vi');
  await client(id(6), { ...base, design_mode: 'preserve_source', use_organization_context: false }, 'vi');
  await client(id(6), designed, 'vi');
  assert.deepEqual(posts.map(call => call[1]), [{ ...designed, use_organization_context: true }, { ...designed, use_organization_context: false },
    { ...base, design_mode: 'preserve_source', use_organization_context: false }, designed], 'sent exactly as given; absent stays absent');
  for (const bad of [{ ...designed, use_organization_context: 'true' }, { ...designed, use_organization_context: null },
    { ...designed, use_organization_context: 1 }, { ...base, design_mode: 'preserve_source', use_organization_context: true }]) {
    await assert.rejects(client(id(6), bad, 'vi'), { outcome: 'rejected', code: 'WORKSPACE_CREATE_INPUT_INVALID' });
  }
  assert.equal(posts.length, 4);
  assert.equal(launchContract.isWorkspaceOrgContextRequestField({ design_mode: 'preserve_source' }), true);
});

test('controller: the context tab offers the switch; Create sends the key only while the feature is on, true only when it may be used', async () => {
  const f = controllerFixture();
  await f.controller.refresh(); f.controller.select(id(7));
  f.controller.setBrief({ learner_audience: 'A', course_purpose: 'B' });
  const sent = async () => { await f.controller.create(); return f.requests.at(-1); };
  assert.equal(f.controller.getState().organizationContext, null);
  assert.equal(Object.hasOwn(await sent(), 'use_organization_context'), false, 'feature off or unknown: today\'s request');

  f.controller.setOrganizationContextOffer({ confirmedVersion: null });
  f.controller.setUseOrganizationContext(true);
  assert.deepEqual(f.controller.getState().organizationContext, { confirmedVersion: null, use: false }, 'nothing confirmed: cannot be turned on');
  assert.equal((await sent()).use_organization_context, false);

  f.controller.setOrganizationContextOffer({ confirmedVersion: 3 });
  assert.deepEqual(f.controller.getState().organizationContext, { confirmedVersion: 3, use: true }, 'default on once a profile is confirmed');
  assert.equal((await sent()).use_organization_context, true);

  f.controller.setUseOrganizationContext(false);
  f.controller.setOrganizationContextOffer({ confirmedVersion: 3 });
  assert.equal(f.controller.getState().organizationContext.use, false, 'the same offer keeps the author\'s choice');
  assert.equal((await sent()).use_organization_context, false);
  f.controller.setOrganizationContextOffer({ confirmedVersion: 4 });
  assert.equal(f.controller.getState().organizationContext.use, true, 'a newly confirmed version is offered on again');

  f.controller.setBrief({ design_mode: 'preserve_source' });
  assert.deepEqual(await sent(), { operation_id: id(9), source_document_ids: [id(7)], content_locale: 'vi', design_mode: 'preserve_source',
    use_organization_context: false }, 'keep-as-is never uses the profile');
  f.controller.setBrief({ design_mode: 'instructional_design' });
  f.controller.setOrganizationContextOffer(null);
  assert.equal(Object.hasOwn(await sent(), 'use_organization_context'), false, 'feature turned off again');
  assert.ok(Object.isFrozen(f.controller.getState().operation));
});

test('controller: an organization context refusal is a definite, fixable refusal with a plain message', async () => {
  const f = controllerFixture();
  await f.controller.refresh(); f.controller.select(id(7));
  f.controller.setBrief({ learner_audience: 'A', course_purpose: 'B' });
  f.controller.setOrganizationContextOffer({ confirmedVersion: 2 });
  for (const [code, status] of [['ORG_CONTEXT_NOT_CONFIRMED', 409], ['ORG_CONTEXT_NOT_APPLICABLE', 422]]) {
    f.fail(Object.assign(Error(String(status)), { response: { status, data: { code } } }));
    await f.controller.create();
    const state = f.controller.getState();
    assert.equal(state.issue, 'brief_rejected'); assert.equal(state.briefError, code); assert.equal(state.unknown, false);
    for (const locale of ['vi', 'en']) {
      env.locale = locale;
      assert.match(t(logic.workspaceLaunchBriefErrorKey(code)), locale === 'vi' ? /Dùng hồ sơ doanh nghiệp/ : /Use the organization profile/);
    }
    env.locale = 'vi';
    f.controller.setUseOrganizationContext(false);
    assert.equal(f.controller.getState().issue, null, 'turning the switch off clears the refusal');
    f.controller.setUseOrganizationContext(true);
  }
});

// ── "Chọn tài liệu đã sẵn sàng": delete from the knowledge base (QC 21/10, C4) ──
const sourceDocs = [{ document_id: id(7), kb_id: id(4), name: 'Nguon.pdf', status: 'learned' },
  { document_id: id(8), kb_id: id(4), name: 'Dang-doc.pdf', status: 'learning' }];
const sourcePanel = (f, locale) => { env.locale = locale; return renderToStaticMarkup(h(WorkspaceSourcePanel, { controller: f.controller, locale })); };

test('source list: delete controls only for authors with the knowledge base delete permission', async () => {
  const plain = controllerFixture({ documents: sourceDocs }); await plain.controller.refresh();
  const html = sourcePanel(plain, 'vi');
  assert.doesNotMatch(html, /role="checkbox"|Xoá tài liệu|Chọn tất cả/);
  assert.ok(html.includes('Nguon.pdf') && html.includes('Dang-doc.pdf'), 'the list itself is unchanged');
  for (const locale of ['vi', 'en']) {
    const f = controllerFixture({ canDelete: true, documents: sourceDocs }); await f.controller.refresh();
    const allowed = sourcePanel(f, locale), vi = locale === 'vi';
    const label = vi ? 'Xoá tài liệu' : 'Delete the document';
    const deletes = [...allowed.matchAll(new RegExp(`<button[^>]*aria-label="${label} ([^"]+)"[^>]*>`, 'g'))].map(m => [m[1], / disabled=""/.test(m[0])]);
    assert.deepEqual(deletes, [['Nguon.pdf', false], ['Dang-doc.pdf', true]], 'a document still being read cannot be deleted yet');
    assert.doesNotMatch(allowed, /KB_|\bKB\b|knowledge base id|document_id|00000000-/);
    f.controller.dispose();
  }
  plain.controller.dispose();
});

// Owner 24/10: no ticking several documents to delete them together; each row deletes only itself.
test('source list: no multi-select delete; one row has one delete button for exactly that document', async () => {
  const rows = [{ document_id: id(7), kb_id: id(4), name: 'Nguon.pdf', status: 'learned' },
    { document_id: id(8), kb_id: id(4), name: 'Bao-cao-quy-3-ban-cuoi-cung-da-duyet-boi-phong-dao-tao-va-phong-nhan-su.pdf', status: 'learned' },
    { document_id: id(9), kb_id: id(4), name: 'So-tay.docx', status: 'learned' }];
  for (const locale of ['vi', 'en']) {
    const f = controllerFixture({ canDelete: true, documents: rows }); await f.controller.refresh();
    const html = sourcePanel(f, locale), vi = locale === 'vi';
    assert.doesNotMatch(html, /role="checkbox"|type="checkbox"|indeterminate/, 'no tick boxes in the list');
    assert.doesNotMatch(html, vi ? /Chọn tất cả|tài liệu đã chọn|Xoá \d+ tài liệu/ : /Select all|\d+ selected|Delete \d+ documents/, 'no select all and no bulk delete button');
    const label = vi ? 'Xoá tài liệu' : 'Delete the document';
    const deletes = [...html.matchAll(new RegExp(`<button[^>]*aria-label="${label} ([^"]+)"[^>]*>`, 'g'))].map(m => m[1]);
    assert.deepEqual(deletes, rows.map(row => row.name), 'one delete button per row, named after its own document');
    const choose = [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>/g)];
    assert.equal(choose.length, rows.length, 'every row keeps its own button that chooses the document');
    f.controller.dispose();
  }
  const panel = readFileSync(path.join(directory, 'workspace-source-panel.tsx'), 'utf8');
  assert.match(panel, /onDelete=\{\(\) => askDelete\(document\.document_id, document\.name\)\}/, 'the row button asks to delete only its own document');
  assert.match(panel, /await controller\.deleteDocument\(deleting\.id\)/, 'the confirmation deletes exactly that one document');
  assert.doesNotMatch(panel, /Checkbox|checked|selectAll|deleteDocuments/);
  const controls = readFileSync(path.join(directory, 'workspace-source-delete.tsx'), 'utf8');
  assert.doesNotMatch(controls, /Checkbox|selectAll|deleteChecked|titleMany|confirmMany/);
});

test('source list: choosing the document for AI ID still works next to the delete buttons', async () => {
  const rows = [{ document_id: id(7), kb_id: id(4), name: 'Nguon.pdf', status: 'learned' },
    { document_id: id(8), kb_id: id(4), name: 'So-tay.pdf', status: 'learned' }];
  const f = controllerFixture({ canDelete: true, documents: rows }); await f.controller.refresh();
  const pressed = () => [...sourcePanel(f, 'vi').matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(?:(?!<\/button>).)*?(Nguon\.pdf|So-tay\.pdf)/g)]
    .map(m => [m[2], m[1]]);
  assert.deepEqual(pressed(), [['Nguon.pdf', 'false'], ['So-tay.pdf', 'false']]);
  f.controller.select(id(8));
  assert.deepEqual(pressed(), [['Nguon.pdf', 'false'], ['So-tay.pdf', 'true']], 'the chosen document is marked');
  f.controller.setBrief({ learner_audience: 'Nhân viên mới', course_purpose: 'Hiểu công ty' });
  await f.controller.create();
  assert.deepEqual(f.requests.at(-1).source_document_ids, [id(8)], 'Create uses the chosen document');
  f.controller.dispose();
});

test('source list: a document AI ID is using says so and cannot be deleted; the row\'s can_delete wins over the permission', async () => {
  const rows = [{ document_id: id(7), kb_id: id(4), name: 'Nguon.pdf', status: 'learned', in_use_by_ai_id: false, can_delete: true },
    { document_id: id(9), kb_id: id(4), name: 'Dang-soan.pdf', status: 'learned', in_use_by_ai_id: true, can_delete: true }];
  for (const locale of ['vi', 'en']) {
    const f = controllerFixture({ canDelete: false, documents: rows }); await f.controller.refresh();
    const html = sourcePanel(f, locale), vi = locale === 'vi';
    const note = vi ? 'Đang dùng để soạn khoá học' : 'In use by a course design';
    assert.equal((html.match(new RegExp(note, 'g')) ?? []).length, 1, 'only the row in use carries the note');
    assert.match(html, new RegExp(`Dang-soan\\.pdf(?:(?!</button>).)*${note}`), 'the note sits in that row');
    const label = vi ? 'Xoá tài liệu' : 'Delete the document';
    const deletes = [...html.matchAll(new RegExp(`<button[^>]*aria-label="${label} ([^"]+)"[^>]*>`, 'g'))].map(m => [m[1], / disabled=""/.test(m[0])]);
    assert.deepEqual(deletes, [['Nguon.pdf', false], ['Dang-soan.pdf', true]], 'the server allows it even without the client permission');
    f.controller.dispose();
  }
  const denied = controllerFixture({ canDelete: true, documents: rows.map(row => ({ ...row, can_delete: false })) }); await denied.controller.refresh();
  assert.doesNotMatch(sourcePanel(denied, 'vi'), /role="checkbox"|Xoá tài liệu|Đang dùng để soạn khoá học/, 'a row the server does not allow has no controls');
  denied.controller.dispose();
});

test('a refused or empty delete keeps the confirmation open with plain words', () => {
  const { workspaceSourceDeleteText } = load(path.join(directory, 'workspace-source-delete.tsx'));
  const outcome = issue => ({ issue, kept: false });
  for (const locale of ['vi', 'en']) {
    env.locale = locale;
    for (const issue of ['in_use', 'busy', 'not_listed', 'forbidden', 'learning', 'connection', 'failed']) {
      assert.equal(workspaceSourceDeleteText(t, outcome(issue)), locales[locale].aiIdSourceDelete.errors[issue], `${locale} ${issue}`);
    }
  }
  env.locale = 'vi';
  assert.equal(workspaceSourceDeleteText(t, outcome('in_use')), 'Chưa xoá được vì AI đang dùng tài liệu để soạn khoá học. Hãy đợi AI soạn xong rồi thử lại.');
  const panel = readFileSync(path.join(directory, 'workspace-source-panel.tsx'), 'utf8');
  assert.match(panel, /if \(outcome\.issue\) \{ setDeleteError\(workspaceSourceDeleteText\(t, outcome\)\); return; \}/,
    'any outcome with an issue keeps the confirmation open; only a real delete closes it');
  assert.match(panel, /setDeleteNote\(outcome\.kept \? t\('aiIdSourceDelete\.kept', \{ name: deleting\.name \}\) : null\)/,
    'a document the server has not removed yet is named in the note');
});

test('the confirmation names the one document, in plain words', () => {
  const { WorkspaceSourceDeleteConfirm } = load(path.join(directory, 'workspace-source-delete.tsx'));
  const confirm = (name, locale, extra = {}) => { env.locale = locale; return renderToStaticMarkup(h(WorkspaceSourceDeleteConfirm,
    { name, busy: false, error: null, onConfirm() {}, onClose() {}, ...extra })); };
  let html = confirm('Nguon.pdf', 'vi');
  assert.ok(html.includes('<h2>Xoá tài liệu này khỏi Kho tri thức?</h2>'));
  assert.ok(html.includes('“Nguon.pdf”') && html.includes('>Xoá tài liệu</button>') && html.includes('>Huỷ</button>'));
  assert.doesNotMatch(html, /\d+ tài liệu|và \d+/, 'never a count of several documents');
  html = confirm('A.pdf', 'en', { error: locales.en.aiIdSourceDelete.errors.in_use });
  assert.ok(html.includes('<h2>Delete this document from the Knowledge Base?</h2>') && html.includes('>Delete document</button>'));
  assert.ok(html.includes('“A.pdf”'));
  assert.match(html, /role="alert"[^>]*>Not deleted: AI is using the document to write a course\./, 'a refusal stays inside the confirmation');
});

test('delete copy: VI and EN have the same keys, every refusal has a plain message, no codes or abbreviations', () => {
  const shape = value => typeof value === 'string' ? 'string' : Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]));
  assert.deepEqual(shape(locales.en.aiIdSourceDelete), shape(locales.vi.aiIdSourceDelete));
  for (const issue of ['in_use', 'learning', 'forbidden', 'connection', 'failed', 'busy', 'not_listed']) {
    for (const locale of ['vi', 'en']) assert.ok(locales[locale].aiIdSourceDelete.errors[issue].length > 30, `${locale} ${issue}`);
  }
  for (const gone of ['selectAll', 'checkLabel', 'deleteChecked', 'titleOne', 'titleMany', 'namesMore', 'confirmOne', 'confirmMany']) {
    for (const locale of ['vi', 'en']) assert.equal(locales[locale].aiIdSourceDelete[gone], undefined, `${locale} ${gone} (multi-select delete removed)`);
  }
  for (const locale of ['vi', 'en']) assert.equal(locales[locale].aiIdSourceDelete.errors.inUseNamed, undefined);
  const strings = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
  for (const locale of ['vi', 'en']) {
    for (const value of strings(locales[locale].aiIdSourceDelete)) {
      assert.doesNotMatch(value, /_|\bKB\b|\bAPI\b|\b(?:202|403|404|409|500)\b|workspace|bulk/i, value);
    }
  }
});
