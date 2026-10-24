import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import type { OrgContextRead, OrgContextState } from '../../api/workspace-org-context.contract';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { useWorkspaceOrgContext } from '@/hooks/queries/use-workspace-org-context';
import type { createWorkspaceSourceState } from './workspace-source-state';
import { orgContextDefaultTab, orgContextLaunchOffer, type WorkspaceLaunchTab } from './workspace-org-context.logic';
import { WorkspaceOrgContextPanel } from './workspace-org-context-panel';
import { WorkspaceOrgContextLaunchProvider } from './workspace-org-context-launch';

type SourceController = ReturnType<typeof createWorkspaceSourceState>;
// Below the desktop width: at least 40px high, and a long label wraps inside its half instead of overflowing it.
const TRIGGER = 'h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm max-lg:h-auto max-lg:min-h-10 max-lg:whitespace-normal max-lg:px-2 max-lg:py-1.5';

/** AI course design start screen. While the organization context feature is on for the tenant (server GET), two
 * tabs: "Ngữ cảnh doanh nghiệp" and "Tạo khoá học" (the children, today's start screen). Off, unknown or
 * unreadable: exactly the children, and Create sends no organization context key. */
export function WorkspaceLaunchTabs({ sources, tenantId, locale, children }: {
  sources: SourceController; tenantId: string | null; locale: WorkspaceLocale; children: ReactNode;
}) {
  const read = useWorkspaceOrgContext({ tenantId, enabled: true });
  const offer = orgContextLaunchOffer(read.data);
  const offered = offer !== null, confirmedVersion = offer?.confirmedVersion ?? null;
  useEffect(() => { sources.setOrganizationContextOffer(offered ? { confirmedVersion } : null); }, [sources, offered, confirmedVersion]);
  // A Create refused for the profile means the server knows better: reload the context state.
  const briefError = useSyncExternalStore(sources.subscribe, () => sources.getState().briefError, () => sources.getState().briefError);
  const { refetch } = read;
  useEffect(() => {
    if (briefError === 'ORG_CONTEXT_NOT_CONFIRMED' || briefError === 'ORG_CONTEXT_NOT_APPLICABLE') void refetch();
  }, [briefError, refetch]);
  if (read.isPending && read.fetchStatus === 'fetching') return <LaunchTabsSkeleton />;
  if (!read.data?.enabled) return <>{children}</>;
  return <OrgContextTabs state={read.data} tenantId={tenantId} locale={locale} onReload={() => refetch().then(result => result.data)}>{children}</OrgContextTabs>;
}

function OrgContextTabs({ state, tenantId, locale, onReload, children }: {
  state: Readonly<OrgContextState>; tenantId: string | null; locale: WorkspaceLocale; onReload: () => Promise<OrgContextRead | undefined>; children: ReactNode;
}) {
  const { t } = useTranslation();
  // Chosen once: confirming a profile later never moves the author to another tab.
  const [tab, setTab] = useState<WorkspaceLaunchTab>(() => orgContextDefaultTab(state));
  const offer = orgContextLaunchOffer(state);
  const confirmedVersion = offer?.confirmedVersion ?? null, confirmedAt = offer?.confirmedAt ?? null;
  const launch = useMemo(() => ({ confirmedVersion, confirmedAt, locale, openContext: () => setTab('context') }), [confirmedVersion, confirmedAt, locale]);
  // Both panels stay mounted: switching tabs keeps an unsaved profile draft, an upload and the start screen as they were.
  return <Tabs value={tab} onValueChange={value => setTab(value === 'context' ? 'context' : 'create')} className="flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 border-b bg-muted/10 px-4 py-2 sm:px-5">
      <TabsList aria-label={t('aiIdOrgContext.tabsLabel')} className="grid h-auto w-full max-w-xl grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/35 p-1 dark:bg-muted/20">
        <TabsTrigger value="context" className={TRIGGER}><Building2 className="h-3.5 w-3.5" aria-hidden />{t('aiIdOrgContext.tabContext')}</TabsTrigger>
        <TabsTrigger value="create" className={TRIGGER}><Sparkles className="h-3.5 w-3.5" aria-hidden />{t('aiIdOrgContext.tabCreate')}</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="context" forceMount className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 data-[state=inactive]:hidden">
      <WorkspaceOrgContextPanel state={state} tenantId={tenantId} locale={locale} onReload={onReload} />
    </TabsContent>
    <TabsContent value="create" forceMount className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
      <WorkspaceOrgContextLaunchProvider value={launch}>{children}</WorkspaceOrgContextLaunchProvider>
    </TabsContent>
  </Tabs>;
}

function LaunchTabsSkeleton() {
  const { t } = useTranslation();
  return <div role="status" className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden px-4 py-5 sm:px-5 lg:grid-cols-[1.45fr_0.8fr]">
    <span className="sr-only">{t('aiIdOrgContext.loading')}</span>
    <div className="animate-pulse space-y-4 rounded-lg border border-border/70 bg-card p-5" aria-hidden><div className="h-5 w-2/5 rounded bg-muted" /><div className="h-16 rounded-lg bg-muted" /><div className="h-12 rounded-lg bg-muted" /></div>
    <div className="hidden animate-pulse rounded-lg border border-border/70 bg-muted/20 p-5 lg:block" aria-hidden><div className="h-4 w-1/2 rounded bg-muted" /><div className="mt-4 h-24 rounded-lg bg-muted" /></div>
  </div>;
}
