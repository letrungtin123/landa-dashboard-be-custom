import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidLessonAuthorCourseId } from './lesson-author-editor-context';

test('accepts canonical course keys and legacy UUID course IDs', () => {
  assert.equal(isValidLessonAuthorCourseId('course-v1:nesso+06786+2026'), true);
  assert.equal(isValidLessonAuthorCourseId('11111111-1111-4111-8111-111111111111'), true);
});

test('does not emit/retain malformed or empty course context IDs', () => {
  assert.equal(isValidLessonAuthorCourseId(undefined), false);
  assert.equal(isValidLessonAuthorCourseId(''), false);
  assert.equal(isValidLessonAuthorCourseId('not-a-course-id'), false);
  assert.equal(isValidLessonAuthorCourseId('course-v1:nesso+only-one-part'), false);
});
