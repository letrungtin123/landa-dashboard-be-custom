import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const contractUrl = compile(readFileSync(new URL('../../api/lesson-author-workspace.contract.ts', import.meta.url), 'utf8'));
const inert = compile('export const customApiClient = {};');
const writeUrl = compile(readFileSync(new URL('../../api/workspace-write.ts', import.meta.url), 'utf8')
  .replace("'./custom-client'", JSON.stringify(inert)).replace("'./lesson-author-workspace.contract'", JSON.stringify(contractUrl)));
const { WorkspaceWriteError } = await import(writeUrl);
const { createWorkspaceWriteState } = await import(compile(readFileSync(new URL('./workspace-write-state.ts', import.meta.url), 'utf8')
  .replace("'../../api/lesson-author-workspace.contract'", JSON.stringify(contractUrl))
  .replace("'../../api/workspace-write'", JSON.stringify(writeUrl))));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const identity = { workspaceId: id(1), nodeId: id(2), correlationId: id(3), contentLocale: 'vi' };
const content = { title: 'Original', purpose: null, data: { html: '<p>Content</p>' }, implementation_notes: null };
const edited = { ...content, title: 'Author edit' };
const detail = (revision = 0, value = content) => ({ workspace_id: id(1), node_id: id(2), correlation_id: id(3),
  content_locale: 'vi', contract_version: 1, status: 'drafting', last_event_sequence: revision + 1,
  updated_at: '2026-09-29T00:00:00Z', parent_id: null, kind: 'course', content_state: 'content_ready',
  current_revision: revision, content: structuredClone(value), user_modified: revision > 0, validation_contract: 'workspace-aggregate-edit-1' });
const receipt = (request, kind, current = request.expected_revision + 1) => ({ workspace_id: id(1), node_id: id(2),
  correlation_id: id(3), operation_id: request.operation_id, revision: request.expected_revision + 1,
  current_revision: current, content_hash: 'a'.repeat(64), user_modified: kind === 'save',
  event_sequence: request.expected_revision + 2, replayed: current !== request.expected_revision + 1 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  const calls = []; let sequence = 10;
  const client = { async save(nodeId, request, options) { calls.push({ kind: 'save', nodeId, request, options }); return receipt(request, 'save'); },
    async reset(nodeId, request, options) { calls.push({ kind: 'reset', nodeId, request, options }); return receipt(request, 'reset'); } };
  const store = createWorkspaceWriteState(client, identity, { operationId: () => id(sequence++) });
  return { calls, client, store };
}

test('creation, reads, edits, locale changes and subscription never dispatch; Save snapshots exact CAS', async () => {
  const f = fixture(); f.store.subscribe(() => {});
  assert.throws(() => f.store.save(), /READ_REQUIRED/);
  f.store.observeDetail(detail()); f.store.setDraft(edited); f.store.setUiLocale('en');
  assert.equal(f.calls.length, 0); await f.store.save();
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].request, { operation_id: id(10), expected_revision: 0, changes: edited });
  assert.equal(f.calls[0].options.uiLocale, 'en'); assert.equal(f.store.getState().detail.content_locale, 'vi');
  assert.equal(f.store.getState().phase, 'committed'); assert.equal(f.store.getState().draft.content.title, edited.title);
  assert.equal(f.store.getState().readRequired, true);
  f.store.observeDetail(detail(1, edited));
  assert.equal(f.store.getState().draft, null); assert.equal(f.store.getState().readRequired, false);
});

test('committed Save reconciles canonical server content without leaving a false dirty draft', async () => {
  const f = fixture();
  const browserDraft = { ...edited, data: { html: '<p>Edited</p><p><br></p>' } };
  const canonicalServer = { ...edited, data: { html: '<p>Edited</p>' } };
  f.store.observeDetail(detail()); f.store.setDraft(browserDraft); await f.store.save();
  f.store.observeDetail(detail(1, canonicalServer));
  assert.equal(f.store.getState().draft, null);
  assert.deepEqual(f.store.getState().detail.content, canonicalServer);
  assert.equal(f.store.getState().readRequired, false);
});

