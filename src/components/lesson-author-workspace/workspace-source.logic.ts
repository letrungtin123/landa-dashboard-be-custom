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

/** After an accepted (queued) delete, the list is re-read until the documents are gone, at most this often. */
export const SOURCE_DELETE_SETTLE_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

export type WorkspaceSourceDeleteIssue = 'in_use' | 'learning' | 'forbidden' | 'connection' | 'failed';
/** `kept`: documents still listed once the list settled (the server skipped them or has not finished). */
export interface WorkspaceSourceDeleteOutcome { issue: WorkspaceSourceDeleteIssue | null; kept: number }

/** A document still being processed cannot be deleted yet (the server refuses it too). */
export function workspaceSourceDeletable(document: Pick<LessonAuthorSourceDocument, 'status'>): boolean {
  return document.status !== 'learning';
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
