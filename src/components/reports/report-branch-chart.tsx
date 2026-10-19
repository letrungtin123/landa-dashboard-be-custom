import { useCallback, useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Eye, Inbox, RefreshCcw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiChartTooltipCard } from '@/components/ai-credits/ai-chart-tooltip';
import { useReportChartWindow } from '@/hooks/queries/use-report-chart';
import { formatLocaleNumber } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import {
  describeReportChartBucket,
  formatReportChartBucketTitle,
  formatReportChartDate,
  formatReportChartPartialNote,
  reportChartBucketSizeKey,
  type ReportChartBucketView,
} from './report-chart-buckets.logic';
import { reportChartBucketId, resolveReportChartSeriesKeys, type ReportChartRequest } from './report-chart-window.logic';
import { REPORT_CHART_OTHER_KEY, branchTooltipRows, buildBranchChart, type BranchChartRow, type BranchSeries } from './report-branch-chart.logic';
import {
  BRANCH_CHART_EASE,
  BranchChartNotice,
  BranchChartSkeleton,
  BranchRankingLegend,
  BranchSummaryStrip,
  branchSeriesColor,
  type BranchBucketSize,
} from './report-branch-chart-parts';

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };
const PILL = 'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground';

/**
 * Enrollments of each branch (group, subgroup or team) over the selected
 * range: smooth lines with a soft fill, summary tiles and a ranking legend
 * that hides, shows and highlights lines. Same requests as ReportWindowChart.
 */
