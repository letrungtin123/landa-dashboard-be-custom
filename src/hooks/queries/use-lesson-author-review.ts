import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceLocale } from '@/api/lesson-author-workspace.contract';
import type { WorkspaceReadScope } from '@/api/lesson-author-workspace';
import { listWorkspaceReviewItems, resolveWorkspaceReviewItem, type WorkspaceReviewDecision } from '@/api/workspace-review';

/** Keys include the active tenant (superadmin switches tenants) and the exact workspace. */
export const lessonAuthorReviewKeys = {
  all: ['lesson-author-review'] as const,
  list: (tenantId: string, scope: WorkspaceReadScope) =>
    [...lessonAuthorReviewKeys.all, tenantId, scope.courseId, scope.conversationId, scope.workspaceId] as const,
};

/** Review items of one finished run. The list changes only by the author's own decisions. */
export function useLessonAuthorReviewItems(input: { tenantId: string | null | undefined; scope: WorkspaceReadScope | null;
  locale: WorkspaceLocale; enabled: boolean }) {
  const scope = input.scope;
  return useQuery({
    queryKey: lessonAuthorReviewKeys.list(input.tenantId ?? '', scope ?? { courseId: '', conversationId: '', workspaceId: '' }),
    queryFn: ({ signal }) => listWorkspaceReviewItems(scope!, input.locale, signal),
    enabled: input.enabled && !!input.tenantId && !!scope,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useResolveLessonAuthorReviewItem(input: { tenantId: string | null | undefined; scope: WorkspaceReadScope | null;
  locale: WorkspaceLocale }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { obligationId: string; decision: WorkspaceReviewDecision; componentNodeId?: string; operationId: string }) =>
      resolveWorkspaceReviewItem(input.scope!, variables.obligationId, { decision: variables.decision,
        component_node_id: variables.componentNodeId, operation_id: variables.operationId }, input.locale),
    // Success, replay or "already reviewed": the list on the server is the answer.
    onSettled: () => input.scope && input.tenantId
      ? queryClient.invalidateQueries({ queryKey: lessonAuthorReviewKeys.list(input.tenantId, input.scope) }) : undefined,
  });
}
