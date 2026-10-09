/* global URL, Buffer */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./course-author-notes.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const logic = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const { readCourseAuthorNotesView, readAuthorNotes, unitAuthorNotes, courseLevelAuthorNotes, courseInfoProposal,
  authorNotesHasContent, authorNotesOutcomeLabel, COURSE_DESCRIPTION_MAX_CHARS, courseAssessmentReviews, assessmentReviewReason,
  assessmentReviewKind, assessmentReviewPosition, courseNoteWithoutGuidanceLists, authorNotesListSplit, AUTHOR_NOTES_LIST_PREVIEW } = logic;

const id = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const courseId = 'course-v1:Nesso+364564+2026';
function notes(kind, overrides = {}) {
  return { version: 1, origin: 'ai_instructional_design', workspace_id: id(1), node_id: id(90), node_kind: kind,
    canonical_path: kind === 'course' ? 'course' : 'chapter_1', revision: 1, content_hash: 'a'.repeat(64), content_locale: 'vi',
    title: `AI ${kind}`, purpose: null, implementation_notes: null, storyboard: null, author_review: null, media_briefs: [],
    idm_guidance: null, ...overrides };
}
const brief = { node_id: id(70), revision: 0, content_hash: 'b'.repeat(64), media_type: 'video', title: 'Video 5Why',
  rationale: 'Minh hoạ', content_points: ['Tại sao 1'], context_description: null, implementation_notes: null };
function view() {
  return { course_id: courseId, course: { display_name: 'QC check 3', description: 'Mô tả cũ', root_block_id: id(10) }, blocks: [
    { block_id: id(10), parent_id: null, block_type: 'course', display_name: 'QC check 3', notes: notes('course', {
      title: 'BiC 5.0 — Thay đổi tư duy', implementation_notes: 'Hold: Tam Hóa',
      storyboard: { summary: 'Khoá học giúp CEO…', target_audience: 'CEO SME', prerequisites: [], assessment_strategy: '' },
      idm_guidance: { hold_items: [{ name: 'Tam Hóa', reason: 'Thiếu tiêu chí', sme_question: 'Tiêu chí là gì?', blocked_must_dos: ['Lập lộ trình'] }],
        pending_objectives: ['LO3'], nice_to_know: [{ name: '4 lực đẩy', summary: 'Bối cảnh' }] } }) },
    { block_id: id(11), parent_id: id(10), block_type: 'chapter', display_name: 'Chương 1', notes: notes('chapter', {
      storyboard: { objective: 'Hiểu Ladder', learning_outcomes: ['lo_1: Đánh giá bậc'] } }) },
    { block_id: id(12), parent_id: id(11), block_type: 'sequential', display_name: 'Mục 1', notes: notes('lesson', {
      implementation_notes: 'Ghi chú mục' }) },
    { block_id: id(13), parent_id: id(12), block_type: 'vertical', display_name: 'Bài 1', notes: notes('unit', {
      purpose: 'Người học tự định vị', implementation_notes: 'QA: đạt', media_briefs: [brief] }) },
    { block_id: id(14), parent_id: id(13), block_type: 'html', display_name: 'Lý thuyết', notes: notes('component', {
      author_review: { purpose: 'Giải thích', example_scenario: null, visual_asset: null, user_behavior_navigation: null } }) },
    { block_id: id(15), parent_id: id(13), block_type: 'problem', display_name: 'Quiz', notes: notes('component') },
  ] };
}

test('reads the editors-only envelope and hides unknown versions or malformed notes', () => {
  const parsed = readCourseAuthorNotesView(view(), courseId);
  assert.equal(parsed.blocks.length, 6);
  assert.equal(parsed.course.root_block_id, id(10));
  assert.throws(() => readCourseAuthorNotesView({ ...view(), course_id: 'other-course' }, courseId));
  assert.throws(() => readCourseAuthorNotesView(null, courseId));
  const mixed = view();
  mixed.blocks[1].notes = { ...mixed.blocks[1].notes, version: 2 };
  mixed.blocks[2].notes = { ...mixed.blocks[2].notes, implementation_notes: 'x'.repeat(8001) };
  assert.deepEqual(readCourseAuthorNotesView(mixed, courseId).blocks.map(b => b.block_id), [id(10), id(13), id(14), id(15)]);
  assert.equal(readAuthorNotes({ ...notes('unit'), origin: 'browser' }), null);
  assert.equal(readAuthorNotes(notes('unit', { content_locale: 'fr' })), null);
});

