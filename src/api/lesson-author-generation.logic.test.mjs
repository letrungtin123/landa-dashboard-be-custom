import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('./lesson-author-generation.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { readBlueprintGenerationStatus, pollBlueprintGeneration } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const id = '11111111-1111-4111-8111-111111111111';
const initial = { job_id: id, correlation_id: id, status: 'queued', progress_code: 'QUEUED',
  deadline_at: new Date(600_000).toISOString(), blueprint_id: null, assistant_message_id: null, external_failure_code: null };
const done = { ...initial, status: 'succeeded', blueprint_id: id, assistant_message_id: id };

test('202 contract requires stable IDs and committed result references', () => {
  assert.equal(readBlueprintGenerationStatus(initial).status, 'queued');
  assert.equal(readBlueprintGenerationStatus(done).blueprint_id, id);
  for (const bad of [null, {}, { ...initial, job_id: 'bad' }, { ...done, blueprint_id: null }]) {
    assert.throws(() => readBlueprintGenerationStatus(bad));
  }
});

test('polling uses only read callback and terminates at committed success', async () => {
  let reads = 0; const progress = []; let time = 0;
  const result = await pollBlueprintGeneration({ initial, signal: new AbortController().signal,
    read: async () => ++reads === 1 ? { ...initial, status: 'running' } : done,
    progress: v => progress.push(v.status), now: () => time, sleep: async ms => { time += ms; } });
  assert.equal(result.blueprint_id, id); assert.equal(reads, 2);
  assert.deepEqual(progress, ['queued', 'running', 'succeeded']);
});

test('failed job does not poll again or create a replacement generation', async () => {
  const result = await pollBlueprintGeneration({ initial: { ...initial, status: 'failed' }, signal: new AbortController().signal,
    read: async () => assert.fail('no read needed'), progress: () => {}, now: () => 0 });
  assert.equal(result.status, 'failed');
});

test('browser cancellation stops GET polling, not the server job', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(pollBlueprintGeneration({ initial, signal: controller.signal,
    read: async () => assert.fail('no network'), progress: () => {} }), { name: 'AbortError' });
});

test('slow job wait bounded to deadline plus reconciliation grace', async () => {
  let time = 0; let reads = 0;
  await assert.rejects(pollBlueprintGeneration({ initial, signal: new AbortController().signal,
    read: async () => { reads++; return initial; }, progress: () => {}, now: () => time,
    sleep: async ms => { time += ms; } }), /GENERATION_STATUS_WAIT_EXPIRED/);
  assert.equal(time, 660_000); assert.equal(reads, 330);
});

test('status identity cannot switch to another job or conversation result', async () => {
  await assert.rejects(pollBlueprintGeneration({ initial, signal: new AbortController().signal,
    read: async () => ({ ...done, job_id: '22222222-2222-4222-8222-222222222222' }), progress: () => {},
    now: () => 0, sleep: async () => {} }), /GENERATION_STATUS_IDENTITY_CHANGED/);
});

test('network failure cannot re-POST and existing SSE fallback/auth/editor path remains', () => {
  const api = readFileSync(new URL('./custom-chat.ts', import.meta.url), 'utf8');
  assert.match(api, /X-Lesson-Author-Job-Key/);
  assert.match(api, /response.status === 202/);
  assert.match(api, /method: 'GET', headers/);
  assert.match(api, /Authorization.*Bearer/);
  assert.match(api, /editor_context: options.editor_context/);
  assert.match(api, /consumeChatEventStream\(response.body/);
  assert.doesNotMatch(source, /method: ['"]POST/);
});
