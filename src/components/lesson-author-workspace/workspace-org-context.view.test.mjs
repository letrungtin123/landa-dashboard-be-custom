import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Real organization context tab, profile card, editors, history, start screen
// switch and UI primitives with the real VI/EN copy. Only i18n, icons and the
// React Query hooks are replaced. SSR proves markup and copy; it does not
// claim browser layout, focus or live backend coverage.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const h = React.createElement;
const env = { locale: 'vi' };
const locales = {};
function t(key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[env.locale]);
  assert.equal(typeof value, 'string', `missing ${env.locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
const mutation = () => ({ mutate() {}, isPending: false, variables: undefined });
const mocks = {
  './custom-client': { customApiClient: {} },
  'react-i18next': { useTranslation: () => ({ t, i18n: { language: env.locale } }) },
  'lucide-react': new Proxy({}, { get: () => () => h('i') }),
  '@/hooks/queries/use-workspace-org-context': {
    useOrgContextUpload: mutation, useOrgContextDeleteDocument: mutation, useOrgProfileDistill: mutation, useOrgProfileSave: mutation,
    useOrgProfileRestore: mutation, useOrgProfileVersion: () => ({ isPending: true }),
  },
  '../../api/workspace-source-stream': {},
};
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier === './vi') return locales.viModule;
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
for (const name of ['vi', 'en']) {
  const exports = load(path.join(src, `i18n/locales/${name}.ts`));
  if (name === 'vi') locales.viModule = exports;
  locales[name] = exports[name];
}
const { WorkspaceOrgContextPanel } = load(path.join(directory, 'workspace-org-context-panel.tsx'));
const { WorkspaceOrgContextLaunchProvider } = load(path.join(directory, 'workspace-org-context-launch.tsx'));
const { WorkspaceLaunchBriefPanel } = load(path.join(directory, 'workspace-launch-brief-panel.tsx'));
const { createWorkspaceSourceState } = load(path.join(directory, 'workspace-source-state.ts'));
const { WorkspaceOrgProfileView } = load(path.join(directory, 'workspace-org-profile-history.tsx'));
const contract = load(path.join(src, 'api/workspace-org-context.contract.ts'));

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = { organization_summary: 'Chuỗi bán lẻ điện máy', products_services: ['Tủ lạnh', 'Máy giặt'],
  learner_groups: [{ name: 'Nhân viên bán hàng', description: 'Tư vấn tại cửa hàng' }], glossary: [{ term: 'Phiếu đổi', meaning: 'Phiếu đổi hàng trong 7 ngày' }],
  key_processes: ['Đổi trả hàng'], culture_tone: 'Thân thiện', design_conventions: [] };
const chars = contract.orgProfileCharCount(profile);
const version = n => ({ version: n, origin: 'ai_draft', profile, char_count: chars, profile_hash: 'b'.repeat(64), created_at: '2026-10-20T05:00:00.000Z', created_by_name: null });
const documentRow = (n, status, patch = {}) => ({ id: id(n), name: `Tai-lieu-${n}.pdf`, size_bytes: 1_300_000, status, error_reason: status === 'error' ? 'RAW_WORKER_CODE' : null,
  created_at: '2026-10-20T04:00:00.000Z', created_by_name: n === 1 ? 'Trần Thị B' : null, ...patch });
const state = (patch = {}, profilePatch = {}) => contract.readOrgContextRead({ enabled: true, ready: true, not_ready_reason: null, limit_bytes: 52_428_800,
  used_bytes: 13_003_000, documents: [documentRow(1, 'learned'), documentRow(2, 'learning'), documentRow(3, 'error')],
  profile: { revision: 4, current: version(2), confirmed_version: 1, confirmed_at: '2026-10-19T12:00:00.000Z', confirmed_by_name: 'Lê C', unread_document_count: 1, ...profilePatch },
  distill: { status: 'idle', requested_at: null, finished_at: null, error_code: null },
  history: [{ version: 2, origin: 'ai_draft', char_count: chars, created_at: '2026-10-20T05:00:00.000Z', created_by_name: null },
    { version: 1, origin: 'author_edit', char_count: 90, created_at: '2026-10-19T12:00:00.000Z', created_by_name: 'Lê C' }], ...patch });
const panel = (value, locale) => { env.locale = locale; return renderToStaticMarkup(h(WorkspaceOrgContextPanel, { state: value, tenantId: id(9), locale, onReload: async () => value })); };
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const buttonDisabled = (html, label) => {
  const match = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}</button>`));
  assert.ok(match, `button ${label}`);
  return /\sdisabled=""/.test(match[0].slice(0, match[0].indexOf('>') + 1));
};

