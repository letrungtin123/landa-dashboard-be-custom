export interface ChatStreamUrlInput {
  apiBaseUrl: string;
  browserOrigin: string;
  conversationId: string;
  target: string;
  courseId?: string;
}

/**
 * Builds the browser-facing chat stream URL. When VITE_CUSTOM_API_URL is
 * `same-origin`, apiBaseUrl is intentionally empty so this stays on the
 * Vite/production origin and retains its /api proxy.
 */
export function buildChatStreamUrl(input: ChatStreamUrlInput): string {
  const apiBaseUrl = input.apiBaseUrl === 'same-origin' ? '' : input.apiBaseUrl;
  const streamUrl = new URL(
    `${apiBaseUrl}/api/ai-chatbot/chat/conversations/${input.conversationId}/messages`,
    input.browserOrigin,
  );
  streamUrl.searchParams.set('target', input.target);
  if (input.courseId) streamUrl.searchParams.set('courseId', input.courseId);
  return streamUrl.toString();
}

export function isChatStreamNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /failed to fetch|network\s*error|load failed|fetch failed/i.test(message);
}

// Node's existing envelope is 600s; allow bounded persistence/readback margin.
export const CHAT_RECOVERY_MAX_MS = 660_000;

/** Both timestamps are epoch milliseconds, never performance.now(). */
export function isChatRecoveryExpired(startedAtEpochMs: number, nowEpochMs = Date.now()): boolean {
  return nowEpochMs - startedAtEpochMs > CHAT_RECOVERY_MAX_MS;
}

/** Only an explicit server rejection is terminal; proxy/commit ambiguity still needs GET recovery. */
export function readGenerationAdmissionRejection(payload: unknown): { code: string; correlationId: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.success !== false || p.kind !== 'lesson_author_admission_error' || p.admission_status !== 'rejected'
    || typeof p.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,99}$/.test(p.code)
    || typeof p.correlation_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.correlation_id)) return null;
  return { code: p.code, correlationId: p.correlation_id };
}

export function hasRecoveredAssistant(
  messages: Array<{ id: string; role: string; created_at: string }>,
  startedAt: number,
  baselineMessageId?: string | null,
): boolean {
  const baseline = baselineMessageId ? messages.findIndex(item => item.id === baselineMessageId) : -1;
  const after = baseline >= 0 ? messages.slice(baseline + 1) : messages.filter(item => Date.parse(item.created_at) >= startedAt);
  const userIndex = after.findIndex(item => item.role === 'user');
  return userIndex >= 0 && after.slice(userIndex + 1).some(item => item.role === 'assistant');
}

/** Parses SSE comments/frames; EOF without a terminal event is not success. */
export async function consumeChatEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<boolean> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal = false;
  const line = (value: string) => {
    if (!value.startsWith('data: ')) return;
    let event: Record<string, unknown>;
    try { event = JSON.parse(value.slice(6)); } catch { return; }
    if (!event || typeof event !== 'object') return;
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') terminal = true;
  };
  try {
    while (!terminal) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const item of lines) { if (!terminal) line(item.trimEnd()); }
    }
    if (!terminal) line((buffer + decoder.decode()).trimEnd());
    return terminal;
  } finally {
    // Stop consuming after terminal; never cancel a live stream merely for being slow.
    if (terminal) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
