/* global URL, Buffer */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./external-url.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { safeHttpUrl, openInNewTab } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('only absolute http(s) learner site addresses become links', () => {
  assert.equal(safeHttpUrl('https://lms.example.com'), 'https://lms.example.com');
  assert.equal(safeHttpUrl(' http://10.0.0.5:5273 '), 'http://10.0.0.5:5273');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'lms.example.com', '', null, undefined]) {
    assert.equal(safeHttpUrl(value), null, String(value));
  }
});

test('new tabs are opened without access to this page', () => {
  const calls = [];
  globalThis.window = { open: (...args) => { calls.push(args); return null; } };
  openInNewTab('https://lms.example.com/?ott=x');
  assert.deepEqual(calls, [['https://lms.example.com/?ott=x', '_blank', 'noopener,noreferrer']]);
  delete globalThis.window;
});
