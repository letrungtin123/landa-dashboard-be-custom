import {
  readWorkspaceLaunchBrief, WORKSPACE_COURSE_PURPOSE_MAX, WORKSPACE_DESIGN_MODES, WORKSPACE_LEARNER_AUDIENCE_MAX,
  type WorkspaceDesignMode, type WorkspaceGraph, type WorkspaceLaunchBrief, type WorkspaceStatus,
} from '../../api/lesson-author-workspace.contract';
import { AI_CREDIT_ERROR_CODES, AI_CREDIT_ERROR_KEYS, isAiCreditErrorCode, type AiCreditErrorCode } from '../../api/ai-credit-errors.logic';

/**
 * AI ID launch brief (QLT-6): the way of working chosen on the start screen
 * and, for the design mode, who the course is for and what it is for. Pure
 * rules shared by the start screen, the source controller and the Create
 * request check. Nothing here reads or writes the server.
 */

/** What the author has typed so far. Texts stay untrimmed while editing and
 * survive a switch to keep-as-is and back. */
export interface WorkspaceLaunchBriefDraft {
  design_mode: WorkspaceDesignMode | null;
  learner_audience: string;
  course_purpose: string;
}
/** Design is the common case, and the choice stays visible on screen. */
export const DEFAULT_WORKSPACE_LAUNCH_BRIEF: Readonly<WorkspaceLaunchBriefDraft> = Object.freeze({
  design_mode: 'instructional_design', learner_audience: '', course_purpose: '',
});

/** The brief keys of the Create request: the texts only for the design mode. */
export type WorkspaceLaunchBriefFields =
  | { design_mode: 'preserve_source' }
  | { design_mode: 'instructional_design'; learner_audience: string; course_purpose: string };

export type WorkspaceLaunchBriefField = 'learners' | 'purpose';
export type WorkspaceCreateMissing = 'document' | 'mode' | WorkspaceLaunchBriefField;
/** Why "Create learning content" is not available yet (one line under the button). */
export type WorkspaceCreateBlock =
  | { kind: 'too_long'; field: WorkspaceLaunchBriefField; max: number }
  | { kind: 'missing'; items: WorkspaceCreateMissing[] }
  | { kind: 'document_not_ready' };

export function isWorkspaceDesignMode(value: unknown): value is WorkspaceDesignMode {
  return WORKSPACE_DESIGN_MODES.includes(value as WorkspaceDesignMode);
}

/** Brief-only problems, in screen order. Whitespace-only text is missing. */
function briefProblems(draft: Readonly<WorkspaceLaunchBriefDraft>) {
  const missing: WorkspaceCreateMissing[] = [];
  let tooLong: { field: WorkspaceLaunchBriefField; max: number } | null = null;
  if (!isWorkspaceDesignMode(draft.design_mode)) missing.push('mode');
  else if (draft.design_mode === 'instructional_design') {
    const audience = draft.learner_audience.trim(), purpose = draft.course_purpose.trim();
    if (!audience) missing.push('learners');
    else if (audience.length > WORKSPACE_LEARNER_AUDIENCE_MAX) tooLong = { field: 'learners', max: WORKSPACE_LEARNER_AUDIENCE_MAX };
    if (!purpose) missing.push('purpose');
    else if (!tooLong && purpose.length > WORKSPACE_COURSE_PURPOSE_MAX) tooLong = { field: 'purpose', max: WORKSPACE_COURSE_PURPOSE_MAX };
  }
  return { missing, tooLong };
}

/** The exact brief keys to send, or null while the brief is incomplete. */
export function workspaceLaunchBriefFields(draft: Readonly<WorkspaceLaunchBriefDraft>): WorkspaceLaunchBriefFields | null {
  const problems = briefProblems(draft);
  if (problems.missing.length || problems.tooLong) return null;
  return draft.design_mode === 'preserve_source' ? { design_mode: 'preserve_source' }
    : { design_mode: 'instructional_design', learner_audience: draft.learner_audience.trim(), course_purpose: draft.course_purpose.trim() };
}

/** Request-side check of the brief keys (everything in a Create request except
 * operation_id, source_document_ids and content_locale). */
export function isWorkspaceLaunchBriefFields(value: Record<string, unknown>): value is WorkspaceLaunchBriefFields {
  const keys = Object.keys(value).sort().join(',');
  if (value.design_mode === 'preserve_source') return keys === 'design_mode';
  const text = (item: unknown, max: number) => typeof item === 'string' && !!item && item === item.trim() && item.length <= max;
  return value.design_mode === 'instructional_design' && keys === 'course_purpose,design_mode,learner_audience'
    && text(value.learner_audience, WORKSPACE_LEARNER_AUDIENCE_MAX) && text(value.course_purpose, WORKSPACE_COURSE_PURPOSE_MAX);
}

