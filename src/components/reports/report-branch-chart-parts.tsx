// Building blocks of the branch enrollment chart: summary tiles, the ranking
// legend (click to hide or show a line), and the loading / empty / error states.
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Activity, CalendarCheck, Eye, EyeOff, Flame, Trophy, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLocaleNumber } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import type { BranchChartModel, BranchSeries } from './report-branch-chart.logic';

export const BRANCH_CHART_EASE = [0.16, 1, 0.3, 1] as const;
export type BranchBucketSize = 'day' | 'week' | 'month';
/** Shares always with one decimal ("10,0%"), so the chips line up. */
const SHARE_FORMAT = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

/** CSS color of a line: 8 categorical steps by rank (light and dark in globals.css), gray for "Khác". */
export function branchSeriesColor(series: BranchSeries): string {
  if (series.isOther) return 'var(--report-series-other)';
  return `var(--report-series-${((series.rank - 1) % 8) + 1})`;
}

function StatTile({ icon: Icon, label, value, hint, className }: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-2xl border border-border/60 bg-background/55 px-3.5 py-3 dark:bg-white/[0.02]', className)}>
      <p className="flex items-start gap-1.5 text-[11px] font-medium leading-4 text-muted-foreground">
        <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="line-clamp-2">{label}</span>
      </p>
      <div className="mt-1.5 truncate text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg">{value}</div>
      {hint && <div className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Leader (or, for one series, how many buckets had enrollments), busiest bucket and average per bucket. */
export function BranchSummaryStrip({ model, size, single, nameOf, bucketTitle }: {
  model: BranchChartModel;
  size: BranchBucketSize;
  single: boolean;
  nameOf: (series: BranchSeries) => string;
  bucketTitle: (bucket: string) => string;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const number = (value: number) => formatLocaleNumber(value, locale);
  const leader = model.series[0];
  const average = model.bucketCount ? model.grandTotal / model.bucketCount : 0;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
      {single || !leader ? (
        <StatTile
          icon={CalendarCheck}
          className="col-span-2 sm:col-span-1"
          label={t(`reports.branchChart.active.${size}`)}
          value={t('reports.branchChart.activeValue', { active: number(model.activeBuckets), total: number(model.bucketCount) })}
        />
      ) : (
        <StatTile
          icon={Trophy}
          className="col-span-2 sm:col-span-1"
          label={t('reports.branchChart.leader')}
          value={<span title={nameOf(leader)}>{nameOf(leader)}</span>}
          hint={t('reports.branchChart.leaderValue', {
            value: number(leader.total),
            share: formatLocaleNumber(leader.share, locale, SHARE_FORMAT),
          })}
        />
      )}
      <StatTile
        icon={Flame}
        label={t(`reports.branchChart.peak.${size}`)}
        value={model.peak ? bucketTitle(model.peak.bucket) : '—'}
        hint={model.peak ? t('reports.branchChart.enrollments', { value: number(model.peak.total) }) : undefined}
      />
      <StatTile
        icon={Activity}
        label={t(`reports.branchChart.average.${size}`)}
        value={formatLocaleNumber(average, locale, { maximumFractionDigits: average < 10 ? 1 : 0 })}
        hint={t('reports.branchChart.unit')}
      />
    </div>
  );
}

/** Ranked chips with total and share; each one hides or shows its line, hover / focus highlights it. */
export function BranchRankingLegend({ series, hidden, focused, groupLabel, overflow, onToggle, onFocus, onShowAll, nameOf }: {
  series: readonly BranchSeries[];
  hidden: ReadonlySet<string>;
  focused: string | null;
  groupLabel: string;
  overflow: boolean;
  onToggle: (key: string) => void;
  onFocus: (key: string | null) => void;
  onShowAll: () => void;
  nameOf: (series: BranchSeries) => string;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const showShare = series.length > 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{t('reports.branchChart.rankingTitle')}</p>
          {showShare && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t('reports.branchChart.rankingHint', { group: groupLabel })}</p>}
        </div>
        {hidden.size > 0 && (
          <button type="button" onClick={onShowAll}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {t('reports.branchChart.showAll')}
          </button>
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {series.map((item, index) => {
          const isHidden = hidden.has(item.key);
          const isFocused = focused === item.key && !isHidden;
          const color = branchSeriesColor(item);
          const name = nameOf(item);
          return (
            <li key={item.key} className="min-w-0">
              <button
                type="button"
                aria-pressed={!isHidden}
                aria-label={t(isHidden ? 'reports.branchChart.showSeries' : 'reports.branchChart.hideSeries', { name })}
                disabled={!showShare}
                onClick={() => onToggle(item.key)}
                onMouseEnter={() => onFocus(item.key)}
                onMouseLeave={() => onFocus(null)}
                onFocus={() => onFocus(item.key)}
                onBlur={() => onFocus(null)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,opacity,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default',
                  isHidden
                    ? 'border-dashed border-border/80 bg-transparent opacity-60 hover:opacity-90'
                    : 'border-border/60 bg-background/55 hover:border-border hover:bg-muted/45 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]',
                  isFocused && 'border-border bg-muted/50 shadow-sm dark:bg-white/[0.06]',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="w-4 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">{item.isOther ? '·' : item.rank}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" aria-hidden
                    style={isHidden ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { backgroundColor: color }} />
                  <span className={cn('min-w-0 flex-1 truncate text-xs font-medium', isHidden ? 'text-muted-foreground line-through decoration-muted-foreground/60' : 'text-foreground')} title={name}>
                    {name}
                  </span>
                  {isHidden && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t('reports.branchChart.hiddenSeries')} />}
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{formatLocaleNumber(item.total, locale)}</span>
                  {showShare && (
                    <span className="min-w-[44px] shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-muted-foreground dark:bg-white/[0.06]">
                      {formatLocaleNumber(item.share, locale, SHARE_FORMAT)}%
                    </span>
                  )}
                </span>
                {showShare && (
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted dark:bg-white/[0.06]" aria-hidden>
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ backgroundColor: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${item.total > 0 ? Math.max(item.share, 1.5) : 0}%` }}
                      transition={{ duration: 0.8, ease: BRANCH_CHART_EASE, delay: 0.15 + Math.min(index, 8) * 0.04 }}
                    />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {showShare && (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {t('reports.branchChart.shareHint', { group: groupLabel })}
          {overflow && <> {t('reports.branchChart.otherHint', { group: groupLabel, count: series.filter(item => !item.isOther).length })}</>}
        </p>
      )}
    </div>
  );
}

/** Placeholder with the final layout: tiles, chart, ranking chips. */
export function BranchChartSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <Skeleton className="col-span-2 h-[78px] rounded-2xl sm:col-span-1" />
        <Skeleton className="h-[78px] rounded-2xl" />
        <Skeleton className="h-[78px] rounded-2xl" />
      </div>
      <Skeleton className="h-[240px] w-full rounded-2xl sm:h-[300px]" />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-[52px] rounded-xl" />)}
      </div>
    </div>
  );
}

/** Empty or error state in the chart's place, with an optional action. */
export function BranchChartNotice({ icon: Icon, tone = 'neutral', title, hint, action }: {
  icon: LucideIcon;
  tone?: 'neutral' | 'error';
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-10 text-center dark:bg-white/[0.015]"
      role={tone === 'error' ? 'alert' : 'status'}>
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl ring-1',
        tone === 'error' ? 'bg-destructive/10 text-destructive ring-destructive/20' : 'bg-primary/10 text-primary ring-primary/15')}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {hint && <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
