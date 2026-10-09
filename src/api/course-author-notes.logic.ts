/**
 * AI ID author notes (QC 364564, defect N6) — pure browser contract.
 *
 * The backend stores author-only design output of an AI ID Apply under
 * `course_blocks.metadata.ai_id_author_notes` (v1) and serves it only through
 * the `courses.can_edit` author-notes endpoint. This module validates that
 * response defensively (no runtime imports so node tests can load it) and
 * derives what the Studio panels show. Notes are read-only here.
 */
export type AuthorNotesKind = 'course' | 'chapter' | 'lesson' | 'unit' | 'component';

export interface AuthorNotesMediaBrief {
  node_id: string;
  revision: number;
  media_type: 'video' | 'static_infographic' | null;
  title: string;
  rationale: string | null;
  content_points: string[];
  context_description: string | null;
  implementation_notes: string | null;
}

export interface AuthorNotesReview {
  purpose: string | null;
  example_scenario: string | null;
  visual_asset: string | null;
  user_behavior_navigation: string | null;
}

export interface AuthorNotesGuidance {
  hold_items: Array<{ name: string; reason: string | null; sme_question: string | null; blocked_must_dos: string[] }>;
  pending_objectives: string[];
  nice_to_know: Array<{ name: string; summary: string }>;
  /** Complete "other questions for the SME" list (QLT-3); null in notes
   * applied before it existed (the course note then holds a truncated list). */
  sme_questions: string[] | null;
}

/** One open assessment obligation recorded at Apply (QLT-3): a planned check
 * question the AI could not verify against the source. */
export interface AuthorNotesAssessmentReview {
  obligation_id: string;
  unit_node_id: string | null;
  unit_path: string;
  unit_title: string | null;
  component_index: number;
  required_kind: string;
  learning_objective_refs: string[];
  learning_objectives: string[];
  unresolved_reason: string;
  evidence_fact_count: number;
}

export interface AuthorNotes {
  /** Workspace identity of the notes (exact match only, never displayed). */
  workspace_id: string | null;
  node_id: string | null;
  node_kind: AuthorNotesKind;
  revision: number;
  content_locale: 'vi' | 'en';
  title: string;
  purpose: string | null;
  implementation_notes: string | null;
  storyboard: Record<string, string | string[]> | null;
  author_review: AuthorNotesReview | null;
  media_briefs: AuthorNotesMediaBrief[];
  idm_guidance: AuthorNotesGuidance | null;
  /** Unit: its own open obligations; course root: the run-wide list (V2).
   * null when the notes carry no list (V1, or applied before QLT-3). */
  assessment_reviews: AuthorNotesAssessmentReview[] | null;
}

export interface AuthorNotesBlock {
  block_id: string;
  parent_id: string | null;
  block_type: string;
  display_name: string;
  notes: AuthorNotes;
}

export interface CourseAuthorNotesView {
  course_id: string;
  course: { display_name: string; description: string | null; root_block_id: string | null };
  blocks: AuthorNotesBlock[];
}

/** Same bound as the backend course update (`description` 1..5000 chars). */
export const COURSE_DESCRIPTION_MAX_CHARS = 5000;

const KINDS: readonly AuthorNotesKind[] = ['course', 'chapter', 'lesson', 'unit', 'component'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same bounds as the backend notes contract. */
export const AUTHOR_NOTES_ASSESSMENT_REVIEWS_MAX = 200;
export const AUTHOR_NOTES_SME_QUESTIONS_MAX = 300;

export class CourseAuthorNotesContractError extends Error {
  constructor() { super('COURSE_AUTHOR_NOTES_INVALID'); this.name = 'CourseAuthorNotesContractError'; }
}
function invalid(): never { throw new CourseAuthorNotesContractError(); }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  const parsed = text(value, max);
  return parsed === null ? undefined : parsed.trim() ? parsed : null;
}
function lines(value: unknown, count: number, max: number): string[] | null {
  return Array.isArray(value) && value.length <= count && value.every(line => typeof line === 'string' && line.length <= max)
    ? value as string[] : null;
}
function revision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readBrief(value: unknown): AuthorNotesMediaBrief | null {
  const source = record(value);
  if (!source) return null;
  const mediaType = source.media_type === 'video' || source.media_type === 'static_infographic' ? source.media_type : null;
  const title = text(source.title, 500), rev = revision(source.revision), points = lines(source.content_points, 16, 1000);
  const rationale = optionalText(source.rationale, 8000), context = optionalText(source.context_description, 2000);
  const notes = optionalText(source.implementation_notes, 8000);
  if (typeof source.node_id !== 'string' || title === null || rev === null || points === null
    || rationale === undefined || context === undefined || notes === undefined) return null;
  return { node_id: source.node_id, revision: rev, media_type: mediaType, title, rationale, content_points: points,
    context_description: context, implementation_notes: notes };
}

