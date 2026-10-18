import { createContext, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  aiCreditsApi,
  type AiCreditPlanCreateInput,
  type AiCreditPlanInput,
  type AiCreditReconciliationInput,
  type AiCreditTopupInput,
  type AiCreditsApi,
} from '@/api/ai-credits';
import { aiCreditAdminErrorKey } from '@/api/ai-credit-errors.logic';
import { getLocalizedApiError } from '@/utils/localized-error';

/**
 * The API the hooks call. Production always uses the real client; the
 * development preview page provides an in-memory one so it never reaches the
 * backend.
 */
const AiCreditsApiContext = createContext<AiCreditsApi>(aiCreditsApi);
export const AiCreditsApiProvider = AiCreditsApiContext.Provider;
function useAiCreditsApi(): AiCreditsApi {
  return useContext(AiCreditsApiContext);
}

/** Keys carry every input that changes the answer: tenant and month. `current` = the backend's current month. */
export const aiCreditKeys = {
  all: ['ai-credits'] as const,
  usageAll: () => [...aiCreditKeys.all, 'usage'] as const,
  usage: (tenantScope: string | null, month: string | null) => [...aiCreditKeys.usageAll(), tenantScope, month ?? 'current'] as const,
  admin: () => [...aiCreditKeys.all, 'admin'] as const,
  plans: () => [...aiCreditKeys.admin(), 'plans'] as const,
  fx: () => [...aiCreditKeys.admin(), 'fx'] as const,
  overviewAll: () => [...aiCreditKeys.admin(), 'overview'] as const,
  overview: (month: string | null) => [...aiCreditKeys.overviewAll(), month ?? 'current'] as const,
  tenantUsageAll: () => [...aiCreditKeys.admin(), 'tenant-usage'] as const,
  tenantUsageOf: (tenantId: string) => [...aiCreditKeys.tenantUsageAll(), tenantId] as const,
  tenantUsage: (tenantId: string, month: string | null) => [...aiCreditKeys.tenantUsageOf(tenantId), month ?? 'current'] as const,
  tenantPlanAll: () => [...aiCreditKeys.admin(), 'tenant-plan'] as const,
  tenantPlan: (tenantId: string) => [...aiCreditKeys.tenantPlanAll(), tenantId] as const,
};

export const AI_CREDIT_STALE_TIME_MS = 30_000;

/** Retry only when the server could not answer (network, timeout) or failed (5xx). */
export function shouldRetryAiCreditQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const failure = error as { response?: { status?: number } } | null;
  if (!failure || typeof failure !== 'object') return false;
  const status = failure.response?.status;
  return status === undefined || status >= 500;
}

const queryDefaults = {
  staleTime: AI_CREDIT_STALE_TIME_MS,
  refetchOnWindowFocus: false,
  retry: shouldRetryAiCreditQuery,
} as const;

/** Keeps the previous month on screen while another month of the same tenant loads (never across tenants). */
function sameScopePlaceholder<T>(scopeIndex: number, scope: string | null) {
  return (previous: T | undefined, previousQuery: { queryKey: QueryKey } | undefined) =>
    previousQuery && previousQuery.queryKey[scopeIndex] === scope ? previous : undefined;
}

/** Usage page of a tenant. tenantScope = the tenant shown; requestTenantId = the X-Tenant-Id a superadmin sends. */
export function useAiUsage(input: { tenantScope: string | null; requestTenantId: string | null; month: string | null }) {
  const api = useAiCreditsApi();
  return useQuery({
    queryKey: aiCreditKeys.usage(input.tenantScope, input.month),
    queryFn: () => api.usage(input.month, input.requestTenantId),
    enabled: Boolean(input.tenantScope),
    placeholderData: sameScopePlaceholder(2, input.tenantScope),
    ...queryDefaults,
  });
}

export function useAiCreditPlans(enabled = true) {
  const api = useAiCreditsApi();
  return useQuery({ queryKey: aiCreditKeys.plans(), queryFn: () => api.listPlans(), enabled, ...queryDefaults });
}

export function useAiFxRates(enabled = true) {
  const api = useAiCreditsApi();
  return useQuery({ queryKey: aiCreditKeys.fx(), queryFn: () => api.listFx(), enabled, ...queryDefaults });
}

export function useAiCreditOverview(month: string | null) {
  const api = useAiCreditsApi();
  return useQuery({
    queryKey: aiCreditKeys.overview(month),
    queryFn: () => api.overview(month),
    placeholderData: previous => previous,
    ...queryDefaults,
  });
}

/** Tenants table: this month's overview, read once for the whole table, by tenant id (never one call per row). */
export function useAiCreditOverviewByTenant() {
  const overview = useAiCreditOverview(null);
  const data = overview.data;
  const byTenant = useMemo(() => new Map((data?.tenants ?? []).map(tenant => [tenant.tenant_id, tenant])), [data]);
  return { loading: overview.isPending, failed: overview.isError && !data, byTenant };
}