test('unit panel data is bound by exact block identity: unit, components, section and chapter', () => {
  const parsed = readCourseAuthorNotesView(view(), courseId);
  const unit = unitAuthorNotes(parsed, id(13));
  assert.equal(unit.unit.block_id, id(13)); assert.equal(unit.lesson.block_id, id(12)); assert.equal(unit.chapter.block_id, id(11));
  assert.deepEqual(unit.components.map(c => c.block_id), [id(14)], 'components without content are hidden');
  assert.equal(unit.briefCount, 1); assert.equal(unit.noteCount, 2);
  const other = unitAuthorNotes(parsed, id(99));
  assert.deepEqual([other.unit, other.lesson, other.chapter, other.components.length], [null, null, null, 0]);
  assert.equal(unitAuthorNotes(null, id(13)).unit, null);
});

test('course level collects course notes, IDM guidance and every media brief', () => {
  const level = courseLevelAuthorNotes(readCourseAuthorNotesView(view(), courseId));
  assert.equal(level.root.block_id, id(10)); assert.equal(level.hasAny, true);
  assert.equal(level.root.notes.idm_guidance.hold_items[0].sme_question, 'Tiêu chí là gì?');
  assert.deepEqual(level.mediaBriefs.map(entry => [entry.unit.display_name, entry.brief.title]), [['Bài 1', 'Video 5Why']]);
  assert.equal(courseLevelAuthorNotes(readCourseAuthorNotesView({ ...view(), blocks: [] }, courseId)).hasAny, false);
});

test('course title/summary are only proposed; in-use and too-long states are explicit', () => {
  const parsed = readCourseAuthorNotesView(view(), courseId);
  assert.deepEqual(courseInfoProposal(parsed, 'QC check 3'), { proposedTitle: 'BiC 5.0 — Thay đổi tư duy',
    proposedDescription: 'Khoá học giúp CEO…', titleInUse: false, descriptionInUse: false, descriptionTooLong: false });
  assert.equal(courseInfoProposal(parsed, ' BiC 5.0 — Thay đổi tư duy ').titleInUse, true);
  const long = view(); long.blocks[0].notes.storyboard.summary = 'x'.repeat(COURSE_DESCRIPTION_MAX_CHARS + 1);
  assert.equal(courseInfoProposal(readCourseAuthorNotesView(long, courseId), 'QC check 3').descriptionTooLong, true);
  assert.deepEqual(courseInfoProposal(null, 'Any'), { proposedTitle: null, proposedDescription: null, titleInUse: false,
    descriptionInUse: false, descriptionTooLong: false });
});

test('content detection and display helpers', () => {
  assert.equal(authorNotesHasContent(readAuthorNotes(notes('component'))), false);
  assert.equal(authorNotesHasContent(readAuthorNotes(notes('chapter', { storyboard: { objective: ' ' } }))), false);
  assert.equal(authorNotesHasContent(readAuthorNotes(notes('unit', { implementation_notes: 'QA' }))), true);
  assert.equal(authorNotesOutcomeLabel('lo_2: Lập Canvas'), 'Lập Canvas');
  assert.equal(authorNotesOutcomeLabel('Lập Canvas'), 'Lập Canvas');
});

// --- QLT-3: open assessment obligations and the complete SME list ----------------------------
const review = (n, unitNode, overrides = {}) => ({ obligation_id: id(100 + n), unit_node_id: unitNode,
  unit_path: 'chapter_1.lesson_1.unit_1', unit_title: 'Ma trận 4 trục', component_index: 2, required_kind: 'single_choice',
  learning_objective_refs: ['lo_1'], learning_objectives: ['Đánh giá hiện trạng theo 4 trục'],
  unresolved_reason: 'ASSESSMENT_SOURCE_CHECK_REQUIRED', evidence_fact_count: 9, ...overrides });
/** Course root + one applied unit (node id 91). `rootReviews` undefined = notes applied before QLT-3. */
function reviewView({ rootReviews, unitReviews, unitWorkspace = id(1) } = {}) {
  const base = view();
  base.blocks[0].notes = { ...base.blocks[0].notes, node_id: id(80),
    ...(rootReviews === undefined ? {} : { assessment_reviews: rootReviews }) };
  base.blocks[3].notes = { ...base.blocks[3].notes, node_id: id(91), workspace_id: unitWorkspace,
    ...(unitReviews === undefined ? {} : { assessment_reviews: unitReviews }) };
  return readCourseAuthorNotesView(base, courseId);
}