for (const locale of ['vi', 'en']) test(`${locale}: context tab shows the space used, the documents with plain statuses and the shared note`, () => {
  const html = panel(state(), locale), words = text(html);
  const vi = locale === 'vi';
  assert.match(html, /role="progressbar"[^>]*aria-valuemin="0" aria-valuemax="100" aria-valuenow="25" aria-valuetext="12[,.]4 MB \/ 50 MB"/);
  assert.ok(words.includes(vi ? '12,4 MB / 50 MB' : '12.4 MB / 50 MB'));
  assert.ok(words.includes(vi ? 'Tài liệu và hồ sơ dùng chung cho mọi khoá học của doanh nghiệp. Mọi người soạn có quyền AI ID đều xem và sửa được.'
    : 'The documents and the profile are shared by every course of your organization.'));
  for (const status of vi ? ['Đã đọc', 'Đang đọc', 'Lỗi'] : ['Read', 'Reading', 'Failed']) assert.ok(words.includes(status), status);
  assert.ok(words.includes(vi ? '1,2 MB · Trần Thị B ·' : '1.2 MB · Trần Thị B ·'), 'size, who and when');
  assert.ok(words.includes(vi ? 'AI không đọc được tài liệu này.' : 'AI could not read this document.'));
  assert.doesNotMatch(html, /RAW_WORKER_CODE|learning|learned|<\w+[^>]*>error</, 'never a raw reason or status code');
  assert.match(html, /<input class="sr-only" type="file" accept=".pdf,.doc,.docx,.pptx,.txt,.md,.csv"/);
  assert.doesNotMatch(html, /type="file"[^>]*multiple/, 'one file at a time');
  assert.equal(buttonDisabled(html, vi ? 'Tải tài liệu lên' : 'Upload a document'), false);
  const deletes = [...html.matchAll(/<button[^>]*aria-label="(?:Xoá tài liệu|Delete the document) (Tai-lieu-\d\.pdf)"[^>]*>/g)];
  assert.deepEqual(deletes.map(match => [match[1], / disabled=""/.test(match[0])]),
    [['Tai-lieu-1.pdf', false], ['Tai-lieu-2.pdf', true], ['Tai-lieu-3.pdf', false]], 'a document being read cannot be deleted yet');
});