test('double-click and listener reentry cannot overlap writes; later typing survives acknowledgement', async () => {
  const f = fixture(), wait = deferred();
  f.client.save = async (nodeId, request) => { f.calls.push(request); await wait.promise; return receipt(request, 'save'); };
  f.store.observeDetail(detail()); f.store.setDraft(edited);
  f.store.subscribe(() => { if (f.store.getState().phase === 'sending') assert.throws(() => f.store.save(), /BUSY/); });
  const pending = f.store.save(); assert.throws(() => f.store.save(), /BUSY/);
  f.store.setDraft({ ...edited, title: 'Typed while sending' });
  wait.resolve(); await pending; f.store.observeDetail(detail(1, edited));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].changes.title, 'Author edit');
  assert.equal(f.store.getState().draft.content.title, 'Typed while sending');
  assert.equal(f.store.getState().draft.baseRevision, 0); assert.equal(f.store.getState().draft.conflict, true);
  assert.throws(() => f.store.save(), /REVISION_CONFLICT/);
  f.store.rebaseDraft(1); await f.store.save(); assert.equal(f.calls[1].expected_revision, 1);
});

test('unknown outcome blocks new operations and requires read plus explicit identical replay', async () => {
  const f = fixture(); let attempt = 0;
  f.client.save = async (nodeId, request) => {
    f.calls.push(structuredClone(request)); if (++attempt === 1) throw new Error('timeout after commit');
    return { ...receipt(request, 'save'), replayed: true };
  };
  f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
  assert.equal(f.store.getState().phase, 'unknown'); assert.equal(f.calls.length, 1);
  assert.throws(() => f.store.replay(), /READ_REQUIRED/);
  f.store.setDraft({ ...edited, title: 'New local text' }); f.store.observeDetail(detail(1, edited));
  assert.equal(f.calls.length, 1); assert.equal(f.store.getState().phase, 'unknown');
  assert.throws(() => f.store.save(), /READ_REQUIRED/);
  assert.throws(() => f.store.reset({ confirmed: true, expectedRevision: 1 }), /READ_REQUIRED/);
  assert.throws(() => f.store.discardDraft(), /BUSY/);
  await f.store.replay(); assert.deepEqual(f.calls[0], f.calls[1]);
  assert.equal(f.store.getState().receipt.replayed, true);
  f.store.observeDetail(detail(1, edited)); assert.equal(f.store.getState().draft.content.title, 'New local text');
});

test('replayed old receipt never rewinds current revision or clears a draft against newer content', async () => {
  const f = fixture(); let attempt = 0;
  f.client.save = async (_node, request) => {
    if (++attempt === 1) throw new Error('lost reply'); return receipt(request, 'save', 3);
  };
  f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
  f.store.observeDetail(detail(3, { ...edited, title: 'Newer server edit' })); await f.store.replay();
  f.store.observeDetail(detail(1, edited));
  assert.equal(f.store.getState().detail.current_revision, 3);
  assert.equal(f.store.getState().receipt.revision, 1);
  assert.equal(f.store.getState().draft.baseRevision, 0);
  f.store.observeDetail(detail(3, { ...edited, title: 'Newer server edit' }));
  assert.equal(f.store.getState().draft.conflict, true); assert.equal(f.store.getState().draft.content.title, edited.title);
});

