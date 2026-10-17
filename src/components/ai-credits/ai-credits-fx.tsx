import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeftRight, Info, Loader2, Pencil, Plus, RefreshCw, Save } from 'lucide-react';
import type { AiFxRate } from '@/api/ai-credits';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAiFxRates, useSetAiFxRate } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { validateAiFxDraft } from './ai-credits-admin.logic';
import { decimalInputValue, formatFullDate, formatMonthLabel, intlLocale } from './ai-credits-format.logic';
import { AI_EASE, AiFormField } from './ai-credits-ui';

/** Set or change the VND per USD rate of one month (taken from Google's invoice). */
export function AiFxDialog({ open, month, months, rates, onOpenChange }: {
  open: boolean;
  month: string;
  /** Months offered in the picker, newest first. */
  months: readonly string[];
  rates: readonly AiFxRate[];
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const id = useId();
  const mutation = useSetAiFxRate();
  const [draft, setDraft] = useState({ month, rate: '', note: '' });
  const [errors, setErrors] = useState<Partial<Record<'month' | 'rate' | 'note', string>>>({});
  const options = months.includes(month) ? months : [month, ...months];

  const fill = (target: string) => {
    const existing = rates.find(rate => rate.month === target);
    setDraft({ month: target, rate: existing ? decimalInputValue(existing.vnd_per_usd, locale) : '', note: existing?.source_note ?? '' });
  };
  // Opening the dialog shows what is saved for that month (empty for a new month).
  useEffect(() => {
    if (!open) return;
    const existing = rates.find(rate => rate.month === month);
    setDraft({ month, rate: existing ? decimalInputValue(existing.vnd_per_usd, locale) : '', note: existing?.source_note ?? '' });
    setErrors({});
  }, [open, month, rates, locale]);

  const submit = () => {
    const result = validateAiFxDraft(draft, locale);
    setErrors(result.errors);
    if (!result.input) return;
    mutation.mutate({ ...result.input, monthLabel: formatMonthLabel(result.input.month, locale) }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base font-semibold">{t('aiCredits.admin.fxDialog.title')}</DialogTitle>
          <DialogDescription className="text-xs leading-5">{t('aiCredits.admin.fxDialog.description')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3.5 p-5" onSubmit={event => { event.preventDefault(); submit(); }} noValidate>
          <AiFormField id={`${id}-month`} label={t('aiCredits.admin.fxDialog.month')} error={errors.month ? t(errors.month) : null}>
            <Select value={draft.month} onValueChange={fill}>
              <SelectTrigger id={`${id}-month`} className="h-9 w-full rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {options.map(item => <SelectItem key={item} value={item}>{formatMonthLabel(item, locale)}</SelectItem>)}
              </SelectContent>
            </Select>
          </AiFormField>
          <AiFormField id={`${id}-rate`} label={t('aiCredits.admin.fxDialog.rate')} hint={t('aiCredits.admin.fxDialog.rateHint')} error={errors.rate ? t(errors.rate) : null}>
            <div className="relative">
              <Input id={`${id}-rate`} inputMode="decimal" value={draft.rate} aria-invalid={Boolean(errors.rate)} placeholder="26150"
                onChange={event => setDraft(value => ({ ...value, rate: event.target.value }))} className="h-9 rounded-xl pr-24 tabular-nums" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">VND / USD</span>
            </div>
          </AiFormField>
          <AiFormField id={`${id}-note`} label={t('aiCredits.admin.fxDialog.note')} optionalLabel={t('aiCredits.common.optional')} error={errors.note ? t(errors.note) : null}>
            <Textarea id={`${id}-note`} rows={2} maxLength={500} value={draft.note} placeholder={t('aiCredits.admin.fxDialog.notePlaceholder')}
              onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} className="min-h-0 rounded-xl" />
          </AiFormField>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
        <DialogFooter className="border-t border-border/60 px-5 py-3.5">
          <Button type="button" variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>{t('aiCredits.common.cancel')}</Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {t('aiCredits.admin.fxDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rates by month, newest first, with the hint that the rate comes from Google's invoice. */
export function AiCreditsFxTab({ months, onEdit }: { months: readonly string[]; onEdit: (month: string) => void }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const fx = useAiFxRates();
  const number = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 4 }), [locale]);
  const currentMonth = months[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><Info className="mt-1 h-4 w-4 shrink-0" aria-hidden />{t('aiCredits.admin.fx.hint')}</p>
        <Button type="button" className="shrink-0 rounded-xl" disabled={!currentMonth} onClick={() => { if (currentMonth) onEdit(currentMonth); }}>
          <Plus aria-hidden />{t('aiCredits.admin.fx.set')}
        </Button>
      </div>
      {fx.data ? (
        fx.data.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/80 px-4 py-12 text-center text-sm text-muted-foreground">{t('aiCredits.admin.fx.empty')}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_40px] gap-4 border-b border-border/60 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
              <span>{t('aiCredits.admin.fx.columnMonth')}</span>
              <span className="text-right">{t('aiCredits.admin.fx.columnRate')}</span>
              <span>{t('aiCredits.admin.fx.columnNote')}</span>
              <span>{t('aiCredits.admin.fx.columnUpdated')}</span>
              <span />
            </div>
            <ul className="divide-y divide-border/50">
              {fx.data.map((rate, index) => (
                <motion.li key={rate.month} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: AI_EASE, delay: Math.min(index, 12) * 0.03 }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_40px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden><ArrowLeftRight className="h-3.5 w-3.5" /></span>
                    <span className="truncate text-sm font-medium text-foreground">{formatMonthLabel(rate.month, locale)}</span>
                    {index === 0 && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{t('aiCredits.admin.fx.latest')}</span>}
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums text-foreground">{number.format(Number(rate.vnd_per_usd))}</p>
                  <p className="col-span-2 truncate text-xs text-muted-foreground md:col-span-1 md:text-sm">{rate.source_note || '—'}</p>
                  <p className="text-xs text-muted-foreground">{formatFullDate(rate.updated_at, locale)}</p>
                  <Button type="button" variant="ghost" size="icon-sm" className="justify-self-end" onClick={() => onEdit(rate.month)} aria-label={t('aiCredits.admin.fx.edit')}>
                    <Pencil aria-hidden />
                  </Button>
                </motion.li>
              ))}
            </ul>
          </div>
        )
      ) : fx.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-6 py-12 text-center" role="alert">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('aiCredits.admin.fx.loadFailed')}</p>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { void fx.refetch(); }}><RefreshCw aria-hidden />{t('aiCredits.common.retry')}</Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-11 rounded-xl" />)}
        </div>
      )}
    </div>
  );
}
