import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Building2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiCreditOverview, useAiCreditPlans } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { aiOverviewTotals } from './ai-credits-admin.logic';
import { formatCount, recentMonths } from './ai-credits-format.logic';
import { AI_EASE } from './ai-credits-ui';
import { AiCreditsKpis } from './ai-credits-kpis';
import { AiCreditsTenantDrawer } from './ai-credits-tenant-drawer';
import { AiCreditsTenantTable } from './ai-credits-tenant-table';
import { AiMonthSelect } from './ai-month-select';

const MONTHS_SHOWN = 12;

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

/** Month KPIs, the missing-FX warning, and the tenant table with its drawer. */
export function AiCreditsOverviewTab({ onSetFx, now }: { onSetFx: (month: string) => void; now: Date }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const months = useMemo(() => recentMonths(now, MONTHS_SHOWN), [now]);
  const [month, setMonth] = useState(months[0]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const overview = useAiCreditOverview(month);
  const plans = useAiCreditPlans();
  // While another month loads, the previous month stays on screen (the month picker sits outside the drawer).
  const data = overview.data;
  const totals = useMemo(() => aiOverviewTotals(data?.tenants ?? []), [data]);
  // The drawer follows the latest overview row, so it shows saved changes right away.
  const selectedTenant = data?.tenants.find(tenant => tenant.tenant_id === selectedTenantId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" aria-hidden />
          {data ? t('aiCredits.admin.overview.tableCount', { count: formatCount(data.tenants.length, locale) }) : '\u00a0'}
          {overview.isFetching && !overview.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-label={t('aiCredits.common.updating')} />}
        </div>
        <AiMonthSelect months={months} value={month} onChange={setMonth} />
      </div>

      {data && data.fx_vnd_per_usd === null && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: AI_EASE }}
          className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/[0.12] via-amber-500/[0.05] to-transparent p-4 sm:flex-row sm:items-center" role="status">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300" aria-hidden>
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{t('aiCredits.admin.overview.noFxTitle')}</p>
            <p className="text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">{t('aiCredits.admin.overview.noFxBody')}</p>
          </div>
          <Button type="button" className="h-9 shrink-0 rounded-xl" onClick={() => onSetFx(month)}>
            {t('aiCredits.admin.overview.setFx')}<ArrowRight aria-hidden />
          </Button>
        </motion.div>
      )}

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

      <AiCreditsTenantDrawer
        tenant={selectedTenant}
        month={month}
        currentMonth={months[0]}
        plans={plans.data ?? []}
        onClose={() => setSelectedTenantId(null)}
      />
    </div>
  );
}
