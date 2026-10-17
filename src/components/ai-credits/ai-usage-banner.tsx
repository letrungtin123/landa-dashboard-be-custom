import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertTriangle, OctagonAlert } from 'lucide-react';
import type { AiUsageSummary } from '@/api/ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { formatPercent, formatShortDate } from './ai-credits-format.logic';
import { AI_EASE } from './ai-credits-ui';

/** Plain notice from 80% of the month's points, and when they are used up. */
export function AiUsageBanner({ summary }: { summary: Pick<AiUsageSummary, 'state' | 'percent' | 'resets_on'> }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  if (summary.state !== 'warning' && summary.state !== 'exhausted') return null;
  const date = formatShortDate(summary.resets_on, locale);
  const exhausted = summary.state === 'exhausted';
  const Icon = exhausted ? OctagonAlert : AlertTriangle;
  return (
    <motion.div
      role={exhausted ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: AI_EASE }}
      className={exhausted
        ? 'relative flex items-start gap-3 overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-r from-rose-500/[0.12] via-rose-500/[0.06] to-transparent p-4 text-rose-900 dark:text-rose-100'
        : 'relative flex items-start gap-3 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/[0.12] via-amber-500/[0.06] to-transparent p-4 text-amber-900 dark:text-amber-100'}
    >
      <span className={exhausted
        ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-300'
        : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300'}>
        <Icon className="h-4.5 w-4.5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">
          {exhausted ? t('aiCredits.usage.banners.exhaustedTitle') : t('aiCredits.usage.banners.warningTitle', { percent: formatPercent(summary.percent, locale) })}
        </p>
        <p className="text-sm leading-6 opacity-85">
          {exhausted
            ? `${t('aiCredits.errors.limitReached')} ${t('aiCredits.usage.banners.exhaustedRenews', { date })}`
            : t('aiCredits.usage.banners.warningBody', { date })}
        </p>
      </div>
    </motion.div>
  );
}
