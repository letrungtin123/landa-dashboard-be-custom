// ═══════════════════════════════════════════════════════════════
// Chat API — Conversations, Messages, SSE Stream, Assignments
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";
import { config } from "@/config/env";
import { useAuthStore } from "@/utils/store";
import { useTenantStore } from "@/utils/tenant-store";

interface ApiResponse<T> { success: boolean; data: T; }

// ── Types ──

export interface ActiveBot {
  id: string;
  tenant_id: string;
  target: string;
  bot_id: string;
  bot_name: string;
  bot_avatar_url: string | null;
  bot_kb_id: string | null;
}

export interface BotAssignment {
  id: string;
  tenant_id: string;
  target: string;
  bot_id: string;
  bot_name: string;
  bot_avatar_url: string | null;
}

export interface ChatConversation {
  id: string;
  tenant_id: string;
  bot_id: string;
  persona_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  persona_name?: string;
  persona_avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Bot Assignments ──

export async function fetchAssignments(): Promise<BotAssignment[]> {
  const { data } = await customApiClient.get<ApiResponse<BotAssignment[]>>("/api/ai-chatbot/bots/assignments");
  return data.data;
}

export async function assignBot(target: string, bot_id: string): Promise<void> {
  await customApiClient.put("/api/ai-chatbot/bots/assignments", { target, bot_id });
}

export async function unassignBot(target: string): Promise<void> {
  await customApiClient.delete(`/api/ai-chatbot/bots/assignments/${target}`);
}

// ── Active Bot ──

export async function fetchActiveBot(): Promise<ActiveBot | null> {
  const { data } = await customApiClient.get<ApiResponse<ActiveBot | null>>("/api/ai-chatbot/chat/active-bot");
  return data.data;
}

// ── Conversations ──

export async function fetchConversations(): Promise<ChatConversation[]> {
  const { data } = await customApiClient.get<ApiResponse<ChatConversation[]>>("/api/ai-chatbot/chat/conversations");
  return data.data;
}

export async function createConversation(personaId: string): Promise<ChatConversation> {
  const { data } = await customApiClient.post<ApiResponse<ChatConversation>>("/api/ai-chatbot/chat/conversations", { persona_id: personaId });
  return data.data;
}

export async function deleteConversation(id: string): Promise<void> {
  await customApiClient.delete(`/api/ai-chatbot/chat/conversations/${id}`);
}

// ── Messages (cursor-based pagination) ──

export interface PaginatedMessages {
  messages: ChatMessage[];
  has_more: boolean;
  next_cursor: string | null;
}

export async function fetchMessages(conversationId: string, cursor?: string): Promise<PaginatedMessages> {
  const params = cursor ? { cursor } : {};
  const { data } = await customApiClient.get<ApiResponse<PaginatedMessages>>(
    `/api/ai-chatbot/chat/conversations/${conversationId}/messages`,
    { params },
  );
  return data.data;
}

/**
 * Send message and stream SSE response.
 * Returns an AbortController so caller can cancel.
 */
export function sendMessageStream(
  conversationId: string,
  content: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
): AbortController {
  const controller = new AbortController();

  // Build headers with auth token
  const { accessToken, user } = useAuthStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
  if (user?.role === 'superadmin') {
    const { activeTenantId } = useTenantStore.getState();
    if (activeTenantId) headers['X-Tenant-Id'] = activeTenantId;
  }

  const url = `${config.customApiUrl}/api/ai-chatbot/chat/conversations/${conversationId}/messages`;

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        onError('Không thể kết nối đến server');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'chunk') onChunk(event.text);
            else if (event.type === 'done') { receivedDone = true; onDone(); }
            else if (event.type === 'error') { receivedDone = true; onError(event.message || 'Lỗi không xác định'); }
          } catch { /* skip malformed line */ }
        }
      }

      // Safety: if stream ended without done/error event, still notify
      if (!receivedDone) onDone();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Lỗi kết nối');
      }
    }
  })();

  return controller;
}