test('a finished upload adds no note under the button: the new document shows its own status in the list', () => {
  // QC 21/10 (C3): "Đã tải lên. AI đang đọc tài liệu, trang sẽ tự cập nhật." is gone; the row status stays.
  const source = readFileSync(path.join(directory, 'workspace-org-context-panel.tsx'), 'utf8');
  assert.doesNotMatch(source, /aiIdOrgContext\.uploaded|upload\.mutate\([^;]*onSuccess|text-emerald-700 dark:text-emerald-400'\}`\}>\{upload/,
    'only a failed upload writes a note');
  for (const locale of ['vi', 'en']) assert.equal(locales[locale].aiIdOrgContext.uploaded, undefined, locale);
  const words = text(panel(state(), 'vi'));
  assert.doesNotMatch(words, /AI đang đọc tài liệu, trang sẽ tự cập nhật/);
  assert.ok(words.includes('Đang đọc') && words.includes('Đã đọc'), 'the per-document status is kept');
});

for (const locale of ['vi', 'en']) test(`${locale}: profile card shows the status, 7 editors with counters and the 6000 total, and the right buttons`, () => {
  const vi = locale === 'vi', html = panel(state(), locale), words = text(html);
  assert.ok(words.includes(vi ? 'Trạng thái: Bản nháp chưa xác nhận' : 'Status: Draft, not confirmed'));
  assert.ok(words.includes(vi ? 'Khoá học mới vẫn dùng bản đã xác nhận ngày 19/10/2026' : 'New courses keep using the version confirmed on 10/19/2026'));
  assert.ok(words.includes(vi ? 'Có 1 tài liệu mới chưa có trong hồ sơ.' : '1 new document(s) are not in the profile yet.'));
  const labels = vi ? ['Giới thiệu doanh nghiệp', 'Sản phẩm và dịch vụ', 'Nhóm người học', 'Thuật ngữ nội bộ', 'Quy trình chính', 'Văn hoá và giọng văn', 'Quy ước khi soạn bài']
    : ['About the organization', 'Products and services', 'Learner groups', 'Internal terms', 'Key processes', 'Culture and tone', 'Lesson writing rules'];
  let at = -1;
  for (const label of labels) { const next = words.indexOf(label, at + 1); assert.ok(next > at, `${label} in spec order`); at = next; }
  assert.equal((html.match(/<textarea/g) ?? []).length, 2, 'two multi-line texts');
  assert.ok(html.includes('value="Tủ lạnh"') && html.includes('value="Nhân viên bán hàng"') && html.includes('value="Phiếu đổi hàng trong 7 ngày"'));
  assert.ok(words.includes(vi ? '21/800 ký tự' : '21/800 characters'));
  assert.ok(words.includes(vi ? '2/15 mục' : '2/15 items') && words.includes(vi ? '0/10 mục' : '0/10 items'));
  assert.ok(words.includes(vi ? `Tổng cộng ${chars}/6.000 ký tự` : `${chars}/6,000 characters in total`));
  assert.equal(buttonDisabled(html, vi ? 'Cập nhật từ tài liệu' : 'Update from documents'), false);
  assert.equal(buttonDisabled(html, vi ? 'Lưu bản nháp' : 'Save draft'), true, 'nothing changed yet');
  assert.equal(buttonDisabled(html, vi ? 'Xác nhận' : 'Confirm'), false, 'the draft is not the confirmed version');
  assert.ok(words.includes(vi ? 'Các bản trước (2)' : 'Earlier versions (2)'));
  assert.ok(words.includes(vi ? 'Bản 2 Bản đang sửa' : 'Version 2 Being edited') && words.includes(vi ? 'Bản 1 Đã xác nhận' : 'Version 1 Confirmed'));
  assert.ok(words.includes(vi ? 'Người soạn chỉnh sửa · Lê C ·' : 'Edited by an author · Lê C ·'));
  const restoreButton = n => html.match(new RegExp(`<button[^>]*aria-label="${vi ? 'Khôi phục bản' : 'Restore version'} ${n}"[^>]*>`))[0];
  assert.match(restoreButton(2), / disabled=""/, 'the version being edited cannot be restored onto itself');
  assert.doesNotMatch(restoreButton(1), / disabled=""/);
  assert.doesNotMatch(words, /ai_draft|author_edit|organization_summary|ORG_CONTEXT|_/, 'no codes in the visible text');
});

test('confirmed, empty and not-yet-read states', () => {
  let html = panel(state({}, { current: version(2), confirmed_version: 2, confirmed_at: '2026-10-19T12:00:00.000Z', confirmed_by_name: 'Lê C' }), 'vi');
  assert.ok(text(html).includes('Đã xác nhận ngày 19/10/2026 bởi Lê C'));
  assert.equal(buttonDisabled(html, 'Xác nhận'), true, 'already confirmed and unchanged');
  html = panel(state({ documents: [documentRow(2, 'learning')], history: [] },
    { current: null, confirmed_version: null, confirmed_at: null, confirmed_by_name: null, unread_document_count: 0 }), 'vi');
  const words = text(html);
  assert.ok(words.includes('Trạng thái: Chưa có'));
  assert.ok(words.includes('Hãy tải lên ít nhất một tài liệu và đợi trạng thái Đã đọc để AI soạn hồ sơ.'));
  assert.equal(buttonDisabled(html, 'Cập nhật từ tài liệu'), true, 'no document has been read yet');
  // Before the first version the AI writes the profile: no empty editors, the two steps, and a way to fill it in by hand.
  assert.ok(words.includes('Chưa có hồ sơ. Để AI soạn giúp bạn:'));
  assert.ok(words.includes('Bấm Cập nhật từ tài liệu. AI sẽ đọc và điền hồ sơ, bạn chỉ cần xem lại rồi bấm Xác nhận.'));
  assert.equal(buttonDisabled(html, 'Không có tài liệu\\? Tự điền hồ sơ'), false);
  assert.doesNotMatch(html, /<textarea|<fieldset/, 'no empty editors before the AI drafts');
  assert.ok(!words.includes('Lưu bản nháp') && !words.includes('Tổng cộng 0/6.000 ký tự') && !words.includes('Chưa có bản nào.'));
  env.locale = 'en';
  assert.ok(text(panel(state({}, { current: version(2), confirmed_version: 2, confirmed_by_name: null }), 'en')).includes('Confirmed on 10/19/2026'));
});

test('space almost used and used up; a server that is not ready says what to do and blocks upload and drafting', () => {
  let html = panel(state({ used_bytes: 45 * 1048576 }), 'vi');
  assert.match(html, /class="[^"]*bg-amber-500[^"]*" style="width:90%"/);
  assert.ok(text(html).includes('Sắp dùng hết dung lượng dành cho ngữ cảnh.'));
  html = panel(state({ used_bytes: 52_428_800 }), 'vi');
  assert.match(html, /class="[^"]*bg-destructive[^"]*" style="width:100%"/);
  assert.ok(text(html).includes('Đã dùng hết dung lượng dành cho ngữ cảnh. Hãy xoá bớt tài liệu cũ để tải thêm.'));
  assert.equal(buttonDisabled(html, 'Tải tài liệu lên'), true);
  for (const reason of contract.ORG_CONTEXT_NOT_READY_REASONS) {
    html = panel(state({ ready: false, not_ready_reason: reason }), 'vi');
    assert.ok(html.includes(`role="alert" class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-6">${locales.vi.aiIdOrgContext.notReady[reason]}</p>`));
    assert.equal(buttonDisabled(html, 'Tải tài liệu lên'), true);
    assert.equal(buttonDisabled(html, 'Cập nhật từ tài liệu'), true);
    assert.equal(/<textarea[^>]*disabled=""/.test(html), reason === 'schema', 'editing needs no AI service, only the stored profile');
  }
});

test('while AI drafts the profile the editors are closed; a failed draft explains and offers Try again', () => {
  for (const status of ['queued', 'running']) {
    const html = panel(state({ distill: { status, requested_at: '2026-10-20T06:00:00.000Z', finished_at: null, error_code: null } }), 'vi');
    assert.match(html, /role="status"[^>]*>(?:(?!<\/div><\/div>).)*AI đang đọc tài liệu…/);
    assert.equal((html.match(/<textarea[^>]*disabled=""/g) ?? []).length, 2);
    assert.equal((html.match(/<fieldset disabled=""/g) ?? []).length, 5);
    for (const label of ['Cập nhật từ tài liệu', 'Lưu bản nháp', 'Xác nhận']) assert.equal(buttonDisabled(html, label), true, label);
  }
  for (const [code, words] of [[null, 'AI chưa soạn được hồ sơ từ tài liệu. Hãy bấm Thử lại.'],
    ['AI_CREDIT_LIMIT_REACHED', 'Đã dùng hết điểm AI của tháng này.'], ['ORG_CONTEXT_NO_LEARNED_SOURCE', 'Chưa có tài liệu nào đọc xong.']]) {
    const html = panel(state({ distill: { status: 'failed', requested_at: null, finished_at: '2026-10-20T06:00:00.000Z', error_code: code } }), 'vi');
    assert.match(html, new RegExp(`role="alert"[^>]*>(?:(?!</div>).)*${words}`));
    assert.equal(buttonDisabled(html, 'Thử lại'), false);
    assert.doesNotMatch(html, /AI_CREDIT|ORG_CONTEXT/);
  }
});

test('a stored version is shown read only in the order of the editors', () => {
  env.locale = 'vi';
  const html = renderToStaticMarkup(h(WorkspaceOrgProfileView, { profile }));
  assert.ok(text(html).includes('Nhóm người học Nhân viên bán hàng: Tư vấn tại cửa hàng'));
  assert.ok(text(html).includes('Quy ước khi soạn bài Chưa có'));
  assert.doesNotMatch(html, /<input|<textarea/);
});

function launchController() {
  const scope = { actorId: id(1), tenantId: id(2), courseId: 'course-v1:TEST+ORG+2026' };
  return createWorkspaceSourceState(scope, { api: {}, authorized: () => true, visible: () => true, canUpload: () => true, operationId: () => id(9),
    locale: 'vi', wait: async () => {}, onCreated: () => {}, stream: () => ({ start() {}, close() {} }), create: async () => { throw Error('unused'); } });
}
const brief = (controller, launch) => renderToStaticMarkup(launch === undefined ? h(WorkspaceLaunchBriefPanel, { controller })
  : h(WorkspaceOrgContextLaunchProvider, { value: launch }, h(WorkspaceLaunchBriefPanel, { controller })));

for (const locale of ['vi', 'en']) test(`${locale}: Create tab switch "use the organization profile" with its confirmed date; hidden for keep-as-is`, () => {
  env.locale = locale;
  const vi = locale === 'vi', controller = launchController();
  const launch = { confirmedVersion: 2, confirmedAt: '2026-10-19T12:00:00.000Z', locale, openContext() {} };
  assert.doesNotMatch(brief(controller), /role="switch"|hồ sơ doanh nghiệp|organization profile/, 'without the tabs the start screen is unchanged');
  let html = brief(controller, launch);
  assert.match(html, /<button type="button" role="switch" aria-checked="false"[^>]*disabled=""/, 'closed until the offer reaches the controller');
  controller.setOrganizationContextOffer({ confirmedVersion: 2 });
  html = brief(controller, launch);
  assert.ok(text(html).includes(vi ? 'Dùng hồ sơ doanh nghiệp (xác nhận ngày 19/10/2026)' : 'Use the organization profile (confirmed on 10/19/2026)'));
  const toggle = html.match(/<button type="button" role="switch"[^>]*>/)[0];
  assert.match(toggle, /aria-checked="true"/, 'on by default');
  assert.doesNotMatch(toggle, /disabled=""/);
  const switchId = toggle.match(/ id="([^"]+)"/)[1];
  assert.match(html, new RegExp(`<label for="${switchId.replace(/[:]/g, '\\:')}"`), 'the line labels the switch');
  controller.setUseOrganizationContext(false);
  assert.match(brief(controller, launch), /role="switch" aria-checked="false"/);
  controller.setBrief({ design_mode: 'preserve_source' });
  assert.doesNotMatch(brief(controller, launch), /role="switch"|Mở thẻ|Open the Organization/, 'keep-as-is never uses the profile');
  controller.setBrief({ design_mode: 'instructional_design' });
  html = brief(controller, { confirmedVersion: null, confirmedAt: null, locale, openContext() {} });
  assert.doesNotMatch(html, /role="switch"/);
  assert.ok(text(html).includes(vi ? 'Chưa có hồ sơ doanh nghiệp đã xác nhận' : 'There is no confirmed organization profile'));
  assert.match(html, new RegExp(`<button type="button" class="[^"]*underline[^"]*">${vi ? 'Mở thẻ Ngữ cảnh doanh nghiệp' : 'Open the Organization context tab'}</button>`));
  controller.dispose();
});

