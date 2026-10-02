import { customApiClient } from './custom-client';
import {
  isWorkspaceId, isWorkspaceSequence, readWorkspaceDetail, readWorkspaceEvents, readWorkspaceGraph,
  readWorkspaceStatus, WorkspaceReadError, workspaceReadFailure,
  type WorkspaceDetail, type WorkspaceEvents, type WorkspaceGraph, type WorkspaceLocale, type WorkspaceStatus,
} from './lesson-author-workspace.contract';

export interface WorkspaceReadScope { courseId: string; conversationId: string; workspaceId: string }
export interface WorkspaceGraphCursor { snapshot_sequence?: number; after_node_id?: string }
export interface WorkspaceReadOptions { signal: AbortSignal; uiLocale: WorkspaceLocale }
export interface WorkspaceReadClient {
  status(options: WorkspaceReadOptions): Promise<WorkspaceStatus>;
  events(afterSequence: number, options: WorkspaceReadOptions): Promise<WorkspaceEvents>;
  graph(cursor: WorkspaceGraphCursor, options: WorkspaceReadOptions): Promise<WorkspaceGraph>;
  detail(nodeId: string, expectedRevision: number | null, options: WorkspaceReadOptions): Promise<WorkspaceDetail>;
}
type ReadTransport = Pick<typeof customApiClient, 'get'>;

/** Scope is immutable. Recreate/dispose state when actor, tenant or course changes.
 * Relative URLs preserve customApiClient's same-origin /admin prefix, Bearer,
 * tenant and shared 401 refresh behavior. No alternate fetch/auth implementation.
 */
export function createWorkspaceReadClient(scope: WorkspaceReadScope, transport: ReadTransport = customApiClient): WorkspaceReadClient {
  if (!isWorkspaceId(scope.workspaceId) || !isWorkspaceId(scope.conversationId)
    || typeof scope.courseId !== 'string' || !scope.courseId.trim() || scope.courseId.length > 255
    || Array.from(scope.courseId).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || ['.', '..'].includes(scope.courseId)) {
    throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
  }
  const workspaceId = scope.workspaceId;
  const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}`
    + `/conversations/${encodeURIComponent(scope.conversationId)}/workspaces/${encodeURIComponent(workspaceId)}`;
  async function read<T extends { workspace_id: string }>(suffix: string, params: Record<string, string | number>,
    options: WorkspaceReadOptions, parse: (value: unknown) => T): Promise<T> {
    options.signal.throwIfAborted();
    if (options.uiLocale !== 'en' && options.uiLocale !== 'vi') throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
    try {
      const { data } = await transport.get(base + suffix, { params: { ...params, ui_locale: options.uiLocale },
        signal: options.signal, headers: { 'Cache-Control': 'no-cache' } });
      options.signal.throwIfAborted();
      if (!data || data.success !== true) throw { response: { data } };
      const result = parse(data.data);
      if (result.workspace_id.toLowerCase() !== workspaceId.toLowerCase()) throw new WorkspaceReadError('WORKSPACE_READ_CONTRACT_INVALID');
      return result;
    } catch (error) {
      options.signal.throwIfAborted();
      throw workspaceReadFailure(error);
    }
  }
  return {
    status: options => read('', {}, options, readWorkspaceStatus),
    events(after, options) {
      if (!isWorkspaceSequence(after)) throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
      return read('/events', { after_sequence: after }, options, value => readWorkspaceEvents(value, after));
    },
    graph(cursor, options) {
      const params: Record<string, string | number> = {};
      if (cursor.snapshot_sequence !== undefined) {
        if (!isWorkspaceSequence(cursor.snapshot_sequence)) throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
        params.snapshot_sequence = cursor.snapshot_sequence;
      }
      if (cursor.after_node_id !== undefined) {
        if (!isWorkspaceId(cursor.after_node_id) || cursor.snapshot_sequence === undefined) throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
        params.after_node_id = cursor.after_node_id;
      }
      return read('/graph', params, options, readWorkspaceGraph);
    },
    detail(nodeId, revision, options) {
      if (!isWorkspaceId(nodeId) || revision !== null && !isWorkspaceSequence(revision)) throw new WorkspaceReadError('WORKSPACE_READ_INPUT_INVALID');
      return read(`/nodes/${encodeURIComponent(nodeId)}`, { expected_revision: revision ?? 'none' }, options, value => {
        const detail = readWorkspaceDetail(value);
        if (detail.node_id.toLowerCase() !== nodeId.toLowerCase() || detail.current_revision !== revision) {
          throw new WorkspaceReadError('WORKSPACE_READ_CONTRACT_INVALID');
        }
        return detail;
      });
    },
  };
}
