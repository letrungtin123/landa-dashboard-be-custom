import { WORKSPACE_COURSE_PURPOSE_MAX, WORKSPACE_LEARNER_AUDIENCE_MAX, type WorkspaceLocale } from './lesson-author-workspace.contract';
import { AI_CREDIT_ERROR_CODES } from './ai-credit-errors.logic';

/**
 * AI ID launch contract: the scope a workspace is launched for, the server
 * selection that opens it, and the launch brief keys of a Create request.
 * Shared by the api modules and the workspace components; it imports nothing
 * from the UI.
 */

export interface WorkspaceHostScope { actorId: string; tenantId: string; courseId: string }
/** Must be returned by an authorized server discovery/selection API. No route,
 * URL parameter, localStorage ID or client-generated ID is a launch source. */
export interface WorkspaceLaunchContext {
  course_id: string;
  conversation_id: string;
  workspace_id: string;
  content_locale: WorkspaceLocale;
  can_edit: boolean;
  correlation_id?: string;
}
export type WorkspaceLaunchResolver = (input: WorkspaceHostScope & {
  uiLocale: WorkspaceLocale;
  signal: AbortSignal;
  /** Re-authorize this exact previous server selection on reopen. */
  previous: Readonly<WorkspaceLaunchContext> | null;
}) => Promise<WorkspaceLaunchContext | null>;

/** The brief keys of the Create request: the texts only for the design mode. */
export type WorkspaceLaunchBriefFields =
  | { design_mode: 'preserve_source' }
  | { design_mode: 'instructional_design'; learner_audience: string; course_purpose: string };

/** Request-side check of the brief keys (everything in a Create request except
 * operation_id, source_document_ids and content_locale). */
export function isWorkspaceLaunchBriefFields(value: Record<string, unknown>): value is WorkspaceLaunchBriefFields {
  const keys = Object.keys(value).sort().join(',');
  if (value.design_mode === 'preserve_source') return keys === 'design_mode';
  const text = (item: unknown, max: number) => typeof item === 'string' && !!item && item === item.trim() && item.length <= max;
  return value.design_mode === 'instructional_design' && keys === 'course_purpose,design_mode,learner_audience'
    && text(value.learner_audience, WORKSPACE_LEARNER_AUDIENCE_MAX) && text(value.course_purpose, WORKSPACE_COURSE_PURPOSE_MAX);
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
