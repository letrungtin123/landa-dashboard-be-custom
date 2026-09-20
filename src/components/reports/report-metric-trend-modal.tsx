import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReportWindowChart } from '@/components/reports/ReportWindowChart';
import { formatLocaleNumber } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import type { AppLocale } from '@/i18n';

function clampPercent(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(Math.max(numericValue, 0), 100);
}

function formatPercent(value: number | null | undefined, locale: AppLocale) {
  const roundedValue = Math.round(clampPercent(value) * 10) / 10;
  return `${formatLocaleNumber(roundedValue, locale, { maximumFractionDigits: 1 })}%`;
}

function getMetricChartColors(metricKey: string | null): string[] {
  if (metricKey === 'active_learners') return ['#10b981'];
  if (metricKey === 'completion_rate') return ['#8b5cf6'];
  if (metricKey === 'total_enrollments') return ['#3b82f6'];
  return ['#3b82f6'];
}

function formatChartMetricValue(metricKey: string | null, value: number, locale: AppLocale): string {
  if (metricKey === 'completion_rate') return formatPercent(value, locale);
  return formatLocaleNumber(value, locale);
}

type ReportMetricTrendModalProps = {
  metricKey: string | null;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  groupId: string | 'all';
  subgroupId: string | 'all';
  teamId: string | 'all';
  dateFrom: string;
  dateTo: string;
  dateLabel: string;
  layerAboveChat?: boolean;
};

export function ReportMetricTrendModal({
  metricKey,
  title,
  isOpen,
  onClose,
  groupId,
  subgroupId,
  teamId,
  dateFrom,
  dateTo,
  dateLabel,
  layerAboveChat = false,
}: ReportMetricTrendModalProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const chartRequest = useMemo(() => {
    if (!metricKey) return null;
    return {
      date_from: dateFrom,
      date_to: dateTo,
      metric: metricKey,
      group_id: groupId === 'all' ? undefined : groupId,
      grouped: false,
      subgroup_id: subgroupId === 'all' ? undefined : subgroupId,
      team_id: teamId === 'all' ? undefined : teamId,
      granularity: 'auto' as const,
    };
  }, [dateFrom, dateTo, groupId, metricKey, subgroupId, teamId]);

  const chartColors = useMemo(() => getMetricChartColors(metricKey), [metricKey]);
  const formatValue = useCallback((value: number) => formatChartMetricValue(metricKey, value, locale), [locale, metricKey]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        overlayClassName={layerAboveChat ? 'z-[10040]' : undefined}
        className={`${layerAboveChat ? 'z-[10050]' : ''} w-[95vw] max-w-[95vw] overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-[90vw] sm:rounded-2xl lg:max-w-[1200px]`}
      >
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-primary/5 via-transparent to-muted/10" />
        <div className="z-10 flex h-full w-full flex-col">
          <DialogHeader className="border-b border-border/40 bg-muted/20 p-5 pr-12 backdrop-blur-md sm:p-6 sm:pr-14">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="truncate text-xl font-bold sm:text-2xl">{title}</DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  {t('reports.dataInRange', { dateRange: dateLabel })}
                </DialogDescription>
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {t('reports.timeChart')}
              </div>
            </div>
          </DialogHeader>
          <div className="w-full p-4 sm:p-6">
            {chartRequest ? (
              <ReportWindowChart
                request={chartRequest}
                height={420}
                valueLabel={title}
                valueSuffix={metricKey === 'completion_rate' ? '%' : ''}
                formatValue={formatValue}
                colors={chartColors}
                emptyLabel={t('reports.noDataInRange')}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
