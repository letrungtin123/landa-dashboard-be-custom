import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Real logic module, transpiled as the other workspace tests do; no network.
const directory = path.dirname(fileURLToPath(import.meta.url));
function load(file) {
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports);
  return module.exports;
}
const { workspacePreserveFailureCopy } = load(path.join(directory, 'workspace-preserve-failure.logic.ts'));

const KEPT_CODES = ['IDM_PRESERVE_SOURCE_TOO_LARGE', 'IDM_PRESERVE_SOURCE_EMPTY', 'IDM_PRESERVE_HTML_NOT_ALLOWED',
  'IDM_PRESERVE_TEXT_MISMATCH', 'IDM_PRESERVE_UNIT_INVALID', 'IDM_PRESERVE_COVERAGE_INVALID',
  'IDM_PRESERVE_SEGMENTATION_INVALID', 'IDM_PRESERVE_MODE_MISMATCH'];

test('every kept-document failure has a plain message and next step in both languages', () => {
  for (const code of KEPT_CODES) {
    const vi = workspacePreserveFailureCopy(code, 'vi');
    const en = workspacePreserveFailureCopy(code, 'en');
    for (const copy of [vi, en]) {
      assert.ok(copy && copy.message.length > 30 && copy.note && copy.note.length > 30, code);
      assert.doesNotMatch(`${copy.message} ${copy.note}`, /IDM_|PRESERVE|_|\b(?:400|422|500)\b(?! phần| parts)/, code);
    }
    assert.notEqual(vi.message, en.message);
  }
  assert.match(workspacePreserveFailureCopy('IDM_PRESERVE_SOURCE_TOO_LARGE', 'vi').note, /chia tài liệu/);
  assert.match(workspacePreserveFailureCopy('IDM_PRESERVE_TEXT_MISMATCH', 'en').message, /stopped instead of changing/);
});

test('other codes keep the existing handling', () => {
  for (const code of [null, undefined, '', 'IDM_UNITS_MOSTLY_FALLBACK', 'AI_PROVIDER_QUOTA_EXHAUSTED', 'toString']) {
    assert.equal(workspacePreserveFailureCopy(code, 'vi'), null);
  }
});
