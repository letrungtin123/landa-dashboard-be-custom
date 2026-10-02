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
const contract = compile(readFileSync(new URL('./lesson-author-workspace.contract.ts', import.meta.url), 'utf8'));
const source = readFileSync(new URL('./workspace-launch.ts', import.meta.url), 'utf8');
const moduleFor = client => import(compile(source.replace("'./custom-client'", JSON.stringify(client))
  .replace("'./lesson-author-workspace.contract'", JSON.stringify(contract))));
const { createWorkspaceLaunchResolver } = await moduleFor(compile('export const customApiClient = {};'));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = () => ({ actorId: id(1), tenantId: id(2), courseId: 'course-v1:TEST+HOST+2026 /?', uiLocale: 'en', signal: new AbortController().signal, previous: null });
const latest = { workspace_id: id(3), conversation_id: id(4), correlation_id: id(5), content_locale: 'vi', status: 'drafting' };

test('latest GET encodes course once, passes signal/locale/no-cache, and maps only server IDs; missing edit grant is false', async () => {
  const calls = [], options = input();
  const resolve = createWorkspaceLaunchResolver({ get: async (...args) => { calls.push(args); return { data: { success: true, data: latest } }; } });
  const result = await resolve(options);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(options.courseId)}/workspaces/latest`);
  assert.deepEqual(calls[0][1], { params: { ui_locale: 'en' }, signal: options.signal, headers: { 'Cache-Control': 'no-cache' } });
  assert.deepEqual(result, { course_id: options.courseId, workspace_id: id(3), conversation_id: id(4), correlation_id: id(5), content_locale: 'vi', can_edit: false });
  const editable = createWorkspaceLaunchResolver({ get: async () => ({ data: { success: true, data: { ...latest, can_edit: true } } }) });
  assert.equal((await editable(options)).can_edit, true);
});
test('null is absence, malformed data is not absence, and errors never fall through to generation/create', async () => {
  for (const value of [undefined, {}, { ...latest, workspace_id: 'invented' }, { ...latest, correlation_id: 'bad' },
    { ...latest, course_id: 'different' }, { ...latest, content_locale: 'fr' }, { ...latest, status: 'finished' }, { ...latest, can_edit: 'yes' }]) {
    let calls = 0;
    const resolve = createWorkspaceLaunchResolver({ get: async () => { calls++; return { data: { success: true, data: value } }; } });
    await assert.rejects(resolve(input()), { code: 'WORKSPACE_READ_CONTRACT_INVALID' }); assert.equal(calls, 1);
  }
  assert.equal(await createWorkspaceLaunchResolver({ get: async () => ({ data: { success: true, data: null } }) })(input()), null);
  let calls = 0;
  await assert.rejects(createWorkspaceLaunchResolver({ get: async () => { calls++; throw { response: { status: 404, data: {} } }; } })(input()));
  assert.equal(calls, 1);
});
test('bad input and aborted requests cannot launch; abort after response rejects stale response', async () => {
  let calls = 0;
  const resolve = createWorkspaceLaunchResolver({ get: async () => { calls++; return { data: { success: true, data: latest } }; } });
  for (const patch of [{ courseId: '..' }, { courseId: 'a\nb' }, { actorId: '' }, { tenantId: 'fake' }, { uiLocale: 'fr' }]) {
    await assert.rejects(resolve({ ...input(), ...patch }));
  }
  const abort = new AbortController(); abort.abort(); await assert.rejects(resolve({ ...input(), signal: abort.signal })); assert.equal(calls, 0);
  const late = new AbortController();
  await assert.rejects(createWorkspaceLaunchResolver({ get: async () => { late.abort(); return { data: { success: true, data: latest } }; } })({ ...input(), signal: late.signal }));
});
test('default discovery transport uses actual shared same-origin base, auth/tenant/ENVI interceptors and GET-only 401 refresh', async () => {
  const authUrl = compile(`let token = 'before'; export function rotate() { token = 'after'; }
    export const useAuthStore = { getState: () => ({ accessToken: token, user: { role: 'superadmin' }, logout() { throw Error('unexpected logout'); } }) };`);
  const replacements = {
    axios: pathToFileURL(createRequire(import.meta.url).resolve('axios')).href,
    '@/config/env': compile("export const config = { customApiUrl: '/admin', apiTimeoutMs: 30000 };"),
    './refresh-manager': compile(`import { rotate } from ${JSON.stringify(authUrl)}; export async function ensureTokenRefresh() { rotate(); return true; }`),
    '@/utils/tenant-data-quota-refresh': compile("export function scheduleTenantDataQuotaRefresh() { throw Error('GET cannot mutate quota'); }"),
    '@/utils/store': authUrl,
    '@/utils/tenant-store': compile(`export const useTenantStore = { getState: () => ({ activeTenantId: '${id(2)}' }) };`),
    '@/utils/locale-store': compile("export const useLocaleStore = { getState: () => ({ locale: 'vi' }) };"),
  };
  let clientSource = readFileSync(new URL('./custom-client.ts', import.meta.url), 'utf8');
  for (const [from, to] of Object.entries(replacements)) clientSource = clientSource.replaceAll(JSON.stringify(from), JSON.stringify(to)).replaceAll(`'${from}'`, JSON.stringify(to));
  const clientUrl = compile(clientSource), { customApiClient } = await import(clientUrl);
  const calls = [];
  customApiClient.defaults.adapter = async config => {
    calls.push({ auth: config.headers.Authorization, tenant: config.headers['X-Tenant-Id'], locale: config.headers['X-UI-Locale'], method: config.method, uri: customApiClient.getUri(config) });
    if (calls.length === 1) throw new axios.AxiosError('401', 'ERR_BAD_REQUEST', config, null, { status: 401, data: {}, headers: {}, config, statusText: 'Unauthorized' });
    return { data: { success: true, data: latest }, status: 200, statusText: 'OK', headers: {}, config };
  };
  const api = await moduleFor(clientUrl); await api.createWorkspaceLaunchResolver()({ ...input(), uiLocale: 'vi' });
  assert.deepEqual(calls.map(c => c.auth), ['Bearer before', 'Bearer after']);
  assert.ok(calls.every(c => c.tenant === id(2) && c.locale === 'vi' && c.method === 'get' && c.uri.startsWith('/admin/api/ai-chatbot/')));
  assert.ok(calls.every(c => c.uri.endsWith('/workspaces/latest?ui_locale=vi')));
});
