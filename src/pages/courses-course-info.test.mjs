import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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
  assert.match(saved, /invalidateQueries\(\{ queryKey: courseAuthorNotesQueryKey\(course\.id\), exact: true \}\)/);
  assert.match(saved, /invalidateQueries\(\{ queryKey: \['course-outline-index', course\.id\], exact: true \}\)/);
});
