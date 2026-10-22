import { customApiClient } from './custom-client';
import type { ApiResponse } from './api-response';

/**
 * Exclusive knowledge bases (QC 21/10, D1/D2): the assistant of the admin page, the assistant of the learner page
 * and AI ID each use their own knowledge base. The server refuses a clash with 409 `AI_CHATBOT_KB_ALREADY_USED`
 * and lists the clashes that already exist so the Deploy page can ask the administrator to choose again.
 */

export const AI_CHATBOT_KB_ALREADY_USED = 'AI_CHATBOT_KB_ALREADY_USED';
export const KB_USAGE_PLACES = ['admin', 'learner', 'ai_id'] as const;
export type KbUsagePlace = typeof KB_USAGE_PLACES[number];
export interface KbUsageConflict { kb_id: string; kb_name: string; used_by: KbUsagePlace[] }

/** True for the server's refusal of a knowledge base that is already used somewhere else. */
export function isKbAlreadyUsedError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return response?.status === 409 && response.data?.code === AI_CHATBOT_KB_ALREADY_USED;
}

/** The server's own plain words for that refusal: Vietnamese, or English when the page sends the English UI locale.
 * They name where the knowledge base is used, including one bot serving both pages. */
export function kbAlreadyUsedMessage(error: unknown): string | null {
  if (!isKbAlreadyUsedError(error)) return null;
  const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

/** `{ conflicts: [{ kb_id, kb_name, used_by }] }`. Unknown places are dropped and a row needs two places to be a
 * clash; extra keys are ignored. Anything else is not this answer. */
export function readKbUsageConflicts(value: unknown): KbUsageConflict[] {
  const conflicts = (value as { conflicts?: unknown } | null)?.conflicts;
  if (!Array.isArray(conflicts)) throw new Error('KB_USAGE_CONFLICTS_INVALID');
  return conflicts.flatMap(raw => {
    const row = raw as { kb_id?: unknown; kb_name?: unknown; used_by?: unknown } | null;
    if (!row || typeof row.kb_id !== 'string' || !row.kb_id || !Array.isArray(row.used_by)) return [];
    const usedBy = KB_USAGE_PLACES.filter(place => (row.used_by as unknown[]).includes(place));
    if (usedBy.length < 2) return [];
    return [{ kb_id: row.kb_id, kb_name: typeof row.kb_name === 'string' ? row.kb_name.trim() : '', used_by: usedBy }];
  });
}

/** Same permission as reading the bot assignments. The usual success envelope; a bare `{ conflicts }` body is read too. */
export async function fetchKbUsageConflicts(signal?: AbortSignal): Promise<KbUsageConflict[]> {
  const { data } = await customApiClient.get<ApiResponse<unknown> | { conflicts?: unknown }>('/api/ai-chatbot/kb-usage-conflicts', { signal });
  return readKbUsageConflicts('data' in data ? data.data : data);
}