test('VI and EN have the same organization context keys, every key the components use, and no codes in the copy', () => {
  const shape = value => typeof value === 'string' ? 'string' : Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]));
  assert.deepEqual(shape(locales.en.aiIdOrgContext), shape(locales.vi.aiIdOrgContext));
  const strings = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
  for (const locale of ['vi', 'en']) {
    for (const value of strings(locales[locale].aiIdOrgContext)) {
      assert.doesNotMatch(value, /_|\b(?:API|KB|HTTP|ID[^ ]|SME)\b|\b(?:400|401|403|404|409|422|429|500)\b|e\.g\.|VD:/, value);
    }
  }
  const files = ['workspace-org-context-panel.tsx', 'workspace-org-profile-card.tsx', 'workspace-org-profile-fields.tsx', 'workspace-org-profile-history.tsx',
    'workspace-org-context-launch.tsx', 'workspace-org-context-dialogs.tsx', 'workspace-launch-tabs.tsx', 'workspace-org-context.logic.ts'];
  const used = files.flatMap(file => [...readFileSync(path.join(directory, file), 'utf8').matchAll(/'(aiIdOrgContext\.[\w.]+)'/g)].map(match => match[1]));
  assert.ok(used.length > 60);
  const lookup = (locale, key) => key.split('.').reduce((node, part) => node?.[part], locales[locale]);
  for (const key of new Set(used)) for (const locale of ['vi', 'en']) assert.equal(typeof lookup(locale, key), 'string', `${locale} ${key}`);
  for (const field of contract.ORG_PROFILE_FIELDS) {
    for (const locale of ['vi', 'en']) {
      const copy = locales[locale].aiIdOrgContext.profile.fields[field];
      assert.equal(typeof copy.label, 'string');
      if (field === 'learner_groups' || field === 'glossary') {
        for (const part of contract.ORG_PROFILE_ROW_LIMITS[field].parts) for (const suffix of ['', 'Placeholder']) assert.equal(typeof copy[`${part.key}${suffix}`], 'string');
      } else assert.equal(typeof copy.placeholder, 'string');
    }
  }
});
