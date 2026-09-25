import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./lesson-author-video-upload.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const logic = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const customChatSource = readFileSync(new URL('./custom-chat.ts', import.meta.url), 'utf8');
const chatWidgetSource = readFileSync(new URL('../components/chat-widget/chat-widget.tsx', import.meta.url), 'utf8');

test('reports determinate upload percentage only when total bytes are known', () => {
  assert.equal(logic.normalizeLessonAuthorVideoUploadProgress(25, 100), 25);
  assert.equal(logic.normalizeLessonAuthorVideoUploadProgress(125, 100), 100);
  assert.equal(logic.normalizeLessonAuthorVideoUploadProgress(1, undefined), null);
  assert.equal(logic.normalizeLessonAuthorVideoUploadProgress(1, 0), null);
});

test('byte completion moves to server-acceptance rather than overall ready', () => {
  assert.equal(logic.lessonAuthorVideoUploadPhase(null), 'uploading');
  assert.equal(logic.lessonAuthorVideoUploadPhase(99), 'uploading');
  assert.equal(logic.lessonAuthorVideoUploadPhase(100), 'accepting');
});

test('polls transcription through KB indexing and stops on learned or error', () => {
  assert.equal(logic.shouldPollLessonAuthorTranscript('queued', null, false), true);
  assert.equal(logic.shouldPollLessonAuthorTranscript('running', null, false), true);
  assert.equal(logic.shouldPollLessonAuthorTranscript('committed', 'learning', false), true);
  assert.equal(logic.shouldPollLessonAuthorTranscript('committed', 'learned', true), false);
  assert.equal(logic.shouldPollLessonAuthorTranscript('committed', 'error', false), false);
  assert.equal(logic.shouldPollLessonAuthorTranscript('failed', null, false), false);
});

test('creates a stable-format upload attempt with randomUUID or cryptographic fallback', () => {
  const native = logic.createLessonAuthorUploadAttemptId({
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    getRandomValues: () => { throw new Error('must not be called'); },
  });
  assert.equal(native, '11111111-1111-4111-8111-111111111111');

  const fallback = logic.createLessonAuthorUploadAttemptId({
    getRandomValues: bytes => {
      bytes.fill(0xab);
      return bytes;
    },
  });
  assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('fails closed when secure upload randomness is unavailable', () => {
  assert.throws(
    () => logic.createLessonAuthorUploadAttemptId(null),
    error => error.code === 'VIDEO_UPLOAD_SECURE_RANDOM_UNAVAILABLE',
  );
  assert.equal(
    logic.lessonAuthorUploadSafeErrorCode(new logic.LessonAuthorUploadPreparationError()),
    'VIDEO_UPLOAD_SECURE_RANDOM_UNAVAILABLE',
  );
  assert.equal(logic.lessonAuthorUploadSafeErrorCode({ response: { status: 413 } }), 'HTTP_413');
  assert.equal(logic.lessonAuthorUploadSafeErrorCode({ code: 'ERR_NETWORK' }), 'ERR_NETWORK');
  assert.equal(logic.lessonAuthorUploadSafeErrorCode(new Error('private source text')), 'VIDEO_UPLOAD_UNKNOWN_ERROR');
});

test('upload transport stays same-origin and forwards only the safe attempt identifier', () => {
  assert.match(
    customChatSource,
    /`\/api\/ai-chatbot\/chat\/lesson-author\/conversations\/\$\{conversationId\}\/transcriptions`/,
  );
  assert.match(customChatSource, /'X-Lesson-Author-Upload-Attempt': idempotencyKey/);
  assert.match(customChatSource, /timeout: LESSON_AUTHOR_VIDEO_UPLOAD_TIMEOUT_MS/);
  assert.match(customChatSource, /body\.append\('idempotency_key', idempotencyKey\)/);
  assert.match(chatWidgetSource, /uploadAttemptId = createLessonAuthorUploadAttemptId\(\)/);
  assert.doesNotMatch(chatWidgetSource, /uploadLessonAuthorVideoTranscript\([\s\S]{0,300}crypto\.randomUUID\(\)/);
});
