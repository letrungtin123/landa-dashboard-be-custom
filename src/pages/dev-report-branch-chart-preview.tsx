import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LineChart, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { GroupEnrollmentsWidget } from '@/components/reports/group-enrollments-widget';
import { ReportMetricTrendModal } from '@/components/reports/report-metric-trend-modal';
import {
  REPORT_BRANCH_PREVIEW_SCENARIOS,
  createReportChartPreviewFetcher,
  reportBranchPreviewRange,
  reportBranchPreviewTotal,
  type ReportBranchPreviewScenario,
} from '@/components/reports/report-branch-chart-preview.mock';
import { formatReportChartDate } from '@/components/reports/report-chart-buckets.logic';
import { ReportChartApiProvider } from '@/hooks/queries/use-report-chart';
import { useLocaleStore } from '@/utils/locale-store';
import { useAuthStore } from '@/utils/store';
import { cn } from '@/utils/utils';

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
function PreviewScope({ scenario, modalOpen, onCloseModal }: { scenario: ReportBranchPreviewScenario; modalOpen: boolean; onCloseModal: () => void }) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  const [fetcher] = useState(() => createReportChartPreviewFetcher(scenario));
  const range = reportBranchPreviewRange(scenario);
  const dateLabel = `${formatReportChartDate(range.from, locale)} - ${formatReportChartDate(range.to, locale)}`;
  return (
    <QueryClientProvider client={queryClient}>
      <ReportChartApiProvider value={fetcher}>
        <div className="mx-auto max-w-7xl space-y-8 p-4 pb-10 sm:p-6">
          <GroupEnrollmentsWidget dateFrom={range.from} dateTo={range.to} dateLabel={dateLabel}
            selectedGroupId="all" selectedSubGroupId="all" selectedTeamId={scenario === 'single' ? 'preview-team' : 'all'}
            totalEnrollments={reportBranchPreviewTotal(scenario)} />
        </div>
        <ReportMetricTrendModal metricKey="total_enrollments" title={t('reports.periodEnrollments')} isOpen={modalOpen} onClose={onCloseModal}
          groupId="all" subgroupId="all" teamId="all" dateFrom={range.from} dateTo={range.to} dateLabel={dateLabel} />
      </ReportChartApiProvider>
    </QueryClientProvider>
  );
}

const PREVIEW_GROUP_LABELS = { group: 'Chi nhánh', subgroup: 'Phòng ban', team: 'Nhóm' };

/**
 * Development-only visual harness for the "Tổng lượt ghi danh theo chi nhánh"
 * chart of the summary report and the metric trend modal: in-memory mock API,
 * no auth, no backend call. The route and this chunk do not exist in
 * production builds (App.tsx gates both on import.meta.env.DEV).
 * URL options: ?scenario=many&theme=dark&lang=en&modal=1
 */
export default function DevReportBranchChartPreviewPage() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [scenario, setScenario] = useState<ReportBranchPreviewScenario>(() => {
    const value = params.get('scenario');
    return (REPORT_BRANCH_PREVIEW_SCENARIOS as readonly string[]).includes(value ?? '') ? value as ReportBranchPreviewScenario : 'branches';
  });
  const [modalOpen, setModalOpen] = useState(() => params.get('modal') === '1');
  const locale = useLocaleStore(state => state.locale);
  const setLocale = useLocaleStore(state => state.setLocale);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const requestedTheme = params.get('theme');
    if (requestedTheme === 'dark' || requestedTheme === 'light') setTheme(requestedTheme);
    const requestedLocale = params.get('lang');
    if (requestedLocale === 'vi' || requestedLocale === 'en') setLocale(requestedLocale);
  }, [params, setLocale, setTheme]);

  // Tenant labels as most customers set them; restored when leaving the preview.
  useEffect(() => {
    const store = useAuthStore.getState();
    const previous = store.groupLabels;
    store.setGroupLabels(PREVIEW_GROUP_LABELS);
    return () => useAuthStore.getState().setGroupLabels(previous);
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/90 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><LineChart className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Report branch chart · visual preview</h1>
              <p className="text-[11px] text-muted-foreground">DEV only · mock data · no backend</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Segmented label="State" value={scenario} options={REPORT_BRANCH_PREVIEW_SCENARIOS} onChange={setScenario} />
            <Segmented label="Lang" value={locale} options={['vi', 'en'] as const} onChange={setLocale} />
            <button type="button" onClick={() => setModalOpen(true)}
              className="flex h-9 items-center rounded-xl border border-border/70 bg-muted/45 px-3 text-xs font-medium">trend modal</button>
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-muted/45 px-3 text-xs font-medium">
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}
              {theme === 'dark' ? 'light' : 'dark'}
            </button>
          </div>
        </div>
      </header>
      <PreviewScope key={scenario} scenario={scenario} modalOpen={modalOpen} onCloseModal={() => setModalOpen(false)} />
    </main>
  );
}
