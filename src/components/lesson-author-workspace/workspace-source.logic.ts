import type { LessonAuthorSourceDocument } from '../../api/custom-chat';

/** Pure rules of the source panel ("Tạo khoá học" tab): which failures may be retried, and the document delete
 * categories. No network, no state: the source controller (workspace-source-state.ts) applies them. */

/** Network loss, timeout or a gateway/restart status: the request may simply
 * be retried. Any other status is an authoritative answer. */
export function isTransientReadFailure(error: unknown): boolean {
  const failure = error as { response?: { status?: number }; code?: unknown; request?: unknown } | null;
  if (!failure || typeof failure !== 'object') return false;
  if (failure.response) return [502, 503, 504].includes(Number(failure.response.status));
  return failure.code === 'ERR_NETWORK' || failure.code === 'ECONNABORTED' || failure.code === 'ETIMEDOUT' || failure.request !== undefined;
}

/** After an accepted (queued) delete, the list is re-read until the document is gone, at most this often. */
export const SOURCE_DELETE_SETTLE_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

/** 'busy': another action of the panel is running; 'not_listed': the document is not in the list any more. */
export type WorkspaceSourceDeleteIssue = 'in_use' | 'learning' | 'forbidden' | 'connection' | 'failed' | 'busy' | 'not_listed';
/** One document per delete (owner 24/10: no multi-select delete). `kept`: the accepted document is still listed once
 * the list settled (the server has not finished). */
export interface WorkspaceSourceDeleteOutcome {
  issue: WorkspaceSourceDeleteIssue | null;
  kept: boolean;
}
export const workspaceSourceDeleteOutcome = (issue: WorkspaceSourceDeleteIssue | null, kept = false): WorkspaceSourceDeleteOutcome =>
  ({ issue, kept });

type DeleteRow = Pick<LessonAuthorSourceDocument, 'status' | 'in_use_by_ai_id' | 'can_delete'>;
/** The server's per-row answer wins; the author's live delete permission decides when the row does not say. */
export function workspaceSourceCanDelete(document: DeleteRow, permitted: boolean): boolean {
  return typeof document.can_delete === 'boolean' ? document.can_delete : permitted;
}
/** Deletable now: allowed, not still being processed, and not a source AI ID is designing from. */
export function workspaceSourceDeletable(document: DeleteRow, permitted: boolean): boolean {
  return workspaceSourceCanDelete(document, permitted) && document.status !== 'learning' && document.in_use_by_ai_id !== true;
}
/** Why a listed document cannot be deleted now (first reason wins), or null. */
export function workspaceSourceDeleteBlock(document: DeleteRow, permitted: boolean): 'forbidden' | 'in_use' | 'learning' | null {
  if (!workspaceSourceCanDelete(document, permitted)) return 'forbidden';
  if (document.in_use_by_ai_id === true) return 'in_use';
  return document.status === 'learning' ? 'learning' : null;
}

/** A refused or failed knowledge base delete, in plain categories. 'gone': it was already deleted. */
export function workspaceSourceDeleteIssue(error: unknown): WorkspaceSourceDeleteIssue | 'gone' {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  if (response?.data?.code === 'KB_DOCUMENT_IN_USE_BY_AI_ID') return 'in_use';
  if (response?.data?.code === 'KB_DOCUMENT_LEARNING') return 'learning';
  if (response?.status === 404) return 'gone';
  if (response?.status === 401 || response?.status === 403) return 'forbidden';
  // No answer or a gateway error: the delete may or may not have been accepted.
  return isTransientReadFailure(error) ? 'connection' : 'failed';
}

/** What one delete request may send: the chosen document when it is in the list and may go now, or why nothing is sent. */
export function workspaceSourceDeletePlan(documents: readonly LessonAuthorSourceDocument[], documentId: string,
  permitted: boolean): { id: string } | WorkspaceSourceDeleteOutcome {
  const document = documents.find(d => d.document_id === documentId);
  if (!document) return workspaceSourceDeleteOutcome('not_listed');
  const block = workspaceSourceDeleteBlock(document, permitted);
  return block ? workspaceSourceDeleteOutcome(block) : { id: document.document_id };
}
