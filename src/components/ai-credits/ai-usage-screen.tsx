import { useEffect, useState } from 'react';
import { useAiUsage } from '@/hooks/queries/use-ai-credits';
import { AiUsageError, AiUsageNoTenant, AiUsageSkeleton } from './ai-usage-states';
import { AiUsageHeader, AiUsageView } from './ai-usage-view';

/**
 * The AI usage of one tenant (the caller's, or the switcher tenant for a
 * superadmin), shown in the AI Chatbot "overview" tab.
 */
export function AiUsageScreen({ tenantScope, requestTenantId }: { tenantScope: string | null; requestTenantId: string | null }) {
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => { setMonth(null); }, [tenantScope]);
  const query = useAiUsage({ tenantScope, requestTenantId, month });
  const summary = query.data;
  // Choosing the newest month goes back to "current" so the backend decides the month.
  const changeMonth = (next: string) => setMonth(summary && next === summary.available_months[0] ? null : next);

  return (
    <div className="relative isolate w-full space-y-6 pb-10">
      <AiUsageHeader summary={summary} month={month} onMonthChange={changeMonth} fetching={query.isFetching && !query.isPending} />
      {!tenantScope ? <AiUsageNoTenant />
        : summary ? <AiUsageView summary={summary} />
          : query.isError ? <AiUsageError onRetry={() => { void query.refetch(); }} retrying={query.isFetching} />
            : <AiUsageSkeleton />}
    </div>
  );
}
