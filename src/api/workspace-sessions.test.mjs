/* global URL, Buffer, AbortController */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const contract = compile(readFileSync(new URL('./lesson-author-workspace.contract.ts', import.meta.url), 'utf8'));
const source = readFileSync(new URL('./workspace-sessions.ts', import.meta.url), 'utf8');
const moduleFor = client => import(compile(source.replace("'./custom-client'", JSON.stringify(client))
  .replace("'./lesson-author-workspace.contract'", JSON.stringify(contract))));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const courseId = 'course-v1:TEST+SESSION /?+2026';
const mine = { owner: { user_id: id(7), display_name: 'Nguyễn Văn A' }, is_mine: true,
  permissions: { can_continue: true, can_rename: true, can_delete: true, can_apply: true } };
const others = { owner: { user_id: id(8), display_name: 'Trần Thị B' }, is_mine: false,
  permissions: { can_continue: false, can_rename: false, can_delete: false, can_apply: true } };
const row = (extra, workspace = { workspace_id: id(2), conversation_id: id(1), correlation_id: id(3), content_locale: 'vi', status: 'ready', can_edit: extra.is_mine }) => ({
  conversation_id: id(1), title: 'Draft', created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02 01:00:00.123456+00', workspace, ...extra });

test('session list is course-scoped, bounded and maps only validated launch identifiers', async () => {
  const calls = [];
  const client = compile(`export const customApiClient={get:async(...args)=>{globalThis.__calls.push(args);return {data:{data:{items:${JSON.stringify([row(mine)])},next_cursor:null}}}}};`);
  globalThis.__calls = calls;
  const api = await moduleFor(client), abort = new AbortController();
  const result = await api.listLessonAuthorSessions(courseId, 'vi', abort.signal);
  assert.equal(result.items[0].workspace.course_id, courseId);
  assert.equal(result.items[0].workspace.can_edit, true);
  assert.equal(result.items[0].updated_at, '2026-10-02 01:00:00.123456+00');
  assert.equal(calls[0][0], `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(courseId)}/sessions`);
  assert.deepEqual(calls[0][1], { params: { limit: 20, scope: 'all', ui_locale: 'vi' }, signal: abort.signal, headers: { 'Cache-Control': 'no-cache' } });
  await api.listLessonAuthorSessions(courseId, 'en', undefined, 'mine');
  assert.equal(calls[1][1].params.scope, 'mine', 'the All/Mine filter runs on the server');
  delete globalThis.__calls;
});

test('other people\'s sessions carry the creator and open read-only', async () => {
  const client = compile(`export const customApiClient={get:async()=>({data:{data:{items:${JSON.stringify([row(others)])},next_cursor:null}}})};`);
  const [item] = (await (await moduleFor(client)).listLessonAuthorSessions(courseId, 'vi')).items;
  assert.deepEqual(item.owner, { user_id: id(8), display_name: 'Trần Thị B' });
  assert.equal(item.is_mine, false);
  assert.equal(item.workspace.can_edit, false);
  assert.deepEqual(item.permissions, others.permissions);
});

test('malformed, cross-conversation or self-contradicting session summaries fail closed', async () => {
  const bad = [
    row(mine, { workspace_id: 'bad' }),
    row(mine, { workspace_id: id(2), conversation_id: id(9), correlation_id: id(3), content_locale: 'vi', status: 'ready', can_edit: true }),
    row(others, { workspace_id: id(2), conversation_id: id(1), correlation_id: id(3), content_locale: 'vi', status: 'ready', can_edit: true }),
    row({ ...others, is_mine: true }),
    row({ ...mine, owner: { user_id: 'x', display_name: 'A' } }),
    row({ ...mine, permissions: { can_continue: true } }),
  ];
  for (const value of bad) {
    const client = compile(`export const customApiClient={get:async()=>({data:{data:{items:${JSON.stringify([value])},next_cursor:null}}})};`);
    await assert.rejects((await moduleFor(client)).listLessonAuthorSessions(courseId, 'vi'));
  }
});

test('running sessions of the course are read from their own bounded endpoint', async () => {
  const calls = [];
  globalThis.__calls = calls;
  const run = { conversation_id: id(4), title: 'Phiên đang chạy', owner: { user_id: id(8), display_name: 'Trần Thị B' }, is_mine: false, started_at: '2026-10-09T01:00:00.000Z' };
  const client = compile(`export const customApiClient={get:async(...args)=>{globalThis.__calls.push(args);return {data:{data:{items:${JSON.stringify([run])}}}}}};`);
  const runs = await (await moduleFor(client)).listLessonAuthorActiveRuns(courseId, 'en');
  assert.deepEqual(runs, [run]);
  assert.equal(calls[0][0], `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(courseId)}/sessions/active-runs`);
  delete globalThis.__calls;
  const broken = compile(`export const customApiClient={get:async()=>({data:{data:{items:[{conversation_id:'x'}]}}})};`);
  await assert.rejects((await moduleFor(broken)).listLessonAuthorActiveRuns(courseId, 'vi'));
});

test('rename, impact and delete use explicit endpoints and validate receipts', async () => {
  const client = compile(`export const calls=[];export const customApiClient={
    patch:async(...args)=>{calls.push(['patch',...args]);return {data:{data:{conversation_id:'${id(1)}',title:'Renamed',updated_at:'2026-10-02 02:00:00.654321+00'}}}},
    get:async(...args)=>{calls.push(['get',...args]);return {data:{data:{conversation_id:'${id(1)}',total_nodes:9,applied_nodes:4,unapplied_nodes:5,active:false}}}},
    delete:async(...args)=>{calls.push(['delete',...args]);return {data:{data:{job_id:'${id(8)}'}}}}
  };`);
  const api = await moduleFor(client);
  const renamed = await api.renameLessonAuthorSession(courseId, id(1), 'Renamed', '2026-10-02 01:00:00.123456+00', 'vi');
  assert.equal(renamed.title, 'Renamed');
  assert.equal(renamed.updated_at, '2026-10-02 02:00:00.654321+00');
  assert.equal((await api.getLessonAuthorSessionDeleteImpact(courseId, id(1), 'vi')).unapplied_nodes, 5);
  assert.equal((await api.deleteLessonAuthorSession(courseId, id(1), 'vi')).job_id, id(8));
});

test('session browser requires impact confirmation and states that applied course data is preserved', () => {
  const browser = readFileSync(new URL('../components/lesson-author-workspace/workspace-session-browser.tsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../components/lesson-author-workspace/workspace-session-card.tsx', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../components/lesson-author-workspace/workspace-course-host.tsx', import.meta.url), 'utf8');
  assert.match(browser, /getLessonAuthorSessionDeleteImpact/);
  assert.ok(browser.indexOf('getLessonAuthorSessionDeleteImpact') < browser.indexOf('deleteLessonAuthorSession(courseId'));
  assert.match(browser, /Nội dung đã áp dụng vào khóa học vẫn được giữ nguyên/);
  assert.match(browser, /Content already applied to the course will remain unchanged/);
  assert.match(browser, /<Dialog open=\{!!deleting\}/);
  assert.match(card, /role=\{model\.canOpen \? 'button' : undefined\}/);
  assert.match(card, /event\.stopPropagation\(\); onStartRename\(\)/);
  assert.match(card, /event\.stopPropagation\(\); onDelete\(\)/);
  assert.match(card, /model\.canRename && <Button/);
  assert.match(card, /model\.canDelete && <Button/);
  assert.doesNotMatch(browser, /<Button size="sm" onClick=\{\(\) => item\.workspace/);
  assert.match(browser, /WorkspaceAiAvatar src=\{assistantAvatarSrc\}/);
  assert.match(browser, /else if \(item\.permissions\.can_continue\) onSource/, 'only the creator continues a session');
  assert.match(host, /useState<'sessions' \| 'source' \| 'workspace'>/);
  assert.match(host, /<WorkspaceSessionBrowser/);
  assert.match(host, /fetchLessonAuthorChatSettings/);
});
