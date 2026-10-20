/* global URL */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const url = new URL(relative, import.meta.url);
  if (modules.has(url.href)) return modules.get(url.href);
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name === './custom-client') return { customApiClient: { post() { throw new Error('offline transport required'); } } };
    if (name.startsWith('.')) {
      const next = new URL(`${name}.ts`, url);
      if (existsSync(next)) return load(next.href);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(url.href, module.exports);
  return module.exports;
}
const reasons = load('./workspace-apply-reason.logic.ts');
const apply = load('./workspace-apply.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const chapter4 = { chapter: { number: 4, title: 'An toàn điện' }, lesson: null, unit: null, component: null };
const unit = { chapter: { number: 2, title: 'C' }, lesson: { number: 1, title: 'S' }, unit: { number: 3, title: 'Đo điện trở' }, component: null };

test('apply reason: the author reads what happened, where, and what to do (VI/EN)', () => {
  const chapter = { category: 'CHAPTER_NOT_COMPLETED', location: chapter4 };
  // Same sentence as the server (backend lesson-author-workspace-apply-reason.logic.ts).
  assert.equal(reasons.workspaceApplyReasonMessage(chapter, 'vi'),
    "Chương 4 «An toàn điện» chưa hoàn tất bước kiểm tra cuối, nên chưa áp dụng được. Bạn có thể dùng 'Viết lại chương' hoặc tự soạn phần này trong khoá học.");
  assert.equal(reasons.workspaceApplyReasonMessage(chapter, 'en'),
    "Chapter 4 \"An toàn điện\" did not finish its final check, so it cannot be applied yet. You can use 'Rewrite chapter' or write this part yourself in the course.");
  assert.match(reasons.workspaceApplyReasonMessage({ category: 'UNIT_NOT_GENERATED', location: unit }, 'vi'),
    /^Bài học «Đo điện trở» \(Chương 2\) chưa được AI soạn xong/);
  assert.match(reasons.workspaceApplyReasonMessage({ category: 'UNIT_NOT_GENERATED', location: unit }, 'en'),
    /^Lesson "Đo điện trở" \(Chapter 2\) was not finished by the AI/);
  assert.equal(reasons.workspaceLocationText({ ...unit, component: { number: 2, title: null } }, 'vi'),
    'nội dung 2 trong bài học «Đo điện trở» (Chương 2)');
  for (const category of reasons.WORKSPACE_APPLY_REASON_CATEGORIES) {
    for (const location of [null, unit, chapter4]) {
      for (const locale of ['vi', 'en']) {
        const message = reasons.workspaceApplyReasonMessage({ category, location }, locale);
        assert.ok(message.length > 20, `${category} ${locale}`);
        assert.doesNotMatch(message, /[A-Z][A-Z0-9]*_[A-Z0-9_]+|\b(4\d\d|5\d\d)\b|undefined|null/);
        assert.doesNotMatch(message, /\b(AI ID|workspace|revision|hash|snapshot|receipt|artifact|chapter_\d)\b/i);
        if (locale === 'vi') assert.doesNotMatch(message, /\b(course|draft|apply|file|lesson|chapter)\b/i);
      }
    }
  }
});

test('apply reason reader keeps only a known category and a well-formed location', () => {
  assert.equal(reasons.readWorkspaceApplyReason({ category: 'SQL_ERROR', location: null }), null);
  assert.equal(reasons.readWorkspaceApplyReason(null), null);
  assert.deepEqual(reasons.readWorkspaceApplyReason({ category: 'STRUCTURE_INVALID', location: null }),
    { category: 'STRUCTURE_INVALID', location: null });
  assert.deepEqual(reasons.readWorkspaceApplyReason({ category: 'CONTENT_CHANGED', location: { chapter: { number: 0, title: 'x' },
    lesson: null, unit: null, component: null } }), { category: 'CONTENT_CHANGED', location: null }, 'a bad location is dropped, the reason stays');
  assert.deepEqual(reasons.readWorkspaceApplyReason({ category: 'CONTENT_CHANGED', location: { ...unit, unit: { number: 3, title: 'x'.repeat(201) } } }).location, null);
});

test('apply client carries the reason of a refused check into the toast text, never of a conflict', async () => {
  const scope = { courseId: 'course-v1:N+1+2026', conversationId: id(1), workspaceId: id(2) };
  const reject = data => ({ post: async () => { throw { response: { status: 422, data } }; } });
  const refused = apply.createWorkspaceApplyClient(scope, reject({ code: 'WORKSPACE_APPLY_VALIDATION_FAILED', message: 'raw server text',
    reason: { category: 'UNIT_FALLBACK_NOT_APPLICABLE', location: unit, message: 'server words are never shown' } }));
  const error = await refused(id(3), id(4), 7, 'vi').then(() => assert.fail('expected a refusal'), value => value);
  assert.ok(error instanceof apply.WorkspaceApplyError);
  assert.equal(error.code, 'WORKSPACE_APPLY_VALIDATION_FAILED');
  assert.deepEqual(error.reason, { category: 'UNIT_FALLBACK_NOT_APPLICABLE', location: unit });
  assert.match(apply.workspaceApplyErrorMessage(error, 'vi'), /^Bài học «Đo điện trở» \(Chương 2\) chỉ có bản nháp chép từ tài liệu nguồn/);
  assert.doesNotMatch(apply.workspaceApplyErrorMessage(error, 'en'), /server words|raw server/);

  const generic = apply.createWorkspaceApplyClient(scope, reject({ code: 'WORKSPACE_APPLY_VALIDATION_FAILED' }));
  const plain = await generic(id(3), id(4), 7, 'en').catch(value => value);
  assert.equal(plain.reason, null);
  assert.equal(apply.workspaceApplyErrorMessage(plain, 'en'), apply.workspaceApplyMessage('WORKSPACE_APPLY_VALIDATION_FAILED', 'en'));

  const conflict = apply.createWorkspaceApplyClient(scope, reject({ code: 'WORKSPACE_APPLY_CONFLICT',
    reason: { category: 'CONTENT_CHANGED', location: unit } }));
  const conflicted = await conflict(id(3), id(4), 7, 'vi').catch(value => value);
  assert.equal(conflicted.reason, null, 'a conflict keeps its own answer');
});
