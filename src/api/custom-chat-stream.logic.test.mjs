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
