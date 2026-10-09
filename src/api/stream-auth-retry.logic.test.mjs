/* global URL, Buffer */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./stream-auth-retry.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { retryAfterUnauthorized } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('a stream reconnects at once only with a really new token, once in a row', () => {
  assert.equal(retryAfterUnauthorized('old', 'new', 0), 'retry_now');
  assert.equal(retryAfterUnauthorized('old', 'new', 1), 'back_off', 'second 401 in a row backs off');
  assert.equal(retryAfterUnauthorized('same', 'same', 0), 'back_off', 'refresh cooldown left the same token');
  assert.equal(retryAfterUnauthorized('old', null, 0), 'back_off');
});
