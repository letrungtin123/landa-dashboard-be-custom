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
const source = readFileSync(new URL('./workspace-write.ts', import.meta.url), 'utf8');
const inert = compile('export const customApiClient = { post() { throw Error("Offline transport required"); } };');
const moduleUrl = client => compile(source.replace("'./custom-client'", JSON.stringify(client))
  .replace("'./lesson-author-workspace.contract'", JSON.stringify(contractUrl)));
const { createWorkspaceWriteClient, readWorkspaceWriteReceipt, validateWorkspaceChanges,
  workspaceWriteFailure, workspaceWriteMessage } = await import(moduleUrl(inert));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { workspaceId: id(1), conversationId: id(2), courseId: 'course-v1:TEST+Write+2026 /?' };
const request = { operation_id: id(3), expected_revision: 0, changes: { title: 'Tên mới' } };
const receipt = { workspace_id: id(1), node_id: id(4), operation_id: id(3), correlation_id: id(5),
  revision: 1, current_revision: 1, content_hash: 'a'.repeat(64), user_modified: true, event_sequence: 2, replayed: false };
const target = { ...scope, nodeId: id(4), operationId: id(3), expectedRevision: 0, operation: 'save' };
const opts = { uiLocale: 'en' };
const rejection = (code, status) => ({ response: { status, data: { success: false, code, request_id: id(9), message: 'private content/SQL' } } });

