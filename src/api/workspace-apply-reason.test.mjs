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
const recovery = load('../components/lesson-author-workspace/workspace-recovery.logic.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const chapter4 = { chapter: { number: 4, title: 'An toàn điện' }, lesson: null, unit: null, component: null };
const unit = { chapter: { number: 2, title: 'C' }, lesson: { number: 1, title: 'S' }, unit: { number: 3, title: 'Đo điện trở' }, component: null };

/**
 * Every refusal sentence, per category, with and without a location: the same
 * table as the backend test (lesson-author-orchestration-v2-apply.test.ts,
 * WORKSPACE_APPLY_REASON_SENTENCES), so both sides tell the author the same thing.
 */
const SENTENCES = {
  'CHAPTER_NOT_COMPLETED:none:vi': "Một chương đã soạn xong các bài học nhưng chưa hoàn tất bước kiểm tra cuối, nên chưa áp dụng được. Nếu việc tạo nội dung đã dừng, hãy dùng 'Chạy tiếp' để chạy lại bước kiểm tra này (không dùng điểm AI); nếu chưa dừng, hãy chờ bước này chạy xong. Nếu vẫn không được, bạn có thể tự soạn phần này trong khoá học, hoặc tạo bản thiết kế mới.",
  'CHAPTER_NOT_COMPLETED:none:en': "A chapter has all its lessons written but did not finish its final check, so it cannot be applied yet. If creating content has stopped, use 'Continue' to run this check again (this does not use AI points); otherwise, wait for it to finish. If it still fails, you can write this part yourself in the course, or create a new course design.",
  'CHAPTER_NOT_COMPLETED:where:vi': "Chương 4 «An toàn điện» đã soạn xong các bài học nhưng chưa hoàn tất bước kiểm tra cuối, nên chưa áp dụng được. Nếu việc tạo nội dung đã dừng, hãy dùng 'Chạy tiếp' để chạy lại bước kiểm tra này (không dùng điểm AI); nếu chưa dừng, hãy chờ bước này chạy xong. Nếu vẫn không được, bạn có thể tự soạn phần này trong khoá học, hoặc tạo bản thiết kế mới.",
  'CHAPTER_NOT_COMPLETED:where:en': "Chapter 4 \"An toàn điện\" has all its lessons written but did not finish its final check, so it cannot be applied yet. If creating content has stopped, use 'Continue' to run this check again (this does not use AI points); otherwise, wait for it to finish. If it still fails, you can write this part yourself in the course, or create a new course design.",
  'UNIT_NOT_GENERATED:none:vi': "Một số bài học chưa được AI soạn xong, nên chưa áp dụng được. Bạn có thể dùng 'Viết lại chương' hoặc tự soạn phần này trong khoá học.",
  'UNIT_NOT_GENERATED:none:en': "Some lessons were not finished by the AI, so they cannot be applied yet. You can use 'Rewrite chapter' or write this part yourself in the course.",
  'UNIT_NOT_GENERATED:where:vi': "Bài học «Đo điện trở» (Chương 2) chưa được AI soạn xong, nên chưa áp dụng được. Bạn có thể dùng 'Viết lại chương' hoặc tự soạn phần này trong khoá học.",
  'UNIT_NOT_GENERATED:where:en': "Lesson \"Đo điện trở\" (Chapter 2) was not finished by the AI, so it cannot be applied yet. You can use 'Rewrite chapter' or write this part yourself in the course.",
  'UNIT_FALLBACK_NOT_APPLICABLE:none:vi': 'Một số bài học chỉ có bản nháp chép từ tài liệu nguồn vì AI chưa soạn được, nên không đưa vào khoá học được. Bản thiết kế này không thể soạn lại phần đó, nên bạn có thể tự soạn phần này trong khoá học, hoặc tạo bản thiết kế mới.',
  'UNIT_FALLBACK_NOT_APPLICABLE:none:en': 'Some lessons only have a draft copied from the source because the AI could not write them, so they cannot be added to the course. This design cannot write them again, so you can write this part yourself in the course, or create a new course design.',
  'UNIT_FALLBACK_NOT_APPLICABLE:where:vi': 'Bài học «Đo điện trở» (Chương 2) chỉ có bản nháp chép từ tài liệu nguồn vì AI chưa soạn được, nên không đưa vào khoá học được. Bản thiết kế này không thể soạn lại phần đó, nên bạn có thể tự soạn phần này trong khoá học, hoặc tạo bản thiết kế mới.',
  'UNIT_FALLBACK_NOT_APPLICABLE:where:en': 'Lesson "Đo điện trở" (Chapter 2) only has a draft copied from the source because the AI could not write it, so it cannot be added to the course. This design cannot write it again, so you can write this part yourself in the course, or create a new course design.',
  'CONTENT_CHANGED:none:vi': 'Nội dung của một phần bản thiết kế không còn khớp với bản đã được kiểm tra. Hãy tải lại bản thiết kế rồi thử lại. Nếu vẫn không được, bạn có thể tự soạn phần này trong khoá học, hoặc tạo bản thiết kế mới.',
  'CONTENT_CHANGED:none:en': 'The content of part of the design no longer matches the checked version. Reload the design and try again. If it still fails, you can write this part yourself in the course, or create a new course design.',
  'CONTENT_CHANGED:where:vi': 'Nội dung của bài học «Đo điện trở» (Chương 2) không còn khớp với bản đã được kiểm tra. Hãy tải lại bản thiết kế rồi thử lại. Nếu vẫn không được, bạn có thể tự soạn phần này trong khoá học, hoặc tạo bản thiết kế mới.',
  'CONTENT_CHANGED:where:en': 'The content of lesson "Đo điện trở" (Chapter 2) no longer matches the checked version. Reload the design and try again. If it still fails, you can write this part yourself in the course, or create a new course design.',
  'CONTENT_INCOMPLETE:none:vi': "Một phần bản thiết kế chưa có nội dung hoàn chỉnh, nên chưa áp dụng được. Hãy chờ AI soạn xong, hoặc dùng 'Viết lại chương'.",
  'CONTENT_INCOMPLETE:none:en': "Part of the design does not have complete content yet, so it cannot be applied. Wait for the AI to finish, or use 'Rewrite chapter'.",
  'CONTENT_INCOMPLETE:where:vi': "Bài học «Đo điện trở» (Chương 2) chưa có nội dung hoàn chỉnh, nên chưa áp dụng được. Hãy chờ AI soạn xong, hoặc dùng 'Viết lại chương'.",
  'CONTENT_INCOMPLETE:where:en': "Lesson \"Đo điện trở\" (Chapter 2) does not have complete content yet, so it cannot be applied. Wait for the AI to finish, or use 'Rewrite chapter'.",
  'CONTENT_EDIT_INVALID:none:vi': 'Phần bạn đã sửa ở bản thiết kế chưa hợp lệ. Hãy mở mục này, kiểm tra lại các ô bắt buộc rồi lưu lại trước khi áp dụng.',
  'CONTENT_EDIT_INVALID:none:en': 'Your changes to the design are not valid. Open it, check the required fields and save again before applying.',
  'CONTENT_EDIT_INVALID:where:vi': 'Phần bạn đã sửa ở bài học «Đo điện trở» (Chương 2) chưa hợp lệ. Hãy mở mục này, kiểm tra lại các ô bắt buộc rồi lưu lại trước khi áp dụng.',
  'CONTENT_EDIT_INVALID:where:en': 'Your changes to lesson "Đo điện trở" (Chapter 2) are not valid. Open it, check the required fields and save again before applying.',
  'CONTENT_CHECK_FAILED:none:vi': 'Nội dung này chưa đạt bước kiểm tra trước khi áp dụng. Hãy mở mục này để xem và sửa, hoặc tự soạn trong khoá học.',
  'CONTENT_CHECK_FAILED:none:en': 'This content did not pass the check before applying. Open it to review and fix it, or write it yourself in the course.',
  'CONTENT_CHECK_FAILED:where:vi': 'Bài học «Đo điện trở» (Chương 2) chưa đạt bước kiểm tra trước khi áp dụng. Hãy mở mục này để xem và sửa, hoặc tự soạn trong khoá học.',
  'CONTENT_CHECK_FAILED:where:en': 'Lesson "Đo điện trở" (Chapter 2) did not pass the check before applying. Open it to review and fix it, or write it yourself in the course.',
  'STRUCTURE_INVALID:none:vi': 'Cấu trúc của bản thiết kế khoá học này không còn hợp lệ để áp dụng. Hãy tạo một bản thiết kế mới cho phần này.',
  'STRUCTURE_INVALID:none:en': 'The structure of this course design is no longer valid to apply. Create a new course design for this part.',
  'STRUCTURE_INVALID:where:vi': 'Cấu trúc của bản thiết kế khoá học này không còn hợp lệ để áp dụng. Hãy tạo một bản thiết kế mới cho phần này.',
  'STRUCTURE_INVALID:where:en': 'The structure of this course design is no longer valid to apply. Create a new course design for this part.',
};

test('apply reason: every category reads the same sentence as the server, naming only actions that can help', () => {
  for (const category of reasons.WORKSPACE_APPLY_REASON_CATEGORIES) {
    // A chapter check names its chapter; every other category is shown here on a lesson.
    for (const location of [null, category === 'CHAPTER_NOT_COMPLETED' ? chapter4 : unit]) {
      for (const locale of ['vi', 'en']) {
        assert.equal(reasons.workspaceApplyReasonMessage({ category, location }, locale),
          SENTENCES[`${category}:${location ? 'where' : 'none'}:${locale}`], `${category} ${locale}`);
      }
    }
  }
  const advice = (category, locale) => reasons.workspaceApplyReasonMessage({ category, location: null }, locale);
  // The quoted labels are the recovery buttons the author sees.
  assert.ok(advice('CHAPTER_NOT_COMPLETED', 'vi').includes(`'${recovery.workspaceRecoveryCopy.vi.resume}'`));
  assert.ok(advice('CHAPTER_NOT_COMPLETED', 'en').includes(`'${recovery.workspaceRecoveryCopy.en.resume}'`));
  assert.ok(advice('UNIT_NOT_GENERATED', 'vi').includes(`'${recovery.workspaceRecoveryCopy.vi.rewriteChapter}'`));
  assert.ok(advice('UNIT_NOT_GENERATED', 'en').includes(`'${recovery.workspaceRecoveryCopy.en.rewriteChapter}'`));
  for (const category of ['CHAPTER_NOT_COMPLETED', 'UNIT_FALLBACK_NOT_APPLICABLE', 'CONTENT_CHANGED']) {
    for (const locale of ['vi', 'en']) {
      assert.ok(!advice(category, locale).includes(recovery.workspaceRecoveryCopy[locale].rewriteChapter), `${category} ${locale}`);
      if (category !== 'CHAPTER_NOT_COMPLETED') {
        assert.ok(!advice(category, locale).includes(`'${recovery.workspaceRecoveryCopy[locale].resume}'`), `${category} ${locale}`);
      }
    }
  }
});

test('apply reason: the author reads what happened, where, and what to do (VI/EN)', () => {
  const chapter = { category: 'CHAPTER_NOT_COMPLETED', location: chapter4 };
  // Same sentence as the server (backend lesson-author-workspace-apply-reason.logic.ts).
  assert.equal(reasons.workspaceApplyReasonMessage(chapter, 'vi'), SENTENCES['CHAPTER_NOT_COMPLETED:where:vi']);
  assert.equal(reasons.workspaceApplyReasonMessage(chapter, 'en'), SENTENCES['CHAPTER_NOT_COMPLETED:where:en']);
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
