import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Real organization context rules and query hooks module. Only the network
// client is replaced; nothing here renders.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const mocks = { './custom-client': { customApiClient: {} } };
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      return load([`${base}.ts`, `${base}.tsx`, base].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile()));
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  loaded.set(file, module.exports);
  return module.exports;
}
const logic = load(path.join(directory, 'workspace-org-context.logic.ts'));
const hooks = load(path.join(src, 'hooks/queries/use-workspace-org-context.ts'));
const contract = load(path.join(src, 'api/workspace-org-context.contract.ts'));
const MB = 1024 * 1024;

test('usage: amber from 80 %, red and full at the limit; the bar never reads full before it is', () => {
  const limit = 50 * MB;
  assert.deepEqual(logic.orgContextUsage(0, limit), { percent: 0, level: 'normal' });
  assert.deepEqual(logic.orgContextUsage(39.9 * MB, limit), { percent: 80, level: 'normal' });
  assert.deepEqual(logic.orgContextUsage(40 * MB, limit), { percent: 80, level: 'warning' });
  assert.deepEqual(logic.orgContextUsage(limit - 1, limit), { percent: 99, level: 'warning' });
  assert.deepEqual(logic.orgContextUsage(limit, limit), { percent: 100, level: 'full' });
  assert.deepEqual(logic.orgContextUsage(limit + 10, limit), { percent: 100, level: 'full' });
});

test('sizes: Vietnamese decimal comma, one decimal, used space rounds down and never shows 0 when something is stored', () => {
  assert.equal(logic.formatOrgContextUsage(13_003_000, 52_428_800, 'vi'), '12,4 MB / 50 MB');
  assert.equal(logic.formatOrgContextUsage(13_003_000, 52_428_800, 'en'), '12.4 MB / 50 MB');
  assert.equal(logic.formatOrgContextUsage(0, 52_428_800, 'vi'), '0 MB / 50 MB');
  assert.equal(logic.formatOrgContextUsage(2_000, 52_428_800, 'vi'), '0,1 MB / 50 MB');
  assert.equal(logic.formatOrgContextUsage(52_428_799, 52_428_800, 'vi'), '49,9 MB / 50 MB', 'one byte short is not shown as full');
  assert.equal(logic.formatOrgContextMegabytes(1536 * MB, 'vi'), '1.536 MB');
  assert.equal(logic.formatOrgContextFileSize(512, 'vi'), '512 B');
  assert.equal(logic.formatOrgContextFileSize(350_000, 'vi'), '342 KB');
  assert.equal(logic.formatOrgContextFileSize(1_300_000, 'vi'), '1,2 MB');
  assert.equal(logic.formatOrgContextFileSize(1_300_000, 'en'), '1.2 MB');
  assert.equal(logic.formatOrgContextDate('2026-10-20T12:00:00.000Z', 'vi'), '20/10/2026');
  assert.match(logic.formatOrgContextDate('2026-10-20T12:00:00.000Z', 'en'), /^10\/20\/2026$/);
});

test('upload check: one supported non-empty file of up to 50 MB that still fits the space', () => {
  const usage = { usedBytes: 49 * MB, limitBytes: 50 * MB };
  assert.equal(logic.orgContextUploadProblem({ name: 'Gioi thieu.PDF', size: 100 }, usage), null);
  for (const name of ['a.docx', 'a.doc', 'a.pptx', 'a.txt', 'a.md', 'a.csv']) assert.equal(logic.orgContextUploadProblem({ name, size: 1 }, usage), null);
  for (const file of [{ name: 'video.mp4', size: 10 }, { name: 'a.xlsx', size: 10 }, { name: 'a.pdf', size: 0 }, { name: 'a.pdf', size: 50 * MB + 1 }]) {
    assert.equal(logic.orgContextUploadProblem(file, { usedBytes: 0, limitBytes: 50 * MB }), 'file');
  }
  assert.equal(logic.orgContextUploadProblem({ name: 'a.pdf', size: MB + 1 }, usage), 'limit');
  assert.equal(logic.orgContextUploadProblem({ name: 'a.pdf', size: MB }, usage), null, 'exactly the limit still fits');
  assert.equal(logic.ORG_CONTEXT_FILE_ACCEPT, '.pdf,.doc,.docx,.pptx,.txt,.md,.csv');
});

const draft = (patch = {}) => ({ ...logic.orgProfileDraftFrom(null), ...patch });

