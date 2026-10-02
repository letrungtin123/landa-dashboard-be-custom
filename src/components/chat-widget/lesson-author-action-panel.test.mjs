import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./lesson-author-action-panel.tsx', import.meta.url), 'utf8');
const widget = readFileSync(new URL('./chat-widget.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../api/custom-chat.ts', import.meta.url), 'utf8');
const uploadApi = readFileSync(new URL('../../api/custom-ai-chatbot.ts', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const exports = {};
const unexpected = () => { throw new Error('Render/restoration must not dispatch work'); };
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
runInNewContext(output, { exports, require: name => {
  if (name === '@/components/ui/button') return { Button: ({ variant, size, children, ...props }) => React.createElement('button', props, children) };
  if (name === '@/api/custom-chat') return { fetchLessonAuthorSourceDocuments: unexpected };
  if (name === '@/api/custom-ai-chatbot') return { fetchDocuments: unexpected, uploadDocuments: unexpected };
  if (name === '@/utils/localized-error') return { getLocalizedApiError: unexpected };
  if (name === 'sonner') return { toast: { success: unexpected, error: unexpected } };
  return require(name);
} });
const props = { scopeKey: 'tenant:user:course:conversation', kbId: 'kb', busy: false, canUpload: true,
  english: false, onSource: unexpected, onCreate: unexpected, onVideo: unexpected, onUploading: unexpected };

test('actual action-panel render has add/create buttons, no free-text composer or voice action', () => {
  const html = renderToStaticMarkup(React.createElement(exports.LessonAuthorActionPanel, props));
  assert.match(html, /Tạo nội dung bài học/);
  assert.match(html, /aria-label="Thêm nguồn"/);
  assert.doesNotMatch(html, /textarea|contenteditable|type="text"|microphone/i);
  assert.match(html, /disabled=""/);
  assert.match(html, /accept=".pdf,.doc,.docx,.pptx,.txt,.md,.csv,.mp4"/);
  assert.equal((html.match(/type="file"/g) || []).length, 1);
});

test('file cards have type-specific icon/color and a textual badge (not color alone)', () => {
  const cases = [
    ['a.PDF', 'PDF', 'red', 'file-text'], ['b.docx', 'DOCX', 'blue', 'file-text'],
    ['c.pptx', 'PPTX', 'orange', 'presentation'], ['d.csv', 'CSV', 'emerald', 'file-spreadsheet'],
    ['e.md', 'MD', 'teal', 'file-code'], ['f.mp4', 'MP4', 'violet', 'video'],
    ['g.transcript.txt', 'TXT', 'violet', 'video'],
  ];
  for (const [name, label, color, icon] of cases) {
    const html = renderToStaticMarkup(React.createElement(exports.LessonAuthorActionPanel, { ...props,
      source: { document_id: 'doc', kb_id: 'kb', name, status: 'learned', type: 'file' } }));
    assert.match(html, new RegExp(`text-${color}-500`));
    assert.match(html, new RegExp(`lucide-${icon}`));
    assert.ok(html.includes(`>${label}</span>`));
  }
});

test('accepted action/history renders no source card or controls; rejected pre-send leaves controls available', () => {
  for (const action of ['GENERATE_COURSE_BLUEPRINT', 'DRAFT_BLUEPRINT_CHAPTER', 'CONTINUE_CHAPTER']) {
    assert.equal(exports.hasLessonAuthorCreationStarted([{ metadata: { lesson_author_action: action } }]), true);
  }
  assert.equal(exports.hasLessonAuthorCreationStarted([{ metadata: { lesson_author_blueprint_id: 'old-blueprint' } }]), true);
  assert.equal(exports.hasLessonAuthorCreationStarted([{ metadata: { source_documents: [] } }]), false);
  const html = renderToStaticMarkup(React.createElement(exports.LessonAuthorActionPanel, { ...props,
    creationStarted: true, source: { document_id: 'doc', kb_id: 'kb', name: 'source.pdf' } }));
  assert.equal(html, '');
  assert.match(widget, /creationStarted=\{Boolean\(blueprintEvent \|\| proposalEvent\?\.blueprint_id\) \|\| hasLessonAuthorCreationStarted\(messages\)\}/);
  assert.match(widget, /busy=\{loadingMessages \|\| streaming/);
});

// Execute the actual component event handlers without a browser/backend. API
// mocks are the boundary: no production upload, indexing or generation occurs.
function panelHarness(overrides = {}, states = {}) {
  const calls = { documents: [], videos: [], errors: [], sources: [], creating: 0 };
  const localExports = {};
  let stateIndex = 0;
  const effects = [];
  runInNewContext(output, { exports: localExports, localStorage: { setItem() {} }, require: name => {
    if (name === 'react') return { ...React, useEffect: effect => effects.push(effect), useRef: value => ({ current: value }),
      useState: value => { const index = stateIndex++; return [index in states ? states[index] : index === 0 ? true : value, () => {}]; } };
    if (name === '@/components/ui/button') return { Button: 'button' };
    if (name === '@/api/custom-chat') return { fetchLessonAuthorSourceDocuments: unexpected };
    if (name === '@/api/custom-ai-chatbot') return { fetchDocuments: unexpected, uploadDocuments: async (...args) => {
      calls.documents.push(args);
      return { results: [{ success: true, data: { id: 'new-doc', kb_id: 'kb', name: args[1][0].name, status: 'learning', type: 'file' } }] };
    } };
    if (name === '@/utils/localized-error') return { getLocalizedApiError: () => 'upload failed' };
    if (name === 'sonner') return { toast: { success() {}, error: message => calls.errors.push(message) } };
    return require(name);
  } });
  const tree = localExports.LessonAuthorActionPanel({ ...props, onVideo: file => calls.videos.push(file),
    onSource: doc => calls.sources.push(doc), onUploading() {}, onCreate: () => calls.creating++, ...overrides });
  const nodes = [];
  const walk = node => {
    if (!React.isValidElement(node)) return;
    nodes.push(node);
    React.Children.forEach(node.props.children, walk);
  };
  walk(tree);
  const input = nodes.find(node => node.type === 'input' && node.props.type === 'file');
  return { calls, nodes, tree, effects, choose(file) { const target = { files: file ? [file] : [], value: 'selected' }; input.props.onChange({ target }); return target; } };
}

test('ready card is neutral, has no refresh action and retains only accessible remove', () => {
  const h = panelHarness({ source: { document_id: 'doc', name: 'Long document title.pdf' } }, { 0: false, 6: 'doc', 7: 'Sẵn sàng' });
  const html = renderToStaticMarkup(h.tree);
  assert.match(html, /border-border\/60 bg-muted\/20/);
  assert.match(html, /lucide-check/);
  assert.match(html, /Sẵn sàng/);
  assert.match(html, /aria-label="Bỏ chọn nguồn"/);
  assert.doesNotMatch(html, /lucide-refresh|Kiểm tra lại|Check again/);
});

test('manual status recheck is a text recovery action only, never a ready-card icon', () => {
  for (const english of [false, true]) {
    const h = panelHarness({ english, source: { document_id: 'doc', name: 'source.pdf' } }, { 0: false, 7: 'Cannot check source', 9: true });
    assert.match(renderToStaticMarkup(h.tree), english ? /Check again/ : /Kiểm tra lại/);
    const ready = panelHarness({ english, source: { document_id: 'doc', name: 'source.pdf' } }, { 0: false, 6: 'doc', 9: true });
    assert.doesNotMatch(renderToStaticMarkup(ready.tree), /Check again|Kiểm tra lại|lucide-refresh/);
  }
});

test('started panel renders nothing and stops list/readiness effects without clearing conversation source', () => {
  const h = panelHarness({ creationStarted: true, source: { document_id: 'doc', name: 'source.pdf' } });
  assert.equal(h.tree, null);
  assert.equal(h.nodes.length, 0);
  h.effects[1](); h.effects[2](); // unexpected API mocks would throw if called
  assert.equal(h.calls.sources.length, 0);
  assert.equal(h.calls.creating, 0);
});

test('one upload entry routes documents to KB API, MP4 to existing transcript callback', async () => {
  const h = panelHarness();
  assert.equal(h.nodes.filter(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('Tải tài liệu lên kho tri thức')).length, 1);
  assert.equal(h.nodes.filter(node => node.type === 'input' && node.props.type === 'file').length, 1);
  const doc = { name: 'test.PDF', size: 1024 };
  assert.equal(h.choose(doc).value, '');
  h.choose(doc); // synchronous duplicate event is blocked while upload is pending
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.documents.length, 1);
  assert.equal(h.calls.documents[0][0], 'kb');
  assert.equal(h.calls.documents[0][1][0], doc);
  assert.equal(typeof h.calls.documents[0][2].onProgress, 'function');
  assert.equal(h.calls.sources[0].status, 'learning');
  assert.equal(h.calls.creating, 0);
  const video = { name: 'clip.MP4', size: 80 * 1024 * 1024 };
  h.choose(video);
  assert.equal(h.calls.videos[0], video);
  assert.equal(h.calls.documents.length, 1);
  assert.equal(h.calls.errors.length, 0);
});

test('cancel/invalid/unauthorized/busy/started selections do not call KB; MP4 keeps its own permission route', async () => {
  for (const [overrides, file, errors] of [
    [{}, undefined, 0], [{}, { name: 'a.exe', size: 100 }, 1],
    [{}, { name: 'a.pdf', size: 51 * 1024 * 1024 }, 1], [{}, { name: 'a.pdf', size: 0 }, 1],
    [{ canUpload: false }, { name: 'a.pdf', size: 100 }, 1],
    [{ kbId: undefined }, { name: 'a.pdf', size: 100 }, 1],
    [{ busy: true }, { name: 'a.pdf', size: 100 }, 0],
  ]) {
    const h = panelHarness(overrides); h.choose(file);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.documents.length, 0); assert.equal(h.calls.videos.length, 0);
    assert.equal(h.calls.errors.length, errors);
  }
  const h = panelHarness({ canUpload: false }); h.choose({ name: 'a.mp4', size: 100 });
  assert.equal(h.calls.videos.length, 1); assert.equal(h.calls.errors.length, 0);
});

// Run the actual refresh callback with deferred availability APIs. This models
// native-picker focus -> change ordering, which previously unmounted the input.
function refreshHarness({ tenant = 'tenant', fail = false } = {}) {
  const ast = ts.createSourceFile('widget.tsx', widget, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'refreshRuntimeAvailability') callback = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(callback);
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const states = []; const opened = [];
  const env = { runtimeAvailabilityRequestRef: { current: 0 }, runtimeTenantId: tenant,
    setRuntimeAvailability: state => states.push(state), setActiveBot() {},
    fetchActiveBot: async () => { const value = await pending; if (fail) throw new Error('denied'); return value; },
    isCourseOutline: true, fetchLessonAuthorChatSettings: async () => null,
    openRef: { current: true }, setSurface() {}, setOpen: value => opened.push(value) };
  const js = ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { refresh: runInNewContext(js, env), resolve, states, opened };
}

test('file-picker focus refresh leaves input mounted so change dispatches upload before availability resolves', async () => {
  const h = refreshHarness(); const panel = panelHarness();
  const request = h.refresh();
  assert.equal(h.states.includes('loading'), false, 'loading would render null and unmount the file input');
  panel.choose({ name: 'selected.pdf', size: 100 });
  assert.equal(panel.calls.documents.length, 1);
  h.resolve({ id: 'authorized-bot' }); await request;
  assert.deepEqual(h.states, ['available']); assert.deepEqual(h.opened, []);
});

test('focus refresh still closes on revoked deployment, missing tenant or availability error', async () => {
  for (const options of [{}, { fail: true }, { tenant: '' }]) {
    const h = refreshHarness(options); const pending = h.refresh(); h.resolve(null); await pending;
    assert.deepEqual(h.states, ['unavailable']);
    if (options.tenant !== '') assert.deepEqual(h.opened, [false]);
  }
  assert.match(widget, /useEffect\(\(\) => \{\s*setRuntimeAvailability\('loading'\);\s*void refreshRuntimeAvailability\(\)/);
});
test('stored learned status cannot enable generation before a fresh readiness check, EN/VI retained', () => {
  const html = renderToStaticMarkup(React.createElement(exports.LessonAuthorActionPanel, { ...props, english: true,
    source: { document_id: 'doc', kb_id: 'kb', name: 'Selected source', status: 'learned', type: 'file' } }));
  assert.match(html, /Selected source/);
  assert.match(html, /Create learning content/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Create learning content<\/button>/);
});
test('only expert composer is replaced; all its sends require a typed action and guard active conversation', () => {
  assert.match(widget, /isLessonAuthor \? lessonAuthorActionPanel : <div/);
  assert.match(widget, /active=\{voiceModeActive && !isLessonAuthor\}/);
  assert.match(widget, /isLessonAuthor && \(!action \|\| source === 'voice'\)/);
  assert.match(widget, /activeStreamConversationIdsRef\.current\.has\(currentConv.id\)/);
  assert.match(widget, /activeStreamConversationIdsRef\.current\.add\(conversationId\)/);
  assert.match(widget, /lesson_author_action: action/);
  assert.match(api, /lesson_author_action: options.lesson_author_action/);
  assert.match(widget, /chapterResume \? 'CONTINUE_CHAPTER'/);
  assert.match(widget, /'DRAFT_BLUEPRINT_CHAPTER'/);
  assert.match(widget, /'GENERATE_COURSE_BLUEPRINT'/);
});
test('scope restoration and polling never create content; source changes cannot claim cached readiness', () => {
  assert.match(source, /lesson-author-source-v1:\$\{scopeKey\}:\$\{kbId/);
  assert.match(widget, /scopeKey=\{`\$\{runtimeTenantId\}:\$\{user\?\.id\}:\$\{courseId\}:\$\{currentConv.id\}`\}/);
  assert.match(source, /setVerifiedId\(null\)/);
  assert.match(source, /row.document_id === source.document_id && row.kb_id === kbId/);
  assert.match(source, /current\?\.status === 'learned'/);
  assert.match(source, /const deadline = Date.now\(\) \+ 10 \* 60_000/);
  const ast = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effects = 0;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
      effects++;
      assert.doesNotMatch(node.getText(ast), /onCreate\(/);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(effects, 3);
  assert.match(source, /if \(!mounted.current\) return/);
});
test('upload uses existing KB permission/limits, does not auto-generate or pretend byte completion is indexing', () => {
  assert.match(widget, /hasPermission\('ai_chatbot', 'can_add'\) && canManageAiChatbot/);
  assert.match(source, /file.size > 50 \* 1024 \* 1024/);
  assert.match(source, /\['.pdf', '.doc', '.docx', '.pptx', '.txt', '.md', '.csv'\]/);
  assert.match(source, /uploadLock.current/);
  assert.match(source, /Waiting for KB acceptance/);
  assert.match(uploadApi, /timeout: 120_000/);
  assert.match(uploadApi, /\/api\/ai-chatbot\/kb\/\$\{kbId\}\/documents/);
  const upload = source.slice(source.indexOf('const upload = async'), source.indexOf('return <div'));
  assert.doesNotMatch(upload, /onCreate\(/);
});
