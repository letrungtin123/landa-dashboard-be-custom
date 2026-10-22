import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exclusive knowledge bases on the Deploy page (QC 21/10, D1/D2): the conflicts reader, the refusal check, the
// place rules and the warning, with the real VI/EN copy. Only i18n, icons and the HTTP client are replaced.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const h = React.createElement;
const env = { locale: 'vi', gets: [], reply: null };
const locales = {};
function t(key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[env.locale]);
  assert.equal(typeof value, 'string', `missing ${env.locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
const mocks = {
  './custom-client': { customApiClient: { get: async (...args) => { env.gets.push(args); return { data: env.reply }; } } },
  'react-i18next': { useTranslation: () => ({ t }) },
  'lucide-react': new Proxy({}, { get: () => () => h('i') }),
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
const api = load(path.join(src, 'api/ai-chatbot-kb-usage.ts'));
const logic = load(path.join(directory, 'deploy-kb-usage.logic.ts'));
const { DeployKbConflicts } = load(path.join(directory, 'deploy-kb-conflicts.tsx'));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('conflicts reader: only real clashes between known places; extra keys ignored; anything else is refused', async () => {
  assert.deepEqual(api.readKbUsageConflicts({ conflicts: [
    { kb_id: id(1), kb_name: ' Kho chung ', used_by: ['admin', 'ai_id', 'admin'], extra: true },
    { kb_id: id(2), kb_name: 'Kho học viên', used_by: ['learner', 'lesson_author'] },
    { kb_id: id(3), kb_name: null, used_by: ['ai_id', 'learner'] },
    { kb_id: '', kb_name: 'x', used_by: ['admin', 'learner'] }, null, 'x',
  ] }), [
    { kb_id: id(1), kb_name: 'Kho chung', used_by: ['admin', 'ai_id'] },
    { kb_id: id(3), kb_name: '', used_by: ['learner', 'ai_id'] },
  ]);
  assert.deepEqual(api.readKbUsageConflicts({ conflicts: [] }), []);
  for (const bad of [null, {}, { conflicts: 'x' }, []]) assert.throws(() => api.readKbUsageConflicts(bad));
  env.gets = [];
  env.reply = { success: true, data: { conflicts: [{ kb_id: id(1), kb_name: 'A', used_by: ['admin', 'learner'] }] } };
  assert.equal((await api.fetchKbUsageConflicts()).length, 1);
  env.reply = { conflicts: [{ kb_id: id(1), kb_name: 'A', used_by: ['admin', 'learner'] }] };
  assert.equal((await api.fetchKbUsageConflicts()).length, 1, 'a bare body is read too');
  assert.deepEqual(env.gets.map(args => args[0]), ['/api/ai-chatbot/kb-usage-conflicts', '/api/ai-chatbot/kb-usage-conflicts']);
});

test('the refusal of a knowledge base already used elsewhere is recognised by its status and code only', () => {
  const failure = (status, code) => ({ response: { status, data: { code, message: 'Kho tri thức đang dùng cho AI ID' } } });
  assert.equal(api.isKbAlreadyUsedError(failure(409, 'AI_CHATBOT_KB_ALREADY_USED')), true);
  for (const other of [failure(409, 'OTHER'), failure(400, 'AI_CHATBOT_KB_ALREADY_USED'), new Error('x'), null]) {
    assert.equal(api.isKbAlreadyUsedError(other), false);
    assert.equal(api.kbAlreadyUsedMessage(other), null);
  }
  // The server's own words (Vietnamese, or English with the English UI) name the places, including one bot on both pages.
  const sameBot = { response: { status: 409, data: { success: false, code: 'AI_CHATBOT_KB_ALREADY_USED', error: 'AI_CHATBOT_KB_ALREADY_USED',
    message: ' One assistant cannot serve both the admin page and the learner page. ' } } };
  assert.equal(api.kbAlreadyUsedMessage(sameBot), 'One assistant cannot serve both the admin page and the learner page.');
  assert.equal(api.kbAlreadyUsedMessage({ response: { status: 409, data: { code: 'AI_CHATBOT_KB_ALREADY_USED', message: ' ' } } }), null);
});

test('deleting a whole knowledge base AI ID is designing from: the server words, else a plain fallback in both languages', () => {
  // Backend QC 22/10: 409 KB_IN_USE_BY_AI_ID on DELETE /kb/:id.
  const refused = message => ({ response: { status: 409, data: { success: false, code: 'KB_IN_USE_BY_AI_ID', message } } });
  assert.equal(api.kbInUseByAiIdMessage(refused(' AI ID is designing a course from documents of this Knowledge Base. ')),
    'AI ID is designing a course from documents of this Knowledge Base.');
  assert.equal(api.kbInUseByAiIdMessage(refused(undefined)), '', 'refused without words: the page uses its own sentence');
  for (const other of [{ response: { status: 409, data: { code: 'OTHER' } } }, { response: { status: 400, data: { code: 'KB_IN_USE_BY_AI_ID' } } },
    new Error('x'), null]) assert.equal(api.kbInUseByAiIdMessage(other), null);
  assert.equal(locales.vi.aiChatbotKbUsage.kbInUseByAiId,
    'AI ID đang dùng tài liệu của Kho tri thức này để soạn khoá học nên chưa xoá được. Vui lòng thử lại khi AI ID soạn xong.');
  assert.match(locales.en.aiChatbotKbUsage.kbInUseByAiId, /^AI ID is designing a course from documents of this Knowledge Base/);
  const page = readFileSync(path.join(directory, 'kb-tab.tsx'), 'utf8');
  const remove = page.slice(page.indexOf('async function handleDelete'), page.indexOf('const totalPages'));
  assert.match(remove, /const inUse = kbInUseByAiIdMessage\(err\);/);
  assert.match(remove, /toast\.error\(inUse !== null \? inUse \|\| t\("aiChatbotKbUsage\.kbInUseByAiId"\) : getLocalizedApiError\(err, t\("aiChatbot\.genericError"\)\)\);/);
});

test('places: the other assistant pages and AI ID that use the same knowledge base, never the slot being assigned', () => {
  const current = { assignments: [{ target: 'admin', bot_kb_id: id(1) }, { target: 'learner', bot_kb_id: id(2) },
    { target: 'lesson_author', bot_kb_id: id(1) }], aiIdKbId: id(1) };
  assert.deepEqual(logic.kbUsagePlacesElsewhere(id(1), current, 'learner'), ['admin', 'ai_id']);
  assert.deepEqual(logic.kbUsagePlacesElsewhere(id(1), current, 'admin'), ['ai_id']);
  assert.deepEqual(logic.kbUsagePlacesElsewhere(id(2), current, 'ai_id'), ['learner']);
  assert.deepEqual(logic.kbUsagePlacesElsewhere(id(1), current, 'ai_id'), ['admin']);
  assert.deepEqual(logic.kbUsagePlacesElsewhere(null, current, 'admin'), [], 'a bot without a knowledge base clashes with nothing');
  const label = place => locales.vi.aiChatbotKbUsage.places[place];
  assert.equal(logic.joinKbUsagePlaces(['admin'], label, ' và '), 'trợ lý trang quản trị');
  assert.equal(logic.joinKbUsagePlaces(['admin', 'ai_id'], label, ' và '), 'trợ lý trang quản trị và AI ID');
  assert.equal(logic.joinKbUsagePlaces(['admin', 'learner', 'ai_id'], label, ' và '), 'trợ lý trang quản trị, trợ lý trang học viên và AI ID');
  assert.deepEqual(logic.kbAlreadyUsedCopy({ kbName: ' Kho A ', places: ['ai_id'] }), { key: 'aiChatbotKbUsage.alreadyUsed', name: 'Kho A', places: ['ai_id'] });
  assert.deepEqual(logic.kbAlreadyUsedCopy({ kbName: 'Kho A', places: [] }), { key: 'aiChatbotKbUsage.alreadyUsedElsewhere' });
  assert.deepEqual(logic.kbAlreadyUsedCopy({ kbName: null, places: ['admin'] }), { key: 'aiChatbotKbUsage.alreadyUsedElsewhere' });
});

for (const locale of ['vi', 'en']) test(`${locale}: one warning per shared knowledge base, naming the places in plain words`, () => {
  env.locale = locale;
  const render = conflicts => renderToStaticMarkup(h(DeployKbConflicts, { conflicts }));
  for (const nothing of [undefined, []]) assert.equal(render(nothing), '');
  const html = render([{ kb_id: id(1), kb_name: 'Kho chung', used_by: ['admin', 'ai_id'] },
    { kb_id: id(2), kb_name: '', used_by: ['admin', 'learner', 'ai_id'] }]);
  const words = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(html, /role="alert"/);
  assert.equal((html.match(/<li/g) ?? []).length, 2);
  if (locale === 'vi') {
    assert.ok(words.includes('Có Kho tri thức đang được dùng chung'));
    assert.ok(words.includes('Kho tri thức “Kho chung” đang được dùng chung cho trợ lý trang quản trị và AI ID.'));
    assert.ok(words.includes('Một Kho tri thức đang được dùng chung cho trợ lý trang quản trị, trợ lý trang học viên và AI ID.'));
  } else {
    assert.ok(words.includes('Some Knowledge Bases are shared'));
    assert.ok(words.includes('The Knowledge Base “Kho chung” is shared by the admin page assistant and AI ID.'));
    assert.ok(words.includes('A Knowledge Base is shared by the admin page assistant, the learner page assistant and AI ID.'));
  }
  assert.doesNotMatch(words, /ai_id|lesson_author|00000000-|\bKB\b|409/);
  if (locale === 'vi') assert.doesNotMatch(words, /\badmin\b|\blearner\b/, 'place codes never reach the Vietnamese text');
});

test('copy: VI and EN have the same keys, no codes or abbreviations; the Deploy page uses them', () => {
  const shape = value => typeof value === 'string' ? 'string' : Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]));
  assert.deepEqual(shape(locales.en.aiChatbotKbUsage), shape(locales.vi.aiChatbotKbUsage));
  const strings = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
  for (const locale of ['vi', 'en']) {
    for (const value of strings(locales[locale].aiChatbotKbUsage)) assert.doesNotMatch(value, /_|\bKB\b|\b409\b|\bbot\b/i, value);
  }
  const page = readFileSync(path.join(directory, 'deploy-section.tsx'), 'utf8');
  assert.match(page, /<DeployKbConflicts conflicts=\{kbConflicts\.data\} \/>/);
  assert.match(page, /useAiChatbotKbUsageConflicts\(activeTenantId \?\? actorTenantId\)/, 'keyed by the active tenant');
  assert.equal((page.match(/refreshKbConflicts\(\);/g) ?? []).length, 5, 'every assignment change and every refused clash reads the conflicts again');
  assert.match(page, /assignmentError\(err, target, botKb\(botId\)\?\.kb_id, botKb\(botId\)\?\.kb_name\)/);
  assert.match(page, /assignmentError\(err, "ai_id", kbId, kbs\.find\(kb => kb\.id === kbId\)\?\.name\)/);
  assert.match(page, /const server = kbAlreadyUsedMessage\(err\);\s+if \(server\) return server;/, 'the server words come first');
  const bot = readFileSync(path.join(directory, 'bot-detail.tsx'), 'utf8');
  assert.match(bot, /isKbAlreadyUsedError\(err\) \? kbAlreadyUsedMessage\(err\) \?\? t\("aiChatbotKbUsage\.alreadyUsedElsewhere"\)/);
  const hook = readFileSync(path.join(src, 'hooks/queries/use-ai-chatbot-kb-usage.ts'), 'utf8');
  assert.match(hook, /conflicts: \(tenantId: string\) => \[\.\.\.aiChatbotKbUsageKeys\.all, 'conflicts', tenantId\]/);
  assert.match(hook, /enabled: !!tenantId/);
});