test('reads obligations and the complete SME list; earlier notes and malformed entries never break the view', () => {
  const parsed = readAuthorNotes(notes('unit', { assessment_reviews: [review(1, id(91)), { ...review(2, id(91)), obligation_id: 'x' },
    { ...review(3, id(91)), component_index: 0 }, { ...review(4, id(91)), unit_node_id: 'not-a-node' }] }));
  assert.deepEqual(parsed.assessment_reviews.map(item => [item.obligation_id, item.unit_node_id]), [[id(101), id(91)], [id(104), null]]);
  assert.equal(readAuthorNotes(notes('unit')).assessment_reviews, null, 'no list in notes applied before QLT-3');
  assert.equal(parsed.node_id, id(90)); assert.equal(parsed.workspace_id, id(1));
  const guidance = { hold_items: [], pending_objectives: [], nice_to_know: [] };
  assert.equal(readAuthorNotes(notes('course', { idm_guidance: guidance })).idm_guidance.sme_questions, null);
  assert.deepEqual(readAuthorNotes(notes('course', { idm_guidance: { ...guidance, sme_questions: ['Q1?', 7, ' ', 'Q2?'] } }))
    .idm_guidance.sme_questions, ['Q1?', 'Q2?']);
  assert.equal(authorNotesHasContent(readAuthorNotes(notes('unit', { assessment_reviews: [review(1, id(91))] }))), true);
  assert.equal(authorNotesHasContent(readAuthorNotes(notes('course', { idm_guidance: { ...guidance, sme_questions: ['Q?'] } }))), true);
});

test('unit obligations: the current root list wins, so a resolved one disappears and older units still show theirs', () => {
  const open = review(1, id(91)), other = review(2, id(92), { unit_path: 'chapter_4.lesson_2.unit_1' });
  // Fresh Apply: root and unit agree.
  assert.deepEqual(unitAuthorNotes(reviewView({ rootReviews: [open, other], unitReviews: [open] }), id(13)).reviews, [open]);
  // Resolved since: a semantic replay refreshed the root only; the unit copy is stale.
  assert.deepEqual(unitAuthorNotes(reviewView({ rootReviews: [other], unitReviews: [open] }), id(13)).reviews, []);
  // Applied before QLT-3, then re-applied as a replay: only the root carries the list.
  assert.deepEqual(unitAuthorNotes(reviewView({ rootReviews: [open, other] }), id(13)).reviews, [open]);
  // No root list (root applied before QLT-3) or another workspace: the unit's own list.
  assert.deepEqual(unitAuthorNotes(reviewView({ unitReviews: [open] }), id(13)).reviews, [open]);
  assert.deepEqual(unitAuthorNotes(reviewView({ rootReviews: [], unitReviews: [open], unitWorkspace: id(2) }), id(13)).reviews, [open]);
  assert.deepEqual(unitAuthorNotes(reviewView({ rootReviews: [open] }), id(12)).reviews, [], 'a section block owns no obligations');
  assert.deepEqual(unitAuthorNotes(null, id(13)).reviews, []);
});

test('course obligations are located by exact unit identity, with current Studio names, or marked not applied', () => {
  const entries = courseAssessmentReviews(reviewView({ rootReviews: [review(1, id(91)),
    review(2, id(92), { unit_path: 'chapter_4.lesson_2.unit_1', unit_title: 'Bản cam kết' }), review(1, id(91))] }));
  assert.deepEqual(entries.map(entry => [entry.review.obligation_id, entry.unit?.display_name ?? null, entry.lesson?.display_name ?? null,
    entry.chapter?.display_name ?? null]), [[id(101), 'Bài 1', 'Mục 1', 'Chương 1'], [id(102), null, null, null]], 'deduplicated');
  assert.deepEqual(courseAssessmentReviews(reviewView({ unitReviews: [review(1, id(91))] })).map(entry => entry.unit?.block_id),
    [id(13)], 'without a root list the units\' own lists are used');
  assert.deepEqual(courseAssessmentReviews(null), []);
  assert.equal(assessmentReviewReason('ASSESSMENT_SOURCE_CHECK_REQUIRED'), 'source_check');
  assert.equal(assessmentReviewReason('SOMETHING_NEW'), 'unknown');
  assert.equal(assessmentReviewKind('single_choice'), 'single_choice'); assert.equal(assessmentReviewKind('worksheet'), 'other');
  assert.deepEqual(assessmentReviewPosition('chapter_1.lesson_2.unit_7'), { chapter: 1, lesson: 2, unit: 7 });
  assert.equal(assessmentReviewPosition('course'), null);
});

