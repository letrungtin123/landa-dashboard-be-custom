import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./custom-chat-stream.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const logic = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const customChatSource = readFileSync(new URL('./custom-chat.ts', import.meta.url), 'utf8');

test('keeps a same-origin Lesson Author stream on the frontend proxy', () => {
  const url = logic.buildChatStreamUrl({
    apiBaseUrl: 'same-origin',
    browserOrigin: 'http://127.0.0.1:5274',
    conversationId: '11111111-1111-1111-1111-111111111111',
    target: 'lesson_author',
    courseId: '22222222-2222-2222-2222-222222222222',
  });

  assert.equal(
    url,
    'http://127.0.0.1:5274/api/ai-chatbot/chat/conversations/11111111-1111-1111-1111-111111111111/messages?target=lesson_author&courseId=22222222-2222-2222-2222-222222222222',
  );
});

test('normalizes both browser spellings of a network failure', () => {
  assert.equal(logic.isChatStreamNetworkError(new Error('NetworkError')), true);
  assert.equal(logic.isChatStreamNetworkError(new Error('network error')), true);
  assert.equal(logic.isChatStreamNetworkError(new Error('Failed to fetch')), true);
  assert.equal(logic.isChatStreamNetworkError(new Error('request rejected')), false);
});

test('stream transport retains the bearer and superadmin tenant forwarding contracts', () => {
  assert.match(customChatSource, /'Authorization': `Bearer \$\{accessToken\}`/);
  assert.match(customChatSource, /headers\['X-Tenant-Id'\] = activeTenantId/);
});

function body(parts) {
  return new ReadableStream({ start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
    controller.close();
  } });
}

test('normal/source chat stream accepts split frames, heartbeat and final event', async () => {
  const events = [];
  assert.equal(await logic.consumeChatEventStream(body([
    ': keepalive\n\n', 'data: {"type":"pro', 'gress","stage":"REQUEST_ACCEPTED"}\n\n',
    'data: {"type":"chunk","text":"hello"}\n\n', 'data: {"type":"done"}',
  ]), event => events.push(event)), true);
  assert.deepEqual(events.map(e => e.type), ['progress', 'chunk', 'done']);
});

test('EOF without terminal is interrupted, never successful done', async () => {
  assert.equal(await logic.consumeChatEventStream(body(['data: {"type":"progress"}\n\n']), () => {}), false);
  await assert.rejects(logic.consumeChatEventStream(new ReadableStream({ start(c) { c.error(new Error('network error')); } }), () => {}), /network error/);
});

test('application error is terminal and is not a transport recovery', async () => {
  const events = [];
  assert.equal(await logic.consumeChatEventStream(body(['data: {"type":"error","code":"PROVIDER_ERROR"}\n\n']), e => events.push(e)), true);
  assert.equal(events[0].code, 'PROVIDER_ERROR');
});

test('slow response is not cancelled before terminal event', async () => {
  let controller;
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { controller = c; }, cancel() { cancelled = true; } });
  let completed = false;
  const result = logic.consumeChatEventStream(stream, () => {}).then(value => { completed = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(cancelled, false);
  controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
  assert.equal(await result, true);
});

test('recovery does not mistake old assistant for current turn; handles clock skew with baseline', () => {
  const old = { id: 'old', role: 'assistant', created_at: '2026-09-25T10:00:00Z' };
  const user = { id: 'new-user', role: 'user', created_at: '2026-09-25T10:01:00Z' };
  const answer = { id: 'new-answer', role: 'assistant', created_at: '2026-09-25T10:02:00Z' };
  const started = Date.parse('2026-09-25T10:05:00Z');
  assert.equal(logic.hasRecoveredAssistant([old], started, 'old'), false);
  assert.equal(logic.hasRecoveredAssistant([old, user], started, 'old'), false);
  assert.equal(logic.hasRecoveredAssistant([old, user, answer], started, 'old'), true);
  assert.equal(logic.hasRecoveredAssistant([old], started), false);
  assert.equal(logic.CHAT_RECOVERY_MAX_MS, 660000);
});

test('Lesson Author interruption uses read-only recovery, not finishStream or re-POST', () => {
  const widget = readFileSync(new URL('../components/chat-widget/chat-widget.tsx', import.meta.url), 'utf8');
  const handler = widget.slice(widget.indexOf('onTransportInterrupted: isLessonAuthor'), widget.indexOf('onProposal: isLessonAuthor', widget.indexOf('onTransportInterrupted: isLessonAuthor')));
  assert.match(widget, /const recoveryStartedAt = Date.now\(\)/);
  assert.match(handler, /recoverPendingTurn\(conversationId, target, recoveryStartedAt\)/);
  assert.doesNotMatch(handler, /recoverPendingTurn\([^\n]*streamStartedAt/);
  assert.doesNotMatch(handler, /finishStream|sendMessageStream|clearStoredChatPendingTurn/);
  assert.match(customChatSource, /source_documents: options.source_documents/);
  assert.match(customChatSource, /editor_context: options.editor_context/);
});

test('fresh recovery uses epoch time, survives a slow valid turn and expires at the existing bound', () => {
  const started = Date.parse('2026-09-25T13:26:06Z');
  assert.equal(logic.isChatRecoveryExpired(started, started + 1), false);
  assert.equal(logic.isChatRecoveryExpired(started, started + 600_000), false);
  assert.equal(logic.isChatRecoveryExpired(started, started + 660_000), false);
  assert.equal(logic.isChatRecoveryExpired(started, started + 660_001), true);
  const widget = readFileSync(new URL('../components/chat-widget/chat-widget.tsx', import.meta.url), 'utf8');
  assert.match(widget, /isChatRecoveryExpired\(startedAt\)/);
  assert.match(widget, /waitForMinimumStreamDuration\(streamStartedAt\)/);
});

test('structured 503 admission rejection is terminal, but unknown commit/proxy failures recover without re-POST', () => {
  const payload = { success: false, kind: 'lesson_author_admission_error', admission_status: 'rejected',
    code: 'GENERATION_ENQUEUE_FAILED', correlation_id: '11111111-1111-4111-8111-111111111111' };
  assert.equal(logic.readGenerationAdmissionRejection(payload)?.code, payload.code);
  for (const other of [null, '<html>502</html>', { ...payload, admission_status: 'unknown' },
    { ...payload, correlation_id: 'secret' }, { success: false, code: payload.code }]) {
    assert.equal(logic.readGenerationAdmissionRejection(other), null);
  }
  const branch = customChatSource.slice(customChatSource.indexOf('if (!response.ok || !response.body)'));
  assert.ok(branch.indexOf('readGenerationAdmissionRejection(payload)') < branch.indexOf('response.status >= 500'));
  assert.match(branch, /emitError\(`[\s\S]*rejection.code/);
});