function readReview(value: unknown): AuthorNotesReview | null {
  const source = record(value);
  if (!source) return null;
  const review: AuthorNotesReview = { purpose: null, example_scenario: null, visual_asset: null, user_behavior_navigation: null };
  for (const key of Object.keys(review) as Array<keyof AuthorNotesReview>) {
    const parsed = optionalText(source[key] ?? null, 2000);
    if (parsed === undefined) return null;
    review[key] = parsed;
  }
  return Object.values(review).some(Boolean) ? review : null;
}

function readGuidance(value: unknown): AuthorNotesGuidance | null {
  const source = record(value);
  if (!source || !Array.isArray(source.hold_items) || !Array.isArray(source.nice_to_know)) return null;
  const pending = lines(source.pending_objectives, 200, 2000);
  if (!pending) return null;
  const holds = source.hold_items.slice(0, 200).flatMap(item => {
    const hold = record(item), name = text(hold?.name, 2000), blocked = lines(hold?.blocked_must_dos, 64, 2000);
    const reason = optionalText(hold?.reason ?? null, 4000), question = optionalText(hold?.sme_question ?? null, 4000);
    return name && blocked && reason !== undefined && question !== undefined
      ? [{ name, reason, sme_question: question, blocked_must_dos: blocked }] : [];
  });
  const niceToKnow = source.nice_to_know.slice(0, 400).flatMap(item => {
    const entry = record(item), name = text(entry?.name, 2000), summary = text(entry?.summary, 4000);
    return name && summary !== null ? [{ name, summary }] : [];
  });
  const questions = Array.isArray(source.sme_questions)
    ? source.sme_questions.slice(0, AUTHOR_NOTES_SME_QUESTIONS_MAX).flatMap(item => {
      const question = text(item, 2000);
      return question && question.trim() ? [question] : [];
    }) : null;
  return { hold_items: holds, pending_objectives: pending, nice_to_know: niceToKnow, sme_questions: questions };
}

function count(value: unknown, min: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;
}

function readAssessmentReview(value: unknown): AuthorNotesAssessmentReview | null {
  const source = record(value);
  if (!source) return null;
  const unitPath = text(source.unit_path, 240), title = optionalText(source.unit_title ?? null, 500);
  const index = count(source.component_index, 1), facts = count(source.evidence_fact_count, 0);
  const refs = lines(source.learning_objective_refs, 24, 32), objectives = lines(source.learning_objectives, 24, 2000);
  const kind = text(source.required_kind, 32), reason = text(source.unresolved_reason, 100);
  const unitNodeId = typeof source.unit_node_id === 'string' && UUID.test(source.unit_node_id) ? source.unit_node_id : null;
  if (typeof source.obligation_id !== 'string' || !UUID.test(source.obligation_id) || !unitPath || title === undefined
    || index === null || facts === null || !refs || !objectives || !kind || !reason) return null;
  return { obligation_id: source.obligation_id, unit_node_id: unitNodeId, unit_path: unitPath, unit_title: title,
    component_index: index, required_kind: kind, learning_objective_refs: refs,
    learning_objectives: objectives.filter(line => line.trim()), unresolved_reason: reason, evidence_fact_count: facts };
}

function readAssessmentReviews(value: unknown): AuthorNotesAssessmentReview[] | null {
  if (!Array.isArray(value)) return null;
  return value.slice(0, AUTHOR_NOTES_ASSESSMENT_REVIEWS_MAX).map(readAssessmentReview)
    .filter((review): review is AuthorNotesAssessmentReview => !!review);
}

function readStoryboard(value: unknown): Record<string, string | string[]> | null {
  const source = record(value);
  if (!source) return null;
  const entries = Object.entries(source).flatMap(([key, item]): Array<[string, string | string[]]> => {
    if (typeof item === 'string') return item.length <= 8000 ? [[key, item]] : [];
    const parsed = lines(item, 64, 2000);
    return parsed ? [[key, parsed]] : [];
  });
  return entries.length ? Object.fromEntries(entries) : null;
}

