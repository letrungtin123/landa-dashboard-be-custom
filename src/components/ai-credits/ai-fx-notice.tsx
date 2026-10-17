import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { aiFxNoticeKind } from './ai-credits-admin.logic';
import { formatMonthShort } from './ai-credits-format.logic';
import { AI_EASE } from './ai-credits-ui';

/**
 * Superadmin only (never on the tenant page): the month has no exchange rate
 * at all, or uses the rate of an earlier month. Nothing when it has its own.
 */
export function AiFxNotice({ month, fxVndPerUsd, fxRateMonth, onSetFx, compact = false }: {
  month: string;
  fxVndPerUsd: number | null | undefined;
  fxRateMonth: string | null | undefined;
  onSetFx?: (month: string) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const kind = aiFxNoticeKind({ month, fxVndPerUsd, fxRateMonth });
  if (kind === 'own') return null;
  const missing = kind === 'missing';
  const Icon = missing ? AlertTriangle : Info;
  const body = missing
    ? t('aiCredits.admin.overview.noFxBody')
    : t('aiCredits.admin.overview.fxInherited', { month: formatMonthShort(month, locale), rateMonth: formatMonthShort(fxRateMonth ?? '', locale) });
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: AI_EASE }} role="status"
      className={cn('flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center',
        missing ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/[0.12] via-amber-500/[0.05] to-transparent'
          : 'border-sky-500/25 bg-gradient-to-r from-sky-500/[0.10] via-sky-500/[0.04] to-transparent',
        compact && 'p-3')}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        missing ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-sky-500/15 text-sky-600 dark:text-sky-300')} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', missing ? 'text-amber-900 dark:text-amber-100' : 'text-sky-900 dark:text-sky-100')}>
          {missing ? t('aiCredits.admin.overview.noFxTitle') : t('aiCredits.admin.overview.fxInheritedTitle')}
        </p>
        <p className={cn('text-sm leading-6', missing ? 'text-amber-900/80 dark:text-amber-100/80' : 'text-sky-900/80 dark:text-sky-100/80')}>{body}</p>
      </div>
      {onSetFx && (
        <Button type="button" variant={missing ? 'default' : 'outline'} className="h-9 shrink-0 rounded-xl" onClick={() => onSetFx(month)}>
          {missing ? t('aiCredits.admin.overview.setFx') : t('aiCredits.admin.overview.setFxForMonth')}<ArrowRight aria-hidden />
        </Button>
      )}
    </motion.div>
  );
}
