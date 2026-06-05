import { useState, useEffect, useRef } from 'react';

import { useTenantStore } from '@/utils/tenant-store';
import { useHeaderInfo } from '@/utils/header-store';
import { useAuthStore } from '@/utils/store';
import { Activity, AlertTriangle, Plus, Pencil, Trash2, Clock, RefreshCw, CalendarIcon, X, LogIn, LogOut } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/shared/pagination';
import { TableToolbar } from '@/components/shared/table-toolbar';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogs } from '@/api/custom-audit-logs';
import type { AuditLog } from '@/api/custom-audit-logs';

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function AuditLogsPage() {
  useHeaderInfo('Audit Logs');

  const user = useAuthStore((s) => s.user);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);

  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [actionFilter, setActionFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  const activeTenantId = useTenantStore((s) => s.activeTenantId);

  // Refresh cooldown
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  useEffect(() => { setPage(1); }, [debouncedSearch, actionFilter, dateRange]);

  // ── Real API call ──
  const { data: apiData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['audit-logs', page, limit, debouncedSearch, actionFilter, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), activeTenantId],
    queryFn: () => getAuditLogs({
      page,
      page_size: limit,
      search: debouncedSearch || undefined,
      action: actionFilter !== 'all' ? actionFilter : undefined,
      date_from: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
      date_to: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
    }),
    enabled: mounted && !isLoggingOut,
    staleTime: 30_000,
  });

  const activities: AuditLog[] = apiData?.results || [];
  const total = apiData?.total || 0;
  const totalPages = apiData?.total_pages || 1;

  const handleRefresh = () => {
    if (refreshCooldown > 0) return;
    refetch();
    toast.success('Logs refreshed');
    setRefreshCooldown(5);
    cooldownRef.current = setInterval(() => {
      setRefreshCooldown((prev) => {
        if (prev <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); cooldownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  if (!mounted || isLoggingOut) return null;



  // Build filters
  const filters: any[] = [
    {
      key: 'action',
      placeholder: 'Actions',
      options: [
        { value: 'CREATE', label: 'Create' },
        { value: 'UPDATE', label: 'Update' },
        { value: 'DELETE', label: 'Delete' },
      ],
    },
  ];

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`
      : format(dateRange.from, 'MMM d, yyyy')
    : null;

  // Group activities by date for timeline view
  const groupedByDate = activities.reduce<Record<string, AuditLog[]>>((acc, log) => {
    const dateKey = new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto pb-10">

      <PageHeader
        icon={Activity}
        title="Nhật ký hoạt động"
        description="Theo dõi tất cả thao tác trong hệ thống"
      />

      <div className="pb-6 flex items-center justify-between" style={{ borderBottom: '1px solid transparent', borderImage: 'linear-gradient(to right, transparent, var(--border), transparent) 1' }}>
        {/* View mode toggle */}
        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/40">
          <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer ${viewMode === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            Table
          </button>
          <button onClick={() => setViewMode('timeline')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer ${viewMode === 'timeline' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            Timeline
          </button>
        </div>

        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshCooldown > 0} className="gap-2 h-9 px-3 text-[13px] shadow-sm">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {refreshCooldown > 0 ? `${refreshCooldown}s` : 'Refresh'}
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by user or entity..."
            filters={filters}
            filterValues={{ action: actionFilter }}
            onFilterChange={(key, val) => {
              if (key === 'action') setActionFilter(val);
            }}
            onReset={() => { setSearch(''); setActionFilter('all'); setDateRange(undefined); }}
          />
        </div>
        {/* <div className="shrink-0 flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger
              className={`inline-flex items-center gap-2 h-8 px-4 text-xs font-medium rounded-full border transition-all duration-200 ease-[var(--ease-out-expo)] shadow-none ${dateLabel
                  ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15 dark:bg-primary/15 dark:border-primary/40'
                  : 'bg-muted/40 border-border/50 text-muted-foreground hover:bg-muted/70 hover:border-border hover:text-foreground'
                }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>{dateLabel || 'Date range'}</span>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-border/60 backdrop-blur-md bg-popover/95" align="end">
              <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} disabled={{ after: new Date() }} />
            </PopoverContent>
          </Popover>
          {dateRange && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-full transition-all duration-200" onClick={() => setDateRange(undefined)} title="Clear date filter">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div> */}
      </div>

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className={`flex flex-col ${isFetching && activities.length > 0 ? 'opacity-50 pointer-events-none transition-opacity duration-200' : 'transition-opacity duration-200'}`}>
            {isLoading && activities.length === 0 ? (
              [1, 2, 3, 4, 5].map((i, index) => (
                <div key={i} className={`flex items-center gap-4 p-4 ${index !== 4 ? 'border-b border-border' : ''}`}>
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))
            ) : !isLoading && activities.length === 0 ? (
              <div className="p-12 text-center">
                <Activity className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-base font-medium text-foreground">No activity logs found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search terms.</p>
              </div>
            ) : (
              activities.map((log, index) => {
                const actionIcon = log.action === 'CREATE' ? Plus : log.action === 'DELETE' ? Trash2 : log.action === 'LOGIN' ? LogIn : log.action === 'LOGOUT' ? LogOut : Pencil;
                const ActionIcon = actionIcon;
                const actionColor = log.action === 'CREATE'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : log.action === 'DELETE'
                    ? 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                    : log.action === 'LOGIN'
                      ? 'bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400'
                      : log.action === 'LOGOUT'
                        ? 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400'
                        : 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400';
                const entityType = (log.entity_type || '').toLowerCase();
                const entityName = log.entity_name || log.entity_id || 'unknown';
                const actionVerb = log.action === 'CREATE' ? 'created' : log.action === 'DELETE' ? 'deleted' : log.action === 'LOGIN' ? 'logged in' : log.action === 'LOGOUT' ? 'logged out' : 'updated';

                return (
                  <div key={log.id} className={`flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors ${index !== activities.length - 1 ? 'border-b border-border' : ''}`}>
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${actionColor}`}>
                      <ActionIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{log.actor_username}</span>{' '}
                        <span className="text-muted-foreground">{actionVerb}{log.action !== 'LOGIN' && log.action !== 'LOGOUT' ? ` ${entityType}` : ''}</span>
                        {log.action !== 'LOGIN' && log.action !== 'LOGOUT' && <>{' '}<span className="font-medium">{entityName}</span></>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(log.created_at)} ({getRelativeTime(log.created_at)})
                        {log.ip_address && <span className="ml-2 opacity-60">• {log.ip_address}</span>}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Pagination page={page} limit={limit} total={total} totalPages={totalPages} onPageChange={setPage} onLimitChange={setLimit} label="logs" />
        </div>
      )}

      {/* TIMELINE VIEW */}
      {viewMode === 'timeline' && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="max-h-[520px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
            <div className={`p-6 ${isFetching && activities.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              {isLoading && activities.length === 0 ? (
                <div className="space-y-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-4 w-4 rounded-full shrink-0 mt-1" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !isLoading && activities.length === 0 ? (
                <div className="p-12 text-center">
                  <Activity className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-base font-medium text-foreground">No activity logs found</p>
                  <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search terms.</p>
                </div>
              ) : (
                Object.entries(groupedByDate).map(([dateKey, logs], groupIdx) => (
                  <div key={dateKey} className={groupIdx > 0 ? 'mt-6' : ''}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 px-2.5 py-1 rounded-md">{dateKey}</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>
                    <div className="relative ml-3">
                      <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />
                      <div className="space-y-0">
                        {logs.map((log) => {
                          const dotColor = log.action === 'CREATE' ? 'bg-emerald-500' : log.action === 'DELETE' ? 'bg-red-500' : log.action === 'LOGIN' ? 'bg-violet-500' : log.action === 'LOGOUT' ? 'bg-slate-500' : 'bg-blue-500';
                          const entityType = (log.entity_type || '').toLowerCase();
                          const entityName = log.entity_name || log.entity_id || 'unknown';
                          const actionVerb = log.action === 'CREATE' ? 'created' : log.action === 'DELETE' ? 'deleted' : log.action === 'LOGIN' ? 'logged in' : log.action === 'LOGOUT' ? 'logged out' : 'updated';
                          const timeStr = new Date(log.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                          return (
                            <div key={log.id} className="relative flex items-start gap-4 py-3 group">
                              <div className="relative z-10 shrink-0 mt-1">
                                <div className={`w-[15px] h-[15px] rounded-full border-[3px] border-card ${dotColor} shadow-sm group-hover:scale-125 transition-transform duration-200`} />
                              </div>
                              <div className="flex-1 min-w-0 -mt-0.5">
                                <p className="text-[13px] text-foreground leading-relaxed">
                                  <span className="font-semibold">{log.actor_username}</span>{' '}
                                  <span className="text-muted-foreground">{actionVerb}{log.action !== 'LOGIN' && log.action !== 'LOGOUT' ? ` ${entityType}` : ''}</span>
                                  {log.action !== 'LOGIN' && log.action !== 'LOGOUT' && <>{' '}<span className="font-medium text-foreground">{entityName}</span></>}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {timeStr}
                                  {log.ip_address && <span className="ml-2 opacity-60">• {log.ip_address}</span>}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <Pagination page={page} limit={limit} total={total} totalPages={totalPages} onPageChange={setPage} onLimitChange={setLimit} label="logs" />
        </div>
      )}
    </div>
  );
}