test('normalising like the server: NFC, controls removed, spaces collapsed, trimmed; line breaks only in the two long texts', () => {
  assert.equal(logic.normalizeOrgText('  Cửa\u0000  hàng\t\tlớn  ', false), 'Cửa hàng lớn');
  assert.equal(logic.normalizeOrgText('Của', false), 'Của', 'NFC');
  assert.equal(logic.normalizeOrgText('a\nb\r\nc', false), 'a b c');
  assert.equal(logic.normalizeOrgText('\n  Dòng 1  \r\n\r\n  Dòng   2 \u0007\n\n', true), 'Dòng 1\n\nDòng 2');
  const profile = logic.normalizeOrgProfile(draft({ organization_summary: ' Giới thiệu ', products_services: [' Tủ lạnh ', '   ', ''],
    learner_groups: [{ name: ' Bán hàng ', description: '' }, { name: '', description: '' }], glossary: [{ term: '', meaning: '  ' }] }));
  assert.deepEqual(profile, { organization_summary: 'Giới thiệu', products_services: ['Tủ lạnh'], learner_groups: [{ name: 'Bán hàng', description: '' }],
    glossary: [], key_processes: [], culture_tone: '', design_conventions: [] });
  assert.doesNotThrow(() => contract.readOrgProfile(profile), 'a normalised valid draft passes the shared reader');
  assert.equal(logic.isOrgProfileEmpty(logic.normalizeOrgProfile(draft({ products_services: ['  '], culture_tone: '\n' }))), true);
  assert.equal(logic.isOrgProfileEmpty(profile), false);
});

test('live counters and caps per field and in total, with the draft indexes', () => {
  const review = logic.orgProfileReview(draft({
    organization_summary: '😀'.repeat(801), culture_tone: Array(13).fill('x').join('\n'),
    products_services: ['', 'a'.repeat(201), ...Array(15).fill('b')],
    learner_groups: [{ name: '', description: 'Chỉ có mô tả' }, { name: '', description: '' }],
    glossary: [{ term: 'POS', meaning: '' }, { term: 't'.repeat(81), meaning: 'm' }],
  }));
  assert.deepEqual(review.fields.organization_summary, { length: 801, count: null }, 'code points');
  assert.deepEqual(review.fields.products_services, { length: 216, count: 16 }, 'empty items are not counted');
  assert.deepEqual(review.fields.learner_groups, { length: 12, count: 1 }, 'an empty row is dropped');
  assert.deepEqual(review.issues, [
    { kind: 'too_long', field: 'organization_summary', index: null, part: null, max: 800 },
    { kind: 'too_long', field: 'products_services', index: 1, part: null, max: 200 },
    { kind: 'too_many', field: 'products_services', max: 15 },
    { kind: 'required', field: 'learner_groups', index: 0, part: 'name' },
    { kind: 'required', field: 'glossary', index: 0, part: 'meaning' },
    { kind: 'too_long', field: 'glossary', index: 1, part: 'term', max: 80 },
    { kind: 'too_many_lines', field: 'culture_tone', max: 12 },
  ]);
  const big = logic.orgProfileReview(draft({ key_processes: Array(15).fill('p'.repeat(300)), products_services: Array(15).fill('s'.repeat(200)) }));
  assert.equal(big.total, 7500);
  assert.deepEqual(big.issues, [{ kind: 'total_too_long', max: 6000 }]);
  assert.deepEqual(logic.orgProfileReview(draft()).issues, []);
  assert.equal(logic.orgProfileReview(draft()).total, 0);
});

const version = (n, profile) => ({ version: n, origin: 'author_edit', profile, char_count: 0, profile_hash: 'a'.repeat(64),
  created_at: '2026-10-20T00:00:00.000Z', created_by_name: null });
const saved = Object.freeze({ ...logic.EMPTY_ORG_PROFILE, organization_summary: 'Công ty A', products_services: ['Tủ lạnh'] });

test('changes are measured against the version being edited, after normalising', () => {
  const editor = logic.orgProfileEditorFrom({ revision: 3, current: version(2, saved) });
  assert.equal(logic.orgProfileEditorDirty(editor), false);
  assert.deepEqual(logic.orgProfileChangedFields({ ...editor.draft, organization_summary: '  Công   ty A ' }, saved), [], 'spacing alone is no change');
  assert.deepEqual(logic.orgProfileChangedFields({ ...editor.draft, products_services: ['Tủ lạnh', ''] }, saved), [], 'an empty new row is no change');
  assert.deepEqual(logic.orgProfileChangedFields({ ...editor.draft, products_services: ['Máy giặt'], culture_tone: 'Vui' }, saved),
    ['products_services', 'culture_tone']);
  assert.deepEqual(logic.orgProfileChangedFields(draft({ glossary: [{ term: 'A', meaning: 'B' }] }), null), ['glossary']);
});

