import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The courses page is too large to render with its full dependency tree, so
// these checks read its source.
const directory = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(directory, 'courses.tsx'), 'utf8');
const edit = page.slice(page.indexOf('function CourseInfoDialog'), page.indexOf('function CourseMentorDialog'));

test('create and edit course dialogs show no AI ID note at the description field', () => {
  // Owner 2026-10-16: the course description is no longer AI ID context.
  assert.doesNotMatch(page, /CourseAiIdDescriptionHint|useLessonAuthorAvailable|aiIdDescription/);
  const create = page.slice(page.indexOf("t('courses.createTitle')"), page.indexOf("t('courses.organization')"));
  assert.match(create, /placeholder=\{t\('courses\.descriptionPlaceholder'\)\}/);
  assert.match(edit, /placeholder=\{t\('courses\.descriptionInputPlaceholder'\)\}/);
  // Validation is unchanged: whitespace-only descriptions still cannot be submitted.
  assert.match(page, /canSubmitCreateCourse = Boolean\(newName\.trim\(\) && newDescription\.trim\(\)/);
  assert.match(edit, /canSave = Boolean\(displayName\.trim\(\) && description\.trim\(\)\)/);
});

test('saving the course name and description refreshes what the course editor shows', () => {
  const saved = edit.slice(edit.indexOf('const saveMut'), edit.indexOf('onError'));
  assert.match(saved, /invalidateQueries\(\{ queryKey: \['course-outline-index', course\.id\], exact: true \}\)/);
});

test('the course editor has no "AI ID notes for authors" panel any more', () => {
  // QC 21/10 (C9): the panel and its read are gone; review warnings stay in the AI ID window ("Chờ duyệt").
  const src = path.resolve(directory, '..');
  assert.equal(existsSync(path.join(src, 'components/course-editor/AiAuthorNotes.tsx')), false);
  assert.equal(existsSync(path.join(src, 'api/course-author-notes.ts')), false);
  for (const file of ['components/course-editor/UnitEditor.tsx', 'pages/course-editor.tsx', 'pages/courses.tsx']) {
    assert.doesNotMatch(readFileSync(path.join(src, file), 'utf8'), /AiAuthorNotes|courseAuthorNotes|course-author-notes/, file);
  }
  for (const locale of ['vi', 'en']) {
    const copy = readFileSync(path.join(src, `i18n/locales/${locale}.ts`), 'utf8');
    assert.doesNotMatch(copy, /aiAuthorNotes:|Ghi chú AI ID cho tác giả|AI ID notes for authors/, locale);
  }
  const host = readFileSync(path.join(src, 'components/lesson-author-workspace/workspace-course-host.tsx'), 'utf8');
  assert.match(host, /overviewNotice=\{state\.launch && workspaceReviewRequired\(presentationRead\?\.status\) \? <WorkspaceReviewPanel/);
});
