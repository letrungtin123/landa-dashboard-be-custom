import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertTriangle, Building2, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AI_EASE } from './ai-credits-ui';

/** Placeholder shaped like the page (hero, two charts, list) while the month loads. */
export function AiUsageSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-7">
        <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10">
          <Skeleton className="mx-auto aspect-square w-[168px] rounded-full sm:w-[196px] md:mx-0" />
          <div className="space-y-4">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-11 w-64 max-w-full" />
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[68px] rounded-2xl" />)}
            </div>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-[320px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </div>
      )}
      <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-4">
        {Array.from({ length: compact ? 3 : 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The month has no AI use yet: a calm illustration instead of empty charts. */
export function AiUsageEmpty() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: AI_EASE, delay: 0.1 }}
      className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-card/60 px-6 py-14 text-center"
    >
      <div className="relative mb-5 flex h-24 w-24 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-primary/15" />
        <span className="absolute inset-3 rounded-full border border-primary/25" />
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-lg shadow-primary/10">
          <Wand2 className="h-6 w-6" />
        </span>
        <Sparkles className="absolute right-1 top-2 h-4 w-4 text-primary/60" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{t('aiCredits.usage.empty.title')}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{t('aiCredits.usage.empty.body')}</p>
    </motion.div>
  );
}

export function AiUsageError({ onRetry, retrying = false }: { onRetry: () => void; retrying?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/25 bg-destructive/[0.04] px-6 py-14 text-center" role="alert">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden>
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{t('aiCredits.usage.error.title')}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{t('aiCredits.usage.error.body')}</p>
      <Button type="button" variant="outline" className="mt-5 rounded-full px-4" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? 'animate-spin' : undefined} aria-hidden />
        {t('aiCredits.common.retry')}
      </Button>
    </div>
  );
}

export function AiUsageNoTenant() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-card/60 px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
        <Building2 className="h-6 w-6" />
      </span>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t('aiCredits.usage.noTenant')}</p>
    </div>
  );
}
