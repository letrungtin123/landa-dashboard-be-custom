import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Real React SSR of the Studio panels with inert UI/network boundaries. This
// proves rendering, EN/VI copy and the editor-only gate; it does not claim
// browser focus, layout or live backend coverage.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const h = React.createElement;
const transpile = (filename, module) => ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
  module, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

const env = { canEdit: true, data: null, locale: 'en', queries: [] };
const locales = {};
for (const name of ['vi', 'en']) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpile(path.join(src, `i18n/locales/${name}.ts`), ts.ModuleKind.CommonJS))(
    specifier => specifier === './vi' ? locales.viModule : require(specifier), module, module.exports);
  if (name === 'vi') locales.viModule = module.exports;
  locales[name] = module.exports[name];
}
function t(key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], locales[env.locale]);
  assert.equal(typeof value, 'string', `missing ${env.locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(values[name]));
}
const element = tag => ({ children, className }) => h(tag, { className }, children);
const ui = {
  '@/components/ui/button': { Button: ({ children, disabled }) => h('button', { disabled }, children) },
  '@/components/ui/badge': { Badge: element('span') },
  '@/components/ui/collapsible': { Collapsible: element('div'), CollapsibleTrigger: element('button'), CollapsibleContent: element('div') },
  '@/components/ui/dialog': { Dialog: ({ children }) => h('div', { role: 'dialog' }, children), DialogContent: element('section'),
    DialogHeader: element('header'), DialogTitle: element('h2'), DialogDescription: element('p') },
  '@/components/ui/alert-dialog': { AlertDialog: ({ open, children }) => open ? h('div', { role: 'alertdialog' }, children) : null,
    AlertDialogContent: element('div'), AlertDialogHeader: element('div'), AlertDialogTitle: element('h3'),
    AlertDialogDescription: element('p'), AlertDialogFooter: element('div'), AlertDialogCancel: element('button'), AlertDialogAction: element('button') },
};
const logicModule = { exports: {} };
new Function('require', 'module', 'exports', transpile(path.join(src, 'api/course-author-notes.logic.ts'), ts.ModuleKind.CommonJS))(require, logicModule, logicModule.exports);
const network = { renamed: [], described: [] };
function localRequire(specifier) {
  if (ui[specifier]) return ui[specifier];
  if (specifier === 'react-i18next') return { useTranslation: () => ({ t }) };
  if (specifier === '@tanstack/react-query') return {
    useQuery: options => { env.queries.push(options); return { data: options.enabled ? env.data : undefined, isError: false, refetch: async () => {} }; },
    useQueryClient: () => ({ invalidateQueries: async () => {} }),
    useMutation: () => ({ mutate: () => {}, isPending: false }),
  };
  if (specifier === 'sonner') return { toast: { success: () => {}, error: () => {} } };
  if (specifier === 'lucide-react') return new Proxy({}, { get: () => () => h('i') });
  if (specifier === '@/utils/store') return { useAuthStore: selector => selector({ hasPermission: (module, action) => module === 'courses' && action === 'can_edit' && env.canEdit }) };
  if (specifier === '@/utils/localized-error') return { getLocalizedApiError: (_error, fallback) => fallback };
  if (specifier === '@/api/custom-course-authoring') return { renameBlock: async (...args) => network.renamed.push(args) };
  if (specifier === '@/api/custom-courses') return { updateCourse: async (...args) => network.described.push(args) };
  if (specifier === '@/api/course-author-notes') return { courseAuthorNotesQueryKey: id => ['course-author-notes', id], getCourseAuthorNotes: async () => env.data };
  if (specifier === '@/api/course-author-notes.logic') return logicModule.exports;
  return require(specifier);
}
const panelModule = { exports: {} };
new Function('require', 'module', 'exports', transpile(path.join(directory, 'AiAuthorNotes.tsx'), ts.ModuleKind.CommonJS))(localRequire, panelModule, panelModule.exports);
const { AiAuthorNotesUnitPanel, AiAuthorNotesCourseButton } = panelModule.exports;

const id = n => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const courseId = 'course-v1:Nesso+364564+2026';
const notes = (kind, overrides = {}) => ({ version: 1, origin: 'ai_instructional_design', workspace_id: id(1), node_id: id(80), node_kind: kind,
  canonical_path: 'x', revision: 4, content_hash: 'c'.repeat(64), content_locale: 'vi', title: `AI ${kind}`, purpose: null,
  implementation_notes: null, storyboard: null, author_review: null, media_briefs: [], idm_guidance: null, ...overrides });
env.data = logicModule.exports.readCourseAuthorNotesView({ course_id: courseId,
  course: { display_name: 'QC check 3', description: 'Mô tả cũ', root_block_id: id(10) }, blocks: [
    { block_id: id(10), parent_id: null, block_type: 'course', display_name: 'QC check 3', notes: notes('course', {
      title: 'BiC 5.0 — Thay đổi tư duy', storyboard: { summary: 'Khoá học giúp CEO SME', target_audience: 'CEO/BĐH SME',
        prerequisites: ['Kinh nghiệm quản lý'], assessment_strategy: 'Phiếu thực hành' }, implementation_notes: 'Ghi chú cấp khoá',
      idm_guidance: { hold_items: [{ name: 'Tam Hóa', reason: 'Thiếu tiêu chí đánh giá', sme_question: 'Tiêu chí Tam Hóa là gì?',
        blocked_must_dos: ['Áp dụng Tam Hóa'] }], pending_objectives: ['LO3 Tam Hóa'], nice_to_know: [{ name: '4 lực đẩy', summary: 'Bối cảnh thị trường' }] } }) },
    { block_id: id(11), parent_id: id(10), block_type: 'chapter', display_name: 'Chương 1', notes: notes('chapter', {
      storyboard: { objective: 'Định vị doanh nghiệp', learning_outcomes: ['lo_1: Đánh giá bậc Ladder'] } }) },
    { block_id: id(12), parent_id: id(11), block_type: 'sequential', display_name: 'Mục 1', notes: notes('lesson', {
      storyboard: { objective: 'Mục tiêu mục', learning_objectives: ['Áp dụng 5Why'], learning_activities: ['Phiếu 5Why'], assessment: 'MCQ' } }) },
    { block_id: id(13), parent_id: id(12), block_type: 'vertical', display_name: 'Bài 1', notes: notes('unit', {
      purpose: 'Người học tự phân tích 5Why', implementation_notes: 'QA tự động: đạt sau khi tự sửa',
      media_briefs: [{ node_id: id(70), revision: 0, content_hash: 'd'.repeat(64), media_type: 'video', title: 'Video chuỗi 5Why',
        rationale: 'Minh hoạ', content_points: ['Tại sao 1', 'Tại sao 2'], context_description: 'Xưởng', implementation_notes: null }] }) },
    { block_id: id(14), parent_id: id(13), block_type: 'html', display_name: 'Lý thuyết 5Why', notes: notes('component', {
      implementation_notes: 'Ghi chú thành phần', author_review: { purpose: 'Giải thích', example_scenario: 'Tình huống xưởng',
        visual_asset: null, user_behavior_navigation: null } }) },
  ] }, courseId);

const render = component => renderToStaticMarkup(component);

test('unit panel shows unit, content, section and chapter notes plus media briefs, marked authors-only (EN/VI)', () => {
  for (const [locale, title, badge] of [['en', 'AI ID notes for authors', 'Authors only'], ['vi', 'Ghi chú AI ID cho tác giả', 'Chỉ tác giả xem']]) {
    env.locale = locale;
    const html = render(h(AiAuthorNotesUnitPanel, { courseId, unitId: id(13) }));
    for (const text of [title, badge, 'QA tự động: đạt sau khi tự sửa', 'Người học tự phân tích 5Why', 'Video chuỗi 5Why', 'Tại sao 2',
      'Lý thuyết 5Why', 'Ghi chú thành phần', 'Tình huống xưởng', 'Mục tiêu mục', 'Phiếu 5Why', 'Định vị doanh nghiệp', 'Đánh giá bậc Ladder']) {
      assert.ok(html.includes(text), `${locale}: ${text}`);
    }
    assert.equal(html.includes('lo_1:'), false, 'machine objective marker hidden');
    assert.equal(html.includes('aiAuthorNotes.'), false, 'no raw translation keys');
  }
});

test('notes are editors-only and absent for non-AI units', () => {
  env.locale = 'en';
  env.canEdit = false; env.queries = [];
  assert.equal(render(h(AiAuthorNotesUnitPanel, { courseId, unitId: id(13) })), '');
  assert.equal(render(h(AiAuthorNotesCourseButton, { courseId, rootBlockId: id(10), currentName: 'QC check 3', onCourseChanged: () => {} })), '');
  assert.ok(env.queries.length > 0 && env.queries.every(query => query.enabled === false), 'no request without courses.can_edit');
  env.canEdit = true;
  assert.equal(render(h(AiAuthorNotesUnitPanel, { courseId, unitId: id(99) })), '');
});

test('course dialog lists Hold/SME/nice-to-know/media and only proposes title and description', () => {
  for (const [locale, useName, hold] of [['en', 'Use as course name', 'Needs SME input (Hold)'], ['vi', 'Dùng làm tên khoá học', 'Cần chuyên gia bổ sung (Hold)']]) {
    env.locale = locale;
    const html = render(h(AiAuthorNotesCourseButton, { courseId, rootBlockId: id(10), currentName: 'QC check 3', onCourseChanged: () => {} }));
    for (const text of [useName, hold, 'QC check 3', 'BiC 5.0 — Thay đổi tư duy', 'Khoá học giúp CEO SME', 'CEO/BĐH SME',
      'Tiêu chí Tam Hóa là gì?', 'Thiếu tiêu chí đánh giá', 'Áp dụng Tam Hóa', 'LO3 Tam Hóa', '4 lực đẩy', 'Video chuỗi 5Why', 'Ghi chú cấp khoá']) {
      assert.ok(html.includes(text), `${locale}: ${text}`);
    }
    assert.equal(html.includes('role="alertdialog"'), false, 'nothing is applied without an explicit confirmation');
  }
  assert.deepEqual(network, { renamed: [], described: [] }, 'rendering never writes the course');
  env.locale = 'en';
  const inUse = render(h(AiAuthorNotesCourseButton, { courseId, rootBlockId: id(10), currentName: 'BiC 5.0 — Thay đổi tư duy', onCourseChanged: () => {} }));
  assert.match(inUse, /<button disabled="">In use<\/button>/);
});

test('Studio mounts both panels, refreshes notes after Apply and keeps every key in both locales', () => {
  const unitEditor = readFileSync(path.join(directory, 'UnitEditor.tsx'), 'utf8');
  const page = readFileSync(path.join(src, 'pages/course-editor.tsx'), 'utf8');
  const panel = readFileSync(path.join(directory, 'AiAuthorNotes.tsx'), 'utf8');
  assert.match(unitEditor, /\{courseId && <AiAuthorNotesUnitPanel courseId=\{courseId\} unitId=\{unitId\} \/>\}/);
  assert.equal((page.match(/<AiAuthorNotesCourseButton /g) ?? []).length, 2, 'desktop sidebar and mobile outline sheet');
  assert.match(page, /invalidateQueries\(\{ queryKey: courseAuthorNotesQueryKey\(courseId\), exact: true \}\)/);
  assert.match(panel, /enabled: canEdit && !!courseId/);
  const keys = [...new Set([...panel.matchAll(/t\('(aiAuthorNotes\.[A-Za-z]+)'/g)].map(match => match[1]))];
  assert.ok(keys.length > 40);
  for (const key of keys) for (const locale of ['vi', 'en']) {
    env.locale = locale; assert.doesNotThrow(() => t(key), `${locale} ${key}`);
  }
  assert.deepEqual(Object.keys(locales.vi.aiAuthorNotes), Object.keys(locales.en.aiAuthorNotes));
});

// --- QLT-3 (QC run 8de1c76b): open obligations and the complete SME list -----------------------
const SME = Array.from({ length: 22 }, (_, index) => `Câu hỏi SME số ${index + 1}?`);
const obligation = (n, unitNode, overrides = {}) => ({ obligation_id: id(200 + n), unit_node_id: unitNode,
  unit_path: 'chapter_1.lesson_1.unit_1', unit_title: 'Ma trận 4 trục', component_index: 2, required_kind: 'single_choice',
  learning_objective_refs: ['lo_1'], learning_objectives: ['Đánh giá hiện trạng hệ điều hành tư duy theo 4 trục'],
  unresolved_reason: 'ASSESSMENT_SOURCE_CHECK_REQUIRED', evidence_fact_count: 9, ...overrides });
function qlt3View() {
  const truncatedNote = ['[Thiết kế theo quy trình ID — idm-1]', '• Câu hỏi khác cho SME:', ...SME.slice(0, 10).map(question => `  - ${question}`),
    '  và 12 mục khác', '• Cấu trúc được thiết kế theo Must Do, không theo mục lục tài liệu.'].join('\n');
  const reviews = [obligation(1, id(81)), obligation(2, id(82), { unit_path: 'chapter_4.lesson_2.unit_1', unit_title: 'Bản cam kết hành động',
    learning_objectives: [], learning_objective_refs: ['lo_1'], unresolved_reason: 'SOME_FUTURE_CODE', evidence_fact_count: 13 })];
  return logicModule.exports.readCourseAuthorNotesView({ course_id: courseId,
    course: { display_name: 'QC check 4', description: null, root_block_id: id(10) }, blocks: [
      { block_id: id(10), parent_id: null, block_type: 'course', display_name: 'QC check 4', notes: notes('course', {
        implementation_notes: truncatedNote, assessment_reviews: reviews,
        idm_guidance: { hold_items: [], pending_objectives: [], nice_to_know: [], sme_questions: SME } }) },
      { block_id: id(11), parent_id: id(10), block_type: 'chapter', display_name: 'Chương 1', notes: notes('chapter', { purpose: 'Định vị' }) },
      { block_id: id(12), parent_id: id(11), block_type: 'sequential', display_name: 'Mục 1', notes: notes('lesson', { purpose: 'Thói quen cũ' }) },
      // Unit applied before QLT-3 (no own list): the current root list still reaches it.
      { block_id: id(13), parent_id: id(12), block_type: 'vertical', display_name: 'Bài 1 đã đổi tên', notes: notes('unit', {
        node_id: id(81), purpose: 'Người học đối chiếu 4 trục' }) },
    ] }, courseId);
}

test('unit panel: open obligations are a visible "needs your review" block with a plain explanation (EN/VI)', () => {
  const original = env.data; env.data = qlt3View();
  try {
    for (const [locale, title, slot, why, action, count] of [
      ['en', 'Needs your review', 'Content slot 2 in this lesson', 'could not write a question it could reliably verify against the source',
        'against the 9 source passages of this lesson', '1 to review'],
      ['vi', 'Cần bạn kiểm tra', 'Vị trí nội dung thứ 2 trong bài', 'chưa tạo được câu hỏi có thể đối chiếu chắc chắn với tài liệu nguồn',
        'với 9 đoạn trích trong tài liệu nguồn của bài này', '1 mục cần kiểm tra'],
    ]) {
      env.locale = locale;
      const html = render(h(AiAuthorNotesUnitPanel, { courseId, unitId: id(13) }));
      for (const text of [title, slot, why, action, count, 'Đánh giá hiện trạng hệ điều hành tư duy theo 4 trục', 'data-testid="ai-author-notes-reviews"']) {
        assert.ok(html.includes(text), `${locale}: ${text}`);
      }
      assert.equal(html.includes('ASSESSMENT_SOURCE_CHECK_REQUIRED'), false, 'known codes are explained, not shown');
      assert.equal(html.includes('Bản cam kết hành động'), false, 'another unit\'s obligation never shows here');
      assert.equal(html.includes('aiAuthorNotes.'), false);
      assert.ok(html.indexOf('data-testid="ai-author-notes-reviews"') < html.indexOf(locale === 'en' ? 'This lesson' : 'Bài học này'),
        'shown before the collapsible read-only notes');
    }
  } finally { env.data = original; }
});

test('course dialog: every obligation located, the complete SME list (collapsible) and no truncated copy (EN/VI)', () => {
  const original = env.data; env.data = qlt3View();
  try {
    for (const [locale, title, count, sme, showAll, notApplied, unknown, below] of [
      ['en', 'Needs your review', '2 to review', 'Other questions for the SME', 'Show all (22)',
        'Chapter 4 · Section 2 · Lesson 1 · not applied to the course yet',
        'Needs an author check before publishing (code SOME_FUTURE_CODE).', 'listed in full in the sections below'],
      ['vi', 'Cần bạn kiểm tra', '2 mục cần kiểm tra', 'Câu hỏi khác cho SME', 'Hiện tất cả (22)',
        'Chương 4 · Mục 2 · Bài 1 · chưa áp dụng vào khoá học',
        'Cần tác giả kiểm tra trước khi xuất bản (mã SOME_FUTURE_CODE).', 'được liệt kê đầy đủ ở các phần bên dưới'],
    ]) {
      env.locale = locale;
      const html = render(h(AiAuthorNotesCourseButton, { courseId, rootBlockId: id(10), currentName: 'QC check 4', onCourseChanged: () => {} }));
      for (const text of [title, count, sme, showAll, notApplied, unknown, below, 'Chương 1 › Mục 1 › Bài 1 đã đổi tên',
        'Bản cam kết hành động', ...SME]) {
        assert.ok(html.includes(text), `${locale}: ${text}`);
      }
      assert.equal(html.includes('mục khác'), false, 'the truncated SME list of the course note is not shown');
      assert.equal(html.includes('[Thiết kế theo quy trình ID — idm-1]'), true, 'the rest of the course note stays');
      assert.equal(html.includes('aiAuthorNotes.'), false);
    }
    assert.deepEqual(network, { renamed: [], described: [] });
  } finally { env.data = original; }
});