/** The tenant's current plan only (tenant edit form): no month usage is read. */
export function useAiTenantPlan(tenantId: string | null) {
  const api = useAiCreditsApi();
  return useQuery({
    queryKey: aiCreditKeys.tenantPlan(tenantId ?? ''),
    queryFn: () => api.tenantPlan(tenantId!),
    enabled: Boolean(tenantId),
    ...queryDefaults,
  });
}

export function useAiTenantUsage(tenantId: string | null, month: string | null) {
  const api = useAiCreditsApi();
  return useQuery({
    queryKey: aiCreditKeys.tenantUsage(tenantId ?? '', month),
    queryFn: () => api.tenantUsage(tenantId!, month),
    enabled: Boolean(tenantId),
    placeholderData: sameScopePlaceholder(3, tenantId ?? ''),
    ...queryDefaults,
  });
}

function useAdminErrorToast() {
  const { t } = useTranslation();
  return (error: unknown, fallbackKey: string) => {
    const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code;
    const key = aiCreditAdminErrorKey(code);
    toast.error(key ? t(key) : getLocalizedApiError(error, t(fallbackKey)));
  };
}

/** After a change on one tenant: its usage (admin and tenant view) and every overview month. */
function invalidateTenant(queryClient: ReturnType<typeof useQueryClient>, tenantId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: aiCreditKeys.overviewAll() }),
    queryClient.invalidateQueries({ queryKey: aiCreditKeys.tenantUsageOf(tenantId) }),
    queryClient.invalidateQueries({ queryKey: [...aiCreditKeys.usageAll(), tenantId] }),
  ]);
}

/** Plan or FX changes recompute months of many tenants: refresh every AI points view. */
function invalidateEverything(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: aiCreditKeys.all });
}

export function useSaveAiCreditPlan() {
  const api = useAiCreditsApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const onError = useAdminErrorToast();
  return useMutation({
    mutationFn: (input: { planId: string | null; plan: AiCreditPlanCreateInput }) => {
      if (input.planId) {
        const { code: _code, ...update } = input.plan;
        return api.updatePlan(input.planId, update satisfies AiCreditPlanInput);
      }
      return api.createPlan(input.plan);
    },
    onSuccess: (_result, input) => {
      toast.success(t(input.planId ? 'aiCredits.admin.toasts.planUpdated' : 'aiCredits.admin.toasts.planCreated'));
      return invalidateEverything(queryClient);
    },
    onError: error => onError(error, 'aiCredits.admin.toasts.planFailed'),
  });
}

export function useSetAiFxRate() {
  const api = useAiCreditsApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const onError = useAdminErrorToast();
  return useMutation({
    mutationFn: (input: { month: string; monthLabel: string; vnd_per_usd: number; source_note: string | null }) =>
      api.setFx(input.month, { vnd_per_usd: input.vnd_per_usd, source_note: input.source_note }),
    onSuccess: (_result, input) => {
      toast.success(t('aiCredits.admin.toasts.fxSaved', { month: input.monthLabel }));
      return invalidateEverything(queryClient);
    },
    onError: error => onError(error, 'aiCredits.admin.toasts.fxFailed'),
  });
}

export function useSetTenantAiPlan() {
  const api = useAiCreditsApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const onError = useAdminErrorToast();
  return useMutation({
    mutationFn: (input: { tenantId: string; tenantName: string; planId: string; planName: string }) =>
      api.setTenantPlan(input.tenantId, input.planId),
    onSuccess: (_result, input) => {
      toast.success(t('aiCredits.admin.toasts.tenantPlanChanged', { tenant: input.tenantName, plan: input.planName }));
      return Promise.all([
        invalidateTenant(queryClient, input.tenantId),
        queryClient.invalidateQueries({ queryKey: aiCreditKeys.plans() }),
        queryClient.invalidateQueries({ queryKey: aiCreditKeys.tenantPlan(input.tenantId) }),
      ]);
    },
    onError: error => onError(error, 'aiCredits.admin.toasts.tenantPlanFailed'),
  });
}

export function useAddAiTopup() {
  const api = useAiCreditsApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const onError = useAdminErrorToast();
  return useMutation({
    mutationFn: (input: { tenantId: string; tenantName: string; pointsLabel: string; topup: AiCreditTopupInput }) =>
      api.addTopup(input.tenantId, input.topup),
    onSuccess: (_result, input) => {
      toast.success(t('aiCredits.admin.toasts.topupAdded', { points: input.pointsLabel, tenant: input.tenantName }));
      return invalidateTenant(queryClient, input.tenantId);
    },
    onError: error => onError(error, 'aiCredits.admin.toasts.topupFailed'),
  });
}

export function useReconcileAiMonth() {
  const api = useAiCreditsApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const onError = useAdminErrorToast();
  return useMutation({
    mutationFn: (input: { tenantId: string; month: string; reconciliation: AiCreditReconciliationInput }) =>
      api.reconcile(input.tenantId, input.month, input.reconciliation),
    onSuccess: () => {
      toast.success(t('aiCredits.admin.toasts.reconcileSaved'));
      return queryClient.invalidateQueries({ queryKey: aiCreditKeys.overviewAll() });
    },
    onError: error => onError(error, 'aiCredits.admin.toasts.reconcileFailed'),
  });
}
