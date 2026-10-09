import { config } from '@/config/env';
import { ensureTokenRefresh } from './refresh-manager';
import { retryAfterUnauthorized } from './stream-auth-retry.logic';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import { isWorkspaceId, type WorkspaceLocale } from './lesson-author-workspace.contract';

export type WorkspaceStreamState = 'connecting' | 'live' | 'reconnecting' | 'blocked' | 'unavailable' | 'closed';
export interface WorkspaceStreamScope { courseId: string; conversationId: string; workspaceId: string; locale: WorkspaceLocale; }
export interface WorkspaceStreamEvent { sequence: number; workspaceId: string; correlationId: string | null; }
export interface WorkspaceStreamClient {
  start(): void;
  close(): void;
}

const MAX_EVENT_BYTES = 16 * 1024;
const MAX_BUFFER_BYTES = 256 * 1024;
const MAX_RECONNECT_FAILURES = 8;
const RETRY_WINDOW_MS = 5 * 60_000;

function streamUrl(scope: WorkspaceStreamScope, after: number) {
  return `${config.customApiUrl}/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}`
    + `/conversations/${encodeURIComponent(scope.conversationId)}/workspaces/${encodeURIComponent(scope.workspaceId)}`
    + `/stream?ui_locale=${encodeURIComponent(scope.locale)}&after_sequence=${after}`;
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const handle = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { window.clearTimeout(handle); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

/** Fetch SSE is used because this application needs its existing bearer and
 * tenant headers. The transport carries commit metadata only; node content is
 * always hydrated through existing authorized DTOs. */
export function createWorkspaceStreamClient(scope: WorkspaceStreamScope, dependencies: {
  active: () => boolean;
  onEvent: (event: WorkspaceStreamEvent) => void;
  onState: (state: WorkspaceStreamState) => void;
  onFault?: (code: 'stream_unavailable' | 'stream_protocol_invalid') => void;
}): WorkspaceStreamClient {
  if (!isWorkspaceId(scope.workspaceId) || !isWorkspaceId(scope.conversationId) || !scope.courseId.trim()) {
    throw new Error('WORKSPACE_STREAM_INPUT_INVALID');
  }
  let controller: AbortController | null = null;
  let running = false;
  let lastSequence = 0;
  let failureStartedAt = 0;
  let failures = 0;
  let unauthorizedRetries = 0;

  const publish = (state: WorkspaceStreamState) => { try { dependencies.onState(state); } catch { /* UI observer only. */ } };
  const dispatch = (type: string, raw: string, id: string | null) => {
    if (raw.length > MAX_EVENT_BYTES) throw new Error('WORKSPACE_STREAM_EVENT_TOO_LARGE');
    if (type === 'workspace_event' || type === 'stream_ready') {
      const value = JSON.parse(raw) as Record<string, unknown>;
      const sequence = value.sequence ?? value.head;
      const workspaceId = value.workspace_id;
      if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || typeof workspaceId !== 'string' || workspaceId.toLowerCase() !== scope.workspaceId.toLowerCase()) {
        throw new Error('WORKSPACE_STREAM_PROTOCOL_INVALID');
      }
      const eventId = id ? Number(id.split(':').at(-1)) : sequence;
      if (!Number.isSafeInteger(eventId) || eventId < sequence) throw new Error('WORKSPACE_STREAM_PROTOCOL_INVALID');
      if (sequence > lastSequence) {
        lastSequence = sequence;
        dependencies.onEvent({ sequence, workspaceId, correlationId: typeof value.correlation_id === 'string' ? value.correlation_id : null });
      }
    } else if (type === 'resync_required') {
      const value = JSON.parse(raw) as Record<string, unknown>;
      const head = value.head;
      if (typeof head !== 'number' || !Number.isSafeInteger(head) || head < 0) throw new Error('WORKSPACE_STREAM_PROTOCOL_INVALID');
      lastSequence = Math.min(lastSequence, head);
      dependencies.onEvent({ sequence: head, workspaceId: scope.workspaceId, correlationId: null });
    } else if (type === 'auth_expiring' || type === 'heartbeat') {
      return;
    } else {
      throw new Error('WORKSPACE_STREAM_PROTOCOL_INVALID');
    }
  };

  async function consume(response: Response, signal: AbortSignal) {
    if (!response.body) throw new Error('WORKSPACE_STREAM_UNAVAILABLE');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', eventType = 'message', eventId: string | null = null, eventData: string[] = [];
    const flush = () => {
      if (!eventData.length) { eventType = 'message'; eventId = null; return; }
      dispatch(eventType, eventData.join('\n'), eventId);
      eventType = 'message'; eventId = null; eventData = [];
    };
    try {
      while (!signal.aborted) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        if (buffer.length > MAX_BUFFER_BYTES) throw new Error('WORKSPACE_STREAM_BUFFER_TOO_LARGE');
        let index: number;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1);
          if (!line) { flush(); continue; }
          if (line.startsWith(':')) continue;
          const separator = line.indexOf(':');
          const field = separator < 0 ? line : line.slice(0, separator);
          const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
          if (field === 'event') eventType = value;
          else if (field === 'id') eventId = value;
          else if (field === 'data') eventData.push(value);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) throw new Error('WORKSPACE_STREAM_INCOMPLETE_FRAME');
    } finally { reader.releaseLock(); }
  }
  async function run() {
    while (running && controller && !controller.signal.aborted && dependencies.active()) {
      const signal = controller.signal;
      try {
        publish(failures ? 'reconnecting' : 'connecting');
        const auth = useAuthStore.getState();
        const tenantId = auth.user?.role === 'superadmin' ? useTenantStore.getState().activeTenantId : auth.user?.tenant_id;
        if (!auth.isAuthenticated || auth.isLoggingOut || !auth.accessToken || !tenantId) { publish('blocked'); return; }
        const response = await fetch(streamUrl(scope, lastSequence), { method: 'GET', signal, cache: 'no-store', headers: {
          Accept: 'text/event-stream', Authorization: `Bearer ${auth.accessToken}`, 'X-Tenant-Id': tenantId,
          'X-UI-Locale': scope.locale, 'Cache-Control': 'no-cache',
        } });
        if (response.status === 401) {
          if (!await ensureTokenRefresh()) { publish('blocked'); return; }
          // Reconnect at once only with a really new token; otherwise back off.
          if (retryAfterUnauthorized(auth.accessToken, useAuthStore.getState().accessToken, unauthorizedRetries) === 'retry_now') {
            unauthorizedRetries++;
            continue;
          }
          throw new Error('WORKSPACE_STREAM_UNAUTHORIZED');
        }
        if (response.status === 403 || response.status === 404) { publish('blocked'); return; }
        if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
          throw new Error('WORKSPACE_STREAM_UNAVAILABLE');
        }
        publish('live'); failures = 0; failureStartedAt = 0; unauthorizedRetries = 0;
        await consume(response, signal);
        if (signal.aborted || !running) return;
        throw new Error('WORKSPACE_STREAM_EOF');
      } catch (error) {
        if (controller?.signal.aborted || !running) return;
        const protocol = error instanceof Error && /PROTOCOL|TOO_LARGE|INCOMPLETE_FRAME/.test(error.message);
        if (protocol) dependencies.onFault?.('stream_protocol_invalid');
        if (!failureStartedAt) failureStartedAt = Date.now();
        failures++;
        if (protocol || failures >= MAX_RECONNECT_FAILURES || Date.now() - failureStartedAt >= RETRY_WINDOW_MS) {
          dependencies.onFault?.('stream_unavailable'); publish('unavailable'); return;
        }
        publish('reconnecting');
        const ceiling = Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5));
        await wait(Math.floor(Math.random() * ceiling), controller.signal).catch(() => undefined);
      }
    }
  }
  return {
    start() { if (running) return; running = true; controller = new AbortController(); void run(); },
    close() { running = false; controller?.abort(); controller = null; publish('closed'); },
  };
}
