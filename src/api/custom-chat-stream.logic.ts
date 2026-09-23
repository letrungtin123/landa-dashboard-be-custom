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