// Shape of the real course note of run 8de1c76b (Python idm/notes.build_course_notes), shortened.
const courseNote = [
  '[Thiết kế theo quy trình ID — idm-1]',
  '• Thời lượng ước tính: 209 phút (13 mục, 4 chương).',
  '• Cần chuyên gia bổ sung (Hold) — chờ SME xác nhận (1), chưa đưa vào bài học:',
  '  1. Bộ lọc Tam Hóa — Tài liệu thiếu bộ tiêu chí. Câu hỏi cho SME: Tiêu chí là gì?',
  '• Mục tiêu học tập chờ SME (chưa hiển thị là kết quả đầu ra của khoá học):',
  '  - Học viên có thể thẩm định sáng kiến theo Tam Hóa.',
  '• Nội dung tham khảo đã lược (Nice to know) — 2 khối, tác giả có thể bổ sung thủ công:',
  '  - Triết lý Tam Doanh: Khai Doanh Trí…',
  '• Nội dung đã loại khỏi khoá (Remove) — 1 khối, kèm lý do:',
  '  - Lịch sử BiC: Thông tin tư liệu nền.',
  '• Câu hỏi khác cho SME:',
  '  - Câu hỏi 1?',
  '  và 12 mục khác',
  '• Cấu trúc được thiết kế theo Must Do, không theo mục lục tài liệu.',
].join('\n');

test('the course note drops only the truncated lists that are shown in full from the guidance', () => {
  const full = { hold_items: [{ name: 'Bộ lọc Tam Hóa', reason: null, sme_question: 'Tiêu chí là gì?', blocked_must_dos: [] }],
    pending_objectives: ['Thẩm định sáng kiến'], nice_to_know: [{ name: 'Tam Doanh', summary: '' }],
    sme_questions: Array.from({ length: 13 }, (_, index) => `Câu hỏi ${index + 1}?`) };
  const stripped = courseNoteWithoutGuidanceLists(courseNote, full);
  assert.equal(stripped.removed, true);
  assert.equal(stripped.text, ['[Thiết kế theo quy trình ID — idm-1]', '• Thời lượng ước tính: 209 phút (13 mục, 4 chương).',
    '• Nội dung đã loại khỏi khoá (Remove) — 1 khối, kèm lý do:', '  - Lịch sử BiC: Thông tin tư liệu nền.',
    '• Cấu trúc được thiết kế theo Must Do, không theo mục lục tài liệu.'].join('\n'));
  assert.doesNotMatch(stripped.text, /mục khác/);
  // Notes applied before QLT-3 have no SME list: that truncated section is the only copy and stays.
  const legacy = courseNoteWithoutGuidanceLists(courseNote, { ...full, sme_questions: null });
  assert.match(legacy.text, /• Câu hỏi khác cho SME:\n {2}- Câu hỏi 1\?\n {2}và 12 mục khác/);
  assert.doesNotMatch(legacy.text, /Cần chuyên gia bổ sung/);
  const english = '[Designed with the ID workflow — idm-1]\n• Other questions for the SME:\n  - Q1?\n  and 4 more\n• The structure follows the Must Dos.';
  assert.equal(courseNoteWithoutGuidanceLists(english, { ...full, sme_questions: ['Q1?'] }).text,
    '[Designed with the ID workflow — idm-1]\n• The structure follows the Must Dos.');
  assert.deepEqual(courseNoteWithoutGuidanceLists(courseNote, null), { text: courseNote, removed: false });
  assert.deepEqual(courseNoteWithoutGuidanceLists('Ghi chú cấp khoá', full), { text: 'Ghi chú cấp khoá', removed: false });
});

test('long lists keep every item: a preview plus the rest behind "show all"', () => {
  assert.deepEqual(authorNotesListSplit([1, 2, 3]), { shown: [1, 2, 3], more: [] });
  const many = Array.from({ length: 22 }, (_, index) => index + 1);
  const split = authorNotesListSplit(many);
  assert.equal(split.shown.length, AUTHOR_NOTES_LIST_PREVIEW);
  assert.deepEqual([...split.shown, ...split.more], many);
});
