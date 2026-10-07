import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import axios from 'axios';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const contractUrl = compile(readFileSync(new URL('./lesson-author-workspace.contract.ts', import.meta.url), 'utf8'));
const contract = await import(contractUrl);
const source = readFileSync(new URL('./lesson-author-workspace.ts', import.meta.url), 'utf8');
const defaultClientUrl = compile('export const customApiClient = { get() { throw new Error("Use the offline test transport"); } };');
const { createWorkspaceReadClient } = await import(compile(source
  .replace("'./custom-client'", JSON.stringify(defaultClientUrl))
  .replace("'./lesson-author-workspace.contract'", JSON.stringify(contractUrl))));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { workspace_id: id(1), correlation_id: id(2), contract_version: 1, content_locale: 'vi',
  status: 'drafting', last_event_sequence: 0, updated_at: '2026-09-29T00:00:00.000Z' };
const status = { ...base, node_count: 0, unit_count: 0, ready_unit_count: 0 };
const graph = { ...base, snapshot_sequence: 0, overview_ready: false, structure_ready: false,
  total_nodes: 0, nodes: [], has_more: false, next_after_node_id: null };
const pending = { ...base, node_id: id(3), parent_id: null, kind: 'course', content_state: 'planned',
  current_revision: null, content: null, user_modified: false, validation_contract: null };
const content = { title: 'Tiêu đề', purpose: null, data: { html: '<p>Nội dung</p>' }, implementation_notes: null };
const ready = { ...pending, current_revision: 0, content_state: 'content_ready', content, validation_contract: 'workspace-aggregate-edit-1' };
const scope = { workspaceId: id(1), conversationId: id(5), courseId: 'course-v1:Org+Course+2026 /?' };
const opts = locale => ({ signal: new AbortController().signal, uiLocale: locale });
const event = sequence => ({ sequence, event_kind: 'architecture_started', node_id: null, node_revision: null,
  operation_id: id(10 + sequence), created_at: base.updated_at });

test('default transport runs existing Bearer/tenant/locale interceptors and shared 401 refresh offline', async () => {
  const authUrl = compile(`let token = 'synthetic-before';
    export function rotate() { token = 'synthetic-after'; }
    export const useAuthStore = { getState: () => ({ accessToken: token, user: { role: 'superadmin' }, logout() { throw Error('unexpected logout'); } }) };`);
  const replacements = {
    axios: pathToFileURL(createRequire(import.meta.url).resolve('axios')).href,
    '@/config/env': compile("export const config = { customApiUrl: 'https://example.invalid/admin', apiTimeoutMs: 30000 };"),
    './refresh-manager': compile(`import { rotate } from ${JSON.stringify(authUrl)}; export async function ensureTokenRefresh() { rotate(); return true; }`),
    '@/utils/tenant-data-quota-refresh': compile("export function scheduleTenantDataQuotaRefresh() { throw Error('GET must not mutate quota'); }"),
    '@/utils/store': authUrl,
    '@/utils/tenant-store': compile(`export const useTenantStore = { getState: () => ({ activeTenantId: '${id(6)}' }) };`),
    '@/utils/locale-store': compile("export const useLocaleStore = { getState: () => ({ locale: 'en' }) };"),
  };
  let clientSource = readFileSync(new URL('./custom-client.ts', import.meta.url), 'utf8');
  for (const [from, to] of Object.entries(replacements)) {
    clientSource = clientSource.replaceAll(JSON.stringify(from), JSON.stringify(to)).replaceAll(`'${from}'`, JSON.stringify(to));
  }
  const clientUrl = compile(clientSource);
  const { customApiClient } = await import(clientUrl);
  const requests = [];
  customApiClient.defaults.adapter = async config => {
    requests.push({ authorization: config.headers.Authorization, tenant: config.headers['X-Tenant-Id'],
      locale: config.headers['X-UI-Locale'], method: config.method, uri: customApiClient.getUri(config), timeout: config.timeout });
    if (requests.length === 1) throw new axios.AxiosError('synthetic 401', 'ERR_BAD_REQUEST', config, null,
      { status: 401, data: { code: 'AUTH_REQUIRED' }, headers: {}, config, statusText: 'Unauthorized' });
    return { data: { success: true, data: status }, status: 200, statusText: 'OK', headers: {}, config };
  };
  const module = await import(compile(source.replace("'./custom-client'", JSON.stringify(clientUrl))
    .replace("'./lesson-author-workspace.contract'", JSON.stringify(contractUrl))));
  await module.createWorkspaceReadClient(scope).status(opts('en'));
  assert.deepEqual(requests.map(r => r.authorization), ['Bearer synthetic-before', 'Bearer synthetic-after']);
  assert.ok(requests.every(r => r.tenant === id(6) && r.locale === 'en' && r.method === 'get'
    && r.uri.startsWith('https://example.invalid/admin/api/') && r.timeout === 30000));
});