test('editor follows newer server versions only while it has no changes; an older snapshot never rolls it back', () => {
  const server = { revision: 3, current: version(2, saved) };
  const editor = logic.syncOrgProfileEditor(null, server);
  assert.equal(logic.syncOrgProfileEditor(editor, server), editor, 'same revision: same editor');
  const newer = { revision: 5, current: version(3, { ...saved, culture_tone: 'Thân thiện' }) };
  const followed = logic.syncOrgProfileEditor(editor, newer);
  assert.equal(followed.baseRevision, 5); assert.equal(followed.draft.culture_tone, 'Thân thiện');
  const changed = { ...editor, draft: { ...editor.draft, culture_tone: 'Của tôi' } };
  assert.equal(logic.syncOrgProfileEditor(changed, newer), changed, 'local changes are kept');
  assert.equal(logic.orgProfileEditorStale(changed, newer), true);
  const afterSave = logic.orgProfileEditorFrom({ revision: 6, current: version(4, saved) });
  assert.equal(logic.syncOrgProfileEditor(afterSave, server), afterSave, 'the cached older state before the refetch is ignored');
  assert.equal(logic.orgProfileEditorStale(afterSave, server), false);
});

const profileState = patch => ({ revision: 1, current: null, confirmed_version: null, confirmed_at: null, confirmed_by_name: null, unread_document_count: 0, ...patch });

test('status line and default tab: none, unconfirmed draft (with the version still used), confirmed by whom', () => {
  assert.deepEqual(logic.orgProfileStatus(profileState()), { kind: 'none' });
  assert.deepEqual(logic.orgProfileStatus(profileState({ current: version(1, saved) })), { kind: 'draft', confirmedAt: null });
  assert.deepEqual(logic.orgProfileStatus(profileState({ current: version(3, saved), confirmed_version: 2, confirmed_at: '2026-10-19T00:00:00.000Z' })),
    { kind: 'draft', confirmedAt: '2026-10-19T00:00:00.000Z' });
  assert.deepEqual(logic.orgProfileStatus(profileState({ current: version(2, saved), confirmed_version: 2, confirmed_at: '2026-10-19T00:00:00.000Z', confirmed_by_name: 'Lê C' })),
    { kind: 'confirmed', at: '2026-10-19T00:00:00.000Z', by: 'Lê C' });
  assert.equal(logic.orgContextDefaultTab({ profile: profileState() }), 'context');
  assert.equal(logic.orgContextDefaultTab({ profile: profileState({ confirmed_version: 2 }) }), 'create');
  assert.equal(logic.orgContextLaunchOffer(undefined), null);
  assert.equal(logic.orgContextLaunchOffer({ enabled: false }), null);
  assert.deepEqual(logic.orgContextLaunchOffer({ enabled: true, profile: profileState({ confirmed_version: 2, confirmed_at: '2026-10-19T00:00:00.000Z' }) }),
    { confirmedVersion: 2, confirmedAt: '2026-10-19T00:00:00.000Z' });
});

test('buttons: draft from documents needs a ready server and a read document; save needs a valid change; confirm a valid non-empty unconfirmed profile', () => {
  const base = { ready: true, notReadyReason: null, distillActive: false, learnedCount: 1, busy: false, dirty: false, valid: true, empty: false,
    currentVersion: 2, confirmedVersion: 1 };
  const actions = patch => logic.orgProfileActions({ ...base, ...patch });
  assert.deepEqual(actions(), { editable: true, distill: true, save: false, confirm: true });
  assert.deepEqual(actions({ dirty: true }), { editable: true, distill: true, save: true, confirm: true });
  assert.equal(actions({ confirmedVersion: 2 }).confirm, false, 'already confirmed');
  assert.equal(actions({ confirmedVersion: 2, dirty: true }).confirm, true, 'a change saves and confirms');
  assert.equal(actions({ currentVersion: null, confirmedVersion: null }).confirm, false);
  assert.deepEqual(actions({ dirty: true, valid: false }), { editable: true, distill: true, save: false, confirm: false });
  assert.equal(actions({ dirty: true, empty: true }).confirm, false, 'an empty profile cannot be confirmed');
  assert.equal(actions({ dirty: true, empty: true }).save, true, 'clearing the draft can still be saved');
  assert.equal(actions({ learnedCount: 0 }).distill, false);
  assert.equal(actions({ ready: false, notReadyReason: 'provider_key' }).distill, false);
  assert.equal(actions({ ready: false, notReadyReason: 'provider_key', dirty: true }).save, true, 'editing does not need the AI service');
  assert.deepEqual(actions({ ready: false, notReadyReason: 'schema', dirty: true }), { editable: false, distill: false, save: false, confirm: false });
  assert.deepEqual(actions({ distillActive: true, dirty: true }), { editable: false, distill: false, save: false, confirm: false });
  assert.deepEqual(actions({ busy: true, dirty: true }), { editable: false, distill: false, save: false, confirm: false });
});

