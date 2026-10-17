import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Banknote, Cpu, Gauge, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import type { AiOverviewTotals } from './ai-credits-admin.logic';
import { formatCount, formatPercent, formatUsd, formatVnd } from './ai-credits-format.logic';
import { AI_EASE, AiAnimatedNumber } from './ai-credits-ui';

function KpiCard({ index, icon: Icon, tone, label, value, sub, hint }: {
  index: number;
  icon: LucideIcon;
  tone: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: AI_EASE, delay: index * 0.06 }}
      className="relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
    >
      <div aria-hidden className={cn('pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-60 blur-2xl', tone)} />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-foreground/70 ring-1 ring-border/60" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-2 truncate text-2xl font-bold tracking-tight text-foreground">{value}</div>
      {sub && <div className="relative mt-0.5 truncate text-xs font-medium text-muted-foreground">{sub}</div>}
      <p className="relative mt-2 truncate text-[11px] text-muted-foreground/80">{hint}</p>
    </motion.div>
  );
}

/** Revenue, AI cost (VND and USD), gross margin and tenants near or over their limit. */
export function AiCreditsKpis({ totals }: { totals: AiOverviewTotals }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const vnd = (value: number | null) => formatVnd(value, locale);
  const positive = (totals.marginVnd ?? 0) >= 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard index={0} icon={Banknote} tone="bg-sky-500/20" label={t('aiCredits.admin.overview.kpiRevenue')}
        value={<AiAnimatedNumber value={totals.revenueVnd} format={vnd} />} hint={t('aiCredits.admin.overview.kpiRevenueHint')} />
      <KpiCard index={1} icon={Cpu} tone="bg-violet-500/20" label={t('aiCredits.admin.overview.kpiCost')}
        value={totals.costVnd === null ? formatUsd(totals.costUsd, locale) : <AiAnimatedNumber value={totals.costVnd} format={vnd} />}
        sub={totals.costVnd === null ? t('aiCredits.admin.overview.kpiNoMargin') : formatUsd(totals.costUsd, locale)}
        hint={t('aiCredits.admin.overview.kpiCostHint')} />
      <KpiCard index={2} icon={positive ? TrendingUp : TrendingDown} tone={positive ? 'bg-emerald-500/20' : 'bg-rose-500/20'}
        label={t('aiCredits.admin.overview.kpiMargin')}
        value={totals.marginVnd === null ? <span className="text-muted-foreground">—</span>
          : <span className={positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}><AiAnimatedNumber value={totals.marginVnd} format={vnd} /></span>}
        sub={totals.marginVnd === null ? t('aiCredits.admin.overview.kpiNoMargin') : formatPercent(totals.marginPercent, locale)}
        hint={t('aiCredits.admin.overview.kpiMarginHint')} />
      <KpiCard index={3} icon={Gauge} tone="bg-amber-500/20" label={t('aiCredits.admin.overview.kpiNearLimit')}
        value={formatCount(totals.nearLimit + totals.exhausted, locale)}
        sub={t('aiCredits.admin.overview.kpiNearLimitHint', { near: formatCount(totals.nearLimit, locale), exhausted: formatCount(totals.exhausted, locale) })}
        hint={t('aiCredits.admin.overview.tableCount', { count: formatCount(totals.tenantCount, locale) })} />
    </div>
  );
}
