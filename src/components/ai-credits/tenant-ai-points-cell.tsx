import { useTranslation } from 'react-i18next';
import type { AiCreditOverviewTenant } from '@/api/ai-credits';
import { Skeleton } from '@/components/ui/skeleton';
import { AppTooltip } from '@/components/ui/tooltip';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { EMPTY_VALUE, formatPercent, formatPoints } from './ai-credits-format.logic';
import { aiStateTone } from './ai-credits-usage.logic';
import { AiStateChip, AiUsageMeter } from './ai-credits-ui';

/**
 * Tenants table > "Điểm AI": the tenant's plan and the share of this month's
 * points it used, in the state colors of the AI points pages. The page reads
 * the superadmin overview once for the whole table and passes each row its
 * entry (never one call per row). Replaces the old monthly token column.
 */
export function TenantAiPointsCell({ loading, failed, tenant }: {
  loading: boolean;
  failed: boolean;
  /** The tenant's row of this month's overview; missing for a tenant created after it was read. */
  tenant: AiCreditOverviewTenant | undefined;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);

  if (loading) {
    return <Skeleton className="mx-auto h-8 w-28 rounded-lg" aria-label={t('tenantManagement.aiPointsLoading')} />;
  }
  if (failed) {
    return (
      <AppTooltip content={t('tenantManagement.aiPointsUnavailable')}>
        <span className="cursor-help text-xs text-muted-foreground" tabIndex={0}>
          {EMPTY_VALUE}<span className="sr-only">{t('tenantManagement.aiPointsUnavailable')}</span>
        </span>
      </AppTooltip>
    );
  }
  if (!tenant || !tenant.has_month) {
    return <span className="text-[11px] text-muted-foreground">{t('aiCredits.admin.overview.noMonth')}</span>;
  }

  const plan = (
    <span className="block max-w-[160px] truncate text-xs font-semibold text-foreground">
      {tenant.plan_name || t('aiCredits.admin.overview.noPlan')}
    </span>
  );
  if (tenant.state === 'unlimited') {
    return (
      <div className="inline-flex flex-col items-center gap-1">
        {plan}
        <AiStateChip state="unlimited" />
      </div>
    );
  }
  if (tenant.state === 'unvalued') {
    return (
      <div className="inline-flex flex-col items-center gap-1">
        {plan}
        <AppTooltip content={t('aiCredits.states.unvalued')}>
          <span className="cursor-help text-[11px] text-muted-foreground" tabIndex={0}>{t('tenantManagement.aiPointsUnvalued')}</span>
        </AppTooltip>
      </div>
    );
  }

  const tone = aiStateTone(tenant.state);
  const used = t('tenantManagement.aiPointsUsed', {
    used: formatPoints(tenant.points_used, locale),
    total: formatPoints(tenant.points_total, locale),
  });
  return (
    <AppTooltip content={`${t(tone.labelKey)} · ${used}`}>
      <div className="inline-flex cursor-help flex-col items-center gap-1" tabIndex={0}>
        {plan}
        <span className="flex w-[132px] items-center gap-2">
          <AiUsageMeter state={tenant.state} percent={tenant.percent} className="flex-1" />
          <span className={cn('w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums', tone.text)}>
            {formatPercent(tenant.percent, locale)}
          </span>
        </span>
        <span className="sr-only">{t(tone.labelKey)}</span>
      </div>
    </AppTooltip>
  );
}
