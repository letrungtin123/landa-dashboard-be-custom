import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertTriangle, Building2, Infinity as InfinityIcon, Layers, Pencil, Plus, RefreshCw } from 'lucide-react';
import type { AiCreditPlan } from '@/api/ai-credits';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiCreditPlans, useAiFxRates } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { aiPlanPreview } from './ai-credits-admin.logic';
import { formatCount, formatPercent, formatPoints, formatUsd, formatVnd } from './ai-credits-format.logic';
import { AI_EASE } from './ai-credits-ui';
import { AiCreditPlanDialog } from './ai-credits-plan-dialog';

function PlanCard({ plan, fxVndPerUsd, index, onEdit }: { plan: AiCreditPlan; fxVndPerUsd: number | null; index: number; onEdit: () => void }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const price = Number(plan.monthly_price_vnd);
  const points = Number(plan.monthly_points);
  const ratio = Number(plan.provider_cost_ratio);
  const buffer = Number(plan.safety_buffer_ratio);
  const preview = aiPlanPreview({ priceVnd: price, points, costRatio: ratio, bufferRatio: buffer, fxVndPerUsd });
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: AI_EASE, delay: Math.min(index, 8) * 0.05 }}
      className={cn('group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
        !plan.is_active && 'opacity-75')}
    >
      <div aria-hidden className={cn('h-1 w-full', plan.is_active ? 'bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)]' : 'bg-muted')} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{plan.name}</h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{t('aiCredits.admin.plans.code', { code: plan.code })}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {plan.is_unlimited && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                <InfinityIcon className="h-3 w-3" aria-hidden />{t('aiCredits.admin.plans.unlimited')}
              </span>
            )}
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', plan.is_active
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-border bg-muted text-muted-foreground')}>
              {plan.is_active ? t('aiCredits.admin.plans.active') : t('aiCredits.admin.plans.inactive')}
            </span>
          </div>
        </div>
        {plan.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{plan.description}</p>}
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-tight text-foreground">{price > 0 ? formatVnd(price, locale) : t('aiCredits.admin.plans.free')}</span>
          {price > 0 && <span className="text-xs text-muted-foreground">{t('aiCredits.admin.plans.perMonth')}</span>}
        </div>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{t('aiCredits.admin.plans.pointsPerMonth', { points: formatPoints(points, locale) })}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/45 px-3 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{t('aiCredits.admin.plans.costRatio')}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{formatPercent(ratio * 100, locale)}</dd>
          </div>
          <div className="rounded-xl bg-muted/45 px-3 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{t('aiCredits.admin.plans.buffer')}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{formatPercent(buffer * 100, locale)}</dd>
          </div>
          <div className="rounded-xl bg-muted/45 px-3 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{t('aiCredits.admin.plans.tenants')}</dt>
            <dd className="flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground"><Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{formatCount(plan.tenant_count, locale)}</dd>
          </div>
          <div className="rounded-xl bg-muted/45 px-3 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{t('aiCredits.admin.plans.pointValueLabel')}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{preview.pointValueUsd !== null ? formatUsd(preview.pointValueUsd, locale) : '—'}</dd>
          </div>
        </dl>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={onEdit}>
            <Pencil aria-hidden />{t('aiCredits.admin.plans.edit')}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

/** Plan cards and the create/edit dialog (with the live point-value preview). */
export function AiCreditsPlansTab() {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const plans = useAiCreditPlans();
  const fx = useAiFxRates();
  const latestFx = fx.data?.[0] ?? null;
  const fxRate = latestFx ? Number(latestFx.vnd_per_usd) : null;
  const [editing, setEditing] = useState<AiCreditPlan | null>(null);
  const [open, setOpen] = useState(false);
  const openDialog = (plan: AiCreditPlan | null) => { setEditing(plan); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Layers className="h-4 w-4" aria-hidden />
          {plans.data ? t('aiCredits.admin.plans.count', { count: formatCount(plans.data.length, locale) }) : '\u00a0'}
        </p>
        <Button type="button" className="rounded-xl" onClick={() => openDialog(null)}><Plus aria-hidden />{t('aiCredits.admin.plans.create')}</Button>
      </div>
      {plans.data ? (
        plans.data.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/80 px-4 py-12 text-center text-sm text-muted-foreground">{t('aiCredits.admin.plans.empty')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {plans.data.map((plan, index) => (
              <PlanCard key={plan.id} plan={plan} index={index} fxVndPerUsd={fxRate !== null && Number.isFinite(fxRate) ? fxRate : null} onEdit={() => openDialog(plan)} />
            ))}
          </div>
        )
      ) : plans.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-6 py-12 text-center" role="alert">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('aiCredits.admin.plans.loadFailed')}</p>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { void plans.refetch(); }}><RefreshCw aria-hidden />{t('aiCredits.common.retry')}</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[300px] rounded-2xl" />)}
        </div>
      )}
      <AiCreditPlanDialog open={open} plan={editing} latestFx={latestFx} onOpenChange={setOpen} />
    </div>
  );
}