test('typed auth/source/conflict failures retain drafts and require fresh reads', async () => {
  for (const code of ['AUTH_REQUIRED', 'WORKSPACE_EDIT_FORBIDDEN', 'WORKSPACE_EDIT_DISABLED', 'WORKSPACE_EDIT_NOT_FOUND',
    'WORKSPACE_REVISION_CONFLICT', 'WORKSPACE_SOURCE_CHANGED',
    'WORKSPACE_EDIT_IDEMPOTENCY_CONFLICT', 'WORKSPACE_NODE_NOT_READY', 'WORKSPACE_EDIT_STATE_INVALID']) {
    const f = fixture(); f.client.save = async () => { throw new WorkspaceWriteError(code); };
    f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
    assert.equal(f.store.getState().phase, 'rejected'); assert.equal(f.store.getState().error.code, code);
    assert.equal(f.store.getState().draft.content.title, edited.title); assert.throws(() => f.store.save(), /READ_REQUIRED/);
  }
});

test('typed validation/input rejection retains the exact authorized revision for correction', async () => {
  for (const code of ['WORKSPACE_EDIT_VALIDATION_REQUIRED', 'WORKSPACE_EDIT_INPUT_INVALID']) {
    const f = fixture(); f.client.save = async () => { throw new WorkspaceWriteError(code); };
    f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
    assert.equal(f.store.getState().phase, 'rejected'); assert.equal(f.store.getState().error.code, code);
    assert.equal(f.store.getState().draft.content.title, edited.title);
    assert.equal(f.store.getState().readRequired, false);
    await f.store.save();
  }
});

test('a later source/auth rejection cannot erase uncertainty about an earlier operation', async () => {
  const f = fixture(); let attempt = 0;
  f.client.save = async () => { if (++attempt === 1) throw new Error('lost response'); throw new WorkspaceWriteError('WORKSPACE_SOURCE_CHANGED'); };
  f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
  f.store.observeDetail(detail(1, edited)); await f.store.replay();
  assert.equal(f.store.getState().phase, 'unknown'); assert.equal(f.store.getState().operation.request.operation_id, id(10));
  f.store.observeDetail(detail(1, edited)); assert.throws(() => f.store.save(), /READ_REQUIRED/);
});

test('Reset requires exact confirmation revision and clears unchanged dirty text only after exact baseline readback', async () => {
  const f = fixture(); f.store.observeDetail(detail(2, edited)); f.store.setDraft({ ...edited, title: 'Local work' });
  assert.throws(() => f.store.reset({ confirmed: false, expectedRevision: 2 }), /CONFIRMATION_REQUIRED/);
  assert.throws(() => f.store.reset({ confirmed: true, expectedRevision: 1 }), /REVISION_CONFLICT/);
  assert.equal(f.calls.length, 0);
  await f.store.reset({ confirmed: true, expectedRevision: 2 });
  assert.deepEqual(f.calls[0].request, { operation_id: id(10), expected_revision: 2 });
  assert.equal(f.store.getState().detail.content.title, edited.title, 'never invent baseline content');
  assert.equal(f.store.getState().draft.content.title, 'Local work');
  f.store.observeDetail(detail(3, edited));
  assert.equal(f.store.getState().draft.content.title, 'Local work', 'user_modified must confirm baseline');
  f.store.observeDetail({ ...detail(3, content), user_modified: false });
  assert.equal(f.store.getState().draft, null);
  assert.equal(f.store.getState().detail.user_modified, false); assert.equal(f.store.getState().receipt.user_modified, false);
});

test('Reset preserves newer local edits, rejected/unknown drafts and drafts when a newer server revision supersedes its receipt', async () => {
  for (const mode of ['typed', 'rejected', 'unknown', 'superseded']) {
    const f = fixture(), wait = deferred();
    f.store.observeDetail(detail(2, edited)); f.store.setDraft(edited);
    f.client.reset = async (_node, request) => {
      await wait.promise;
      if (mode === 'rejected') throw new WorkspaceWriteError('WORKSPACE_REVISION_CONFLICT');
      if (mode === 'unknown') throw new Error('lost reply');
      return receipt(request, 'reset');
    };
    const pending = f.store.reset({ confirmed: true, expectedRevision: 2 });
    if (mode === 'typed') f.store.setDraft({ ...edited, title: 'Newer local edit' });
    wait.resolve(); await pending;
    f.store.observeDetail({ ...detail(mode === 'superseded' ? 4 : 3, content), user_modified: false });
    assert.equal(f.store.getState().draft.content.title, mode === 'typed' ? 'Newer local edit' : edited.title);
  }
});

