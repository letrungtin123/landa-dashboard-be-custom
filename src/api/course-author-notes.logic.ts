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
}

export interface AuthorNotes {
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
  return { hold_items: holds, pending_objectives: pending, nice_to_know: niceToKnow };
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
  return { node_kind: kind, revision: rev, content_locale: source.content_locale, title, purpose, implementation_notes: notes,
    storyboard: readStoryboard(source.storyboard), author_review: readReview(source.author_review),
    media_briefs: source.media_briefs.slice(0, 32).map(readBrief).filter((brief): brief is AuthorNotesMediaBrief => !!brief),
    idm_guidance: readGuidance(source.idm_guidance) };
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
    || (guidance && (guidance.hold_items.length || guidance.pending_objectives.length || guidance.nice_to_know.length)));
}

export interface UnitAuthorNotes {
  unit: AuthorNotesBlock | null;
  lesson: AuthorNotesBlock | null;
  chapter: AuthorNotesBlock | null;
  components: AuthorNotesBlock[];
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
    briefCount: unit?.notes.media_briefs.length ?? 0,
    noteCount: visible.filter(block => block.notes.implementation_notes).length,
  };
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
