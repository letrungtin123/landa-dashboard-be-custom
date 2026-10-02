import { config } from '@/config/env';
import { ensureTokenRefresh } from './refresh-manager';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import { isWorkspaceId, type WorkspaceLocale } from './lesson-author-workspace.contract';
import type { LessonAuthorSourceDocument } from './custom-chat';

export type SourceStreamState = 'connecting' | 'live' | 'reconnecting' | 'blocked' | 'unavailable' | 'closed';
export interface SourceStreamScope { documentId: string; locale: WorkspaceLocale; }
export interface SourceStreamDocument extends LessonAuthorSourceDocument {
  status: 'learning' | 'learned' | 'error';
  updated_at: string;
}
export interface SourceStreamClient { start(): void; close(): void; }

const MAX_EVENT_BYTES = 16 * 1024;
const MAX_BUFFER_BYTES = 128 * 1024;
const MAX_RECONNECT_FAILURES = 8;
const RETRY_WINDOW_MS = 5 * 60_000;

function url(scope: SourceStreamScope) {
  return `${config.customApiUrl}/api/ai-chatbot/chat/lesson-author/source-documents/${encodeURIComponent(scope.documentId)}`
    + `/stream?ui_locale=${encodeURIComponent(scope.locale)}`;
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const handle = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { window.clearTimeout(handle); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

/** Exact-source SSE with bounded transport reconnect. It never lists documents,
 * uploads a source, or starts generation. A reconnect receives an authoritative
 * initial snapshot for this same document ID. */
export function createWorkspaceSourceStreamClient(scope: SourceStreamScope, dependencies: {
  active: () => boolean;
  onDocument: (document: SourceStreamDocument) => void;
  onState: (state: SourceStreamState) => void;
}): SourceStreamClient {
  if (!isWorkspaceId(scope.documentId)) throw new Error('SOURCE_STREAM_INPUT_INVALID');
  let controller: AbortController | null = null, running = false, terminal = false, failures = 0, failureStartedAt = 0;
  const publish = (state: SourceStreamState) => { try { dependencies.onState(state); } catch { /* UI observer only. */ } };
  const dispatch = (event: string, raw: string) => {
    if (raw.length > MAX_EVENT_BYTES) throw new Error('SOURCE_STREAM_EVENT_TOO_LARGE');
    if (event === 'auth_expiring') return;
    if (event !== 'source_status') throw new Error('SOURCE_STREAM_PROTOCOL_INVALID');
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.delivery_contract_version !== 1 || value.document_id !== scope.documentId || !isWorkspaceId(String(value.kb_id ?? ''))
      || typeof value.name !== 'string' || value.name.length > 500 || value.type !== 'file'
      || !['learning', 'learned', 'error'].includes(String(value.status))
      || typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))) {
      throw new Error('SOURCE_STREAM_PROTOCOL_INVALID');
    }
    dependencies.onDocument({ document_id: value.document_id, kb_id: value.kb_id as string, name: value.name,
      type: 'file', status: value.status as SourceStreamDocument['status'],
      source_info: value.source_info && typeof value.source_info === 'object' ? value.source_info as SourceStreamDocument['source_info'] : null,
      updated_at: value.updated_at });
    terminal = value.status === 'learned' || value.status === 'error';
  };
  async function consume(response: Response, signal: AbortSignal) {
    if (!response.body) throw new Error('SOURCE_STREAM_UNAVAILABLE');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', eventType = 'message', eventData: string[] = [];
    const flush = () => {
      if (eventData.length) dispatch(eventType, eventData.join('\n'));
      eventType = 'message'; eventData = [];
    };
    try {
      while (!signal.aborted) {
        const next = await reader.read(); if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        if (buffer.length > MAX_BUFFER_BYTES) throw new Error('SOURCE_STREAM_BUFFER_TOO_LARGE');
        let index: number;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1);
          if (!line) { flush(); continue; }
          if (line.startsWith(':')) continue;
          const separator = line.indexOf(':'), field = separator < 0 ? line : line.slice(0, separator);
          const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
          if (field === 'event') eventType = value; else if (field === 'data') eventData.push(value);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) throw new Error('SOURCE_STREAM_INCOMPLETE_FRAME');
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
        const response = await fetch(url(scope), { method: 'GET', signal, cache: 'no-store', headers: {
          Accept: 'text/event-stream', Authorization: `Bearer ${auth.accessToken}`, 'X-Tenant-Id': tenantId,
          'X-UI-Locale': scope.locale, 'Cache-Control': 'no-cache',
        } });
        if (response.status === 401) { if (!await ensureTokenRefresh()) { publish('blocked'); return; } continue; }
        if (response.status === 403 || response.status === 404) { publish('blocked'); return; }
        if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) throw new Error('SOURCE_STREAM_UNAVAILABLE');
        publish('live'); failures = 0; failureStartedAt = 0;
        await consume(response, signal);
        if (signal.aborted || !running || !dependencies.active()) return;
        if (terminal) return;
        throw new Error('SOURCE_STREAM_EOF');
      } catch {
        if (controller?.signal.aborted || !running) return;
        if (!failureStartedAt) failureStartedAt = Date.now(); failures++;
        if (failures >= MAX_RECONNECT_FAILURES || Date.now() - failureStartedAt >= RETRY_WINDOW_MS) { publish('unavailable'); return; }
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