/** Version 1 only. Unknown versions or malformed notes are hidden, never guessed. */
export function readAuthorNotes(value: unknown): AuthorNotes | null {
  const source = record(value);
  if (!source || source.version !== 1 || source.origin !== 'ai_instructional_design') return null;
  const kind = KINDS.find(candidate => candidate === source.node_kind);
  const rev = revision(source.revision), title = text(source.title, 500);
  const purpose = optionalText(source.purpose, 8000), notes = optionalText(source.implementation_notes, 8000);
  if (!kind || rev === null || title === null || purpose === undefined || notes === undefined
    || (source.content_locale !== 'vi' && source.content_locale !== 'en') || !Array.isArray(source.media_briefs)) return null;
  const identity = (value: unknown) => typeof value === 'string' && UUID.test(value) ? value : null;
  return { workspace_id: identity(source.workspace_id), node_id: identity(source.node_id),
    node_kind: kind, revision: rev, content_locale: source.content_locale, title, purpose, implementation_notes: notes,
    storyboard: readStoryboard(source.storyboard), author_review: readReview(source.author_review),
    media_briefs: source.media_briefs.slice(0, 32).map(readBrief).filter((brief): brief is AuthorNotesMediaBrief => !!brief),
    idm_guidance: readGuidance(source.idm_guidance), assessment_reviews: readAssessmentReviews(source.assessment_reviews) };
}

/** Envelope from GET /api/course-authoring/author-notes/:courseId. */
export function readCourseAuthorNotesView(value: unknown, courseId: string): CourseAuthorNotesView {
  const source = record(value), course = record(source?.course);
  if (!source || !course || source.course_id !== courseId || !Array.isArray(source.blocks)
    || typeof course.display_name !== 'string') invalid();
  const description = course.description === null || course.description === undefined ? null
    : typeof course.description === 'string' ? course.description : invalid();
  const rootBlockId = typeof course.root_block_id === 'string' ? course.root_block_id : null;
  const blocks = (source.blocks as unknown[]).flatMap(item => {
    const block = record(item);
    const notes = readAuthorNotes(block?.notes);
    if (!block || !notes || typeof block.block_id !== 'string' || typeof block.block_type !== 'string'
      || (block.parent_id !== null && typeof block.parent_id !== 'string')) return [];
    return [{ block_id: block.block_id, parent_id: block.parent_id as string | null, block_type: block.block_type,
      display_name: typeof block.display_name === 'string' ? block.display_name : notes.title, notes }];
  });
  return { course_id: courseId, course: { display_name: course.display_name, description, root_block_id: rootBlockId }, blocks };
}

/** True when a notes value has anything an author can read. */
export function authorNotesHasContent(notes: AuthorNotes | null | undefined): boolean {
  if (!notes) return false;
  const guidance = notes.idm_guidance;
  return !!(notes.purpose || notes.implementation_notes || notes.media_briefs.length || notes.author_review
    || (notes.storyboard && Object.values(notes.storyboard).some(value => Array.isArray(value) ? value.length : value.trim()))
    || (guidance && (guidance.hold_items.length || guidance.pending_objectives.length || guidance.nice_to_know.length
      || guidance.sme_questions?.length))
    || notes.assessment_reviews?.length);
}

export interface CourseLevelAuthorNotes {
  root: AuthorNotesBlock | null;
  mediaBriefs: Array<{ unit: AuthorNotesBlock; brief: AuthorNotesMediaBrief }>;
  hasAny: boolean;
}

export function courseLevelAuthorNotes(view: CourseAuthorNotesView | null | undefined): CourseLevelAuthorNotes {
  const blocks = view?.blocks ?? [];
  const root = blocks.find(block => block.notes.node_kind === 'course'
    && (!view?.course.root_block_id || block.block_id === view.course.root_block_id)) ?? null;
  const mediaBriefs = blocks.flatMap(block => block.notes.media_briefs.map(brief => ({ unit: block, brief })));
  return { root, mediaBriefs, hasAny: blocks.some(block => authorNotesHasContent(block.notes)) };
}

/**
 * The run-wide obligation list of the course root, when it is current for
 * this unit's workspace. Every Apply (also a semantic replay, which must not
 * touch mapped blocks) refreshes the root, while a mapped unit's own copy is
 * refreshed only by the next non-replay Apply. So the root list wins: an
 * obligation resolved since then disappears, and a course applied before
 * QLT-3 shows its obligations after any re-Apply.
 */
function currentRootReviews(view: CourseAuthorNotesView | null | undefined, workspaceId: string | null): AuthorNotesAssessmentReview[] | null {
  const root = courseLevelAuthorNotes(view).root;
  return root?.notes.assessment_reviews && root.notes.workspace_id && root.notes.workspace_id === workspaceId
    ? root.notes.assessment_reviews : null;
}

