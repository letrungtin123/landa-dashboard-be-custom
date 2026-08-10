import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/utils/store';
import { cn } from '@/utils/utils';

export interface ModuleTab {
  key: string;
  label: string;
  /** Permission check: module code (e.g. 'customer') */
  module: string;
  /** Permission check: tab code (e.g. 'conversation') */
  tab: string;
  /** The component to render */
  component: React.ReactNode;
  /** If true, this tab takes full remaining height (e.g. Conversations 3-panel) */
  fullHeight?: boolean;
}

interface ModuleTabsProps {
  tabs: ModuleTab[];
  /** Default tab key if none specified in URL */
  defaultTab?: string;
}

export function ModuleTabs({ tabs, defaultTab }: ModuleTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  // Filter tabs by permission
  // Shell mode: chưa có permission system → staff/superuser đã vượt auth gate → cho phép tất cả
  const visibleTabs = tabs.filter((t) => {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    // Nếu chưa có permission entry cho module/tab → mặc định cho phép (shell mode)
    const hasEntry = !!permissions?.[t.module];
    if (!hasEntry) return true;
    return hasPermission(t.module, 'can_view');
  });

  if (visibleTabs.length === 0) return null;

  const activeKey = searchParams.get('tab') || defaultTab || visibleTabs[0]?.key;
  const activeTab = visibleTabs.find((t) => t.key === activeKey) || visibleTabs[0];

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div className={cn('flex flex-col', activeTab?.fullHeight ? 'h-[calc(100vh-4rem)]' : 'min-h-0')}>
      {/* Tab bar — only show if more than 1 visible tab */}
      {visibleTabs.length > 1 && (
        <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-sm px-6 sticky top-0 z-20">
          <nav className="flex items-center gap-6">
            {visibleTabs.map((tab) => {
              const isActive = tab.key === activeTab?.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    'relative my-2 inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium transition-all outline-none !shadow-none',
                    isActive
                      ? 'app-liquid-button text-current'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Tab content */}
      <div className={cn('flex-1 min-h-0', activeTab?.fullHeight ? '' : 'p-6')}>
        {activeTab?.component}
      </div>
    </div>
  );
}
