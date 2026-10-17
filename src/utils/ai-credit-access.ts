// Who may see the AI points data. The backend enforces the same rules
// (/api/ai-credits/usage: ai_chatbot can_view, never learners; /admin: superadmin).

/** The AI Chatbot module: its overview tab shows the tenant's AI usage. */
export const AI_CHATBOT_MODULE = 'ai_chatbot';

export interface AiUsageViewer {
  role: string | null | undefined;
  tenantModules: readonly string[];
  hasPermission: (moduleCode: string, action: 'can_view') => boolean;
}

/**
 * Owner rule (same as the AI Chatbot module pages): the superadmin always; a
 * superuser when the tenant has the module; staff when the tenant has it and
 * their permission group can view it. learner_plus and learner never, even
 * with a module permission.
 */
export function canViewAiUsage(viewer: AiUsageViewer): boolean {
  if (viewer.role === 'superadmin') return true;
  if (viewer.role !== 'superuser' && viewer.role !== 'staff') return false;
  if (!viewer.tenantModules.includes(AI_CHATBOT_MODULE)) return false;
  return viewer.role === 'superuser' || viewer.hasPermission(AI_CHATBOT_MODULE, 'can_view');
}

/** Plans, FX rates, money overview, top-ups and reconciliation. */
export function canManageAiCredits(role: string | null | undefined): boolean {
  return role === 'superadmin';
}
