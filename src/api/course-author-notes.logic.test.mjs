/* global URL, Buffer */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./course-author-notes.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const logic = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const { readCourseAuthorNotesView, readAuthorNotes, unitAuthorNotes, courseLevelAuthorNotes, courseInfoProposal,
  authorNotesHasContent, authorNotesOutcomeLabel, COURSE_DESCRIPTION_MAX_CHARS } = logic;

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
