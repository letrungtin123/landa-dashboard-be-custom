import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Coins, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  AI_CREDITS_PREVIEW_SCENARIOS, createAiCreditsPreviewApi, type AiCreditsPreviewScenario,
} from '@/components/ai-credits/ai-credits-preview.mock';
import { AiCreditsApiProvider } from '@/hooks/queries/use-ai-credits';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { AiUsageScreen } from '@/pages/ai-usage';
import { AiCreditsScreen } from '@/pages/ai-credits';

type PreviewView = 'both' | 'tenant' | 'admin';

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
        {view !== 'admin' && <AiUsageScreen tenantScope="preview-tenant" requestTenantId={null} />}
        {view === 'both' && <div className="mx-auto my-4 h-px max-w-7xl bg-border" aria-hidden />}
        {view !== 'tenant' && <AiCreditsScreen />}
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
            <Segmented label="Page" value={view} options={['both', 'tenant', 'admin'] as const} onChange={setView} />
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
