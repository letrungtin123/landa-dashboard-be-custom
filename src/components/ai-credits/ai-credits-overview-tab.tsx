import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Building2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiCreditOverview, useAiCreditPlans } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { aiOverviewTotals } from './ai-credits-admin.logic';
import { formatCount } from './ai-credits-format.logic';
import { AiCreditsKpis } from './ai-credits-kpis';
import { AiCreditsTenantDrawer } from './ai-credits-tenant-drawer';
import { AiCreditsTenantTable } from './ai-credits-tenant-table';
import { AiFxNotice } from './ai-fx-notice';
import { AiMonthSelect } from './ai-month-select';

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[132px] rounded-2xl" />)}
      </div>
      <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-4">
        {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 rounded-xl" />)}
      </div>
    </div>
  );
}

/** Month KPIs, the exchange-rate notices, and the tenant table with its drawer. */
export function AiCreditsOverviewTab({ onSetFx }: { onSetFx: (month: string) => void }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  // null = the backend's current month; the picker lists only months that have data.
  const [month, setMonth] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const overview = useAiCreditOverview(month);
  const plans = useAiCreditPlans();
  // While another month loads, the previous month stays on screen (the month picker sits outside the drawer).
  const data = overview.data;
  const totals = useMemo(() => aiOverviewTotals(data?.tenants ?? []), [data]);
  const currentMonth = data?.available_months[0] ?? null;
  const changeMonth = (next: string) => setMonth(next === currentMonth ? null : next);
  // The drawer follows the latest overview row, so it shows saved changes right away.
  const selectedTenant = data?.tenants.find(tenant => tenant.tenant_id === selectedTenantId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" aria-hidden />
          {data ? t('aiCredits.admin.overview.tableCount', { count: formatCount(data.tenants.length, locale) }) : ' '}
          {overview.isFetching && !overview.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-label={t('aiCredits.common.updating')} />}
        </div>
        <AiMonthSelect months={data?.available_months ?? []} value={month ?? data?.month} onChange={changeMonth} disabled={!data} />
      </div>

      {data && <AiFxNotice month={data.month} fxVndPerUsd={data.fx_vnd_per_usd} fxRateMonth={data.fx_rate_month} onSetFx={onSetFx} />}

      {data ? (
        <>
          <AiCreditsKpis totals={totals} />
          <div className="space-y-3">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{t('aiCredits.admin.overview.tableTitle')}</h2>
            <AiCreditsTenantTable tenants={data.tenants} onOpen={tenant => setSelectedTenantId(tenant.tenant_id)} />
          </div>
        </>
      ) : overview.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-6 py-12 text-center" role="alert">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('aiCredits.admin.overview.loadFailed')}</p>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { void overview.refetch(); }}>
            <RefreshCw aria-hidden />{t('aiCredits.common.retry')}
          </Button>
        </div>
      ) : <OverviewSkeleton />}

      {data && currentMonth && (
        <AiCreditsTenantDrawer
          tenant={selectedTenant}
          month={data.month}
          currentMonth={currentMonth}
          plans={plans.data ?? []}
          onClose={() => setSelectedTenantId(null)}
          onSetFx={onSetFx}
        />
      )}
    </div>
  );
}
