// Who may open the AI points pages. The backend enforces the same rules
// (/api/ai-credits/usage: staff, superuser, superadmin; /admin: superadmin).

/** Route/nav code of the tenant AI usage page; gated by role, not by a tenant module. */
export const AI_USAGE_MODULE = 'ai_usage';

const AI_USAGE_ROLES = ['superadmin', 'superuser', 'staff'] as const;

/** Tenant admins and the superadmin; never learner_plus or learners. */
export function canViewAiUsage(role: string | null | undefined): boolean {
  return AI_USAGE_ROLES.includes(role as typeof AI_USAGE_ROLES[number]);
}

/** Plans, FX rates, money overview, top-ups and reconciliation. */
export function canManageAiCredits(role: string | null | undefined): boolean {
  return role === 'superadmin';
}
