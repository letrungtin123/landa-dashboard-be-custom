import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Coins, Crown, Loader2, ReceiptText, type LucideIcon } from 'lucide-react';
import type { AiCreditOverviewTenant, AiCreditPlan } from '@/api/ai-credits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAddAiTopup, useReconcileAiMonth, useSetTenantAiPlan } from '@/hooks/queries/use-ai-credits';
import { confirmDialog } from '@/utils/confirm-store';
import { useLocaleStore } from '@/utils/locale-store';
import { validateAiReconcileDraft, validateAiTopupDraft } from './ai-credits-admin.logic';
import { decimalInputValue, formatMonthLabel, formatPoints, formatVnd } from './ai-credits-format.logic';
import { AiFormField } from './ai-credits-ui';

function FormCard({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Current plan and a plan picker; the change is confirmed before it is sent. */
export function AiTenantPlanForm({ tenant, plans }: { tenant: AiCreditOverviewTenant; plans: readonly AiCreditPlan[] }) {
  const { t } = useTranslation();
  const mutation = useSetTenantAiPlan();
  const currentPlanId = tenant.current_plan_id ?? tenant.plan_id;
  const [planId, setPlanId] = useState<string>(currentPlanId ?? '');
  useEffect(() => { setPlanId(currentPlanId ?? ''); }, [currentPlanId, tenant.tenant_id]);
  const choices = plans.filter(plan => plan.is_active || plan.id === currentPlanId);
  const current = plans.find(plan => plan.id === currentPlanId);
  const chosen = plans.find(plan => plan.id === planId);
  const canChange = Boolean(chosen && chosen.is_active && chosen.id !== currentPlanId) && !mutation.isPending;

  const submit = () => {
    if (!chosen || !canChange) return;
    confirmDialog({
      title: t('aiCredits.admin.drawer.confirmPlanTitle'),
      description: t('aiCredits.admin.drawer.confirmPlanBody', { tenant: tenant.tenant_name, plan: chosen.name }),
      confirmText: t('aiCredits.admin.drawer.changePlan'),
      onConfirm: () => mutation.mutate({ tenantId: tenant.tenant_id, tenantName: tenant.tenant_name, planId: chosen.id, planName: chosen.name }),
    });
  };

  return (
    <FormCard icon={Crown} title={t('aiCredits.admin.drawer.planTitle')} hint={t('aiCredits.admin.drawer.planChangeNote')}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={planId || undefined} onValueChange={setPlanId}>
          <SelectTrigger className="h-9 w-full rounded-xl sm:flex-1" aria-label={t('aiCredits.admin.drawer.choosePlan')}>
            <SelectValue placeholder={current?.name ?? tenant.plan_name ?? t('aiCredits.admin.drawer.choosePlan')} />
          </SelectTrigger>
          <SelectContent>
            {choices.map(plan => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" className="h-9 rounded-xl" disabled={!canChange} onClick={submit}>
          {mutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowRightLeft aria-hidden />}
          {t('aiCredits.admin.drawer.changePlan')}
        </Button>
      </div>
    </FormCard>
  );
}

/** Extra points for the current month (optional price and note). */
export function AiTenantTopupForm({ tenant, currentMonth }: { tenant: AiCreditOverviewTenant; currentMonth: string }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const id = useId();
  const mutation = useAddAiTopup();
  const [draft, setDraft] = useState({ points: '', price: '', reason: '' });
  const [errors, setErrors] = useState<Partial<Record<'points' | 'price' | 'reason', string>>>({});
  useEffect(() => { setDraft({ points: '', price: '', reason: '' }); setErrors({}); }, [tenant.tenant_id]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateAiTopupDraft(draft, locale);
    setErrors(result.errors);
    if (!result.input) return;
    mutation.mutate(
      { tenantId: tenant.tenant_id, tenantName: tenant.tenant_name, pointsLabel: formatPoints(result.input.points, locale), topup: result.input },
      { onSuccess: () => setDraft({ points: '', price: '', reason: '' }) },
    );
  };

  return (
    <FormCard icon={Coins} title={t('aiCredits.admin.drawer.topupTitle')} hint={t('aiCredits.admin.drawer.topupHint', { month: formatMonthLabel(currentMonth, locale) })}>
      <form className="space-y-3" onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <AiFormField id={`${id}-points`} label={t('aiCredits.admin.drawer.topupPoints')} error={errors.points ? t(errors.points) : null}>
            <Input id={`${id}-points`} inputMode="numeric" value={draft.points} aria-invalid={Boolean(errors.points)}
              onChange={event => setDraft(value => ({ ...value, points: event.target.value }))} className="h-9 rounded-xl" />
          </AiFormField>
          <AiFormField id={`${id}-price`} label={t('aiCredits.admin.drawer.topupPrice')} optionalLabel={t('aiCredits.common.optional')} error={errors.price ? t(errors.price) : null}>
            <Input id={`${id}-price`} inputMode="numeric" value={draft.price} aria-invalid={Boolean(errors.price)}
              onChange={event => setDraft(value => ({ ...value, price: event.target.value }))} className="h-9 rounded-xl" />
          </AiFormField>
        </div>
        <AiFormField id={`${id}-reason`} label={t('aiCredits.admin.drawer.topupReason')} optionalLabel={t('aiCredits.common.optional')} error={errors.reason ? t(errors.reason) : null}>
          <Textarea id={`${id}-reason`} rows={2} maxLength={500} value={draft.reason} placeholder={t('aiCredits.admin.drawer.topupReasonPlaceholder')}
            onChange={event => setDraft(value => ({ ...value, reason: event.target.value }))} className="min-h-0 rounded-xl" />
        </AiFormField>
        <div className="flex justify-end">
          <Button type="submit" className="h-9 rounded-xl" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Coins aria-hidden />}
            {t('aiCredits.admin.drawer.topupSubmit')}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}

/** What Google AI Studio billed for the tenant's own key in the selected month. */
export function AiTenantReconcileForm({ tenant, month }: { tenant: AiCreditOverviewTenant; month: string }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const id = useId();
  const mutation = useReconcileAiMonth();
  const savedCost = tenant.reconciled_cost_vnd;
  const savedNote = tenant.reconciled_note;
  const [draft, setDraft] = useState({ cost: '', note: '' });
  const [errors, setErrors] = useState<Partial<Record<'cost' | 'note', string>>>({});
  // The form shows what is saved for this tenant and month.
  useEffect(() => {
    setDraft({ cost: savedCost === null ? '' : decimalInputValue(savedCost, locale), note: savedNote ?? '' });
    setErrors({});
  }, [tenant.tenant_id, month, savedCost, savedNote, locale]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateAiReconcileDraft(draft, locale);
    setErrors(result.errors);
    if (!result.input) return;
    mutation.mutate({ tenantId: tenant.tenant_id, month, reconciliation: result.input });
  };

  return (
    <FormCard icon={ReceiptText} title={t('aiCredits.admin.drawer.reconcileTitle')} hint={t('aiCredits.admin.drawer.reconcileHint', { month: formatMonthLabel(month, locale) })}>
      <form className="space-y-3" onSubmit={submit} noValidate>
        <AiFormField id={`${id}-cost`} label={t('aiCredits.admin.drawer.reconcileCost')} error={errors.cost ? t(errors.cost) : null}
          hint={tenant.reconciled_cost_vnd !== null ? t('aiCredits.admin.drawer.reconcileCurrent', { amount: formatVnd(tenant.reconciled_cost_vnd, locale) }) : undefined}>
          <Input id={`${id}-cost`} inputMode="numeric" value={draft.cost} aria-invalid={Boolean(errors.cost)}
            onChange={event => setDraft(value => ({ ...value, cost: event.target.value }))} className="h-9 rounded-xl" />
        </AiFormField>
        <AiFormField id={`${id}-note`} label={t('aiCredits.admin.drawer.reconcileNote')} optionalLabel={t('aiCredits.common.optional')} error={errors.note ? t(errors.note) : null}>
          <Textarea id={`${id}-note`} rows={2} maxLength={500} value={draft.note}
            onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} className="min-h-0 rounded-xl" />
        </AiFormField>
        <div className="flex justify-end">
          <Button type="submit" className="h-9 rounded-xl" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <ReceiptText aria-hidden />}
            {t('aiCredits.admin.drawer.reconcileSubmit')}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
