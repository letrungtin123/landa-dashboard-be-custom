import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, Bot, Brain, Building2, Coins, Moon, Rocket, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TenantAiPointsCell } from '@/components/ai-credits/tenant-ai-points-cell';
import {
  AI_CREDITS_PREVIEW_SCENARIOS, createAiCreditsPreviewApi, type AiCreditsPreviewScenario,
} from '@/components/ai-credits/ai-credits-preview.mock';
import { AiCreditsApiProvider, useAiCreditOverviewByTenant } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { AiUsageScreen } from '@/components/ai-credits/ai-usage-screen';
import { AiCreditsScreen } from '@/pages/ai-credits';

type PreviewView = 'both' | 'chatbot' | 'admin' | 'tenants';

/** Tenant management table, "Điểm AI" column only (the rest of that page is not part of the preview). */
function TenantsColumnPreview() {
  const { t } = useTranslation();
  const aiPoints = useAiCreditOverviewByTenant();
  const rows = aiPoints.loading || aiPoints.failed
    ? [{ id: 'pending', name: 'Tenant' }]
    : [...[...aiPoints.byTenant.values()].map(tenant => ({ id: tenant.tenant_id, name: tenant.tenant_name })),
      { id: 'created-after-read', name: 'New tenant (not in the overview yet)' }];
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader icon={Building2} title={t('tenantManagement.title')} />
      <TooltipProvider delayDuration={300}>
        <div className="app-data-table-shell rounded-lg border bg-card">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="whitespace-nowrap">{t('tenantManagement.name')}</TableHead>
                <TableHead className="w-[176px] whitespace-nowrap text-center">{t('tenantManagement.aiPoints')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="w-[176px] text-center">
                    <TenantAiPointsCell loading={aiPoints.loading} failed={aiPoints.failed} tenant={aiPoints.byTenant.get(row.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>
    </div>
  );
}

/** The AI Chatbot page with its overview tab open, as tenant admins see it (other tabs are not part of the preview). */
function ChatbotOverviewPreview() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 p-6">
      <PageHeader icon={Bot} title={t('aiChatbot.title')} description={t('aiChatbot.description')} />
      <Tabs value="overview" className="w-full">
        <TabsList className="grid w-full max-w-3xl grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="kb" className="gap-2" disabled><Brain className="h-4 w-4" /> {t('aiChatbot.knowledgeBases')}</TabsTrigger>
          <TabsTrigger value="bots" className="gap-2" disabled><Bot className="h-4 w-4" /> {t('aiChatbot.chatbots')}</TabsTrigger>
          <TabsTrigger value="deploy" className="gap-2" disabled><Rocket className="h-4 w-4" /> {t('aiChatbot.deploy')}</TabsTrigger>
          <TabsTrigger value="overview" className="gap-2"><BarChart3 className="h-4 w-4" /> {t('aiChatbot.overview')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6"><AiUsageScreen tenantScope="preview-tenant" requestTenantId={null} /></TabsContent>
      </Tabs>
    </div>
  );
}

/** Small segmented control of the visual QA bar (developer-only labels). */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-muted/45 p-1">
        {options.map(option => (
          <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}
            className={cn('h-7 rounded-lg px-2.5 text-xs font-medium transition-colors',
              value === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A fresh cache and mock API per scenario (remounted by key), so each state starts from scratch. */
function PreviewScope({ scenario, view }: { scenario: AiCreditsPreviewScenario; view: PreviewView }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [api] = useState(() => createAiCreditsPreviewApi(scenario));
  return (
    <QueryClientProvider client={queryClient}>
      <AiCreditsApiProvider value={api}>
        {(view === 'both' || view === 'chatbot') && <ChatbotOverviewPreview />}
        {view === 'both' && <div className="mx-auto my-4 h-px max-w-7xl bg-border" aria-hidden />}
        {(view === 'both' || view === 'admin') && <AiCreditsScreen />}
        {view === 'tenants' && <TenantsColumnPreview />}
      </AiCreditsApiProvider>
    </QueryClientProvider>
  );
}

/**
 * Development-only visual harness for the AI points pages: in-memory mock
 * API, no auth, no backend call. The route and this chunk do not exist in
 * production builds (App.tsx gates both on import.meta.env.DEV).
 */
export default function DevAiCreditsPreviewPage() {
  const [scenario, setScenario] = useState<AiCreditsPreviewScenario>('ok');
  const [view, setView] = useState<PreviewView>('both');
  const locale = useLocaleStore(state => state.locale);
  const setLocale = useLocaleStore(state => state.setLocale);
  const { theme, setTheme } = useTheme();
  if (!import.meta.env.DEV) return null;

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/90 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Coins className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">AI points · visual preview</h1>
              <p className="text-[11px] text-muted-foreground">DEV only · mock data · no backend</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Segmented label="State" value={scenario} options={AI_CREDITS_PREVIEW_SCENARIOS} onChange={setScenario} />
            <Segmented label="Page" value={view} options={['both', 'chatbot', 'admin', 'tenants'] as const} onChange={setView} />
            <Segmented label="Lang" value={locale} options={['vi', 'en'] as const} onChange={setLocale} />
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-muted/45 px-3 text-xs font-medium">
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}
              {theme === 'dark' ? 'light' : 'dark'}
            </button>
          </div>
        </div>
      </header>
      <PreviewScope key={scenario} scenario={scenario} view={view} />
    </main>
  );
}