/** Open obligations shown on one unit block (exact identity, never by title). */
export function unitAssessmentReviews(view: CourseAuthorNotesView | null | undefined, unit: AuthorNotesBlock | null): AuthorNotesAssessmentReview[] {
  if (!unit || unit.notes.node_kind !== 'unit') return [];
  const fromRoot = currentRootReviews(view, unit.notes.workspace_id);
  if (fromRoot) return unit.notes.node_id ? fromRoot.filter(review => review.unit_node_id === unit.notes.node_id) : [];
  return unit.notes.assessment_reviews ?? [];
}

export interface UnitAuthorNotes {
  unit: AuthorNotesBlock | null;
  lesson: AuthorNotesBlock | null;
  chapter: AuthorNotesBlock | null;
  components: AuthorNotesBlock[];
  /** Open assessment obligations of this unit ("needs your review"). */
  reviews: AuthorNotesAssessmentReview[];
  briefCount: number;
  noteCount: number;
}

/** Notes shown on one unit (vertical): the unit itself, its components and
 * the enclosing section/chapter context, found by exact block identity. */
export function unitAuthorNotes(view: CourseAuthorNotesView | null | undefined, unitId: string): UnitAuthorNotes {
  const byId = new Map((view?.blocks ?? []).map(block => [block.block_id, block]));
  const unit = byId.get(unitId) ?? null;
  const lesson = unit?.parent_id ? byId.get(unit.parent_id) ?? null : null;
  const chapter = lesson?.parent_id ? byId.get(lesson.parent_id) ?? null : null;
  const components = (view?.blocks ?? []).filter(block => block.parent_id === unitId && block.notes.node_kind === 'component'
    && authorNotesHasContent(block.notes));
  const visible = [unit, lesson, chapter, ...components].filter((block): block is AuthorNotesBlock => !!block && authorNotesHasContent(block.notes));
  return {
    unit: unit && authorNotesHasContent(unit.notes) ? unit : null,
    lesson: lesson && authorNotesHasContent(lesson.notes) ? lesson : null,
    chapter: chapter && authorNotesHasContent(chapter.notes) ? chapter : null,
    components,
    reviews: unitAssessmentReviews(view, unit),
    briefCount: unit?.notes.media_briefs.length ?? 0,
    noteCount: visible.filter(block => block.notes.implementation_notes).length,
  };
}

export interface CourseAssessmentReviewEntry {
  review: AuthorNotesAssessmentReview;
  /** The applied unit block and its section/chapter (current Studio names), or null when not applied. */
  unit: AuthorNotesBlock | null;
  lesson: AuthorNotesBlock | null;
  chapter: AuthorNotesBlock | null;
}

/** Every open obligation for the course dialog: the root list when present,
 * else the units' own lists (deduplicated), each located by exact identity. */
export function courseAssessmentReviews(view: CourseAuthorNotesView | null | undefined): CourseAssessmentReviewEntry[] {
  const blocks = view?.blocks ?? [];
  const root = courseLevelAuthorNotes(view).root;
  const byId = new Map(blocks.map(block => [block.block_id, block]));
  const units = blocks.filter(block => block.notes.node_kind === 'unit' && block.notes.node_id);
  const reviews = root?.notes.assessment_reviews
    ?? units.flatMap(unit => unit.notes.assessment_reviews ?? []);
  const seen = new Set<string>();
  return reviews.filter(review => !seen.has(review.obligation_id) && !!seen.add(review.obligation_id)).map(review => {
    const unit = review.unit_node_id ? units.find(block => block.notes.node_id === review.unit_node_id
      && (!root?.notes.workspace_id || block.notes.workspace_id === root.notes.workspace_id)) ?? null : null;
    const lesson = unit?.parent_id ? byId.get(unit.parent_id) ?? null : null;
    const chapter = lesson?.parent_id ? byId.get(lesson.parent_id) ?? null : null;
    return { review, unit, lesson, chapter };
  });
}

/** Known `unresolved_reason` codes Studio explains in words; others are shown generically with the code. */
export type AssessmentReviewReason = 'source_check' | 'unknown';
export function assessmentReviewReason(code: string): AssessmentReviewReason {
  return code === 'ASSESSMENT_SOURCE_CHECK_REQUIRED' ? 'source_check' : 'unknown';
}
export type AssessmentReviewKind = 'single_choice' | 'other';
export function assessmentReviewKind(kind: string): AssessmentReviewKind {
  return kind === 'single_choice' ? 'single_choice' : 'other';
}
/** `chapter_1.lesson_2.unit_7` → 1, 2, 7 (Studio: chapter · section · lesson). */
export function assessmentReviewPosition(path: string): { chapter: number; lesson: number; unit: number } | null {
  const match = /^chapter_([1-9][0-9]*)\.lesson_([1-9][0-9]*)\.unit_([1-9][0-9]*)$/.exec(path);
  return match ? { chapter: Number(match[1]), lesson: Number(match[2]), unit: Number(match[3]) } : null;
}