test('Save/Reset exact URLs and schemas use POST, preserve prefix, and suppress automatic auth replay', async () => {
  const calls = [];
  const transport = axios.create({ baseURL: 'https://example.invalid/admin', adapter: async config => {
    calls.push(config);
    return { data: { success: true, data: { ...receipt, user_modified: config.url.endsWith('/save') } },
      status: 200, statusText: 'OK', headers: {}, config };
  } });
  const client = createWorkspaceWriteClient(scope, transport);
  await client.save(id(4), request, opts);
  await client.reset(id(4), { operation_id: id(3), expected_revision: 0 }, { uiLocale: 'vi' });
  const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}/conversations/${id(2)}/workspaces/${id(1)}/nodes/${id(4)}`;
  assert.deepEqual(calls.map(c => c.url), [`${base}/save`, `${base}/reset`]);
  assert.deepEqual(calls.map(c => JSON.parse(c.data)), [request, { operation_id: id(3), expected_revision: 0 }]);
  assert.deepEqual(calls.map(c => c.params), [{ ui_locale: 'en' }, { ui_locale: 'vi' }]);
  assert.ok(calls.every(c => c.method === 'post' && c._retried === true && transport.getUri(c).startsWith('https://example.invalid/admin/api/')));
  assert.deepEqual(Object.keys(client).sort(), ['reset', 'save']);
});

test('actual shared auth interceptors retain Bearer/tenant/locale but never refresh/retry a write 401', async () => {
  const replacements = {
    axios: pathToFileURL(createRequire(import.meta.url).resolve('axios')).href,
    '@/config/env': compile("export const config = { customApiUrl: 'https://example.invalid/admin', apiTimeoutMs: 30000 };"),
    './refresh-manager': compile("export async function ensureTokenRefresh() { throw Error('Automatic write retry forbidden'); }"),
    '@/utils/tenant-data-quota-refresh': compile('export function scheduleTenantDataQuotaRefresh() {}'),
    '@/utils/store': compile("export const useAuthStore = { getState: () => ({ accessToken: 'synthetic', user: { role: 'superadmin' } }) };"),
    '@/utils/tenant-store': compile(`export const useTenantStore = { getState: () => ({ activeTenantId: '${id(8)}' }) };`),
    '@/utils/locale-store': compile("export const useLocaleStore = { getState: () => ({ locale: 'en' }) };"),
  };
  let text = readFileSync(new URL('./custom-client.ts', import.meta.url), 'utf8');
  for (const [from, to] of Object.entries(replacements)) text = text.replaceAll(JSON.stringify(from), JSON.stringify(to)).replaceAll(`'${from}'`, JSON.stringify(to));
  const clientUrl = compile(text), { customApiClient } = await import(clientUrl);
  let calls = 0;
  customApiClient.defaults.adapter = async config => {
    calls++;
    assert.equal(config.headers.Authorization, 'Bearer synthetic');
    assert.equal(config.headers['X-Tenant-Id'], id(8));
    assert.equal(config.headers['X-UI-Locale'], 'en');
    assert.equal(config.timeout, 30000);
    throw new axios.AxiosError('synthetic auth failure', 'ERR_BAD_REQUEST', config, null,
      { ...rejection('AUTH_REQUIRED', 401).response, config, headers: {}, statusText: 'Unauthorized' });
  };
  const { createWorkspaceWriteClient: create } = await import(moduleUrl(clientUrl));
  await assert.rejects(create(scope).save(id(4), request, opts), e => e.code === 'AUTH_REQUIRED' && e.outcome === 'rejected');
  assert.equal(calls, 1);
});

test('unknown fields, forged proof/identity, unsafe JSON, oversized content and revisions fail before sending', async () => {
  let calls = 0; const client = createWorkspaceWriteClient(scope, { post: async () => { calls++; assert.fail(); } });
  for (const patch of [{ expected_revision: -1 }, { expected_revision: '0' }, { expected_revision: Number.MAX_SAFE_INTEGER },
    { expected_revision: NaN }, { operation_id: 'bad' }, { tenant_id: id(10) }, { validation: { checks: 'PASS' } },
    { changes: {} }, { changes: { title: '' } }, { changes: { title: 'x'.repeat(501) } },
    { changes: { component_type: 'html' } }, { changes: { data: { source_fact_ids: ['forged'] } } },
    { changes: { data: { node_id: id(55) } } }, { changes: { data: Infinity } },
    { changes: { purpose: false } }, { changes: { data: 'x'.repeat(2 * 1024 * 1024) } }]) {
    await assert.rejects(client.save(id(4), { ...request, ...patch }, opts), /INPUT_INVALID/);
  }
  await assert.rejects(client.reset(id(4), request, opts), /INPUT_INVALID/);
  await assert.rejects(client.save(id(4), request, { uiLocale: 'fr' }), /INPUT_INVALID/);
  const circular = {}; circular.self = circular;
  assert.throws(() => validateWorkspaceChanges({ data: circular }), /INPUT_INVALID/);
  assert.throws(() => validateWorkspaceChanges({ data: JSON.parse('{"__proto__":{}}') }), /INPUT_INVALID/);
  assert.throws(() => validateWorkspaceChanges({ get title() { assert.fail('getter must not run'); } }), /INPUT_INVALID/);
  assert.equal(calls, 0);
});

test('receipt requires exact identity/CAS and keeps old replay revision distinct from current pointer', () => {
  assert.deepEqual(readWorkspaceWriteReceipt(receipt, target), receipt);
  assert.equal(readWorkspaceWriteReceipt({ ...receipt, replayed: true, current_revision: 7 }, target).revision, 1);
  for (const patch of [{ workspace_id: id(33) }, { node_id: id(33) }, { operation_id: id(33) },
    { correlation_id: 'bad' }, { revision: 2 }, { current_revision: 0 }, { current_revision: 2 },
    { content_hash: 'not-hash' }, { event_sequence: 0 }, { user_modified: 'true' }, { replayed: 'true' }]) {
    assert.throws(() => readWorkspaceWriteReceipt({ ...receipt, ...patch }, target), e => e.code === 'WORKSPACE_EDIT_RECEIPT_INVALID' && e.outcome === 'unknown');
  }
  assert.throws(() => readWorkspaceWriteReceipt(receipt, { ...target, operation: 'reset' }), /RECEIPT_INVALID/);
});

test('all backend rejection codes have EN/VI copy; unknown transport outcomes never auto retry', async () => {
  const codes = { AUTH_REQUIRED: 401, WORKSPACE_EDIT_FORBIDDEN: 403, WORKSPACE_EDIT_DISABLED: 503,
    WORKSPACE_EDIT_INPUT_INVALID: 400, WORKSPACE_EDIT_NOT_FOUND: 404, WORKSPACE_REVISION_CONFLICT: 409,
    WORKSPACE_EDIT_IDEMPOTENCY_CONFLICT: 409, WORKSPACE_NODE_NOT_READY: 409, WORKSPACE_EDIT_STATE_INVALID: 409,
    WORKSPACE_SOURCE_CHANGED: 409, WORKSPACE_EDIT_VALIDATION_REQUIRED: 422, WORKSPACE_EDIT_UNAVAILABLE: 503 };
  for (const [code, status] of Object.entries(codes)) {
    const error = workspaceWriteFailure(rejection(code, status));
    assert.equal(error.code, code); assert.equal(error.requestId, id(9));
    assert.equal(error.outcome, code === 'WORKSPACE_EDIT_UNAVAILABLE' ? 'unknown' : 'rejected');
    assert.ok(workspaceWriteMessage(code, 'en')); assert.notEqual(workspaceWriteMessage(code, 'en'), workspaceWriteMessage(code, 'vi'));
    assert.ok(!error.message.includes('private'));
  }
  for (const failure of [new Error('network private'), { code: 'ECONNABORTED' }, rejection('SQL_ERROR', 500),
    rejection('WORKSPACE_REVISION_CONFLICT', 502), { response: { status: 503, data: '<html>proxy</html>' } }]) {
    let calls = 0;
    const client = createWorkspaceWriteClient(scope, { post: async () => { calls++; throw failure; } });
    await assert.rejects(client.save(id(4), request, opts), e => e.outcome === 'unknown'); assert.equal(calls, 1);
  }
  for (const code of ['WORKSPACE_EDIT_RECEIPT_INVALID', 'WORKSPACE_EDIT_READ_REQUIRED', 'WORKSPACE_EDIT_BUSY', 'WORKSPACE_EDIT_RESET_CONFIRMATION_REQUIRED']) {
    assert.notEqual(workspaceWriteMessage(code, 'vi'), workspaceWriteMessage(code, 'en'));
  }
});

test('abort before dispatch sends nothing; lost response and malformed success remain unknown', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const client = createWorkspaceWriteClient(scope, { post: async () => { calls++; return { data: { success: true, data: {} } }; } });
  await assert.rejects(client.save(id(4), request, { ...opts, signal: controller.signal }), e => e.outcome === 'rejected');
  assert.equal(calls, 0);
  await assert.rejects(client.save(id(4), request, opts), e => e.outcome === 'unknown'); assert.equal(calls, 1);
});
