import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Crown, RefreshCw, Sparkles } from 'lucide-react';
import type { AiUsageSummary } from '@/api/ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { formatShortDate, platformDate } from './ai-credits-format.logic';
import { isUsageEmpty } from './ai-credits-usage.logic';
import { AI_EASE, AiReveal } from './ai-credits-ui';
import { AiMonthSelect } from './ai-month-select';
import { AiUsageBanner } from './ai-usage-banner';
import { AiUsageDailyChart } from './ai-usage-daily-chart';
import { AiUsageFeatures } from './ai-usage-features';
import { AiUsageHero } from './ai-usage-hero';
import { AiUsageEmpty } from './ai-usage-states';
import { AiUsageTopUsers } from './ai-usage-top-users';

/** Page title row: title, plan, month picker and the renewal date. */
export function AiUsageHeader({ summary, month, onMonthChange, fetching = false }: {
  summary: AiUsageSummary | undefined;
  month: string | null;
  onMonthChange: (month: string) => void;
  fetching?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const selected = month ?? summary?.month ?? null;
  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: AI_EASE }}
      className="flex flex-col gap-4 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--gradient-from)] to-[var(--gradient-to)] text-white shadow-lg shadow-primary/20">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{t('aiCredits.usage.title')}</h2>
            {summary && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <Crown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="sr-only">{t('aiCredits.usage.planLabel')}:</span>
                <span className="truncate">{summary.plan.name || t('aiCredits.usage.noPlan')}</span>
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t('aiCredits.usage.description')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {summary && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/70 px-3 text-xs font-medium text-muted-foreground">
            <RefreshCw className={cn('h-3.5 w-3.5', fetching && 'animate-spin')} aria-hidden />
            {t('aiCredits.usage.renewsOn', { date: formatShortDate(summary.resets_on, locale) })}
          </span>
        )}
        <AiMonthSelect months={summary?.available_months ?? []} value={selected} onChange={onMonthChange} disabled={!summary} />
      </div>
    </motion.header>
  );
}

/**
 * Body of the usage page for one month. Shared by the tenant page and the
 * superadmin tenant drawer (compact: no daily chart, no top-user lines).
 * Shows points and percent only — never money, tokens or provider names.
 */
export function AiUsageView({ summary, compact = false, now }: { summary: AiUsageSummary; compact?: boolean; now?: Date }) {
  const empty = isUsageEmpty(summary);
  // In the current month (the newest one) the top-user lines stop at today.
  const until = summary.available_months[0] === summary.month ? platformDate(now ?? new Date()) : null;
  // Before points can be counted the day charts have nothing to draw: they are left out (no counts are shown instead).
  const hasPointValues = summary.daily.some(item => typeof item.points === 'number');
  return (
    <div className="space-y-5">
      <AiUsageBanner summary={summary} />
      <AiUsageHero summary={summary} />
      {empty ? <AiUsageEmpty /> : (
        <>
          <AiReveal index={1} className="min-w-0"><AiUsageFeatures features={summary.features} /></AiReveal>
          {!compact && hasPointValues && <AiReveal index={2} className="min-w-0"><AiUsageDailyChart daily={summary.daily} month={summary.month} /></AiReveal>}
          <AiReveal index={3}>
            <AiUsageTopUsers users={summary.users} userDaily={summary.user_daily} month={summary.month} until={until} showChart={!compact && hasPointValues} />
          </AiReveal>
        </>
      )}
    </div>
  );
}