/** Long author lists show a preview and a "show all" toggle; nothing is dropped. */
export const AUTHOR_NOTES_LIST_PREVIEW = 5;
export const AUTHOR_NOTES_LIST_COLLAPSE_AT = 8;
export function authorNotesListSplit<T>(values: readonly T[]): { shown: T[]; more: T[] } {
  return values.length > AUTHOR_NOTES_LIST_COLLAPSE_AT
    ? { shown: values.slice(0, AUTHOR_NOTES_LIST_PREVIEW), more: values.slice(AUTHOR_NOTES_LIST_PREVIEW) }
    : { shown: [...values], more: [] };
}

/** Section headers of the AI ID course note (Python `idm/notes.build_course_notes`, VI and EN) whose
 * complete lists Studio shows from the structured guidance. The note truncates them ("và N mục khác"). */
const COURSE_NOTE_SECTIONS: ReadonlyArray<{ list: 'hold_items' | 'pending_objectives' | 'nice_to_know' | 'sme_questions'; prefixes: string[] }> = [
  { list: 'hold_items', prefixes: ['• Cần chuyên gia bổ sung (Hold)', '• Needs SME input (Hold)'] },
  { list: 'pending_objectives', prefixes: ['• Mục tiêu học tập chờ SME', '• Learning objectives awaiting the SME'] },
  { list: 'nice_to_know', prefixes: ['• Nội dung tham khảo đã lược (Nice to know)', '• Reference content left out (Nice to know)'] },
  { list: 'sme_questions', prefixes: ['• Câu hỏi khác cho SME', '• Other questions for the SME'] },
];

/**
 * The course implementation note without the sections Studio already lists in
 * full from `idm_guidance`, so the author never reads a truncated copy next to
 * the complete one. A section is removed only when its structured list is
 * non-empty; an unknown note layout is returned unchanged.
 */
export function courseNoteWithoutGuidanceLists(note: string, guidance: AuthorNotesGuidance | null): { text: string; removed: boolean } {
  if (!guidance) return { text: note, removed: false };
  const covered = COURSE_NOTE_SECTIONS.filter(section => (guidance[section.list]?.length ?? 0) > 0).flatMap(section => section.prefixes);
  if (!covered.length) return { text: note, removed: false };
  const kept: string[] = [];
  let skipping = false, removed = false;
  for (const line of note.split(/\r?\n/)) {
    if (line.startsWith('•')) skipping = covered.some(prefix => line.startsWith(prefix));
    else if (line.trim() && !/^\s/.test(line)) skipping = false;
    if (skipping) removed = true; else kept.push(line);
  }
  return removed ? { text: kept.join('\n').trim(), removed } : { text: note, removed: false };
}

export interface CourseInfoProposal {
  proposedTitle: string | null;
  proposedDescription: string | null;
  titleInUse: boolean;
  descriptionInUse: boolean;
  descriptionTooLong: boolean;
}

/** The AI title/summary are learner-visible once used, so Studio only
 * proposes them; nothing here writes. Comparison ignores surrounding space. */
export function courseInfoProposal(view: CourseAuthorNotesView | null | undefined, currentTitle: string): CourseInfoProposal {
  const root = courseLevelAuthorNotes(view).root;
  const title = root?.notes.title.trim() || null;
  const summary = root?.notes.storyboard?.summary;
  const description = typeof summary === 'string' && summary.trim() ? summary.trim() : null;
  return {
    proposedTitle: title,
    proposedDescription: description,
    titleInUse: !!title && title === currentTitle.trim(),
    descriptionInUse: !!description && description === (view?.course.description ?? '').trim(),
    descriptionTooLong: !!description && description.length > COURSE_DESCRIPTION_MAX_CHARS,
  };
}

/** Storyboard keys in display order; `learning_outcomes` (V2) and
 * `learning_objectives` (V1) are the same author-facing list. */
export function storyboardList(storyboard: AuthorNotes['storyboard'], key: string): string[] {
  const value = storyboard?.[key];
  return Array.isArray(value) ? value.filter(line => line.trim()) : [];
}
export function storyboardText(storyboard: AuthorNotes['storyboard'], key: string): string | null {
  const value = storyboard?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}
/** Remove a leading machine `lo_<n>:` marker from an objective for display only. */
export function authorNotesOutcomeLabel(value: string): string {
  return value.replace(/^\s*lo[_\s-]*\d+\s*[:.)-]\s*/i, '').trim() || value;
}
