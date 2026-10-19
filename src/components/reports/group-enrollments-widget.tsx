import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { formatLocaleNumber } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { useAuthStore } from '@/utils/store';
import { ReportBranchChart } from './report-branch-chart';

/**
 * "Tổng lượt ghi danh theo ..." card of the summary report: one line per
 * group, subgroup or team (depending on the filter) over the selected range.
 */
export function GroupEnrollmentsWidget({
  dateFrom,
  dateTo,
  dateLabel,
  selectedGroupId,
  selectedSubGroupId,
  selectedTeamId,
  totalEnrollments,
}: {
  dateFrom: string;
  dateTo: string;
  dateLabel: string;
  selectedGroupId: string | 'all';
  selectedSubGroupId: string | 'all';
  selectedTeamId: string | 'all';
  totalEnrollments: number;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  // What one line of the chart is: the level below the selected filter.
  const lineLabel = selectedTeamId !== 'all' || selectedSubGroupId !== 'all'
    ? labels.team
    : selectedGroupId !== 'all' ? labels.subgroup : labels.group;
  const title = selectedTeamId !== 'all'
    ? t('reports.totalEnrollmentOf', { group: lowerGroupLabel(labels.team) })
    : t('reports.totalEnrollmentBy', { group: lowerGroupLabel(lineLabel) });

  const chartRequest = useMemo(() => ({
    date_from: dateFrom,
    date_to: dateTo,
    metric: 'total_enrollments',
    group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
    group_by_org: selectedGroupId === 'all' && selectedTeamId === 'all',
    grouped: selectedTeamId !== 'all' ? false : undefined,
    subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
    team_id: selectedTeamId === 'all' ? undefined : selectedTeamId,
    granularity: 'auto' as const,
  }), [dateFrom, dateTo, selectedGroupId, selectedSubGroupId, selectedTeamId]);

  return (
    <section className="relative h-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/[0.05] to-transparent" aria-hidden />
      <header className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <TrendingUp className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('reports.enrollmentTrend', { dateRange: dateLabel })}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {formatLocaleNumber(totalEnrollments, locale)}
          </span>
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">{t('reports.duringPeriod')}</span>
        </div>
      </header>
      <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
        <ReportBranchChart
          key={JSON.stringify(chartRequest)}
          request={chartRequest}
          title={title}
          valueLabel={t('reports.enrollment')}
          emptyLabel={t('reports.noEnrollmentData')}
          groupLabel={lowerGroupLabel(lineLabel)}
        />
      </div>
    </section>
  );
}
