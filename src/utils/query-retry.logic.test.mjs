import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./query-retry.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { MAX_QUERY_RETRIES, requestErrorStatus, shouldRetryQuery } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const axiosError = (status) => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status } });

test('reads the HTTP status from axios errors and typed API errors', () => {
  assert.equal(requestErrorStatus(axiosError(404)), 404);
  assert.equal(requestErrorStatus(Object.assign(new Error('read'), { status: 503 })), 503);
  assert.equal(requestErrorStatus(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })), null);
  assert.equal(requestErrorStatus(null), null);
  assert.equal(requestErrorStatus('boom'), null);
});

test('never retries a 4xx answer', () => {
  for (const status of [400, 401, 403, 404, 408, 409, 422, 429]) {
    assert.equal(shouldRetryQuery(0, axiosError(status)), false, String(status));
  }
});

test('retries network errors, timeouts and 5xx at most twice', () => {
  assert.equal(MAX_QUERY_RETRIES, 2);
  for (const error of [axiosError(500), axiosError(502), Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }), new Error('contract')]) {
    assert.equal(shouldRetryQuery(0, error), true);
    assert.equal(shouldRetryQuery(1, error), true);
    assert.equal(shouldRetryQuery(2, error), false);
  }
});

test('the app query client uses this rule and does not refetch every query on window focus', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /retry: shouldRetryQuery/);
  assert.match(app, /refetchOnWindowFocus: false/);
  assert.doesNotMatch(app, /new QueryClient\(\)/);
});
