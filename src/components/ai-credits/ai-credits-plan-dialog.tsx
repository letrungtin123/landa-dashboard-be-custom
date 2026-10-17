import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Loader2, Save } from 'lucide-react';
import type { AiCreditPlan, AiFxRate } from '@/api/ai-credits';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useSaveAiCreditPlan } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import {
  aiPlanDraftFromPlan, aiPlanDraftNumbers, aiPlanPreview, DEFAULT_AI_PLAN_DRAFT, validateAiPlanDraft,
  type AiPlanDraft, type AiPlanField,
} from './ai-credits-admin.logic';
import { formatMonthLabel, formatPercent, formatUsd, formatVnd, intlLocale } from './ai-credits-format.logic';
import { AiFormField } from './ai-credits-ui';

/** Live value of one point, provider budget and margin, at the latest FX rate. */
function PlanPreview({ draft, fx }: { draft: AiPlanDraft; fx: AiFxRate | null }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const parsedFx = fx ? Number(fx.vnd_per_usd) : NaN;
  const fxRate = Number.isFinite(parsedFx) && parsedFx > 0 ? parsedFx : null;
  const numbers = aiPlanDraftNumbers(draft, locale);
  const preview = aiPlanPreview({ ...numbers, fxVndPerUsd: fxRate });
  const incomplete = preview.providerBudgetVnd === null || numbers.points === null;
  const free = numbers.priceVnd === 0;
  return (
    <aside className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
        <Calculator className="h-3.5 w-3.5" aria-hidden />{t('aiCredits.admin.planDialog.previewTitle')}
      </p>
      {free ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('aiCredits.admin.planDialog.previewFree')}</p>
      ) : incomplete ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('aiCredits.admin.planDialog.previewIncomplete')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-base font-semibold leading-snug text-foreground">
            {preview.pointValueUsd !== null
              ? t('aiCredits.admin.planDialog.previewPointValue', { usd: formatUsd(preview.pointValueUsd, locale), vnd: formatVnd(preview.pointValueVnd, locale) })
              : t('aiCredits.admin.planDialog.previewPointValueNoFx', { vnd: formatVnd(preview.pointValueVnd, locale) })}
          </p>
          <dl className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-background/70 px-3 py-2.5 ring-1 ring-border/60">
              <dt className="text-[11px] text-muted-foreground">{t('aiCredits.admin.planDialog.previewBudget')}</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{formatVnd(preview.providerBudgetVnd, locale)}</dd>
            </div>
            <div className="rounded-xl bg-background/70 px-3 py-2.5 ring-1 ring-border/60">
              <dt className="text-[11px] text-muted-foreground">{t('aiCredits.admin.planDialog.previewMargin')}</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatVnd(preview.marginVnd, locale)}
                {preview.marginPercent !== null && <span className="ml-1 text-xs font-medium text-muted-foreground">({formatPercent(preview.marginPercent, locale)})</span>}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-muted-foreground">
            {fx && fxRate !== null
              ? t('aiCredits.admin.planDialog.previewFx', { rate: new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(fxRate), month: formatMonthLabel(fx.month, locale) })
              : t('aiCredits.admin.planDialog.previewNoFx')}
          </p>
        </div>
      )}
    </aside>
  );
}

