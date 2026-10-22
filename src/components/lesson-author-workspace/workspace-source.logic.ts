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

/** 'busy': another action of the panel is running; 'not_listed': none of the documents is in the list any more. */
export type WorkspaceSourceDeleteIssue = 'in_use' | 'learning' | 'forbidden' | 'connection' | 'failed' | 'busy' | 'not_listed';
/** `kept`: documents still listed once the list settled (the server has not finished). `names`: the documents AI ID
 * is using (in_use); `serverMessage`: the server's own plain words when they cannot be named from the list. */
export interface WorkspaceSourceDeleteOutcome {
  issue: WorkspaceSourceDeleteIssue | null;
  kept: number;
  names: readonly string[];
  serverMessage: string | null;
}
export const workspaceSourceDeleteOutcome = (issue: WorkspaceSourceDeleteIssue | null,
  extra: Partial<Omit<WorkspaceSourceDeleteOutcome, 'issue'>> = {}): WorkspaceSourceDeleteOutcome =>
  ({ issue, kept: 0, names: [], serverMessage: null, ...extra });

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

/** What one delete request may send: the chosen documents that are in the list, or why nothing is sent. One that
 * cannot go now refuses them all, as the server does with a bulk request. */
export function workspaceSourceDeletePlan(documents: readonly LessonAuthorSourceDocument[], documentIds: readonly string[],
  permitted: boolean): { ids: string[] } | WorkspaceSourceDeleteOutcome {
  const listed = [...new Set(documentIds)].map(id => documents.find(d => d.document_id === id))
    .filter((d): d is LessonAuthorSourceDocument => !!d);
  if (!listed.length) return workspaceSourceDeleteOutcome('not_listed');
  const blocks = listed.map(d => workspaceSourceDeleteBlock(d, permitted));
  if (blocks.includes('forbidden')) return workspaceSourceDeleteOutcome('forbidden');
  if (blocks.includes('in_use')) return workspaceSourceDeleteOutcome('in_use', { names: listed.filter((_, i) => blocks[i] === 'in_use').map(d => d.name) });
  if (blocks.includes('learning')) return workspaceSourceDeleteOutcome('learning');
  return { ids: listed.map(d => d.document_id) };
}

/** A KB_DOCUMENT_IN_USE_BY_AI_ID refusal: its `document_ids` named from the list, or the server's own plain words
 * when the list cannot name them all. */
export function workspaceSourceInUseOutcome(error: unknown, documents: readonly LessonAuthorSourceDocument[]): WorkspaceSourceDeleteOutcome {
  const data = (error as { response?: { data?: { document_ids?: unknown; message?: unknown } } } | null)?.response?.data;
  const ids = Array.isArray(data?.document_ids) ? data.document_ids.filter((id): id is string => typeof id === 'string') : [];
  const message = typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : null;
  const names = ids.map(id => documents.find(d => d.document_id === id)?.name).filter((name): name is string => !!name);
  return names.length && (names.length === ids.length || !message)
    ? workspaceSourceDeleteOutcome('in_use', { names }) : workspaceSourceDeleteOutcome('in_use', { serverMessage: message });
}

/** Up to `max` quoted names and how many more there are. */
export function workspaceSourceNameList(names: readonly string[], max = 5): { shown: string; more: number } {
  return { shown: names.slice(0, max).map(name => `“${name}”`).join(', '), more: Math.max(0, names.length - max) };
}
