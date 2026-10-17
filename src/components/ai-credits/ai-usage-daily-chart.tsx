import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AiUsageDaily } from '@/api/ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { AiChartLegend, AiChartTooltipCard, type AiRechartsPayload } from './ai-chart-tooltip';
import { formatAxisTick, formatDayTick, formatFullDate, formatPoints } from './ai-credits-format.logic';
import { aiFeatureColor, aiFeatureLabelKey, dailyFeatureChart, type AiDailyRow, type AiFeatureGroup } from './ai-credits-usage.logic';
import { AiSectionCard } from './ai-credits-ui';

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };

/** Points per day of the month, stacked by feature (thin bars, 2px surface gap, rounded top). */
export function AiUsageDailyChart({ daily, month }: { daily: readonly AiUsageDaily[]; month: string }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const gradientPrefix = `ai-daily-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const chart = useMemo(() => dailyFeatureChart(daily, month), [daily, month]);
  const label = (group: AiFeatureGroup) => t(aiFeatureLabelKey(group));

  const renderTooltip = ({ active, payload }: { active?: boolean; payload?: AiRechartsPayload[] }) => {
    const row = active ? payload?.[0]?.payload as AiDailyRow | undefined : undefined;
    if (!row) return null;
    const rows = chart.groups
      .filter(group => (row[group] ?? 0) > 0)
      .sort((a, b) => (row[b] ?? 0) - (row[a] ?? 0))
      .map(group => ({ key: group, label: label(group), color: aiFeatureColor(group), value: formatPoints(row[group] ?? 0, locale) }));
    return (
      <AiChartTooltipCard
        title={formatFullDate(row.date, locale)}
        rows={rows}
        total={{ label: t('aiCredits.usage.daily.total'), value: t('aiCredits.common.pointsValue', { value: formatPoints(row.total, locale) }) }}
      />
    );
  };

  return (
    <AiSectionCard icon={CalendarRange} title={t('aiCredits.usage.daily.title')} description={t('aiCredits.usage.daily.description')}>
      {chart.hasPoints ? (
        <div className="space-y-4">
          <div className="h-[260px] w-full sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap="22%">
                <defs>
                  {chart.groups.map(group => (
                    <linearGradient key={group} id={`${gradientPrefix}-${group}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={aiFeatureColor(group)} stopOpacity={1} />
                      <stop offset="100%" stopColor={aiFeatureColor(group)} stopOpacity={0.72} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
                <XAxis
                  dataKey="date"
                  tickFormatter={value => formatDayTick(String(value), locale)}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval="preserveStartEnd"
                  minTickGap={14}
                />
                <YAxis
                  tickFormatter={value => formatAxisTick(Number(value), locale)}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  allowDecimals={false}
                />
                <Tooltip content={renderTooltip} cursor={{ fill: 'var(--muted)', opacity: 0.55 }} wrapperStyle={{ outline: 'none', zIndex: 20 }} />
                {chart.groups.map((group, index) => (
                  <Bar
                    key={group}
                    dataKey={group}
                    stackId="points"
                    fill={`url(#${gradientPrefix}-${group})`}
                    stroke="var(--card)"
                    strokeWidth={1}
                    maxBarSize={22}
                    radius={index === chart.groups.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    animationDuration={800}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <AiChartLegend items={chart.groups.map(group => ({ key: group, label: label(group), color: aiFeatureColor(group) }))} />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
          {t('aiCredits.usage.daily.noPoints')}
        </p>
      )}
    </AiSectionCard>
  );
}
