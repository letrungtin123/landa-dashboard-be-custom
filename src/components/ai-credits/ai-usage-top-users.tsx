import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AiUsageUser, AiUsageUserDaily } from '@/api/ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { AiChartLegend, AiChartTooltipCard, type AiRechartsPayload } from './ai-chart-tooltip';
import { formatAxisTick, formatDayTick, formatFullDate, formatPoints } from './ai-credits-format.logic';
import { aiUserDisplayName, userDailyChart, type AiUserChartRow, type AiUserSeries } from './ai-credits-usage.logic';
import { AiSectionCard } from './ai-credits-ui';
import { AiUsageUserList, AiUserName } from './ai-usage-user-list';

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };
type LineMode = 'cumulative' | 'daily';

/** Running total (default, easy to compare) or points of each day. */
function ModeToggle({ value, onChange }: { value: LineMode; onChange: (value: LineMode) => void }) {
  const { t } = useTranslation();
  const options: Array<[LineMode, string]> = [['cumulative', t('aiCredits.usage.users.modeCumulative')], ['daily', t('aiCredits.usage.users.modeDaily')]];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-0.5 dark:bg-white/[0.04]" role="group" aria-label={t('aiCredits.usage.users.title')}>
      {options.map(([mode, label]) => (
        <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}
          className={cn('h-7 rounded-lg px-2.5 text-xs font-medium transition-colors',
            value === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** One line per top person over the month, then the full list of people. */
export function AiUsageTopUsers({ users, userDaily, month, until = null, showChart = true }: {
  users: readonly AiUsageUser[];
  userDaily: readonly AiUsageUserDaily[];
  month: string;
  /** Last day with data in the current month (lines stop there); null for a past month. */
  until?: string | null;
  showChart?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const [mode, setMode] = useState<LineMode>('cumulative');
  const chart = useMemo(() => userDailyChart(userDaily, users, month, { cumulative: mode === 'cumulative', until }), [userDaily, users, month, mode, until]);
  const labels = useMemo(() => ({
    system: t('aiCredits.usage.users.system'), deletedUser: t('aiCredits.usage.users.deletedUser'), deleted: t('aiCredits.usage.users.deleted'),
  }), [t]);
  const seriesName = (series: AiUserSeries) => series.user
    ? `${aiUserDisplayName(series.user, labels)}${series.user.deleted && !series.user.system && (series.user.name?.trim() || series.user.email?.trim()) ? ` ${labels.deleted}` : ''}`
    : labels.deletedUser;
  const drawable = showChart && chart.hasPoints && chart.series.length > 0;

  const renderTooltip = ({ active, payload }: { active?: boolean; payload?: AiRechartsPayload[] }) => {
    const row = active ? payload?.[0]?.payload as AiUserChartRow | undefined : undefined;
    if (!row) return null;
    const rows = chart.series
      .map(series => ({ series, value: Number(row[series.key] ?? 0) }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .map(item => ({ key: item.series.key, label: seriesName(item.series), color: item.series.color, value: formatPoints(item.value, locale) }));
    return <AiChartTooltipCard title={formatFullDate(String(row.date), locale)} rows={rows} />;
  };

  return (
    <AiSectionCard icon={Trophy} title={t('aiCredits.usage.users.title')} description={t('aiCredits.usage.users.description')}
      actions={drawable ? <ModeToggle value={mode} onChange={setMode} /> : undefined}>
      <div className="space-y-6">
        {showChart && (drawable ? (
          <div className="space-y-4">
            <div className="h-[240px] w-full sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart.rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
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
                  <YAxis tickFormatter={value => formatAxisTick(Number(value), locale)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
                  <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.35, strokeWidth: 1 }} wrapperStyle={{ outline: 'none', zIndex: 20 }} />
                  {chart.series.map(series => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={seriesName(series)}
                      stroke={series.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 4.5, stroke: 'var(--card)', strokeWidth: 2, fill: series.color }}
                      connectNulls={false}
                      animationDuration={900}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <AiChartLegend items={chart.series.map(series => ({
              key: series.key,
              color: series.color,
              label: series.user ? <AiUserName user={series.user} labels={labels} /> : labels.deletedUser,
            }))} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
            {t('aiCredits.usage.users.noChart')}
          </p>
        ))}
        <AiUsageUserList users={users} />
      </div>
    </AiSectionCard>
  );
}