export function ReportBranchChart({ request, title, valueLabel, emptyLabel, groupLabel }: {
  request: ReportChartRequest;
  /** Card title, read out as the chart's name. */
  title: string;
  /** Name of the single series when the chart is not split (one team selected). */
  valueLabel: string;
  emptyLabel: string;
  /** Lowercase name of what one line is ("chi nhánh", "phòng ban"...). */
  groupLabel: string;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const reduceMotion = useReducedMotion();
  const gradientPrefix = `branch-chart-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const chart = useReportChartWindow(request);
  const { query } = chart;
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);

  const seriesKeys = useMemo(() => resolveReportChartSeriesKeys(chart.points, chart.isGrouped), [chart.isGrouped, chart.points]);
  const model = useMemo(
    () => buildBranchChart(chart.points, seriesKeys, { otherKey: chart.seriesOverflow ? REPORT_CHART_OTHER_KEY : null }),
    [chart.points, chart.seriesOverflow, seriesKeys],
  );
  const buckets = useMemo(() => {
    const views = new Map<string, ReportChartBucketView | null>();
    for (const point of chart.points) {
      const id = reportChartBucketId(point);
      views.set(id, describeReportChartBucket(id, chart.granularity, chart.range, locale));
    }
    return views;
  }, [chart.granularity, chart.points, chart.range, locale]);

  const translate = useCallback((key: string, params?: Record<string, string | number>) => t(key, params), [t]);
  const number = useCallback((value: number) => formatLocaleNumber(value, locale), [locale]);
  const nameOf = useCallback((series: BranchSeries) => (
    series.isOther ? t('reportChart.other') : series.key === 'value' ? valueLabel : series.key
  ), [t, valueLabel]);
  const bucketTitle = useCallback((bucket: string) => {
    const view = buckets.get(bucket);
    return view ? formatReportChartBucketTitle(view, translate) : bucket;
  }, [buckets, translate]);
  const tick = useCallback((bucket: string) => buckets.get(bucket)?.tick ?? bucket, [buckets]);
  // Weeks or months cut by the range hold fewer days: marked with a hollow dot and explained below the chart.
  const partialBuckets = useMemo(() => new Set([...buckets].filter(([, view]) => view?.partial).map(([bucket]) => bucket)), [buckets]);

  const toggle = useCallback((key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  if (query.isPending) return <BranchChartSkeleton />;
  if (query.isError && !chart.points.length) {
    return (
      <BranchChartNotice icon={AlertTriangle} tone="error" title={t('reports.branchChart.loadFailed')}
        action={(
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60">
            <RefreshCcw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} aria-hidden />
            {t('common.retry')}
          </button>
        )} />
    );
  }
  if (model.grandTotal <= 0) return <BranchChartNotice icon={Inbox} title={emptyLabel} hint={t('reports.branchChart.emptyHint')} />;

  const size: BranchBucketSize = chart.granularity ?? 'day';
  const sizeKey = reportChartBucketSizeKey(chart.granularity);
  const single = model.series.length === 1;
  const visibleCount = model.series.filter(series => !hidden.has(series.key)).length;
  const active = focused && !hidden.has(focused) ? focused : null;
  const baseFill = model.series.length <= 3 ? 0.2 : 0.09;
  const showDots = model.rows.length <= 3;
  const partialDot = (color: string, slot: string) => (props: { cx?: number; cy?: number; index?: number; payload?: BranchChartRow }) => {
    const key = `${slot}-${props.index ?? 0}`;
    if (props.cx == null || props.cy == null || !props.payload || !partialBuckets.has(props.payload.bucket)) return <g key={key} />;
    return <circle key={key} cx={props.cx} cy={props.cy} r={3.5} fill="var(--card)" stroke={color} strokeWidth={1.75} />;
  };
  // Leader drawn last (on top); a highlighted line goes above every other one.
  const drawOrder = [...model.series].reverse().sort((a, b) => Number(a.key === active) - Number(b.key === active));
  const hasMore = query.hasPreviousPage || query.hasNextPage;
  const edgeFailed = query.isFetchPreviousPageError || query.isFetchNextPageError;

  const renderTooltip = ({ active: tooltipActive, payload }: { active?: boolean; payload?: Array<{ payload?: BranchChartRow }> }) => {
    const row = tooltipActive ? payload?.[0]?.payload : undefined;
    if (!row) return null;
    const { rows, total } = branchTooltipRows(row, model.series, hidden);
    const view = buckets.get(row.bucket);
    const note = view ? formatReportChartPartialNote(view, translate) : null;
    return (
      <AiChartTooltipCard
        title={<>{bucketTitle(row.bucket)}{note && <span className="mt-0.5 block text-[10px] font-normal leading-4 text-muted-foreground">{note}</span>}</>}
        rows={rows.map(item => ({ key: item.series.key, label: nameOf(item.series), color: branchSeriesColor(item.series), value: number(item.value) }))}
        total={visibleCount > 1 ? { label: t('reports.branchChart.tooltipTotal'), value: number(total) } : undefined}
      />
    );
  };

  return (
    <motion.div
      className="space-y-5"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: BRANCH_CHART_EASE }}
    >
      <BranchSummaryStrip model={model} size={size} single={single} nameOf={nameOf} bucketTitle={bucketTitle} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {sizeKey && <span className={PILL}><CalendarDays className="h-3.5 w-3.5" aria-hidden />{t(sizeKey)}</span>}
          {hasMore && chart.loadedFrom && chart.loadedTo && (
            <span className="text-[11px] text-muted-foreground">
              {t('reports.branchChart.showing', { from: formatReportChartDate(chart.loadedFrom, locale), to: formatReportChartDate(chart.loadedTo, locale) })}
            </span>
          )}
        </div>
        <div className="relative h-[240px] w-full min-w-0 sm:h-[300px]" role="figure" aria-label={t('reports.branchChart.chartLabel', { title })}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={model.rows} margin={{ top: 8, right: 10, bottom: 0, left: -6 }} accessibilityLayer>
              <defs>
                {model.series.map(series => (
                  <linearGradient key={series.slot} id={`${gradientPrefix}-${series.slot}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={branchSeriesColor(series)} stopOpacity={active === series.key ? 0.32 : active ? 0 : baseFill} />
                    <stop offset="95%" stopColor={branchSeriesColor(series)} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
              <XAxis dataKey="bucket" tickFormatter={value => tick(String(value))} tick={AXIS_TICK} tickLine={false}
                axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={18} tickMargin={8} />
              <YAxis tickFormatter={value => number(Number(value))} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.4, strokeWidth: 1, strokeDasharray: '4 4' }}
                wrapperStyle={{ outline: 'none', zIndex: 20 }} isAnimationActive={false} />
              {drawOrder.map(series => {
                const color = branchSeriesColor(series);
                const dim = !!active && active !== series.key;
                return (
                  <Area
                    key={series.slot}
                    type="monotone"
                    dataKey={series.slot}
                    name={nameOf(series)}
                    hide={hidden.has(series.key)}
                    stroke={color}
                    strokeOpacity={dim ? 0.2 : 1}
                    strokeWidth={active === series.key ? 2.75 : model.series.length > 5 ? 1.75 : 2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill={`url(#${gradientPrefix}-${series.slot})`}
                    dot={showDots ? { r: 3.5, stroke: color, strokeWidth: 2, fill: 'var(--card)' } : partialBuckets.size ? partialDot(color, series.slot) : false}
                    activeDot={dim ? false : { r: 4.5, stroke: 'var(--card)', strokeWidth: 2, fill: color }}
                    isAnimationActive={!reduceMotion}
                    animationBegin={(series.rank - 1) * 70}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
          {visibleCount === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-card/75 px-6 text-center backdrop-blur-[2px]">
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">{t('reports.branchChart.allHidden')}</p>
              <button type="button" onClick={() => setHidden(new Set())}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-medium text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                <Eye className="h-3.5 w-3.5" aria-hidden />{t('reports.branchChart.showAll')}
              </button>
            </div>
          )}
        </div>
        {partialBuckets.size > 0 && (size === 'week' || size === 'month') && (
          <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-muted-foreground bg-card" aria-hidden />
            {t(size === 'week' ? 'reports.branchChart.partialWeekHint' : 'reports.branchChart.partialMonthHint')}
          </p>
        )}
        {hasMore && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <EdgeButton direction="before" visible={query.hasPreviousPage} loading={query.isFetchingPreviousPage}
              label={t('reports.branchChart.earlier')} onClick={() => void query.fetchPreviousPage()} />
            {edgeFailed && <span className="text-[11px] font-medium text-destructive">{t('reportChart.loadMoreFailed')}</span>}
            <EdgeButton direction="after" visible={query.hasNextPage} loading={query.isFetchingNextPage}
              label={t('reports.branchChart.later')} onClick={() => void query.fetchNextPage()} />
          </div>
        )}
      </div>

      {!single && (
        <BranchRankingLegend
          series={model.series}
          hidden={hidden}
          focused={focused}
          groupLabel={groupLabel}
          overflow={model.series.some(series => series.isOther)}
          onToggle={toggle}
          onFocus={setFocused}
          onShowAll={() => setHidden(new Set())}
          nameOf={nameOf}
        />
      )}
    </motion.div>
  );
}

/** Loads the window before / after the loaded buckets (only for ranges longer than one window). */
function EdgeButton({ direction, visible, loading, label, onClick }: {
  direction: 'before' | 'after';
  visible: boolean;
  loading: boolean;
  label: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (!visible) return <span aria-hidden />;
  const Icon = direction === 'before' ? ChevronLeft : ChevronRight;
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={cn(PILL, 'h-7 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60', direction === 'after' && 'flex-row-reverse')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {loading ? t('reportChart.loadingMore') : label}
    </button>
  );
}