test('stale, foreign or malformed reads cannot grant fresh write eligibility', async () => {
  const f = fixture(); f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
  f.store.observeDetail(detail()); assert.equal(f.store.getState().readRequired, true);
  f.store.observeDetail(detail(1, edited));
  for (const change of [{ workspace_id: id(8) }, { node_id: id(8) }, { correlation_id: id(8) }, { content_locale: 'en' }, { contract_version: 99 }]) {
    assert.throws(() => f.store.observeDetail({ ...detail(1, edited), ...change }));
    assert.equal(f.store.getState().readRequired, true);
  }
  f.store.observeDetail(detail(1, edited)); f.store.invalidateRead(); assert.throws(() => f.store.reset({ confirmed: true, expectedRevision: 1 }), /READ_REQUIRED/);
});

test('invalid/wrong-correlation receipt is unknown and cannot clear draft', async () => {
  const f = fixture(); f.client.save = async (_node, request) => ({ ...receipt(request, 'save'), correlation_id: id(99) });
  f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
  assert.equal(f.store.getState().phase, 'unknown'); assert.equal(f.store.getState().receipt, null);
  assert.equal(f.store.getState().draft.content.title, edited.title);
});

test('operation IDs are unique across new requests; disposal ignores late replies and does not claim rollback', async () => {
  const f = fixture(), wait = deferred(); let signal;
  f.client.save = async (_node, request, options) => { signal = options.signal; await wait.promise; return receipt(request, 'save'); };
  f.store.observeDetail(detail()); f.store.setDraft(edited);
  const pending = f.store.save(); await Promise.resolve(); f.store.dispose();
  assert.equal(signal.aborted, true); wait.resolve(); await pending;
  assert.equal(f.store.getState().receipt, null); assert.equal(f.store.getState().detail, null);
  assert.throws(() => f.store.save(), /STATE_INVALID/);
  const client = { save: async (_n, r) => receipt(r, 'save') };
  const repeated = createWorkspaceWriteState(client, identity, { operationId: () => id(44) });
  repeated.observeDetail(detail()); repeated.setDraft(edited); await repeated.save(); repeated.observeDetail(detail(1, edited));
  repeated.setDraft({ ...edited, title: 'Next' }); assert.throws(() => repeated.save(), /IDEMPOTENCY_CONFLICT/);
});

test('known noneditable run/node states block new writes, while explicit replay can recover a committed operation after run termination', async () => {
  for (const status of ['queued', 'designing', 'failed', 'canceled']) {
    const f = fixture(); f.store.observeDetail({ ...detail(), status }); f.store.setDraft(edited);
    assert.throws(() => f.store.save(), /STATE_INVALID/); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.store.observeDetail({ ...detail(), content_state: 'planned', current_revision: null, content: null,
    user_modified: false, validation_contract: null });
  assert.throws(() => f.store.reset({ confirmed: true, expectedRevision: 0 }), /NODE_NOT_READY/);
  let attempt = 0;
  f.client.save = async (_node, request) => { if (++attempt === 1) throw new Error('lost reply'); return { ...receipt(request, 'save'), replayed: true }; };
  f.store.observeDetail(detail()); f.store.setDraft(edited); await f.store.save();
  f.store.observeDetail({ ...detail(1, edited), status: 'failed' });
  await f.store.replay(); assert.equal(f.store.getState().receipt.replayed, true);
});

test('disposal from the sending observer prevents dispatch', async () => {
  const f = fixture(); f.store.observeDetail(detail()); f.store.setDraft(edited);
  f.store.subscribe(() => { if (f.store.getState().phase === 'sending') f.store.dispose(); });
  await f.store.save(); assert.equal(f.calls.length, 0);
});
