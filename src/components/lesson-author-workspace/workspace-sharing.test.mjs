/* global URL */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Shared AI course design sessions in the browser: list filter, creator name,
// view-only cards, running-session banner, "course was edited" dialog, upload
// route and the plain-language VI/EN copy. Network/UI kit boundaries only are stubbed.
const require = createRequire(import.meta.url);
const h = React.createElement;
const modules = new Map();
const posts = [];
const ui = {
  Dialog: ({ open, children }) => open ? h('div', { role: 'dialog' }, children) : null,
  DialogContent: ({ children }) => h('section', null, children),
  DialogTitle: ({ children }) => h('h2', null, children),
  DialogDescription: ({ children }) => h('p', null, children),
  Button: ({ children, disabled, ...rest }) => h('button', { disabled, 'aria-label': rest['aria-label'] }, children),
  Input: props => h('input', props),
};
function load(relative) {
  const url = new URL(relative, import.meta.url);
  if (modules.has(url.href)) return modules.get(url.href);
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (name === './custom-client') return { customApiClient: { post: async (...args) => { posts.push(args); return { data: { success: true, data: { results: [], uploaded: 1, failed: 0 } } }; } } };
    if (name === './custom-chat') return {};
    if (name.startsWith('../ui/')) return ui;
    if (name.startsWith('.')) {
      const tsUrl = new URL(name + '.ts', url), tsxUrl = new URL(name + '.tsx', url);
      return load((existsSync(tsUrl) ? tsUrl : tsxUrl).href);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(url.href, module.exports);
  return module.exports;
}
const sharing = load('./workspace-sharing.ts');
const { WorkspaceSessionCard, WorkspaceSessionScopeFilter } = load('./workspace-session-card.tsx');
const { WorkspaceActiveRunNotice } = load('./workspace-active-run-banner.tsx');
const { WorkspaceApplyConflictDialog } = load('./workspace-apply-conflict-dialog.tsx');
const apply = load('../../api/workspace-apply.ts');
const sources = load('../../api/workspace-sources.ts');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workspace = can_edit => ({ course_id: 'c', workspace_id: id(2), conversation_id: id(1), correlation_id: id(3), content_locale: 'vi', can_edit });
const mine = { conversation_id: id(1), title: 'Phiên của tôi', created_at: '2026-10-09T00:00:00.000Z', updated_at: '2026-10-09T01:00:00.000Z',
  owner: { user_id: id(7), display_name: 'Nguyễn Văn A' }, is_mine: true,
  permissions: { can_continue: true, can_rename: true, can_delete: true, can_apply: true }, workspace: workspace(true) };
const others = { ...mine, conversation_id: id(11), title: 'Phiên của B', owner: { user_id: id(8), display_name: 'Trần Thị B' }, is_mine: false,
  permissions: { can_continue: false, can_rename: false, can_delete: false, can_apply: true }, workspace: workspace(false) };
const labels = { open: 'Mở bản thiết kế khoá học', continue: 'Tiếp tục tạo nội dung', rename: 'Đổi tên', save: 'Lưu tên', cancel: 'Hủy', remove: 'Xóa', untitled: 'Bản thiết kế' };
const card = (item, locale = 'vi') => renderToStaticMarkup(h(WorkspaceSessionCard, { item, locale, labels, editing: false, title: '', renaming: false,
  updatedLabel: '9 thg 10', onOpen() {}, onStartRename() {}, onTitleChange() {}, onCommitRename() {}, onCancelRename() {}, onDelete() {} }));

test('list cards show the creator; other people\'s sessions are view-only without rename/delete', () => {
  const own = card(mine);
  assert.match(own, /Bạn tạo/); assert.match(own, /data-readonly="false"/);
  assert.match(own, /aria-label="Đổi tên"/); assert.match(own, />Xóa</);
  const shared = card(others);
  assert.match(shared, /Người tạo: Trần Thị B/); assert.match(shared, /Chỉ xem/); assert.match(shared, /data-readonly="true"/);
  assert.match(shared, /aria-label="Xem bản thiết kế khoá học: Phiên của B"/);
  assert.doesNotMatch(shared, /Đổi tên|>Xóa</);
  // A superuser may rename/delete someone else's session but still only views it.
  const admin = card({ ...others, permissions: { ...others.permissions, can_rename: true, can_delete: true } });
  assert.match(admin, /aria-label="Đổi tên"/); assert.match(admin, />Xóa</); assert.match(admin, /Chỉ xem/);
  // Someone else's session without a workspace has nothing to open (no composer).
  const empty = card({ ...others, workspace: null });
  assert.match(empty, /aria-disabled="true"/); assert.match(empty, /Phiên này chưa có nội dung để xem/);
  assert.doesNotMatch(empty, /role="button"/);
  assert.match(card(others, 'en'), /Started by Trần Thị B/);
  assert.match(card({ ...others, owner: { user_id: id(8), display_name: '' } }), /Không rõ người tạo/);
});

test('All / Mine filter defaults to All and marks the active choice', () => {
  for (const [scope, pressedAll] of [['all', 'true'], ['mine', 'false']]) {
    const html = renderToStaticMarkup(h(WorkspaceSessionScopeFilter, { scope, locale: 'vi', onChange() {} }));
    assert.match(html, /aria-label="Hiển thị phiên thiết kế"/);
    assert.match(html, new RegExp(`aria-pressed="${pressedAll}"[^>]*>Tất cả`));
    assert.match(html, />Của tôi</);
  }
  const browser = readFileSync(new URL('./workspace-session-browser.tsx', import.meta.url), 'utf8');
  assert.match(browser, /useState<LessonAuthorSessionScope>\('all'\)/);
  assert.match(browser, /listLessonAuthorSessions\(courseId, locale, signal, scope\)/);
  assert.match(browser, /s\.sharedNote/);
});

test('running-session banner names other people only and never the session being viewed', () => {
  const run = (n, name, isMine = false) => ({ conversation_id: id(n), title: 'x', owner: { user_id: id(n + 50), display_name: name }, is_mine: isMine, started_at: '2026-10-09T01:00:00.000Z' });
  assert.equal(sharing.workspaceActiveRunNotice([], null, 'vi'), null);
  assert.equal(sharing.workspaceActiveRunNotice([run(1, 'Tôi', true)], null, 'vi'), null, 'own runs are not announced');
  assert.equal(sharing.workspaceActiveRunNotice([run(1, 'B')], id(1), 'vi'), null, 'the open session is not announced');
  assert.equal(sharing.workspaceActiveRunNotice([run(1, 'Trần Thị B')], null, 'vi'),
    'Khoá học này đang có phiên thiết kế của Trần Thị B đang chạy. Bạn nên đợi phiên đó xong rồi mới đưa nội dung vào khoá học.');
  assert.match(sharing.workspaceActiveRunNotice([run(1, 'B'), run(2, 'C'), run(3, '')], null, 'en'), /^3 course design sessions by other people are running for this course \(B, C, Someone else\)/);
  const html = renderToStaticMarkup(h(WorkspaceActiveRunNotice, { text: 'Có phiên đang chạy' }));
  assert.match(html, /role="status"/); assert.match(html, /Có phiên đang chạy/);
  assert.equal(renderToStaticMarkup(h(WorkspaceActiveRunNotice, { text: null })), '');
  assert.equal(sharing.workspaceReadOnlyNotice('Trần Thị B', 'vi'),
    'Trần Thị B đã tạo phiên này. Bạn có thể xem và đưa nội dung vào khoá học, nhưng chỉ người tạo mới tiếp tục soạn được.');
});

test('"course was edited" dialog lists the parts and replaces them only on explicit confirmation', () => {
  const conflict = { items: [{ node_id: id(9), kind: 'chapter', title: 'Chương 1' }, { node_id: id(10), kind: 'unit', title: '' }], total: 4,
    overwrite_confirmation: 'a'.repeat(64) };
  const edited = renderToStaticMarkup(h(WorkspaceApplyConflictDialog, { code: 'WORKSPACE_APPLY_COURSE_EDITED', conflict, locale: 'vi', busy: false, onConfirm() {}, onClose() {} }));
  assert.match(edited, /Khoá học đã được chỉnh sửa/);
  assert.match(edited, /Bạn có muốn thay các phần này bằng nội dung mới không\?/);
  assert.match(edited, /Chương: Chương 1/); assert.match(edited, /Bài học: Phần chưa có tên/);
  assert.match(edited, /và 2 phần khác/);
  assert.match(edited, />Thay bằng nội dung mới</); assert.match(edited, />Giữ nguyên khoá học</);
  const structural = renderToStaticMarkup(h(WorkspaceApplyConflictDialog, { code: 'WORKSPACE_APPLY_COURSE_STRUCTURE_CHANGED',
    conflict: { ...conflict, overwrite_confirmation: null, total: 2 }, locale: 'en', busy: false, onConfirm() {}, onClose() {} }));
  assert.match(structural, /The content cannot be added yet/); assert.match(structural, /deleted or moved/);
  assert.doesNotMatch(structural, /Replace with new content/, 'deleted/moved parts can never be overwritten');
  const host = readFileSync(new URL('./workspace-course-host.tsx', import.meta.url), 'utf8');
  assert.match(host, /if \(token\) void apply\(undefined, undefined, false, token\)/);
});

test('Apply client parses conflict lists strictly and echoes the confirmation token', async () => {
  const token = 'b'.repeat(64);
  assert.deepEqual(apply.readWorkspaceApplyConflict('WORKSPACE_APPLY_COURSE_EDITED', { items: [{ node_id: id(9), kind: 'lesson', title: ' Mục 1 ' }], total: 1, overwrite_confirmation: token }),
    { items: [{ node_id: id(9), kind: 'lesson', title: 'Mục 1' }], total: 1, overwrite_confirmation: token });
  assert.equal(apply.readWorkspaceApplyConflict('WORKSPACE_APPLY_COURSE_EDITED', { items: [], total: 0, overwrite_confirmation: 'nope' }), null);
  assert.equal(apply.readWorkspaceApplyConflict('WORKSPACE_APPLY_CONFLICT', { items: [], total: 0, overwrite_confirmation: token }), null);
  const sent = [];
  const client = apply.createWorkspaceApplyClient({ courseId: 'c', conversationId: id(1), workspaceId: id(2) }, { post: async (...args) => {
    sent.push(args);
    throw { response: { status: 409, data: { code: 'WORKSPACE_APPLY_COURSE_EDITED', conflict: { items: [{ node_id: id(9), kind: 'chapter', title: 'C' }], total: 1, overwrite_confirmation: token } } } };
  } });
  await assert.rejects(client(id(9), id(20), 4, 'vi'), error => error.code === 'WORKSPACE_APPLY_COURSE_EDITED' && error.conflict.overwrite_confirmation === token);
  await assert.rejects(client(id(9), id(21), 4, 'vi', token), error => error.code === 'WORKSPACE_APPLY_COURSE_EDITED');
  assert.deepEqual(sent[0][1], { operation_id: id(20), expected_workspace_revision: 4 });
  assert.deepEqual(sent[1][1], { operation_id: id(21), expected_workspace_revision: 4, overwrite_confirmation: token });
  const busy = apply.createWorkspaceApplyClient({ courseId: 'c', conversationId: id(1), workspaceId: id(2) }, { post: async () => {
    throw { response: { status: 409, data: { code: 'WORKSPACE_APPLY_COURSE_BUSY' } } }; } });
  await assert.rejects(busy(id(9), id(22), 4, 'en'), error => error.code === 'WORKSPACE_APPLY_COURSE_BUSY' && error.outcome === 'rejected' && error.conflict === null);
  assert.equal(apply.workspaceApplyMessage('WORKSPACE_APPLY_COURSE_BUSY', 'vi'), 'Có người khác đang đưa nội dung vào khoá học này. Vui lòng thử lại sau ít phút.');
});

test('AI course design upload goes to the course-editor route, never the knowledge base admin route', async () => {
  await sources.workspaceSourceApi.upload({ name: 'nguon.pdf' }, { onProgress() {} });
  assert.equal(posts[0][0], '/api/ai-chatbot/chat/lesson-author/source-documents');
  assert.doesNotMatch(posts[0][0], /\/kb\//);
  const state = readFileSync(new URL('./workspace-source-state.ts', import.meta.url), 'utf8');
  assert.match(state, /dependencies\.api\.upload\(file, \{ onProgress: progress \}\)/);
});

test('new VI/EN copy matches key by key and stays plain: no status numbers, codes or tech words', () => {
  const { vi, en } = sharing.workspaceSharingCopy;
  const keys = value => Object.entries(value).flatMap(([key, child]) => typeof child === 'object' ? keys(child).map(k => `${key}.${k}`) : [key]).sort();
  assert.deepEqual(keys(vi), keys(en));
  const strings = value => Object.values(value).flatMap(child => typeof child === 'object' ? strings(child) : [child]);
  const applyMessages = ['WORKSPACE_APPLY_COURSE_BUSY', 'WORKSPACE_APPLY_COURSE_EDITED', 'WORKSPACE_APPLY_COURSE_STRUCTURE_CHANGED']
    .flatMap(code => [['vi', apply.workspaceApplyMessage(code, 'vi')], ['en', apply.workspaceApplyMessage(code, 'en')]]);
  const all = [...strings(vi).map(text => ['vi', text]), ...strings(en).map(text => ['en', text]), ...applyMessages];
  for (const [locale, text] of all) {
    assert.ok(text.trim().length > 0);
    assert.doesNotMatch(text, /\b[1-5]\d\d\b/, `status code in: ${text}`);
    assert.doesNotMatch(text, /[A-Z][A-Z0-9]*_[A-Z0-9_]+/, `error code in: ${text}`);
    assert.doesNotMatch(text, /\b(AI ID|KB|lock|workspace|revision|hash|snapshot|receipt|token|scope)\b/i, `jargon in: ${text}`);
    if (locale === 'vi') assert.doesNotMatch(text, /\b(session|course|draft|apply|upload|file|owner)\b/i, `English word in Vietnamese: ${text}`);
  }
});

test('audit log shows "applied someone else\'s session" in both languages', () => {
  const vi = readFileSync(new URL('../../i18n/locales/vi.ts', import.meta.url), 'utf8');
  const en = readFileSync(new URL('../../i18n/locales/en.ts', import.meta.url), 'utf8');
  for (const file of [vi, en]) {
    assert.match(file, /"lesson_author\.workspace\.applied_shared": "/);
    assert.match(file, /lesson_author_session: "/);
    assert.match(file, /lesson_author_session_creator: "/);
  }
  assert.match(vi, /"lesson_author\.workspace\.applied_shared": "đã đưa nội dung từ phiên thiết kế của người khác vào khoá học"/);
});