const read = patch => ({ enabled: true, documents: [], distill: { status: 'idle' }, ...patch });

test('hooks: poll every 5 s only while a document is being read or a draft is queued or running, and only on a visible tab', () => {
  assert.equal(hooks.ORG_CONTEXT_POLL_MS, 5000);
  assert.equal(hooks.orgContextPollInterval(undefined, 'visible'), false);
  assert.equal(hooks.orgContextPollInterval({ enabled: false }, 'visible'), false);
  assert.equal(hooks.orgContextPollInterval(read(), 'visible'), false);
  assert.equal(hooks.orgContextPollInterval(read({ documents: [{ status: 'learned' }, { status: 'error' }] }), 'visible'), false);
  assert.equal(hooks.orgContextPollInterval(read({ documents: [{ status: 'learned' }, { status: 'learning' }] }), 'visible'), 5000);
  assert.equal(hooks.orgContextPollInterval(read({ distill: { status: 'queued' } }), 'visible'), 5000);
  assert.equal(hooks.orgContextPollInterval(read({ distill: { status: 'running' } }), undefined), 5000);
  assert.equal(hooks.orgContextPollInterval(read({ distill: { status: 'failed' } }), 'visible'), false);
  assert.equal(hooks.orgContextPollInterval(read({ distill: { status: 'running' } }), 'hidden'), false);
  const source = readFileSync(path.join(src, 'hooks/queries/use-workspace-org-context.ts'), 'utf8');
  assert.match(source, /refetchInterval: query => orgContextPollInterval\(query\.state\.data, visibility\(\)\)/);
  assert.doesNotMatch(source, /setInterval|setTimeout|localStorage|sessionStorage/);
});

test('hooks: keys carry the tenant; reads retry once and only when the server could not answer', () => {
  assert.deepEqual(hooks.orgContextKeys.state('t1'), ['lesson-author-org-context', 't1', 'state']);
  assert.deepEqual(hooks.orgContextKeys.version('t1', 3), ['lesson-author-org-context', 't1', 'version', 3]);
  assert.notDeepEqual(hooks.orgContextKeys.state('t1'), hooks.orgContextKeys.state('t2'));
  const error = (status, code = 'X') => ({ response: { status, data: { code } } });
  assert.equal(hooks.shouldRetryOrgContextRead(0, { request: {} }), true);
  assert.equal(hooks.shouldRetryOrgContextRead(0, error(503)), true);
  assert.equal(hooks.shouldRetryOrgContextRead(1, error(503)), false);
  for (const status of [400, 401, 403, 404, 409]) assert.equal(hooks.shouldRetryOrgContextRead(0, error(status)), false);
  assert.equal(hooks.shouldRetryOrgContextRead(0, new contract.OrgContextError('ORG_CONTEXT_CONTRACT_INVALID', null, null)), false);
});

test('a stored text that the screen would normalise differently never shows as changed just because it was opened', () => {
  const stored = Object.freeze({ ...logic.EMPTY_ORG_PROFILE, organization_summary: 'Hai  khoảng trắng', products_services: ['  Tủ lạnh'] });
  const editor = logic.orgProfileEditorFrom({ revision: 1, current: version(1, stored) });
  assert.deepEqual(logic.orgProfileChangedFields(editor.draft, stored), []);
  assert.equal(logic.orgProfileEditorDirty(editor), false);
  assert.deepEqual(logic.orgProfileChangedFields({ ...editor.draft, organization_summary: 'Khác' }, stored), ['organization_summary']);
});