/** Null when Create may be pressed. Brief problems come first because they are
 * fixed on this screen; a chosen document that is still processing comes last. */
export function workspaceCreateBlock(input: {
  document: 'none' | 'processing' | 'ready';
  draft: Readonly<WorkspaceLaunchBriefDraft>;
}): WorkspaceCreateBlock | null {
  const { missing, tooLong } = briefProblems(input.draft);
  if (tooLong) return { kind: 'too_long', ...tooLong };
  const items: WorkspaceCreateMissing[] = input.document === 'none' ? ['document', ...missing] : missing;
  if (items.length) return { kind: 'missing', items };
  return input.document === 'processing' ? { kind: 'document_not_ready' } : null;
}

const MISSING_KEYS: Record<WorkspaceCreateMissing, string> = {
  document: 'aiIdLaunchBrief.missingDocument', mode: 'aiIdLaunchBrief.missingMode',
  learners: 'aiIdLaunchBrief.missingLearners', purpose: 'aiIdLaunchBrief.missingPurpose',
};
/** i18n keys of the one-line reason: `key` with `max`, or with `items` built
 * by translating `itemKeys` and joining them with ", ". */
export function workspaceCreateBlockCopy(block: WorkspaceCreateBlock): { key: string; max?: number; itemKeys?: string[] } {
  if (block.kind === 'too_long') {
    return { key: block.field === 'learners' ? 'aiIdLaunchBrief.learnersTooLong' : 'aiIdLaunchBrief.purposeTooLong', max: block.max };
  }
  if (block.kind === 'document_not_ready') return { key: 'aiIdLaunchBrief.documentNotReady' };
  return { key: 'aiIdLaunchBrief.missing', itemKeys: block.items.map(item => MISSING_KEYS[item]) };
}

/** Brief validation codes the server returns before it creates anything. */
export const WORKSPACE_LAUNCH_BRIEF_ERROR_CODES = [
  'LESSON_AUTHOR_LAUNCH_MODE_INVALID', 'LESSON_AUTHOR_LAUNCH_AUDIENCE_REQUIRED', 'LESSON_AUTHOR_LAUNCH_PURPOSE_REQUIRED',
  'LESSON_AUTHOR_LAUNCH_BRIEF_TOO_LONG', 'LESSON_AUTHOR_LAUNCH_BRIEF_NOT_ALLOWED',
  // QLT-6: keeping the material as it is is not turned on for this organization (no IDM pipeline).
  'LESSON_AUTHOR_LAUNCH_MODE_UNAVAILABLE',
  // AI points: the month's points are used up, or too few are left for a new run. Refused before
  // anything is created; Create works again once points are added (no field to fix).
  ...AI_CREDIT_ERROR_CODES,
] as const;
export type WorkspaceLaunchBriefErrorCode = typeof WORKSPACE_LAUNCH_BRIEF_ERROR_CODES[number];
export function isWorkspaceLaunchBriefErrorCode(code: unknown): code is WorkspaceLaunchBriefErrorCode {
  return WORKSPACE_LAUNCH_BRIEF_ERROR_CODES.includes(code as WorkspaceLaunchBriefErrorCode);
}
const ERROR_KEYS: Record<Exclude<WorkspaceLaunchBriefErrorCode, AiCreditErrorCode>, string> = {
  LESSON_AUTHOR_LAUNCH_MODE_INVALID: 'errorMode',
  LESSON_AUTHOR_LAUNCH_AUDIENCE_REQUIRED: 'errorLearners',
  LESSON_AUTHOR_LAUNCH_PURPOSE_REQUIRED: 'errorPurpose',
  LESSON_AUTHOR_LAUNCH_BRIEF_TOO_LONG: 'errorTooLong',
  LESSON_AUTHOR_LAUNCH_BRIEF_NOT_ALLOWED: 'errorNotAllowed',
  LESSON_AUTHOR_LAUNCH_MODE_UNAVAILABLE: 'errorModeUnavailable',
};
/** i18n key of the plain message for a brief rejection (under aiIdLaunchBrief; AI points refusals share aiCredits.errors). */
export function workspaceLaunchBriefErrorKey(code: WorkspaceLaunchBriefErrorCode): string {
  return isAiCreditErrorCode(code) ? AI_CREDIT_ERROR_KEYS[code] : `aiIdLaunchBrief.${ERROR_KEYS[code]}`;
}

/** The brief of an open session, from the status read (or the graph when only
 * it carries the field). Null for sessions created before the brief existed. */
export function workspaceSessionLaunchBrief(read: { status: WorkspaceStatus | null; graph: WorkspaceGraph | null } | null): WorkspaceLaunchBrief | null {
  if (!read) return null;
  const wire = read.status && read.status.launch_brief !== undefined ? read.status.launch_brief : read.graph?.launch_brief;
  return readWorkspaceLaunchBrief(wire);
}
