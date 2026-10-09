import { useQuery } from '@tanstack/react-query';
import type { WorkspaceLocale } from '@/api/lesson-author-workspace.contract';
import { listLessonAuthorActiveRuns } from '@/api/workspace-sessions';

/** Course-scoped keys include the active tenant (superadmin switches tenants). */
export const lessonAuthorSessionKeys = {
  all: ['lesson-author-sessions'] as const,
  activeRuns: (tenantId: string, courseId: string) => [...lessonAuthorSessionKeys.all, 'active-runs', tenantId, courseId] as const,
};

/** Bounded poll while the AI course design panel is open and the tab visible. */
export const LESSON_AUTHOR_ACTIVE_RUN_POLL_MS = 30_000;

export function lessonAuthorActiveRunPollInterval(visibility: DocumentVisibilityState | undefined): number | false {
  return visibility === 'hidden' ? false : LESSON_AUTHOR_ACTIVE_RUN_POLL_MS;
}

export function useLessonAuthorActiveRuns(input: { tenantId: string | null | undefined; courseId: string; locale: WorkspaceLocale; enabled: boolean }) {
  return useQuery({
    queryKey: lessonAuthorSessionKeys.activeRuns(input.tenantId ?? '', input.courseId),
    queryFn: ({ signal }) => listLessonAuthorActiveRuns(input.courseId, input.locale, signal),
    enabled: input.enabled && !!input.tenantId && !!input.courseId,
    staleTime: LESSON_AUTHOR_ACTIVE_RUN_POLL_MS / 2,
    refetchInterval: () => lessonAuthorActiveRunPollInterval(typeof document === 'undefined' ? undefined : document.visibilityState),
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
