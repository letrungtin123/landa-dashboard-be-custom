import type { BotAssignment } from '../../api/custom-chat';
import type { KbUsagePlace } from '../../api/ai-chatbot-kb-usage';

/** Pure rules of the Deploy page's exclusive knowledge bases (QC 21/10, D1/D2). No React, no network. */

/** What is being assigned: a bot to a page target, or the AI ID knowledge base itself. */
export type KbUsageSlot = 'admin' | 'learner' | 'lesson_author' | 'ai_id';

/** The other places that use `kbId` now, as far as this page knows (the server decides). */
export function kbUsagePlacesElsewhere(kbId: string | null | undefined, current: {
  assignments: readonly Pick<BotAssignment, 'target' | 'bot_kb_id'>[]; aiIdKbId: string | null | undefined;
}, slot: KbUsageSlot): KbUsagePlace[] {
  if (!kbId) return [];
  const places: KbUsagePlace[] = [];
  for (const target of ['admin', 'learner'] as const) {
    if (slot !== target && current.assignments.some(item => item.target === target && item.bot_kb_id === kbId)) places.push(target);
  }
  if (slot !== 'ai_id' && current.aiIdKbId === kbId) places.push('ai_id');
  return places;
}

/** "A", "A và B", "A, B và C" (the joining word comes from the copy). */
export function joinKbUsagePlaces(places: readonly KbUsagePlace[], label: (place: KbUsagePlace) => string, and: string): string {
  const words = places.map(label);
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')}${and}${words[words.length - 1]}`;
}

/** Which message a refused assignment shows: with the knowledge base and its places when this page knows them. */
export function kbAlreadyUsedCopy(input: { kbName: string | null | undefined; places: readonly KbUsagePlace[] }):
  { key: 'aiChatbotKbUsage.alreadyUsed'; name: string; places: readonly KbUsagePlace[] } | { key: 'aiChatbotKbUsage.alreadyUsedElsewhere' } {
  const name = input.kbName?.trim();
  return name && input.places.length ? { key: 'aiChatbotKbUsage.alreadyUsed', name, places: input.places } : { key: 'aiChatbotKbUsage.alreadyUsedElsewhere' };
}
