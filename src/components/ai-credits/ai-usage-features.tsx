import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AiUsageFeature } from '@/api/ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { AiChartTooltipCard, type AiRechartsPayload } from './ai-chart-tooltip';
import { AiFeatureIconTile } from './ai-feature-icon';
import { formatCount, formatPercent, formatPoints } from './ai-credits-format.logic';
import { aiFeatureColor, aiFeatureLabelKey, groupFeatureTotals, type AiFeatureTotal } from './ai-credits-usage.logic';
import { AI_EASE, AiSectionCard } from './ai-credits-ui';

/** Donut of the month split by feature, plus one card per feature (points, uses, share). */
export function AiUsageFeatures({ features }: { features: readonly AiUsageFeature[] }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const totals = useMemo(() => groupFeatureTotals(features), [features]);
  const byPoints = totals.basis === 'points';
  const slices = totals.items.map(item => ({ ...item, value: byPoints ? item.points ?? 0 : item.calls, label: t(aiFeatureLabelKey(item.group)) }))
    .filter(item => item.value > 0);
  const centerValue = byPoints ? formatPoints(totals.totalPoints, locale) : formatCount(totals.totalCalls, locale);

  const renderTooltip = ({ active, payload }: { active?: boolean; payload?: AiRechartsPayload[] }) => {
    const item = active ? payload?.[0]?.payload as (AiFeatureTotal & { label: string }) | undefined : undefined;
    if (!item) return null;
    return (
      <AiChartTooltipCard
        title={item.label}
        rows={[
          ...(item.points !== null ? [{ key: 'points', label: t('aiCredits.usage.features.points'), color: aiFeatureColor(item.group), value: formatPoints(item.points, locale) }] : []),
          { key: 'uses', label: t('aiCredits.common.uses'), color: 'var(--muted-foreground)', value: formatCount(item.calls, locale) },
          { key: 'share', label: t('aiCredits.common.share'), color: 'transparent', value: formatPercent(item.share, locale) },
        ]}
      />
    );
  };

  return (
    <AiSectionCard
      icon={PieChartIcon}
      title={t('aiCredits.usage.features.title')}
      description={byPoints ? t('aiCredits.usage.features.description') : t('aiCredits.usage.features.descriptionByUses')}
      className="h-full"
      // Laid out by the card's own width (the page, or the narrower superadmin drawer).
      bodyClassName="@container"
    >
      <div className="grid gap-5 @2xl:grid-cols-[208px_minmax(0,1fr)] @2xl:items-center">
        <div className="relative mx-auto h-[200px] w-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius={66}
                outerRadius={94}
                paddingAngle={slices.length > 1 ? 2 : 0}
                cornerRadius={5}
                stroke="var(--card)"
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                animationDuration={900}
              >
                {slices.map(item => <Cell key={item.group} fill={aiFeatureColor(item.group)} />)}
              </Pie>
              <Tooltip content={renderTooltip} wrapperStyle={{ outline: 'none', zIndex: 20 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-medium text-muted-foreground">{t('aiCredits.usage.features.total')}</span>
            <span className="text-xl font-bold tabular-nums tracking-tight text-foreground">{centerValue}</span>
            <span className="text-[11px] text-muted-foreground">{byPoints ? t('aiCredits.usage.features.points') : t('aiCredits.common.uses')}</span>
          </div>
        </div>

        <ul className="grid gap-2.5 @md:grid-cols-2 @5xl:grid-cols-3">
          {totals.items.map((item, index) => {
            const color = aiFeatureColor(item.group);
            return (
              <motion.li
                key={item.group}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: AI_EASE, delay: 0.05 * index }}
                className="group min-w-0 rounded-2xl border border-border/60 bg-background/60 p-3.5 transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md dark:bg-white/[0.02]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <AiFeatureIconTile group={item.group} color={color} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{t(aiFeatureLabelKey(item.group))}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{formatPercent(item.share, locale)}</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="truncate text-lg font-semibold tabular-nums tracking-tight text-foreground">
                    {item.points !== null
                      ? t('aiCredits.common.pointsValue', { value: formatPoints(item.points, locale) })
                      : `${t('aiCredits.common.uses')}: ${formatCount(item.calls, locale)}`}
                  </span>
                  {item.points !== null && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {t('aiCredits.common.uses')}: <span className="font-medium tabular-nums text-foreground/80">{formatCount(item.calls, locale)}</span>
                    </span>
                  )}
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(item.share, item.share > 0 ? 2 : 0)}%` }}
                    transition={{ duration: 0.9, ease: AI_EASE, delay: 0.1 + 0.05 * index }}
                  />
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </AiSectionCard>
  );
}
