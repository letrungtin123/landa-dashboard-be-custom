import { useTranslation } from 'react-i18next';
import { Building2, Gauge, X } from 'lucide-react';
import type { AiCreditOverviewTenant, AiCreditPlan } from '@/api/ai-credits';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAiTenantUsage } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { formatMonthLabel } from './ai-credits-format.logic';
import { AiStateChip } from './ai-credits-ui';
import { AiTenantPlanForm, AiTenantReconcileForm, AiTenantTopupForm } from './ai-credits-tenant-forms';
import { AiUsageError, AiUsageSkeleton } from './ai-usage-states';
import { AiUsageView } from './ai-usage-view';
import { AiFxNotice } from './ai-fx-notice';

/** Side panel of one tenant: plan change, extra points, invoice check and a compact view of its usage. */
export function AiCreditsTenantDrawer({ tenant, month, currentMonth, plans, onClose, onSetFx }: {
  tenant: AiCreditOverviewTenant | null;
  /** Month selected in the overview (usage and invoice check). */
  month: string;
  /** Top-ups always go to the current month. */
  currentMonth: string;
  plans: readonly AiCreditPlan[];
  onClose: () => void;
  onSetFx?: (month: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const usage = useAiTenantUsage(tenant?.tenant_id ?? null, month);

  return (
    <Sheet open={Boolean(tenant)} onOpenChange={open => { if (!open) onClose(); }}>
      {/* The close button sits in the sticky header so scrolled content never covers it. */}
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto bg-background p-0 sm:max-w-2xl">
        {tenant && (
          <>
            <SheetHeader className="sticky top-0 z-10 border-b border-border/60 bg-background/90 px-5 py-4 backdrop-blur-md">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--gradient-from)] to-[var(--gradient-to)] text-white shadow-md" aria-hidden>
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base font-semibold">{tenant.tenant_name}</SheetTitle>
                  <SheetDescription className="truncate text-xs">{t('aiCredits.admin.drawer.description')}</SheetDescription>
                </div>
                <AiStateChip state={tenant.state} className="hidden sm:inline-flex" />
                <SheetClose asChild>
                  <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 transition-transform duration-200 hover:rotate-90">
                    <X aria-hidden />
                    <span className="sr-only">{t('common.close')}</span>
                  </Button>
                </SheetClose>
              </div>
            </SheetHeader>
            <div className="space-y-4 p-4 sm:p-5">
              <AiTenantPlanForm tenant={tenant} plans={plans} />
              <AiTenantTopupForm tenant={tenant} currentMonth={currentMonth} />
              <AiTenantReconcileForm tenant={tenant} month={month} />
              <section className="space-y-3 pt-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {t('aiCredits.admin.drawer.usageTitle', { month: formatMonthLabel(month, locale) })}
                </h3>
                {usage.data && 'fx_vnd_per_usd' in usage.data && (
                  <AiFxNotice month={usage.data.month} fxVndPerUsd={usage.data.fx_vnd_per_usd} fxRateMonth={usage.data.fx_rate_month} onSetFx={onSetFx} compact />
                )}
                {usage.data ? <AiUsageView summary={usage.data} compact />
                  : usage.isError ? <AiUsageError onRetry={() => { void usage.refetch(); }} retrying={usage.isFetching} />
                    : <AiUsageSkeleton compact />}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
