import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// The AI points error codes and their VI/EN copy (real locale files).
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '..');
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(file), specifier);
      return load([`${base}.ts`, base].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile()));
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  loaded.set(file, module.exports);
  return module.exports;
}
const errors = load(path.join(directory, 'ai-credit-errors.logic.ts'));
const locales = { vi: load(path.join(src, 'i18n/locales/vi.ts')).vi, en: load(path.join(src, 'i18n/locales/en.ts')).en };
function t(locale, key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[locale]);
  assert.equal(typeof value, 'string', `missing ${locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}

test('refused inputs of the AI points routes get a plain VI/EN message naming the field', () => {
  assert.equal(errors.aiCreditInvalidInputKeys('OTHER_CODE', 'name'), null);
  const named = errors.aiCreditInvalidInputKeys('AI_CREDIT_INVALID_INPUT', 'monthly_points');
  assert.deepEqual(named, { key: 'aiCredits.admin.apiErrors.invalidField', fieldKey: 'aiCredits.admin.apiErrors.fields.monthly_points' });
  assert.equal(t('vi', named.key, { field: t('vi', named.fieldKey) }), 'Thông tin chưa hợp lệ: Điểm mỗi tháng. Hãy kiểm tra lại.');
  assert.equal(t('en', named.key, { field: t('en', named.fieldKey) }), 'This value is not valid: Points per month. Please check it.');
  assert.deepEqual(errors.aiCreditInvalidInputKeys('AI_CREDIT_INVALID_INPUT', 'something_else'), { key: 'aiCredits.admin.apiErrors.invalidInput', fieldKey: null });
  assert.deepEqual(errors.aiCreditInvalidInputKeys('AI_CREDIT_INVALID_INPUT', undefined), { key: 'aiCredits.admin.apiErrors.invalidInput', fieldKey: null });
  assert.equal(t('en', 'aiCredits.admin.apiErrors.invalidInput'), 'Some of the information is not valid. Please check it.');
  for (const field of errors.AI_CREDIT_INPUT_FIELDS) {
    for (const locale of ['vi', 'en']) assert.doesNotMatch(t(locale, `aiCredits.admin.apiErrors.fields.${field}`), /_/);
  }
  const localizedError = readFileSync(path.join(src, 'utils/localized-error.ts'), 'utf8');
  assert.match(localizedError, /const invalidInput = aiCreditInvalidInputKeys\(response\?\.data\?\.code, response\?\.data\?\.field\);/);
});

test('a month without data cannot be checked against an invoice: plain VI/EN message', () => {
  assert.equal(errors.aiCreditAdminErrorKey('AI_CREDIT_MONTH_NOT_FOUND'), 'aiCredits.admin.apiErrors.monthNotFound');
  assert.equal(t('vi', 'aiCredits.admin.apiErrors.monthNotFound'), 'Tháng này chưa có dữ liệu điểm AI của đơn vị nên chưa đối soát được.');
  assert.equal(t('en', 'aiCredits.admin.apiErrors.monthNotFound'),
    'This organization has no AI points data for this month, so it cannot be checked against an invoice.');
});
