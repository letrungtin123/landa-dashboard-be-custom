import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Building2, ChevronRight, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import type { AiCreditOverviewTenant } from '@/api/ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { aiReconciliationStatus } from './ai-credits-admin.logic';
import { formatPercent, formatPoints, formatSignedPercent, formatUsd, formatVnd } from './ai-credits-format.logic';
import { AI_EASE, AiStateChip, AiUsageMeter } from './ai-credits-ui';

const COLUMNS = 'xl:grid-cols-[minmax(0,1.6fr)_160px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_16px]';

function ReconcileBadge({ tenant }: { tenant: AiCreditOverviewTenant }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const status = aiReconciliationStatus(tenant);
  if (status === 'none') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <CircleDashed className="h-3 w-3 shrink-0" aria-hidden />{t('aiCredits.admin.overview.reconcileNone')}
      </span>
    );
  }
  if (status === 'match') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
        <CircleCheck className="h-3 w-3 shrink-0" aria-hidden />{t('aiCredits.admin.overview.reconcileMatch')}
      </span>
    );
  }
  const diff = formatSignedPercent(tenant.reconciled_diff_percent, locale);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
      <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
      {t(status === 'over' ? 'aiCredits.admin.overview.reconcileOver' : 'aiCredits.admin.overview.reconcileUnder', { diff })}
    </span>
  );
}

/** Small caption shown above a value on narrow screens (the header row takes over on wide screens). */
function MobileCaption({ children }: { children: string }) {
  return <p className="text-[11px] text-muted-foreground xl:hidden">{children}</p>;
}

/** One row per tenant: plan, usage meter, points, cost (USD/VND), revenue, margin and the invoice check. Rows open the drawer. */
export function AiCreditsTenantTable({ tenants, onOpen }: { tenants: readonly AiCreditOverviewTenant[]; onOpen: (tenant: AiCreditOverviewTenant) => void }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  if (tenants.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border/80 px-4 py-12 text-center text-sm text-muted-foreground">{t('aiCredits.admin.overview.empty')}</p>;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className={cn('hidden gap-3 border-b border-border/60 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:grid', COLUMNS)}>
        <span>{t('aiCredits.admin.overview.columnTenant')}</span>
        <span>{t('aiCredits.admin.overview.columnUsage')}</span>
        <span className="text-right">{t('aiCredits.admin.overview.columnPoints')}</span>
        <span className="text-right">{t('aiCredits.admin.overview.columnCost')}</span>
        <span className="text-right">{t('aiCredits.admin.overview.columnRevenue')}</span>
        <span className="text-right">{t('aiCredits.admin.overview.columnMargin')}</span>
        <span>{t('aiCredits.admin.overview.columnReconcile')}</span>
        <span />
      </div>
      <ul className="divide-y divide-border/50">
        {tenants.map((tenant, index) => {
          const marginTone = tenant.margin_vnd === null ? 'text-muted-foreground'
            : tenant.margin_vnd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
          return (
            <motion.li key={tenant.tenant_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: AI_EASE, delay: Math.min(index, 12) * 0.025 }}>
              <button
                type="button"
                onClick={() => onOpen(tenant)}
                aria-label={t('aiCredits.admin.overview.openTenant', { name: tenant.tenant_name })}
                className={cn('group grid w-full grid-cols-2 gap-x-3 gap-y-3 px-4 py-3.5 md:grid-cols-4 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none xl:items-center', COLUMNS)}
              >
                <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-4 xl:col-span-1">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15" aria-hidden>
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{tenant.tenant_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="sr-only">{t('aiCredits.admin.overview.columnPlan')}: </span>
                      {tenant.plan_name || t('aiCredits.admin.overview.noPlan')}
                    </p>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/60 xl:hidden" aria-hidden />
                </div>
                <div className="col-span-2 min-w-0 space-y-1.5 md:col-span-4 xl:col-span-1">
                  {tenant.has_month ? (
                    <>
                      <div className="flex items-center gap-2">
                        <AiUsageMeter state={tenant.state} percent={tenant.percent} className="flex-1" />
                        <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                          {tenant.state === 'unlimited' ? '∞' : formatPercent(tenant.percent, locale)}
                        </span>
                      </div>
                      <AiStateChip state={tenant.state} />
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <CircleDashed className="h-3 w-3 shrink-0" aria-hidden />{t('aiCredits.admin.overview.noMonth')}
                    </span>
                  )}
                </div>
                <div className="min-w-0 xl:text-right">
                  <MobileCaption>{t('aiCredits.admin.overview.columnPoints')}</MobileCaption>
                  {tenant.has_month ? (
                    <p className="truncate text-sm tabular-nums text-foreground">
                      {formatPoints(tenant.points_used, locale)}
                      <span className="text-muted-foreground"> / {tenant.is_unlimited ? '∞' : formatPoints(tenant.points_total, locale)}</span>
                    </p>
                  ) : <p className="text-sm text-muted-foreground">—</p>}
                </div>
                <div className="min-w-0 xl:text-right">
                  <MobileCaption>{t('aiCredits.admin.overview.columnCost')}</MobileCaption>
                  <p className="truncate text-sm tabular-nums text-foreground">{formatVnd(tenant.cost_vnd, locale)}</p>
                  <p className="truncate text-[11px] tabular-nums text-muted-foreground">{formatUsd(tenant.cost_usd, locale)}</p>
                </div>
                <div className="min-w-0 xl:text-right">
                  <MobileCaption>{t('aiCredits.admin.overview.columnRevenue')}</MobileCaption>
                  <p className="truncate text-sm tabular-nums text-foreground">{tenant.has_month ? formatVnd(tenant.revenue_vnd, locale) : '—'}</p>
                </div>
                <div className="min-w-0 xl:text-right">
                  <MobileCaption>{t('aiCredits.admin.overview.columnMargin')}</MobileCaption>
                  <p className={cn('truncate text-sm font-semibold tabular-nums', marginTone)}>{formatVnd(tenant.margin_vnd, locale)}</p>
                  {tenant.margin_percent !== null && <p className="text-[11px] tabular-nums text-muted-foreground">{formatPercent(tenant.margin_percent, locale)}</p>}
                </div>
                <div className="col-span-2 min-w-0 md:col-span-4 xl:col-span-1">
                  <MobileCaption>{t('aiCredits.admin.overview.columnReconcile')}</MobileCaption>
                  <ReconcileBadge tenant={tenant} />
                </div>
                <ChevronRight className="hidden h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 xl:block" aria-hidden />
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
