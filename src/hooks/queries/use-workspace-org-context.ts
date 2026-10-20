import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceLocale } from '@/api/lesson-author-workspace.contract';
import { orgContextApi } from '@/api/workspace-org-context';
import { ORG_CONTEXT_CONNECTION, readOrgContextFailure, type OrgContextRead, type OrgProfile } from '@/api/workspace-org-context.contract';

/** Tenant-wide data: every key carries the active tenant (a superadmin switches tenants). */
export const orgContextKeys = {
  all: ['lesson-author-org-context'] as const,
  tenant: (tenantId: string) => [...orgContextKeys.all, tenantId] as const,
  state: (tenantId: string) => [...orgContextKeys.tenant(tenantId), 'state'] as const,
  version: (tenantId: string, version: number) => [...orgContextKeys.tenant(tenantId), 'version', version] as const,
};

/** Polling only while the server is still working: a document being read, or a profile draft queued or running. */
export const ORG_CONTEXT_POLL_MS = 5_000;
export const ORG_CONTEXT_STALE_MS = 30_000;

export function orgContextWorking(data: OrgContextRead | undefined): boolean {
  if (!data?.enabled) return false;
  return data.documents.some(document => document.status === 'learning')
    || data.distill.status === 'queued' || data.distill.status === 'running';
}
/** React Query refetchInterval: 5 s while working and the tab is visible, otherwise no polling. */
export function orgContextPollInterval(data: OrgContextRead | undefined, visibility: DocumentVisibilityState | undefined): number | false {
  return visibility !== 'hidden' && orgContextWorking(data) ? ORG_CONTEXT_POLL_MS : false;
}
/** One retry, only when the server could not answer or failed; a refusal (404 of an older server, 403) is final. */
export function shouldRetryOrgContextRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  const failure = readOrgContextFailure(error);
  return failure.code === ORG_CONTEXT_CONNECTION || failure.status !== null && failure.status >= 500;
}

const visibility = () => typeof document === 'undefined' ? undefined : document.visibilityState;

export function useWorkspaceOrgContext(input: { tenantId: string | null | undefined; enabled: boolean }) {
  return useQuery({
    queryKey: orgContextKeys.state(input.tenantId ?? ''),
    queryFn: ({ signal }) => orgContextApi.state(signal),
    enabled: input.enabled && !!input.tenantId,
    staleTime: ORG_CONTEXT_STALE_MS,
    refetchInterval: query => orgContextPollInterval(query.state.data, visibility()),
    refetchOnWindowFocus: true,
    retry: shouldRetryOrgContextRead,
  });
}

/** One stored version (versions never change once written). */
export function useOrgProfileVersion(input: { tenantId: string | null | undefined; version: number | null }) {
  return useQuery({
    queryKey: orgContextKeys.version(input.tenantId ?? '', input.version ?? 0),
    queryFn: ({ signal }) => orgContextApi.version(input.version!, signal),
    enabled: !!input.tenantId && input.version !== null,
    staleTime: Infinity,
    retry: shouldRetryOrgContextRead,
  });
}

/** After every attempt the server state is the answer: reload it (this tenant only). */
function useRefreshState(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  return () => tenantId ? queryClient.invalidateQueries({ queryKey: orgContextKeys.state(tenantId) }) : undefined;
}

export function useOrgContextUpload(tenantId: string | null | undefined) {
  const onSettled = useRefreshState(tenantId);
  return useMutation({
    mutationFn: (input: { file: File; onProgress: (percent: number | null) => void }) => orgContextApi.upload(input.file, { onProgress: input.onProgress }),
    onSettled,
  });
}
export function useOrgContextDeleteDocument(tenantId: string | null | undefined) {
  const onSettled = useRefreshState(tenantId);
  return useMutation({ mutationFn: (documentId: string) => orgContextApi.removeDocument(documentId), onSettled });
}
export function useOrgProfileDistill(tenantId: string | null | undefined) {
  const onSettled = useRefreshState(tenantId);
  return useMutation({
    mutationFn: (input: { expectedRevision: number; locale: WorkspaceLocale }) =>
      orgContextApi.distill({ expected_revision: input.expectedRevision, locale: input.locale }),
    onSettled,
  });
}
export function useOrgProfileSave(tenantId: string | null | undefined) {
  const onSettled = useRefreshState(tenantId);
  return useMutation({
    mutationFn: (input: { expectedRevision: number; profile: Readonly<OrgProfile>; confirm: boolean }) =>
      orgContextApi.saveProfile({ expected_revision: input.expectedRevision, profile: input.profile, confirm: input.confirm }),
    onSettled,
  });
}
export function useOrgProfileRestore(tenantId: string | null | undefined) {
  const onSettled = useRefreshState(tenantId);
  return useMutation({
    mutationFn: (input: { expectedRevision: number; version: number }) =>
      orgContextApi.restore({ expected_revision: input.expectedRevision, version: input.version }),
    onSettled,
  });
}
