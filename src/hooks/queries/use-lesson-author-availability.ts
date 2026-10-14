import { useQuery } from '@tanstack/react-query';
import { fetchLessonAuthorChatSettings } from '@/api/custom-chat';
import { isLessonAuthorDeployedForTenant, lessonAuthorEntryAllowed } from '@/api/lesson-author-availability.logic';
import { workspaceHostEnabled } from '@/components/lesson-author-workspace/workspace-host.logic';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';

/** Keys include the tenant: a superadmin switches tenants with the tenant switcher. */
export const lessonAuthorAvailabilityKeys = {
  all: ['lesson-author-availability'] as const,
  tenant: (tenantId: string) => [...lessonAuthorAvailabilityKeys.all, tenantId] as const,
};

/** Bot assignment changes rarely; the server caches the same settings. */
export const LESSON_AUTHOR_AVAILABILITY_STALE_MS = 5 * 60_000;

/** True when the current user can use AI ID for the current tenant: the same
 * gate as the course editor entry point plus the tenant's AI ID deployment.
 * `active` keeps the request off until a screen actually needs the answer. */
export function useLessonAuthorAvailable(active: boolean): boolean {
  const user = useAuthStore(s => s.user);
  const authenticated = useAuthStore(s => s.isAuthenticated && !s.isLoggingOut);
  const canEditCourses = useAuthStore(s => s.hasPermission('courses', 'can_edit'));
  const activeTenantId = useTenantStore(s => s.activeTenantId);
  const tenantId = user?.role === 'superadmin' ? activeTenantId : user?.tenant_id ?? null;
  const eligible = active && lessonAuthorEntryAllowed({
    featureEnabled: workspaceHostEnabled(import.meta.env.VITE_LESSON_AUTHOR_WORKSPACE_ENABLED),
    authenticated, role: user?.role, canEditCourses, tenantId,
  });
  const settings = useQuery({
    queryKey: lessonAuthorAvailabilityKeys.tenant(tenantId ?? ''),
    queryFn: () => fetchLessonAuthorChatSettings(),
    enabled: eligible,
    staleTime: LESSON_AUTHOR_AVAILABILITY_STALE_MS,
    retry: 1,
  });
  // An unknown answer (loading or failed read) only hides an advisory hint.
  return eligible && isLessonAuthorDeployedForTenant(settings.data, tenantId);
}