test('all four exact GET routes preserve same-origin prefix and ui/content locale separation', async () => {
  const requests = [];
  const http = axios.create({ baseURL: 'https://example.invalid/admin', adapter: async config => {
    requests.push(config);
    const data = config.url.endsWith('/events') ? { ...base, events: [], next_sequence: 0, has_more: false }
      : config.url.endsWith('/graph') ? graph : config.url.includes('/nodes/') ? pending : status;
    return { data: { success: true, data, request_id: id(99) }, status: 200, statusText: 'OK', headers: {}, config };
  } });
  const api = createWorkspaceReadClient(scope, http);
  assert.equal((await api.status(opts('en'))).content_locale, 'vi');
  await api.events(0, opts('vi'));
  await api.graph({ snapshot_sequence: 0, after_node_id: id(3) }, opts('en'));
  await api.detail(id(3), null, opts('en'));
  const path = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}/conversations/${id(5)}/workspaces/${id(1)}`;
  assert.deepEqual(requests.map(r => r.url), [path, `${path}/events`, `${path}/graph`, `${path}/nodes/${id(3)}`]);
  assert.ok(requests.every(r => r.method === 'get' && !r.data && r.signal && http.getUri(r).startsWith('https://example.invalid/admin/api/')));
  assert.deepEqual(requests.map(r => r.params), [
    { ui_locale: 'en' }, { after_sequence: 0, ui_locale: 'vi' },
    { snapshot_sequence: 0, after_node_id: id(3), ui_locale: 'en' }, { expected_revision: 'none', ui_locale: 'en' },
  ]);
  assert.deepEqual(Object.keys(api).sort(), ['detail', 'events', 'graph', 'status']);
  assert.match(source, /import \{ customApiClient \} from '\.\/custom-client'/);
  assert.match(source, /transport: ReadTransport = customApiClient/);
});

test('status counts, version, sequence, locale and frozen workspace identity fail closed', async () => {
  for (const bad of [null, {}, { ...status, contract_version: 2 }, { ...status, ready_unit_count: 1 },
    { ...status, last_event_sequence: Number.MAX_SAFE_INTEGER + 1 }, { ...status, content_locale: 'EN' },
    { ...status, status: 'needs_action', failure_code: 'PRIVATE raw text', failure_stage: 'chapter_blueprint', failure_chapter_key: 'chapter-2' },
    { ...status, status: 'needs_action', failure_code: 'SAFE_CODE', failure_stage: null, failure_chapter_key: 'chapter-2' }]) {
    assert.throws(() => contract.readWorkspaceStatus(bad), /WORKSPACE_READ_CONTRACT_INVALID/);
  }
  assert.equal(contract.readWorkspaceStatus({ ...status, status: 'needs_action', failure_code: 'ORCHESTRATION_V2_EXECUTION_RUNTIME_CHANGED',
    failure_stage: 'chapter_blueprint', failure_chapter_key: 'chapter-2' }).failure_chapter_key, 'chapter-2');
  const api = createWorkspaceReadClient(scope, { get: async () => ({ data: { success: true, data: { ...status, workspace_id: id(777) } } }) });
  await assert.rejects(api.status(opts('en')), /WORKSPACE_READ_CONTRACT_INVALID/);
});

test('status accepts only bounded ordered architecture preview data', () => {
  const preview = { run_id: id(40), course_title: 'Khóa học an toàn', total_chapters: 2,
    completed_chapters: 1, total_nodes: 3, truncated: false, chapters: [
      { chapter_key: 'chapter-1', order: 0, title: 'Nhận diện', state: 'ready' },
      { chapter_key: 'chapter-2', order: 1, title: 'Kiểm soát', state: 'generating' },
    ], nodes: [
      { node_id: id(41), parent_id: null, kind: 'course', canonical_path: 'course', sort_order: 0,
        title: 'Khóa học an toàn', state: 'ready', component_type: null, media_type: null },
      { node_id: id(42), parent_id: id(41), kind: 'chapter', canonical_path: 'chapter_1', sort_order: 0,
        title: 'Nhận diện', state: 'ready', component_type: null, media_type: null },
      { node_id: id(43), parent_id: id(41), kind: 'chapter', canonical_path: 'chapter_2', sort_order: 1,
        title: 'Kiểm soát', state: 'generating', component_type: null, media_type: null },
    ] };
  assert.deepEqual(contract.readWorkspaceStatus({ ...status, architecture_preview: preview }).architecture_preview, preview);
  const rootOnly = { ...preview, total_chapters: 0, completed_chapters: 0, total_nodes: 1, chapters: [], nodes: [preview.nodes[0]] };
  assert.deepEqual(contract.readWorkspaceStatus({ ...status, architecture_preview: rootOnly }).architecture_preview, rootOnly);
  for (const architecture_preview of [
    { ...preview, completed_chapters: 2 },
    { ...preview, chapters: preview.chapters.map((chapter, index) => index ? { ...chapter, order: 3 } : chapter) },
    { ...preview, chapters: preview.chapters.map((chapter, index) => index ? { ...chapter, state: 'private' } : chapter) },
    { ...preview, total_nodes: 2 },
    { ...preview, nodes: preview.nodes.map((node, index) => index === 1 ? { ...node, parent_id: id(99) } : node) },
    { ...preview, nodes: preview.nodes.map((node, index) => index === 1 ? { ...node, component_type: 'html' } : node) },
    { ...preview, course_title: '' },
  ]) assert.throws(() => contract.readWorkspaceStatus({ ...status, architecture_preview }), /WORKSPACE_READ_CONTRACT_INVALID/);
});

test('input guards do not send invalid cursors, paths, locale or revision', async () => {
  const api = createWorkspaceReadClient(scope, { get: () => assert.fail('no request') });
  for (const invalid of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => api.events(invalid, opts('en')), /INPUT_INVALID/);
    assert.throws(() => api.detail(id(3), invalid, opts('en')), /INPUT_INVALID/);
  }
  assert.throws(() => api.graph({ after_node_id: id(3) }, opts('en')), /INPUT_INVALID/);
  assert.throws(() => createWorkspaceReadClient({ ...scope, courseId: '..' }), /INPUT_INVALID/);
  assert.throws(() => createWorkspaceReadClient({ ...scope, workspaceId: 'bad' }), /INPUT_INVALID/);
  await assert.rejects(api.status(opts('fr')), /INPUT_INVALID/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.status({ signal: controller.signal, uiLocale: 'en' }), { name: 'AbortError' });
});

test('detail null/zero revision and real payload round-trip; malformed content is rejected', async () => {
  assert.deepEqual(contract.readWorkspaceDetail(pending), pending);
  assert.deepEqual(contract.readWorkspaceDetail(ready).content, content);
  const requests = [];
  const api = createWorkspaceReadClient(scope, { get: async (url, config) => {
    requests.push(config); return { data: { success: true, data: ready } };
  } });
  assert.equal((await api.detail(id(3), 0, opts('en'))).current_revision, 0);
  assert.equal(requests[0].params.expected_revision, 0);
  await assert.rejects(api.detail(id(3), 1, opts('en')), /CONTRACT_INVALID/);
  await assert.rejects(api.detail(id(4), 0, opts('en')), /CONTRACT_INVALID/);
  for (const bad of [{ ...ready, content: null }, { ...pending, content }, { ...ready, validation_contract: null },
    { ...ready, content: { ...content, title: '' } }, { ...ready, content: { ...content, data: { x: Infinity } } },
    { ...ready, content: { ...content, data: 'x'.repeat(2 * 1024 * 1024) } }]) {
    assert.throws(() => contract.readWorkspaceDetail(bad), /CONTRACT_INVALID/);
  }
});

test('event pagination validates exact 100-entry pages, next cursor, gaps, duplicates and ordering', () => {
  const first = { ...base, last_event_sequence: 101, events: Array.from({ length: 100 }, (_, i) => event(i + 1)), next_sequence: 100, has_more: true };
  const last = { ...first, events: [event(101)], next_sequence: 101, has_more: false };
  assert.equal(contract.readWorkspaceEvents(first, 0).next_sequence, 100);
  assert.equal(contract.readWorkspaceEvents(last, 100).next_sequence, 101);
  for (const events of [[], [event(2)], [event(1), event(1)], [event(2), event(1)]]) {
    assert.throws(() => contract.readWorkspaceEvents({ ...base, last_event_sequence: Math.max(1, events.length), events,
      next_sequence: events.length, has_more: false }, 0), /RESNAPSHOT_REQUIRED/);
  }
  assert.throws(() => contract.readWorkspaceEvents({ ...last, next_sequence: 102 }, 100), /CONTRACT_INVALID/);
  assert.throws(() => contract.readWorkspaceEvents(last, 102), /RESNAPSHOT_REQUIRED/);
});

test('optional server-bound detail discriminators support legacy omission/null and reject unknown or wrong-kind values', () => {
  assert.equal(contract.readWorkspaceDetail(ready).component_type, undefined);
  assert.equal(contract.readWorkspaceDetail({ ...ready, component_type: null, media_type: null }).media_type, null);
  const component = { ...ready, kind: 'component', parent_id: id(40) };
  for (const component_type of ['html', 'problem', 'la_faq', 'la_sortable', 'la_crossword', 'la_diagram']) {
    assert.equal(contract.readWorkspaceDetail({ ...component, component_type, media_type: null }).component_type, component_type);
  }
  for (const media_type of ['video', 'static_infographic']) {
    assert.equal(contract.readWorkspaceDetail({ ...ready, kind: 'media_brief', parent_id: id(40), media_type, component_type: null }).media_type, media_type);
  }
  for (const bad of [{ ...component, component_type: 'faq' }, { ...component, component_type: 1 },
    { ...component, component_type: 'video' }, { ...ready, component_type: 'html' },
    { ...component, media_type: 'video' }, { ...ready, kind: 'media_brief', parent_id: id(40), media_type: 'image' }]) {
    assert.throws(() => contract.readWorkspaceDetail(bad), /CONTRACT_INVALID/);
  }
});

test('generated quality envelopes use the same compatibility matrix as orchestration V2', () => {
  const generated = { ...ready, kind: 'component', parent_id: id(40), component_type: 'html', media_type: null };
  for (const quality of [
    { content_origin: 'provider_validated', quality_state: 'validated' },
    { content_origin: 'structured_fallback', quality_state: 'validated' },
    { content_origin: 'structured_fallback', quality_state: 'review_required' },
    { content_origin: 'raw_source_fallback', quality_state: 'review_required' },
  ]) assert.doesNotThrow(() => contract.readWorkspaceDetail({ ...generated, ...quality }), JSON.stringify(quality));

  for (const quality of [
    { content_origin: 'provider_validated', quality_state: 'review_required' },
    { content_origin: 'raw_source_fallback', quality_state: 'validated' },
    { content_origin: 'structured_fallback', quality_state: 'unknown' },
    { content_origin: 'structured_fallback', quality_state: null },
    { content_origin: null, quality_state: 'review_required' },
  ]) assert.throws(() => contract.readWorkspaceDetail({ ...generated, ...quality }), /CONTRACT_INVALID/);

  assert.doesNotThrow(() => contract.readWorkspaceDetail(generated));
  assert.doesNotThrow(() => contract.readWorkspaceDetail({ ...generated, content_origin: null, quality_state: null }));
  assert.throws(() => contract.readWorkspaceDetail({ ...ready, content_origin: 'provider_validated', quality_state: 'validated' }), /CONTRACT_INVALID/);
});

test('graph pages cannot imply readiness, truncate oversized pages or accept unordered IDs', () => {
  assert.deepEqual(contract.readWorkspaceGraph(graph), graph);
  const node = { node_id: id(3), parent_id: null, kind: 'course', canonical_path: 'course', sort_order: 0,
    content_state: 'planned', current_revision: null, component_type: null, media_type: null,
    title: null, user_modified: false, applied: false };
  const sealed = { ...graph, overview_ready: true, structure_ready: true, total_nodes: 1, nodes: [node] };
  assert.deepEqual(contract.readWorkspaceGraph(sealed).nodes, [node]);
  for (const bad of [{ ...sealed, overview_ready: false }, { ...sealed, snapshot_sequence: 1 },
    { ...sealed, nodes: Array(101).fill(node), total_nodes: 101 }, { ...sealed, has_more: true, next_after_node_id: id(3) },
    { ...sealed, total_nodes: 2, nodes: [node, node] }, { ...sealed, nodes: [{ ...node, user_modified: true }] },
    { ...sealed, nodes: [{ ...node, applied: true }] }, { ...sealed, nodes: [{ ...node, applied: 'yes' }] },
    { ...sealed, nodes: [{ ...node, component_type: 'html' }] },
    { ...sealed, nodes: [{ ...node, media_type: 'video' }] },
    { ...sealed, nodes: [{ ...node, kind: 'component', parent_id: id(4), component_type: null }] },
    { ...sealed, nodes: [{ ...node, kind: 'media_brief', parent_id: id(4), media_type: null }] }]) {
    assert.throws(() => contract.readWorkspaceGraph(bad), /CONTRACT_INVALID/);
  }
  const component = { ...node, node_id: id(4), parent_id: id(3), kind: 'component', component_type: 'la_diagram' };
  assert.equal(contract.readWorkspaceGraph({ ...sealed, nodes: [component] }).nodes[0].component_type, 'la_diagram');
  const validatedFallback = { ...component, content_origin: 'structured_fallback', quality_state: 'validated' };
  assert.equal(contract.readWorkspaceGraph({ ...sealed, nodes: [validatedFallback] }).nodes[0].quality_state, 'validated');
  const media = { ...node, node_id: id(5), parent_id: id(3), kind: 'media_brief', media_type: 'video' };
  assert.equal(contract.readWorkspaceGraph({ ...sealed, nodes: [media] }).nodes[0].media_type, 'video');
});

test('typed HTTP errors retain only safe code/request ID and localize every code in EN/VI', async () => {
  for (const code of ['AUTH_REQUIRED', 'WORKSPACE_READ_FORBIDDEN', 'WORKSPACE_READ_DISABLED', 'WORKSPACE_READ_INPUT_INVALID',
    'WORKSPACE_NOT_FOUND', 'WORKSPACE_NODE_NOT_FOUND', 'WORKSPACE_REVISION_CONFLICT', 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED',
    'WORKSPACE_READ_UNAVAILABLE', 'WORKSPACE_READ_CONTRACT_INVALID', 'WORKSPACE_READ_LIMIT']) {
    const api = createWorkspaceReadClient(scope, { get: async () => { throw { response: {
      status: 409, data: { code, request_id: id(99), message: 'private SQL / raw content' },
    } }; } });
    await assert.rejects(api.status(opts('en')), error => error.code === code && error.requestId === id(99)
      && error.status === 409 && !error.message.includes('private'));
    assert.ok(contract.workspaceReadMessage(code, 'en'));
    assert.notEqual(contract.workspaceReadMessage(code, 'en'), contract.workspaceReadMessage(code, 'vi'));
  }
  const failed = contract.workspaceReadFailure({ response: { status: 502, data: { code: 'SQL_FAILED', message: 'secret' } } });
  assert.equal(failed.code, 'WORKSPACE_READ_UNAVAILABLE');
  assert.equal(contract.workspaceReadFailure({ response: { status: 403 } }).code, 'WORKSPACE_READ_FORBIDDEN');
});