/** Create or edit a plan; validation mirrors the backend and shows plain messages. */
export function AiCreditPlanDialog({ open, plan, latestFx, onOpenChange }: {
  open: boolean;
  /** Null to create a new plan. */
  plan: AiCreditPlan | null;
  latestFx: AiFxRate | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const id = useId();
  const mutation = useSaveAiCreditPlan();
  const [draft, setDraft] = useState<AiPlanDraft>({ ...DEFAULT_AI_PLAN_DRAFT });
  const [errors, setErrors] = useState<Partial<Record<AiPlanField, string>>>({});
  const isNew = plan === null;

  useEffect(() => {
    if (!open) return;
    setDraft(plan ? aiPlanDraftFromPlan(plan, locale) : { ...DEFAULT_AI_PLAN_DRAFT });
    setErrors({});
  }, [open, plan, locale]);

  const set = <K extends keyof AiPlanDraft>(key: K, value: AiPlanDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const error = (field: AiPlanField) => (errors[field] ? t(errors[field]!) : null);
  const fieldId = (field: string) => `${id}-${field}`;
  const textInput = (field: 'price' | 'points' | 'costRatio' | 'buffer' | 'sortOrder', inputMode: 'numeric' | 'decimal') => (
    <Input id={fieldId(field)} inputMode={inputMode} value={draft[field]} aria-invalid={Boolean(errors[field])}
      onChange={event => set(field, event.target.value)} className="h-9 rounded-xl tabular-nums" />
  );

  const submit = () => {
    const result = validateAiPlanDraft(draft, locale, isNew);
    setErrors(result.errors);
    if (!result.input) return;
    mutation.mutate({ planId: plan?.id ?? null, plan: result.input }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-2rem)] max-w-3xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base font-semibold">{isNew ? t('aiCredits.admin.planDialog.createTitle') : t('aiCredits.admin.planDialog.editTitle')}</DialogTitle>
          <DialogDescription className="text-xs leading-5">{t('aiCredits.admin.planDialog.description')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_260px]" onSubmit={event => { event.preventDefault(); submit(); }} noValidate>
          <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
            <AiFormField id={fieldId('name')} label={t('aiCredits.admin.planDialog.name')} error={error('name')} className="sm:col-span-2">
              <Input id={fieldId('name')} value={draft.name} maxLength={120} aria-invalid={Boolean(errors.name)}
                onChange={event => set('name', event.target.value)} className="h-9 rounded-xl" />
            </AiFormField>
            <AiFormField id={fieldId('code')} label={t('aiCredits.admin.planDialog.code')} hint={t('aiCredits.admin.planDialog.codeHint')} error={error('code')} className="sm:col-span-2">
              <Input id={fieldId('code')} value={draft.code} maxLength={40} disabled={!isNew} aria-invalid={Boolean(errors.code)}
                onChange={event => set('code', event.target.value.toLowerCase())} className="h-9 rounded-xl font-mono" />
            </AiFormField>
            <AiFormField id={fieldId('price')} label={t('aiCredits.admin.planDialog.price')} error={error('price')}>
              {textInput('price', 'numeric')}
            </AiFormField>
            <AiFormField id={fieldId('points')} label={t('aiCredits.admin.planDialog.points')} error={error('points')}>
              {textInput('points', 'numeric')}
            </AiFormField>
            <AiFormField id={fieldId('costRatio')} label={t('aiCredits.admin.planDialog.costRatio')} hint={t('aiCredits.admin.planDialog.costRatioHint')} error={error('costRatio')}>
              {textInput('costRatio', 'decimal')}
            </AiFormField>
            <AiFormField id={fieldId('buffer')} label={t('aiCredits.admin.planDialog.buffer')} hint={t('aiCredits.admin.planDialog.bufferHint')} error={error('buffer')}>
              {textInput('buffer', 'decimal')}
            </AiFormField>
            <AiFormField id={fieldId('description')} label={t('aiCredits.admin.planDialog.descriptionLabel')} optionalLabel={t('aiCredits.common.optional')} error={error('description')} className="sm:col-span-2">
              <Textarea id={fieldId('description')} rows={2} maxLength={1000} value={draft.description}
                onChange={event => set('description', event.target.value)} className="min-h-0 rounded-xl" />
            </AiFormField>
            <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5 sm:col-span-2">
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{t('aiCredits.admin.planDialog.unlimited')}</span>
                <span className="block text-[11px] text-muted-foreground">{t('aiCredits.admin.planDialog.unlimitedHint')}</span>
              </span>
              <Switch checked={draft.isUnlimited} onCheckedChange={value => set('isUnlimited', value)} aria-label={t('aiCredits.admin.planDialog.unlimited')} />
            </label>
            <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{t('aiCredits.admin.planDialog.active')}</span>
                <span className="block text-[11px] text-muted-foreground">{t('aiCredits.admin.planDialog.activeHint')}</span>
              </span>
              <Switch checked={draft.isActive} onCheckedChange={value => set('isActive', value)} aria-label={t('aiCredits.admin.planDialog.active')} />
            </label>
            <AiFormField id={fieldId('sortOrder')} label={t('aiCredits.admin.planDialog.sortOrder')} error={error('sortOrder')}>
              {textInput('sortOrder', 'numeric')}
            </AiFormField>
          </div>
          <div className="min-w-0 md:sticky md:top-0 md:self-start"><PlanPreview draft={draft} fx={latestFx} /></div>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
        <DialogFooter className="border-t border-border/60 px-5 py-3.5">
          <Button type="button" variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>{t('aiCredits.common.cancel')}</Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {isNew ? t('aiCredits.admin.planDialog.create') : t('aiCredits.admin.planDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
