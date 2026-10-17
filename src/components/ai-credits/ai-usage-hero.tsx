import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Activity, Gift, Hourglass, Infinity as InfinityIcon, Info, Layers, PiggyBank, Timer } from 'lucide-react';
import type { AiUsageSummary } from '@/api/ai-credits';
import { AppTooltip } from '@/components/ui/tooltip';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { AiCreditRing } from './ai-credit-ring';
import { formatCount, formatPercent, formatPoints } from './ai-credits-format.logic';
import { aiStateTone } from './ai-credits-usage.logic';
import { AI_EASE, AiAnimatedNumber, AiStateChip, AiStatTile } from './ai-credits-ui';

/** The month at a glance: ring with the share used, points used of the total and what is left. */
export function AiUsageHero({ summary }: { summary: AiUsageSummary }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const tone = aiStateTone(summary.state);
  const { points } = summary;
  const totalCalls = summary.features.reduce((sum, item) => sum + (item.calls || 0), 0);
  const unlimited = summary.state === 'unlimited';
  const unvalued = summary.state === 'unvalued';
  // Without point values (no FX rate yet, or a free plan) the month is shown in uses.
  const byUses = unvalued || points.used === null;
  const fmtPoints = (value: number | null) => formatPoints(value, locale);
  const fmtPercent = (value: number | null) => formatPercent(value, locale);
  const fmtCount = (value: number | null) => formatCount(value, locale);
  const ringLabel = unlimited ? t('aiCredits.usage.hero.unlimitedTitle')
    : unvalued ? t('aiCredits.usage.hero.unvaluedTitle')
      : `${fmtPercent(summary.percent)} ${t('aiCredits.usage.hero.percentCaption')}`;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: AI_EASE }}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm"
    >
      <div aria-hidden className={cn('pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-gradient-to-br to-transparent blur-3xl', tone.glow)} />
      <div aria-hidden className={cn('pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-gradient-to-tr to-transparent opacity-60 blur-3xl', tone.glow)} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)', backgroundSize: '22px 22px' }} />

      <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10">
        <div className="flex justify-center md:justify-start">
          <AiCreditRing state={summary.state} percent={summary.percent} label={ringLabel}>
            {unlimited ? (
              <>
                <InfinityIcon className={cn('h-10 w-10', tone.text)} aria-hidden />
                <span className="mt-1 text-sm font-semibold text-foreground">{t('aiCredits.usage.hero.unlimitedTitle')}</span>
              </>
            ) : unvalued ? (
              <>
                <Hourglass className={cn('h-8 w-8', tone.text)} aria-hidden />
                <span className="mt-2 text-xs font-semibold leading-4 text-foreground">{t('aiCredits.usage.hero.unvaluedTitle')}</span>
              </>
            ) : (
              <>
                <AiAnimatedNumber value={summary.percent} format={fmtPercent} className="text-4xl font-bold tracking-tight text-foreground sm:text-[2.6rem]" />
                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('aiCredits.usage.hero.percentCaption')}</span>
              </>
            )}
          </AiCreditRing>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <AiStateChip state={summary.state} />
            <p className="pt-1 text-sm font-medium text-muted-foreground">
              {byUses ? t('aiCredits.usage.hero.usesThisMonth') : t('aiCredits.usage.hero.usedLabel')}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {byUses
                ? <AiAnimatedNumber value={totalCalls} format={fmtCount} className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl" />
                : <AiAnimatedNumber value={points.used} format={fmtPoints} className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl" />}
              {!unlimited && !unvalued && points.total !== null && (
                <span className="text-base font-medium text-muted-foreground">{t('aiCredits.usage.hero.ofTotal', { total: fmtPoints(points.total) })}</span>
              )}
            </div>
            {(unlimited || unvalued) && (
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                {unlimited ? t('aiCredits.usage.hero.unlimitedBody') : t('aiCredits.usage.hero.unvaluedBody')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {!unlimited && !unvalued && (
              <AiStatTile icon={PiggyBank} label={t('aiCredits.usage.hero.remaining')}
                value={<AiAnimatedNumber value={points.remaining} format={fmtPoints} />} />
            )}
            {!unlimited && points.plan !== null && (
              <AiStatTile icon={Layers} label={t('aiCredits.usage.hero.planPoints')} value={fmtPoints(points.plan)} />
            )}
            {points.topup > 0 && (
              <AiStatTile icon={Gift} label={t('aiCredits.usage.hero.topup')} value={`+${fmtPoints(points.topup)}`} />
            )}
            {!byUses && (
              <AiStatTile icon={Activity} label={t('aiCredits.usage.hero.usesThisMonth')} value={fmtCount(totalCalls)} />
            )}
          </div>

          {points.reserved !== null && points.reserved > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              <span>{t('aiCredits.usage.hero.reserved')}:</span>
              <span className="font-semibold tabular-nums text-foreground">{t('aiCredits.common.pointsValue', { value: fmtPoints(points.reserved) })}</span>
              <AppTooltip content={t('aiCredits.usage.hero.reservedHint')} className="max-w-xs">
                <button type="button" className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground" aria-label={t('aiCredits.usage.hero.reservedHint')}>
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </button>
              </AppTooltip>
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}
