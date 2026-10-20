/* global Buffer, URL, AbortController */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const contractUrl = compile(readFileSync(new URL('./lesson-author-workspace.contract.ts', import.meta.url), 'utf8'));
const clientStub = compile('export const customApiClient = {};');
const {
  createWorkspaceRecoveryClient, readWorkspaceRecoveryView, workspaceRecoveryFailure, workspaceRecoveryMessage, WorkspaceRecoveryError,
} = await import(compile(readFileSync(new URL('./workspace-recovery.ts', import.meta.url), 'utf8')
  .replace("'./custom-client'", JSON.stringify(clientStub))
  .replace("'./lesson-author-workspace.contract'", JSON.stringify(contractUrl))));
const { readWorkspaceEvents } = await import(contractUrl);

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { courseId: 'course-v1:TEST+RECOVERY+2026', conversationId: id(1), workspaceId: id(2) };
const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}/conversations/${id(1)}/workspaces/${id(2)}`;
const option = (reason = null) => ({ available: reason === null, reason });
function recoveryView(overrides = {}) {
  return {
    run_id: id(20), run_status: 'needs_action', workspace_status: 'needs_action', failure_code: 'RUN_STOPPED_BY_AUTHOR',
    event_head: 42, draining: false, stop: option('RUN_STOP_NOT_ACTIVE'), resume: { ...option('RECOVERY_NOTHING_TO_DO'), task_count: 0 },
    regenerate: { ...option(), max_rewrites_per_lesson: 3, missing_unit_count: 2,
      course: { ...option(), node_id: id(30), unit_count: 2 },
      chapters: [{ ...option(), node_id: id(31), chapter_key: 'chapter-1', unit_count: 2 }],
      units: [{ ...option(), node_id: id(41), chapter_node_id: id(31), rewrites_used: 0 },
        { ...option('RECOVERY_LIMIT_REACHED'), node_id: id(42), chapter_node_id: id(31), rewrites_used: 3 }] },
    ...overrides,
  };
}

test('GET …/recovery view is read strictly; any malformed part hides the actions', () => {
  const view = readWorkspaceRecoveryView(recoveryView());
  assert.equal(view.event_head, 42);
  assert.equal(view.regenerate.units[1].reason, 'RECOVERY_LIMIT_REACHED');
  // A future reason code is kept (never shown as text); a lower-case or spaced value is not a code.
  assert.equal(readWorkspaceRecoveryView(recoveryView({ stop: option('RECOVERY_SOMETHING_NEW') })).stop.reason, 'RECOVERY_SOMETHING_NEW');
  for (const broken of [
    recoveryView({ run_id: 'run-1' }), recoveryView({ event_head: -1 }), recoveryView({ event_head: 1.5 }),
    recoveryView({ draining: 'no' }), recoveryView({ run_status: 'running' }), recoveryView({ workspace_status: 'paused' }),
    recoveryView({ stop: { available: true, reason: 'RUN_STOP_NOT_ACTIVE' } }), recoveryView({ stop: option('not a code') }),
    recoveryView({ failure_code: 'boom!' }), recoveryView({ resume: { ...option(), task_count: -1 } }),
    recoveryView({ regenerate: { ...recoveryView().regenerate, units: [{ ...option(), node_id: 'x', chapter_node_id: null, rewrites_used: 0 }] } }),
    recoveryView({ regenerate: { ...recoveryView().regenerate, chapters: null } }), null, [], 'view',
  ]) {
    assert.throws(() => readWorkspaceRecoveryView(broken), { code: 'RECOVERY_UNAVAILABLE', outcome: 'rejected' }, JSON.stringify(broken));
  }
});

test('requests: exact paths, bodies and locale; invalid input never reaches the network', async () => {
  const calls = [];
  const transport = {
    async get(url, config) { calls.push(['GET', url, config]); return { data: { success: true, data: recoveryView() } }; },
    async post(url, body, config) {
      calls.push(['POST', url, body, config]);
      const action = url.endsWith('/stop') ? 'stop' : url.endsWith('/resume') ? 'resume' : 'regenerate';
      return { data: { success: true, data: { recovery_id: action === 'stop' ? null : id(50), run_id: id(20), action,
        reopened_task_count: action === 'stop' ? 0 : 3, workspace_status: 'drafting', replayed: false } } };
    },
  };
  const client = createWorkspaceRecoveryClient(scope, transport);
  const signal = new AbortController().signal;
  assert.equal((await client.describe('en', signal)).event_head, 42);
  assert.equal((await client.stop(id(60), 'vi')).action, 'stop');
  assert.equal((await client.resume(id(61), 42, 'vi')).reopened_task_count, 3);
  assert.equal((await client.regenerate(id(31), id(62), 42, 'en')).recovery_id, id(50));
  assert.deepEqual(calls.map(call => call.slice(0, 3)), [
    ['GET', `${base}/recovery`, { _retried: true, params: { ui_locale: 'en' }, signal }],
    ['POST', `${base}/stop`, { operation_id: id(60) }],
    ['POST', `${base}/resume`, { operation_id: id(61), expected_workspace_revision: 42 }],
    ['POST', `${base}/nodes/${id(31)}/regenerate`, { operation_id: id(62), expected_workspace_revision: 42 }],
  ]);
  assert.deepEqual(calls[1][3], { _retried: true, params: { ui_locale: 'vi' } });
  const before = calls.length;
  await assert.rejects(client.stop('not-a-uuid', 'vi'), { code: 'RECOVERY_INPUT_INVALID' });
  await assert.rejects(client.resume(id(63), -1, 'vi'), { code: 'RECOVERY_INPUT_INVALID' });
  await assert.rejects(client.regenerate('node', id(64), 1, 'vi'), { code: 'RECOVERY_INPUT_INVALID' });
  await assert.rejects(client.resume(id(65), 1, 'fr'), { code: 'RECOVERY_INPUT_INVALID' });
  assert.equal(calls.length, before);
  assert.throws(() => createWorkspaceRecoveryClient({ ...scope, workspaceId: 'w' }, transport), { code: 'RECOVERY_INPUT_INVALID' });
});

test('outcomes: listed refusals are definite; outages and unreadable 2xx answers keep the same operation for a retry', async () => {
  const failing = response => ({ async get() { throw { response }; }, async post() { throw { response }; } });
  const cases = [
    [{ status: 409, data: { code: 'RECOVERY_STATE_CHANGED' } }, 'RECOVERY_STATE_CHANGED', 'rejected'],
    [{ status: 429, data: { code: 'AI_CREDIT_INSUFFICIENT_FOR_RECOVERY' } }, 'AI_CREDIT_INSUFFICIENT_FOR_RECOVERY', 'rejected'],
    [{ status: 409, data: { code: 'RECOVERY_IDEMPOTENCY_CONFLICT' } }, 'RECOVERY_IDEMPOTENCY_CONFLICT', 'rejected'],
    [{ status: 503, data: { code: 'RECOVERY_UNAVAILABLE' } }, 'RECOVERY_UNAVAILABLE', 'unknown'],
    [{ status: 403, data: { code: 'LESSON_AUTHOR_SESSION_NOT_OWNER' } }, 'RECOVERY_FORBIDDEN', 'rejected'],
    [{ status: 404, data: {} }, 'RECOVERY_NOT_FOUND', 'rejected'],
    [{ status: 502, data: '<html>' }, 'RECOVERY_UNAVAILABLE', 'unknown'],
    [undefined, 'RECOVERY_UNAVAILABLE', 'unknown'],
  ];
  for (const [response, code, outcome] of cases) {
    const client = createWorkspaceRecoveryClient(scope, failing(response));
    await assert.rejects(client.resume(id(70), 1, 'en'), { code, outcome }, JSON.stringify(response));
  }
  const odd = createWorkspaceRecoveryClient(scope, { async post() { return { data: { success: true, data: { action: 'resume' } } }; } });
  await assert.rejects(odd.resume(id(71), 1, 'en'), { code: 'RECOVERY_UNAVAILABLE', outcome: 'unknown' });
  const wrongAction = createWorkspaceRecoveryClient(scope, { async post() { return { data: { success: true, data: {
    recovery_id: id(50), run_id: id(20), action: 'resume', reopened_task_count: 1, workspace_status: 'drafting', replayed: false } } }; } });
  await assert.rejects(wrongAction.regenerate(id(31), id(72), 1, 'en'), { outcome: 'unknown' });
  assert.equal(workspaceRecoveryFailure(new WorkspaceRecoveryError('RECOVERY_NOTHING_TO_DO', 'rejected')).code, 'RECOVERY_NOTHING_TO_DO');
});

test('every refusal has plain Vietnamese and English words without codes or technical terms', () => {
  for (const code of ['AUTH_REQUIRED', 'RECOVERY_DISABLED', 'RECOVERY_FORBIDDEN', 'RECOVERY_INPUT_INVALID', 'RECOVERY_NOT_FOUND',
    'RECOVERY_STATE_CHANGED', 'RECOVERY_UNIT_HAS_CONTENT', 'RECOVERY_NOTHING_TO_DO', 'RECOVERY_LIMIT_REACHED',
    'RECOVERY_RUNTIME_CHANGED', 'RECOVERY_OTHER_RUN_ACTIVE', 'RECOVERY_IDEMPOTENCY_CONFLICT', 'RUN_STOP_NOT_ACTIVE',
    'AI_CREDIT_INSUFFICIENT_FOR_RECOVERY', 'RECOVERY_UNAVAILABLE']) {
    for (const locale of ['vi', 'en']) {
      const text = workspaceRecoveryMessage(code, locale);
      assert.ok(text.length > 10, `${code} ${locale}`);
      assert.doesNotMatch(text, /[A-Z]{2,}_[A-Z_]+|\b(?:4\d\d|5\d\d)\b|workspace|revision|hash|lock|snapshot|operation id|idempot/i, text);
    }
  }
});

test('the event reader accepts run_resumed (continue/rewrite) like any committed event', () => {
  const view = { workspace_id: id(2), contract_version: 1, correlation_id: id(3), content_locale: 'vi', status: 'drafting',
    last_event_sequence: 5, updated_at: '2026-10-20T00:00:00.000Z' };
  const events = readWorkspaceEvents({ ...view, events: [{ sequence: 5, event_kind: 'run_resumed', node_id: null,
    node_revision: null, operation_id: id(80), created_at: '2026-10-20T00:00:00.000Z' }], next_sequence: 5, has_more: false }, 4);
  assert.equal(events.events[0].event_kind, 'run_resumed');
});
