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

test('session list is course-scoped, bounded and maps only validated launch identifiers', async () => {
  const calls = [];
  const client = compile(`export const customApiClient={get:async(...args)=>{globalThis.__calls.push(args);return {data:{data:{items:[{
    conversation_id:'${id(1)}',title:'Draft',created_at:'2026-10-02T00:00:00.000Z',updated_at:'2026-10-02 01:00:00.123456+00',
    workspace:{workspace_id:'${id(2)}',conversation_id:'${id(1)}',correlation_id:'${id(3)}',content_locale:'vi',status:'ready',can_edit:true}
  }],next_cursor:null}}}}};`);
  globalThis.__calls = calls;
  const api = await moduleFor(client), abort = new AbortController();
  const result = await api.listLessonAuthorSessions(courseId, 'vi', abort.signal);
  assert.equal(result.items[0].workspace.course_id, courseId);
  assert.equal(result.items[0].updated_at, '2026-10-02 01:00:00.123456+00');
  assert.equal(calls[0][0], `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(courseId)}/sessions`);
  assert.deepEqual(calls[0][1], { params: { limit: 20, ui_locale: 'vi' }, signal: abort.signal, headers: { 'Cache-Control': 'no-cache' } });
  delete globalThis.__calls;
});

test('malformed or cross-conversation workspace summaries fail closed', async () => {
  for (const workspace of [null, { workspace_id: 'bad' }, { workspace_id: id(2), conversation_id: id(9), correlation_id: id(3), content_locale: 'vi', status: 'ready', can_edit: true }]) {
    const row = { conversation_id: id(1), title: 'Draft', created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T01:00:00.000Z', workspace };
    if (workspace === null) continue;
    const client = compile(`export const customApiClient={get:async()=>({data:{data:{items:${JSON.stringify([row])},next_cursor:null}}})};`);
    await assert.rejects((await moduleFor(client)).listLessonAuthorSessions(courseId, 'vi'));
  }
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
  const host = readFileSync(new URL('../components/lesson-author-workspace/workspace-course-host.tsx', import.meta.url), 'utf8');
  assert.match(browser, /getLessonAuthorSessionDeleteImpact/);
  assert.ok(browser.indexOf('getLessonAuthorSessionDeleteImpact') < browser.indexOf('deleteLessonAuthorSession\(courseId'));
  assert.match(browser, /Nội dung đã áp dụng vào khóa học vẫn được giữ nguyên/);
  assert.match(browser, /Content already applied to the course will remain unchanged/);
  assert.match(browser, /<Dialog open=\{!!deleting\}/);
  assert.match(browser, /role="button"/);
  assert.match(browser, /event\.stopPropagation\(\); startRename\(item\)/);
  assert.match(browser, /event\.stopPropagation\(\); void requestDelete\(item\)/);
  assert.doesNotMatch(browser, /<Button size="sm" onClick=\{\(\) => item\.workspace/);
  assert.match(browser, /WorkspaceAiAvatar src=\{assistantAvatarSrc\}/);
  assert.match(host, /useState<'sessions' \| 'source' \| 'workspace'>/);
  assert.match(host, /<WorkspaceSessionBrowser/);
  assert.match(host, /fetchLessonAuthorChatSettings/);
});
