import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Coins, Layers, LayoutDashboard } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiCreditsFxTab, AiFxDialog } from '@/components/ai-credits/ai-credits-fx';
import { mergeMonths, shiftMonth } from '@/components/ai-credits/ai-credits-format.logic';
import { AiCreditsOverviewTab } from '@/components/ai-credits/ai-credits-overview-tab';
import { AiCreditsPlansTab } from '@/components/ai-credits/ai-credits-plans-tab';
import { AI_EASE } from '@/components/ai-credits/ai-credits-ui';
import { useAiCreditOverview, useAiFxRates } from '@/hooks/queries/use-ai-credits';
import { useHeaderInfo } from '@/utils/header-store';

type AiCreditsTab = 'overview' | 'plans' | 'fx';

/** Superadmin: AI plans, FX rates by month and the money overview of every tenant. */
export function AiCreditsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AiCreditsTab>('overview');
  const [fxMonth, setFxMonth] = useState<string | null>(null);
  const fx = useAiFxRates();
  // Same cache as the overview tab's current month: the months that really have data.
  const current = useAiCreditOverview(null);
  const months = useMemo(() => current.data?.available_months ?? [], [current.data]);
  // The FX picker offers those months, months that already have a rate, and next month (to set it ahead).
  const fxMonths = useMemo(() => mergeMonths(
    months[0] ? [shiftMonth(months[0], 1)] : [],
    months,
    (fx.data ?? []).map(rate => rate.month),
  ), [months, fx.data]);

  return (
    <div className="relative isolate mx-auto w-full max-w-7xl space-y-6 p-4 pb-16 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/[0.06] to-transparent" />
      <motion.header initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: AI_EASE }}
        className="flex items-start gap-3.5 border-b border-border/50 pb-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--gradient-from)] to-[var(--gradient-to)] text-white shadow-lg shadow-primary/20" aria-hidden>
          <Coins className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t('aiCredits.admin.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t('aiCredits.admin.description')}</p>
        </div>
      </motion.header>

      <Tabs value={tab} onValueChange={value => setTab(value as AiCreditsTab)} className="space-y-5">
        <TabsList className="h-auto w-full max-w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview" className="h-9 px-3.5"><LayoutDashboard aria-hidden />{t('aiCredits.admin.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="plans" className="h-9 px-3.5"><Layers aria-hidden />{t('aiCredits.admin.tabs.plans')}</TabsTrigger>
          <TabsTrigger value="fx" className="h-9 px-3.5"><ArrowLeftRight aria-hidden />{t('aiCredits.admin.tabs.fx')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-0"><AiCreditsOverviewTab onSetFx={setFxMonth} /></TabsContent>
        <TabsContent value="plans" className="mt-0"><AiCreditsPlansTab /></TabsContent>
        <TabsContent value="fx" className="mt-0"><AiCreditsFxTab months={months} onEdit={setFxMonth} /></TabsContent>
      </Tabs>

      <AiFxDialog
        open={fxMonth !== null}
        month={fxMonth ?? months[0] ?? ''}
        months={fxMonths}
        rates={fx.data ?? []}
        onOpenChange={open => { if (!open) setFxMonth(null); }}
      />
    </div>
  );
}

export default function AiCreditsPage() {
  const { t } = useTranslation();
  useHeaderInfo(t('aiCredits.admin.title'));
  return <AiCreditsScreen />;
}
