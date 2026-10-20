/* global FormData */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Real organization context contract, client and error copy with the real
// VI/EN locales. Only the network client is replaced.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '..');
const mocks = { './custom-client': { customApiClient: {} } };
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
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
const contract = load(path.join(directory, 'workspace-org-context.contract.ts'));
const { createOrgContextApi } = load(path.join(directory, 'workspace-org-context.ts'));
const locales = { vi: load(path.join(src, 'i18n/locales/vi.ts')).vi, en: load(path.join(src, 'i18n/locales/en.ts')).en };
function t(locale, key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[locale]);
  assert.equal(typeof value, 'string', `missing ${locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
const message = (locale, error) => {
  const copy = contract.orgContextErrorMessage(error);
  return t(locale, copy.key, { field: copy.field ? t(locale, `aiIdOrgContext.profile.fields.${copy.field}.label`) : '',
    limit: copy.limitBytes ? `${copy.limitBytes / 1048576} MB` : '' });
};

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = 'a'.repeat(64);
const profile = (patch = {}) => ({ organization_summary: 'Công ty bán lẻ điện máy.\nHơn 200 cửa hàng.', products_services: ['Tủ lạnh', 'Máy giặt'],
  learner_groups: [{ name: 'Nhân viên bán hàng', description: 'Tư vấn tại cửa hàng' }], glossary: [{ term: 'POS', meaning: 'Máy tính tiền' }],
  key_processes: ['Đổi trả trong 7 ngày'], culture_tone: 'Thân thiện', design_conventions: [], ...patch });
const version = (n, patch = {}) => ({ version: n, origin: 'ai_draft', profile: profile(), char_count: 120, profile_hash: hash,
  created_at: '2026-10-20T05:00:00.000Z', created_by_name: 'Nguyễn Văn A', ...patch });
const documentRow = (n, patch = {}) => ({ id: id(n), name: `Gioi-thieu-${n}.pdf`, size_bytes: 1_300_000, status: 'learned', error_reason: null,
  created_at: '2026-10-20T04:00:00.000Z', created_by_name: 'Trần Thị B', ...patch });
const state = (patch = {}) => ({ enabled: true, ready: true, not_ready_reason: null, limit_bytes: 52_428_800, used_bytes: 13_002_342,
  documents: [documentRow(1), documentRow(2, { status: 'learning' })],
  profile: { revision: 4, current: version(2), confirmed_version: 1, confirmed_at: '2026-10-19T03:00:00.000Z', confirmed_by_name: 'Lê C', unread_document_count: 1 },
  distill: { status: 'idle', requested_at: null, finished_at: '2026-10-20T05:00:00.000Z', error_code: null },
  history: [{ version: 2, origin: 'ai_draft', char_count: 120, created_at: '2026-10-20T05:00:00.000Z', created_by_name: null },
    { version: 1, origin: 'author_edit', char_count: 90, created_at: '2026-10-19T03:00:00.000Z', created_by_name: 'Lê C' }],
  ...patch });

test('GET state: the feature off is just {enabled:false}; a full state is read, frozen, and extra keys are not forwarded', () => {
  assert.deepEqual(contract.readOrgContextRead({ enabled: false, documents: 'ignored' }), { enabled: false });
  const read = contract.readOrgContextRead({ ...state(), extra: 'x', profile: { ...state().profile, secret: 1 } });
  assert.equal(read.enabled, true);
  assert.equal(read.documents.length, 2);
  assert.equal(read.profile.current.profile.products_services[1], 'Máy giặt');
  assert.equal(Object.hasOwn(read, 'extra'), false);
  assert.equal(Object.hasOwn(read.profile, 'secret'), false);
  for (const value of [read, read.documents, read.documents[0], read.profile, read.profile.current, read.profile.current.profile,
    read.profile.current.profile.glossary, read.distill, read.history]) assert.ok(Object.isFrozen(value));
  const notReady = contract.readOrgContextRead(state({ ready: false, not_ready_reason: 'schema', documents: [], history: [],
    profile: { ...state().profile, current: null, confirmed_version: null, confirmed_at: null, confirmed_by_name: null, unread_document_count: 0 } }));
  assert.equal(notReady.not_ready_reason, 'schema');
  for (const reason of contract.ORG_CONTEXT_NOT_READY_REASONS) {
    assert.doesNotThrow(() => contract.readOrgContextRead(state({ ready: false, not_ready_reason: reason })));
  }
});

test('GET state: anything outside the contract fails closed', () => {
  const base = state();
  const bad = [
    null, [], {}, { enabled: 'true' }, { ...base, enabled: undefined },
    { ...base, ready: false }, { ...base, not_ready_reason: 'engine' }, { ...base, ready: false, not_ready_reason: 'other' },
    { ...base, limit_bytes: 0 }, { ...base, used_bytes: -1 }, { ...base, used_bytes: '1' },
    { ...base, documents: [documentRow(1, { status: 'deleting' })] }, { ...base, documents: [documentRow(1), documentRow(1)] },
    { ...base, documents: [documentRow(1, { id: 'local' })] }, { ...base, documents: [documentRow(1, { name: '  ' })] },
    { ...base, documents: [documentRow(1, { size_bytes: 1.5 })] }, { ...base, documents: [documentRow(1, { created_at: 'yesterday' })] },
    { ...base, history: Array.from({ length: 21 }, (_, n) => ({ ...base.history[0], version: n + 1 })) },
    { ...base, history: [{ ...base.history[0], origin: 'import' }] },
    { ...base, distill: { ...base.distill, status: 'done' } },
    { ...base, profile: { ...base.profile, revision: '4' } }, { ...base, profile: { ...base.profile, revision: -1 } },
    { ...base, profile: { ...base.profile, confirmed_version: 0 } }, { ...base, profile: { ...base.profile, unread_document_count: null } },
    { ...base, profile: { ...base.profile, current: version(2, { profile_hash: 'A'.repeat(64) }) } },
    { ...base, profile: { ...base.profile, current: version(2, { char_count: 6001 }) } },
  ];
  for (const value of bad) assert.throws(() => contract.readOrgContextRead(value), { code: 'ORG_CONTEXT_CONTRACT_INVALID' });
});

test('profile: exactly the 7 keys within the caps, counted in code points', () => {
  const ok = value => contract.readOrgProfile(profile(value));
  assert.equal(ok({ organization_summary: '😀'.repeat(800) }).organization_summary.length, 1600, 'code points, not UTF-16 units');
  assert.ok(ok({ organization_summary: Array(12).fill('dòng').join('\n') }));
  assert.ok(ok({ products_services: Array(15).fill('a'), design_conventions: Array(10).fill('b'.repeat(200)) }));
  assert.ok(ok({ glossary: Array.from({ length: 40 }, () => ({ term: 't'.repeat(80), meaning: 'm' })) }));
  assert.ok(ok({ learner_groups: [{ name: 'n', description: '' }] }), 'a group description may be empty');
  assert.equal(contract.orgProfileCharCount(contract.readOrgProfile(profile())), [...'Công ty bán lẻ điện máy.\nHơn 200 cửa hàng.'].length
    + [...'Tủ lạnhMáy giặtNhân viên bán hàngTư vấn tại cửa hàngPOSMáy tính tiềnĐổi trả trong 7 ngàyThân thiện'].length);
  const bad = [
    { organization_summary: '😀'.repeat(801) }, { organization_summary: Array(13).fill('x').join('\n') }, { culture_tone: 'c'.repeat(601) },
    { products_services: Array(16).fill('a') }, { products_services: [''] }, { products_services: ['a'.repeat(201)] }, { products_services: 'a' },
    { key_processes: ['p'.repeat(301)] }, { design_conventions: Array(11).fill('d') },
    { learner_groups: [{ name: '', description: 'd' }] }, { learner_groups: [{ name: 'n' }] }, { learner_groups: Array(13).fill({ name: 'n', description: '' }) },
    { glossary: [{ term: 't', meaning: '' }] }, { glossary: [{ term: 't', meaning: 'm', note: 'x' }] }, { glossary: Array(41).fill({ term: 't', meaning: 'm' }) },
    { key_processes: Array(15).fill('p'.repeat(300)), products_services: Array(15).fill('s'.repeat(200)) },
    { extra: '' },
  ];
  for (const value of bad) assert.throws(() => contract.readOrgProfile(profile(value)), { code: 'ORG_CONTEXT_CONTRACT_INVALID' });
  const missing = profile(); delete missing.culture_tone;
  assert.throws(() => contract.readOrgProfile(missing));
});

function transport(answer = { status: 200, data: { success: true, data: state() } }) {
  const calls = [];
  const reply = async (...args) => { calls.push(args); if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer(...args) : answer; };
  return { calls, client: { get: reply, post: reply, put: reply, delete: reply } };
}

test('client: routes, bodies and options match the backend API; answers are read strictly', async () => {
  const get = transport();
  const api = createOrgContextApi(get.client);
  const signal = new AbortController().signal;
  assert.equal((await api.state(signal)).enabled, true);
  assert.deepEqual(get.calls[0], ['/api/ai-chatbot/chat/lesson-author/org-context', { signal, headers: { 'Cache-Control': 'no-cache' } }]);

  const upload = transport({ status: 201, data: { success: true, data: { document: documentRow(5, { status: 'learning' }) } } });
  const progress = [];
  const file = new File(['abc'], 'Gioi thieu.pdf', { type: 'application/pdf' });
  const uploaded = await createOrgContextApi(upload.client).upload(file, { onProgress: value => progress.push(value) });
  assert.equal(uploaded.status, 'learning');
  const [url, form, options] = upload.calls[0];
  assert.equal(url, '/api/ai-chatbot/chat/lesson-author/org-context/documents');
  assert.ok(form instanceof FormData); assert.equal(form.get('file').name, 'Gioi thieu.pdf');
  assert.equal(options.timeout, 120_000); assert.deepEqual(options.headers, { 'Content-Type': 'multipart/form-data' });
  options.onUploadProgress({ loaded: 50, total: 200 }); options.onUploadProgress({ loaded: 5 });
  assert.deepEqual(progress, [25, null]);

  const removed = transport({ status: 202, data: '' });
  await createOrgContextApi(removed.client).removeDocument(id(5));
  assert.deepEqual(removed.calls[0], [`/api/ai-chatbot/chat/lesson-author/org-context/documents/${id(5)}`]);
  await assert.rejects(createOrgContextApi(removed.client).removeDocument('../x'), { code: 'ORG_CONTEXT_INPUT_INVALID' });
  assert.equal(removed.calls.length, 1, 'an invalid id is never sent');

  const distill = transport({ status: 202, data: { success: true, data: { revision: 5, distill: { status: 'queued', requested_at: '2026-10-20T06:00:00.000Z', finished_at: null, error_code: null } } } });
  assert.equal((await createOrgContextApi(distill.client).distill({ expected_revision: 4, locale: 'vi' })).distill.status, 'queued');
  assert.deepEqual(distill.calls[0], ['/api/ai-chatbot/chat/lesson-author/org-context/profile/distill', { expected_revision: 4, locale: 'vi' }]);
  await assert.rejects(createOrgContextApi(distill.client).distill({ expected_revision: 4, locale: 'fr' }), { code: 'ORG_CONTEXT_INPUT_INVALID' });

  const save = transport({ status: 200, data: { success: true, data: { revision: 6, current: version(3, { origin: 'author_edit' }), confirmed_version: 3 } } });
  const saved = await createOrgContextApi(save.client).saveProfile({ expected_revision: 5, profile: profile(), confirm: true });
  assert.equal(saved.confirmed_version, 3);
  assert.deepEqual(save.calls[0], ['/api/ai-chatbot/chat/lesson-author/org-context/profile', { expected_revision: 5, profile: profile(), confirm: true }]);
  for (const body of [{ expected_revision: 5, profile: profile({ products_services: [''] }), confirm: false },
    { expected_revision: 5, profile: profile(), confirm: 'yes' }, { expected_revision: -1, profile: profile(), confirm: false }]) {
    await assert.rejects(createOrgContextApi(save.client).saveProfile(body), { code: 'ORG_CONTEXT_INPUT_INVALID' });
  }
  assert.equal(save.calls.length, 1, 'an unsaveable profile is refused before the PUT');

  const restore = transport({ status: 200, data: { success: true, data: { revision: 7, current: version(4, { origin: 'restore' }) } } });
  assert.equal((await createOrgContextApi(restore.client).restore({ expected_revision: 6, version: 1 })).current.origin, 'restore');
  assert.deepEqual(restore.calls[0], ['/api/ai-chatbot/chat/lesson-author/org-context/profile/restore', { expected_revision: 6, version: 1 }]);

  const one = transport({ status: 200, data: { success: true, data: { version: version(1) } } });
  assert.equal((await createOrgContextApi(one.client).version(1, signal)).version, 1);
  assert.deepEqual(one.calls[0], ['/api/ai-chatbot/chat/lesson-author/org-context/profile/versions/1', { signal }]);
  await assert.rejects(createOrgContextApi(one.client).version(0), { code: 'ORG_CONTEXT_INPUT_INVALID' });

  for (const answer of [{ status: 200, data: { success: false } }, { status: 200, data: { success: true, data: { revision: 1 } } }, { status: 200 }]) {
    await assert.rejects(createOrgContextApi(transport(answer).client).restore({ expected_revision: 1, version: 1 }), { code: 'ORG_CONTEXT_CONTRACT_INVALID' });
  }
});

test('client: refusals keep the server code, status and details; no answer is a connection failure', async () => {
  const refusal = Object.assign(new Error('409'), { response: { status: 409, data: { success: false, code: 'ORG_CONTEXT_LIMIT_REACHED',
    message: 'raw', details: { used_bytes: 52_000_000, limit_bytes: 52_428_800 } } } });
  await assert.rejects(createOrgContextApi(transport(refusal).client).state(), error => {
    assert.ok(error instanceof contract.OrgContextError);
    assert.equal(error.code, 'ORG_CONTEXT_LIMIT_REACHED'); assert.equal(error.status, 409);
    assert.deepEqual(error.details, { used_bytes: 52_000_000, limit_bytes: 52_428_800 });
    return true;
  });
  await assert.rejects(createOrgContextApi(transport(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', request: {} })).client).state(),
    { code: 'ORG_CONTEXT_CONNECTION', status: null });
  const odd = contract.readOrgContextFailure({ response: { status: 500, data: { code: 'lower case <b>', details: ['x'] } } });
  assert.equal(odd.code, 'ORG_CONTEXT_FAILED'); assert.equal(odd.details, null);
});

const failure = (code, status, details) => ({ response: { status, data: { success: false, code, message: 'Thông báo thô', details } } });

test('error copy: the owner wording for a full space and a conflict, in both languages', () => {
  assert.equal(message('vi', failure('ORG_CONTEXT_LIMIT_REACHED', 409, { used_bytes: 52_000_000, limit_bytes: 52_428_800 })),
    'Đã dùng hết 50 MB dành cho ngữ cảnh. Hãy xoá bớt tài liệu cũ rồi tải lại.');
  assert.equal(message('en', failure('ORG_CONTEXT_LIMIT_REACHED', 409, { limit_bytes: 52_428_800 })),
    'The 50 MB for context documents is used up. Delete some older documents, then upload again.');
  assert.equal(message('vi', failure('ORG_CONTEXT_REVISION_CONFLICT', 409)), 'Hồ sơ vừa được người khác cập nhật. Hãy tải lại để xem bản mới.');
  assert.equal(message('en', failure('ORG_CONTEXT_REVISION_CONFLICT', 409)), 'Someone else has just updated the profile. Reload to see the new version.');
  assert.deepEqual(contract.orgContextErrorMessage(failure('ORG_CONTEXT_LIMIT_REACHED', 409)), { key: 'aiIdOrgContext.errors.limitReached' },
    'without details the screen fills the limit it shows');
});

test('error copy: every refusal has its own plain message without codes, abbreviations or status numbers', () => {
  const cases = [
    [failure('ORG_CONTEXT_DISTILL_RUNNING', 409), 'aiIdOrgContext.errors.distillRunning'],
    [failure('ORG_CONTEXT_NO_LEARNED_DOCUMENTS', 409), 'aiIdOrgContext.errors.noLearnedDocuments'],
    [failure('ORG_CONTEXT_FILE_INVALID', 400), 'aiIdOrgContext.errors.fileInvalid'],
    [failure('PAYLOAD_TOO_LARGE', 413), 'aiIdOrgContext.errors.fileInvalid'],
    [failure('TENANT_DATA_LIMIT_REACHED', 409), 'tenantManagement.quotaLimitReached'],
    [failure('AI_CREDIT_LIMIT_REACHED', 429), 'aiCredits.errors.limitReached'],
    [failure('AI_CREDIT_INSUFFICIENT_FOR_RUN', 429), 'aiCredits.errors.insufficientForRun'],
    [failure('ORG_CONTEXT_NOT_CONFIRMED', 409), 'aiIdLaunchBrief.errorOrgContextNotConfirmed'],
    [failure('ORG_CONTEXT_NOT_APPLICABLE', 422), 'aiIdLaunchBrief.errorOrgContextNotApplicable'],
    [failure('ORG_CONTEXT_DISABLED', 404), 'aiIdOrgContext.errors.disabled'],
    [failure('KB_DOCUMENT_LEARNING', 409), 'aiIdOrgContext.errors.documentLearning'],
    [failure('NOT_DEPLOYED', 409), 'aiIdOrgContext.notReady.not_deployed'],
    [failure('LESSON_AUTHOR_SOURCE_UPLOAD_NOT_DEPLOYED', 409), 'aiIdOrgContext.notReady.not_deployed'],
    [failure('NOT_READY', 409), 'aiIdOrgContext.errors.notReady'],
    [failure('FORBIDDEN', 403), 'aiIdOrgContext.errors.forbidden'],
    [failure('NOT_FOUND', 404), 'aiIdOrgContext.errors.notFound'],
    [failure('INTERNAL_ERROR', 500), 'aiIdOrgContext.errors.generic'],
    [new contract.OrgContextError('ORG_CONTEXT_CONNECTION', null, null), 'aiIdOrgContext.errors.connection'],
    [new contract.OrgContextError('ORG_CONTEXT_CONTRACT_INVALID', null, null), 'aiIdOrgContext.errors.unexpected'],
    [failure('ORG_CONTEXT_PROFILE_INVALID', 422, { path: 'glossary.3.term', reason: 'too_long' }), 'aiIdOrgContext.errors.profile.too_long'],
    [failure('ORG_CONTEXT_PROFILE_INVALID', 422, { path: 'products_services[2]', reason: 'too_many' }), 'aiIdOrgContext.errors.profile.too_many'],
    [failure('ORG_CONTEXT_PROFILE_INVALID', 422, { path: '', reason: 'total_too_long' }), 'aiIdOrgContext.errors.profile.total_too_long'],
    [failure('ORG_CONTEXT_PROFILE_INVALID', 422, { reason: 'empty' }), 'aiIdOrgContext.errors.profile.empty'],
    [failure('ORG_CONTEXT_PROFILE_INVALID', 422, { path: 'culture_tone', reason: 'shape' }), 'aiIdOrgContext.errors.profile.shape'],
    [failure('ORG_CONTEXT_PROFILE_INVALID', 422, { path: 'unknown_field', reason: 'too_long' }), 'aiIdOrgContext.errors.profile.generic'],
    [failure('ORG_CONTEXT_PROFILE_INVALID', 422), 'aiIdOrgContext.errors.profile.generic'],
  ];
  for (const [error, key] of cases) {
    assert.equal(contract.orgContextErrorMessage(error).key, key, JSON.stringify(error.response?.data ?? error.code));
    for (const locale of ['vi', 'en']) {
      const text = message(locale, error);
      assert.ok(text.length > 20, text);
      assert.doesNotMatch(text, /_|\b(?:400|401|403|404|409|413|422|429|500)\b|\bAPI\b|\bKB\b|undefined|\{\{/, text);
    }
  }
  assert.equal(message('vi', failure('ORG_CONTEXT_PROFILE_INVALID', 422, { path: 'glossary.3.term', reason: 'too_long' })),
    'Phần Thuật ngữ nội bộ dài quá giới hạn. Hãy rút gọn rồi lưu lại.');
  assert.equal(message('en', failure('ORG_CONTEXT_PROFILE_INVALID', 422, { path: 'learner_groups', reason: 'too_many' })),
    'Learner groups has too many items. Remove some, then save again.');
});

test('not-ready reasons and failed drafts say what to do, in both languages', () => {
  for (const reason of contract.ORG_CONTEXT_NOT_READY_REASONS) {
    for (const locale of ['vi', 'en']) assert.ok(t(locale, contract.orgContextNotReadyKey(reason)).length > 40);
  }
  assert.equal(contract.orgContextDistillFailureKey('AI_CREDIT_LIMIT_REACHED'), 'aiCredits.errors.limitReached');
  assert.equal(contract.orgContextDistillFailureKey('ORG_CONTEXT_NO_LEARNED_SOURCE'), 'aiIdOrgContext.errors.noLearnedDocuments');
  for (const code of [null, 'SERVICE_BUSY', 'PROVIDER_ERROR']) assert.equal(contract.orgContextDistillFailureKey(code), 'aiIdOrgContext.profile.distillFailed');
});
