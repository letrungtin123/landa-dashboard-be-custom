import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AiUsageHeader, AiUsageView } from '@/components/ai-credits/ai-usage-view';
import { AiUsageError, AiUsageNoTenant, AiUsageSkeleton } from '@/components/ai-credits/ai-usage-states';
import { useAiUsage } from '@/hooks/queries/use-ai-credits';
import { useHeaderInfo } from '@/utils/header-store';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';

/** The AI usage page for one tenant (the caller's, or the switcher tenant for a superadmin). */
export function AiUsageScreen({ tenantScope, requestTenantId }: { tenantScope: string | null; requestTenantId: string | null }) {
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => { setMonth(null); }, [tenantScope]);
  const query = useAiUsage({ tenantScope, requestTenantId, month });
  const summary = query.data;
  // Choosing the newest month goes back to "current" so the backend decides the month.
  const changeMonth = (next: string) => setMonth(summary && next === summary.months[0] ? null : next);

  return (
    <div className="relative isolate mx-auto w-full max-w-7xl space-y-6 p-4 pb-16 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/[0.06] to-transparent" />
      <AiUsageHeader summary={summary} month={month} onMonthChange={changeMonth} fetching={query.isFetching && !query.isPending} />
      {!tenantScope ? <AiUsageNoTenant />
        : summary ? <AiUsageView summary={summary} />
          : query.isError ? <AiUsageError onRetry={() => { void query.refetch(); }} retrying={query.isFetching} />
            : <AiUsageSkeleton />}
    </div>
  );
}

export default function AiUsagePage() {
  const { t } = useTranslation();
  useHeaderInfo(t('aiCredits.usage.title'));
  const user = useAuthStore(state => state.user);
  const activeTenantId = useTenantStore(state => state.activeTenantId);
  const superadmin = user?.role === 'superadmin';
  const tenantScope = superadmin ? activeTenantId : user?.tenant_id ?? null;
  return <AiUsageScreen tenantScope={tenantScope} requestTenantId={superadmin ? activeTenantId : null} />;
}
