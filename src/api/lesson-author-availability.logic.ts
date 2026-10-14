import type { LessonAuthorSettings } from './custom-chat';

/** Roles that see the AI ID entry point in the course editor
 * (see useCourseWorkspaceHost in workspace-course-host.tsx). */
export const LESSON_AUTHOR_ENTRY_ROLES: readonly string[] = ['staff', 'superuser', 'superadmin'];

/** Same gate as the course editor's AI ID entry point: build flag, signed-in
 * staff+ with course edit permission, and a resolved tenant (the active tenant
 * for a superadmin). */
export function lessonAuthorEntryAllowed(input: {
  featureEnabled: boolean;
  authenticated: boolean;
  role: string | null | undefined;
  canEditCourses: boolean;
  tenantId: string | null | undefined;
}): boolean {
  return input.featureEnabled && input.authenticated && input.canEditCourses && !!input.tenantId
    && !!input.role && LESSON_AUTHOR_ENTRY_ROLES.includes(input.role);
}

/** AI ID is deployed for a tenant when its AI course design (lesson_author)
 * bot is assigned in that tenant and the tenant runs the self-built RAG engine
 * the AI ID workspace requires. */
export function isLessonAuthorDeployedForTenant(
  settings: LessonAuthorSettings | null | undefined,
  tenantId: string | null | undefined,
): boolean {
  const bot = settings?.active_bot;
  return !!tenantId && !!bot && bot.target === 'lesson_author' && bot.tenant_id === tenantId
    && bot.ai_active_engine === 'self_built_rag';
}
