import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const module = { exports: {} };
const output = ts.transpileModule(readFileSync(new URL('./workspace-source-stream.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const require = name => {
  if (name === '@/config/env') return { config: { customApiUrl: 'http://localhost:3001' } };
  if (name === './refresh-manager') return { ensureTokenRefresh: async () => false };
  if (name === '@/utils/store') return { useAuthStore: { getState: () => ({ isAuthenticated: true, isLoggingOut: false,
    accessToken: 'test-token', user: { role: 'superadmin' } }) } };
  if (name === '@/utils/tenant-store') return { useTenantStore: { getState: () => ({ activeTenantId: id(2) }) } };
  if (name === './lesson-author-workspace.contract') return { isWorkspaceId: value => /^[0-9a-f-]{36}$/i.test(value) };
  throw new Error(`unexpected import ${name}`);
};
new Function('require', 'module', 'exports', output)(require, module, module.exports);
const { createWorkspaceSourceStreamClient } = module.exports;

test('exact source SSE carries auth/tenant headers and publishes terminal snapshot once', async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  const calls = [], documents = [], states = [];
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    const data = { delivery_contract_version: 1, document_id: id(1), kb_id: id(3), name: 'Uploaded.pdf', type: 'file',
      status: 'learned', source_info: { extension: 'pdf' }, updated_at: '2026-09-30T00:00:00.000Z' };
    return new Response(`event: source_status\ndata: ${JSON.stringify(data)}\n\n`, { status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
  };
  try {
    const client = createWorkspaceSourceStreamClient({ documentId: id(1), locale: 'vi' }, {
      active: () => true, onDocument: value => documents.push(value), onState: value => states.push(value),
    });
    client.start();
    for (let index = 0; index < 20 && documents.length === 0; index++) await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], new RegExp(`${id(1)}/stream\\?ui_locale=vi$`));
    assert.equal(calls[0][1].headers.Authorization, 'Bearer test-token');
    assert.equal(calls[0][1].headers['X-Tenant-Id'], id(2));
    assert.deepEqual(documents.map(value => [value.document_id, value.status]), [[id(1), 'learned']]);
    assert.deepEqual(states.slice(0, 2), ['connecting', 'live']);
    client.close();
  } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
});
