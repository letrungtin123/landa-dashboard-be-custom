import { useQuery } from '@tanstack/react-query';
import { fetchKbUsageConflicts } from '@/api/ai-chatbot-kb-usage';

/** Keys include the active tenant (superadmin switches tenants). */
export const aiChatbotKbUsageKeys = {
  all: ['ai-chatbot-kb-usage'] as const,
  conflicts: (tenantId: string) => [...aiChatbotKbUsageKeys.all, 'conflicts', tenantId] as const,
};

/** Knowledge bases already shared between the admin assistant, the learner assistant and AI ID. Read again each time
 * the Deploy tab opens (staleTime 0): a bot edit on another tab can change the answer. A failed read shows nothing. */
export function useAiChatbotKbUsageConflicts(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: aiChatbotKbUsageKeys.conflicts(tenantId ?? ''),
    queryFn: ({ signal }) => fetchKbUsageConflicts(signal),
    enabled: !!tenantId,
    staleTime: 0,
    retry: 1,
  });
}
