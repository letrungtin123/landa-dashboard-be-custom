import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  Activity, ChevronLeft, ChevronRight, Clock, Info, LogIn, LogOut,
  Pencil, Plus, RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { getAuditLogDetail, getAuditLogs, type AuditLog, type AuditLogDetail } from '@/api/custom-audit-logs';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { useHeaderInfo } from '@/utils/header-store';
import { formatLocaleDate } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import type { AppLocale } from '@/i18n';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function getRelativeTime(dateStr: string, locale: AppLocale, t: Translate): string {
  const diffSeconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSeconds < 60) return t('auditLogs.relativeTime.justNow');
  if (diffSeconds < 3600) return t('auditLogs.relativeTime.minutesAgo', { count: Math.floor(diffSeconds / 60) });
  if (diffSeconds < 86400) return t('auditLogs.relativeTime.hoursAgo', { count: Math.floor(diffSeconds / 3600) });
  if (diffSeconds < 604800) return t('auditLogs.relativeTime.daysAgo', { count: Math.floor(diffSeconds / 86400) });
  return formatLocaleDate(dateStr, locale, { month: 'short', day: 'numeric' });
}

function formatDate(dateStr: string, locale: AppLocale): string {
  return formatLocaleDate(dateStr, locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const ipv4 = ip.split('.');
  if (ipv4.length === 4) return `${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.*`;
  const ipv6 = ip.split(':').filter(Boolean);
  return ipv6.length > 1 ? `${ipv6.slice(0, 3).join(':')}::*` : '—';
}

function translateEntityType(entityType: string, t: Translate): string {
  return t(`auditLogs.entityTypes.${entityType}`, { defaultValue: entityType.split('_').join(' ') });
}

const COURSE_COMPONENT_EVENT_ACTIONS = {
  'course.component.created': 'created',
  'course.component.updated': 'updated',
  'course.component.deleted': 'deleted',
  'course.component.reordered': 'reordered',
} as const;

const COURSE_COMPONENT_TYPES = new Set([
  'course', 'chapter', 'sequential', 'vertical',
  'video', 'html', 'problem', 'la_media_quiz', 'la_image_choice_quiz',
  'la_scenario_chat', 'la_crossword', 'la_sortable', 'la_diagram', 'la_faq', 'la_pdf',
]);

function translateCourseComponentType(componentType: unknown, t: Translate): string {
  if (typeof componentType !== 'string') return t('auditLogs.courseComponentTypes.other');

  return COURSE_COMPONENT_TYPES.has(componentType)
    ? t(`auditLogs.courseComponentTypes.${componentType}`)
    : t('auditLogs.courseComponentTypes.other');
}

function courseComponentEventSummary(log: AuditLog, t: Translate): string | null {
  const action = log.event_code
    ? COURSE_COMPONENT_EVENT_ACTIONS[log.event_code as keyof typeof COURSE_COMPONENT_EVENT_ACTIONS]
    : undefined;
  if (!action) return null;

  const metadata = log.event_metadata || {};
  const actor = log.actor_username || t('auditLogs.unknownActor');
  const componentType = translateCourseComponentType(metadata.component_type, t);
  const subject = log.entity_name || log.entity_id || '';
  const courseName = typeof metadata.course_name === 'string' ? metadata.course_name : '';
  const courseContext = courseName ? ` · ${t('auditLogs.inCourse', { name: courseName })}` : '';

  return `${actor} ${t(`auditLogs.courseComponentActions.${action}`)} ${componentType}${subject ? ` ${subject}` : ''}${courseContext}`;
}

function actionVerb(action: AuditLog['action'], t: Translate): string {
  const key = action === 'CREATE' ? 'create' : action === 'DELETE' ? 'delete' : action === 'LOGIN' ? 'login' : action === 'LOGOUT' ? 'logout' : 'update';
  return t(`auditLogs.actionVerbs.${key}`);
}

function eventSummary(log: AuditLog, t: Translate): string {
  const componentSummary = courseComponentEventSummary(log, t);
  if (componentSummary) return componentSummary;

  const actor = log.actor_username || t('auditLogs.unknownActor');
  if (log.event_code) {
    const translated = t(`auditLogs.events.${log.event_code}`, { defaultValue: '' });
    if (translated) {
      if (log.event_code.startsWith('auth.')) return `${actor} ${translated}`;
      const subject = log.entity_name || log.entity_id || '';
      const courseName = typeof log.event_metadata?.course_name === 'string' ? log.event_metadata.course_name : '';
      const courseContext = log.event_code.startsWith('course.component.') && courseName
        ? ` · ${t('auditLogs.inCourse', { name: courseName })}`
        : '';
      return `${actor} ${translated}${subject ? ` ${subject}` : ''}${courseContext}`;
    }
  }
  if (log.action === 'LOGIN' || log.action === 'LOGOUT') return `${actor} ${actionVerb(log.action, t)}`;
  const subject = log.entity_name || log.entity_id || t('auditLogs.unknownEntity');
  return `${actor} ${actionVerb(log.action, t)} ${translateEntityType(log.entity_type, t)} ${subject}`;
}

function auditContextPreview(log: AuditLog, t: Translate): string | null {
  const metadata = log.event_metadata || {};
  const courseName = typeof metadata.course_name === 'string' ? metadata.course_name : null;
  const parentName = typeof metadata.parent_name === 'string' ? metadata.parent_name : null;
  const relatedName = typeof metadata.related_entity_name === 'string' ? metadata.related_entity_name : null;
  const relatedType = typeof metadata.related_entity_type === 'string' ? metadata.related_entity_type : null;
  const affectedCount = typeof metadata.affected_count === 'number' ? metadata.affected_count : null;
  const showAffectedCount = affectedCount !== null && log.event_code !== 'permission_group.matrix.updated';
  const items: string[] = [];

  if (courseName && !log.event_code?.startsWith('course.component.')) items.push(`${t('auditLogs.course')}: ${courseName}`);
  if (parentName) items.push(`${t('auditLogs.parent')}: ${parentName}`);
  if (relatedName) items.push(`${relatedType ? translateEntityType(relatedType, t) : t('auditLogs.relatedEntity')}: ${relatedName}`);
  if (showAffectedCount) items.push(t('auditLogs.affectedCountValue', { count: affectedCount }));

  return items.length ? items.join(' · ') : null;
}

function auditChangePreview(log: AuditLog, t: Translate): string | null {
  const change = log.changes?.[0];
  if (!change) return null;
  const field = t(`auditLogs.changeFields.${change.field}`, { defaultValue: change.field.split('_').join(' ') });
  return `${field}: ${displayAuditValue(change.before, t, change.field)} → ${displayAuditValue(change.after, t, change.field)}`;
}

function actionVisual(action: AuditLog['action']) {
  if (action === 'CREATE') return { Icon: Plus, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
  if (action === 'DELETE') return { Icon: Trash2, className: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  if (action === 'LOGIN') return { Icon: LogIn, className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' };
  if (action === 'LOGOUT') return { Icon: LogOut, className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' };
  return { Icon: Pencil, className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' };
}

function displayAuditValue(value: unknown, t: Translate, field?: string): string {
  if (field === 'data_limit_gb') {
    if (value === null || value === undefined || value === '') return t('auditLogs.values.unlimited');
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB` : t('auditLogs.values.unlimited');
  }
  if (field === 'progress') {
    const progress = Number(value);
    return Number.isFinite(progress) ? `${progress.toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : t('auditLogs.values.empty');
  }
  if (value === null || value === undefined || value === '') return t('auditLogs.values.empty');
  if (value === true) return t('auditLogs.values.yes');
  if (value === false) return t('auditLogs.values.no');
  if (value === 'draft' || value === 'published' || value === 'published_version') {
    return t(`auditLogs.values.${value}`);
  }
  return String(value);
}

function formatFileSize(bytes: unknown): string | null {
  const value = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!Number.isFinite(value) || value < 0) return null;
  return `${(value / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} GB`;
}

function AuditDetailSheet({
  log,
  detail,
  isLoadingDetail,
  onOpenChange,
}: {
  log: AuditLog | null;
  detail?: AuditLogDetail;
  isLoadingDetail: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const metadata = log?.event_metadata || {};
  const courseName = typeof metadata.course_name === 'string' ? metadata.course_name : null;
  const componentType = typeof metadata.component_type === 'string' ? metadata.component_type : null;
  const componentTypeLabel = translateCourseComponentType(componentType, t);
  const entityTypeLabel = log?.entity_type === 'course_block'
    ? componentTypeLabel
    : translateEntityType(log?.entity_type || '', t);
  const parentName = typeof metadata.parent_name === 'string' ? metadata.parent_name : null;
  const relatedName = typeof metadata.related_entity_name === 'string' ? metadata.related_entity_name : null;
  const relatedType = typeof metadata.related_entity_type === 'string' ? metadata.related_entity_type : null;
  const fileName = typeof metadata.file_name === 'string' ? metadata.file_name : null;
  const fileSize = formatFileSize(metadata.file_size_bytes);
  const affectedCount = typeof metadata.affected_count === 'number' ? metadata.affected_count : null;
  const showAffectedCount = affectedCount !== null && log?.event_code !== 'permission_group.matrix.updated';
  const maskedIp = maskIp(log?.ip_address || null);
  const actorDisplayName = detail?.actor_display_name || log?.actor_username || t('auditLogs.unknownActor');
  const actorEmail = detail?.actor_email || null;
  const subjectDisplayName = detail?.subject_display_name || null;
  const subjectUsername = detail?.subject_username || null;
  const subjectEmail = detail?.subject_email || null;
  const subjectRole = detail?.subject_role || null;
  const hasDeletedUserSnapshot = Boolean(subjectDisplayName || subjectUsername || subjectEmail || subjectRole);

  return (
    <Sheet open={Boolean(log)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {log && <>
          <SheetHeader className="border-b border-border/70 pr-12">
            <SheetTitle>{t('auditLogs.detailTitle')}</SheetTitle>
            <SheetDescription>{eventSummary(log, t)}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 p-4">
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3.5 text-sm">
              <p className="font-medium text-foreground">{log.entity_name || log.entity_id || t('auditLogs.unknownEntity')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{entityTypeLabel} · {formatDate(log.created_at, locale)}</p>
            </div>

            {(courseName || componentType || parentName || relatedName || fileName || showAffectedCount) && <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('auditLogs.context')}</p>
              <div className="space-y-2 rounded-xl border border-border/70 p-3.5 text-sm">
                {courseName && <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.course')}</span><span className="text-right font-medium">{courseName}</span></div>}
                {componentType && <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.componentType')}</span><span className="text-right font-medium">{componentTypeLabel}</span></div>}
                {parentName && <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.parent')}</span><span className="text-right font-medium">{parentName}</span></div>}
                {relatedName && <div className="flex justify-between gap-4"><span className="text-muted-foreground">{relatedType ? translateEntityType(relatedType, t) : t('auditLogs.relatedEntity')}</span><span className="text-right font-medium">{relatedName}</span></div>}
                {fileName && <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.file')}</span><span className="max-w-[60%] text-right font-medium">{fileName}{fileSize ? ` (${fileSize})` : ''}</span></div>}
                {showAffectedCount && <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.affectedCount')}</span><span className="text-right font-medium">{affectedCount}</span></div>}
              </div>
            </section>}

            {(log.changes?.length || 0) > 0 && <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('auditLogs.changes')}</p>
              <div className="overflow-hidden rounded-xl border border-border/70">
                {log.changes!.map((change, index) => (
                  <div key={`${change.field}-${index}`} className={`p-3.5 text-sm ${index > 0 ? 'border-t border-border/70' : ''}`}>
                    <p className="mb-2 font-medium">{t(`auditLogs.changeFields.${change.field}`, { defaultValue: change.field.split('_').join(' ') })}</p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                      <span className="truncate rounded-md bg-muted px-2 py-1.5 text-muted-foreground">{displayAuditValue(change.before, t, change.field)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="truncate rounded-md bg-primary/10 px-2 py-1.5 font-medium text-foreground">{displayAuditValue(change.after, t, change.field)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>}

            {!log.event_code && log.details && <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('auditLogs.legacyDetail')}</p>
              <p className="rounded-xl border border-border/70 bg-muted/25 p-3.5 text-sm leading-6 text-foreground">{log.details}</p>
            </section>}

            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('auditLogs.actor')}</p>
              <div className="space-y-2 rounded-xl border border-border/70 p-3.5 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.displayName')}</span><span className="max-w-[62%] break-words text-right font-medium text-foreground">{isLoadingDetail ? <Skeleton className="ml-auto h-4 w-28" /> : actorDisplayName}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.username')}</span><span className="max-w-[62%] break-all text-right font-medium text-foreground">{log.actor_username || t('auditLogs.unknownActor')}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.email')}</span><span className="max-w-[62%] break-all text-right font-medium text-foreground">{isLoadingDetail ? <Skeleton className="ml-auto h-4 w-36" /> : actorEmail || t('auditLogs.actorEmailUnavailable')}</span></div>
              </div>
            </section>

            {hasDeletedUserSnapshot && <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('auditLogs.deletedAccount')}</p>
              <div className="space-y-2 rounded-xl border border-destructive/20 bg-destructive/[0.035] p-3.5 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.displayName')}</span><span className="max-w-[62%] break-words text-right font-medium text-foreground">{isLoadingDetail ? <Skeleton className="ml-auto h-4 w-28" /> : subjectDisplayName || t('auditLogs.values.empty')}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.username')}</span><span className="max-w-[62%] break-all text-right font-medium text-foreground">{isLoadingDetail ? <Skeleton className="ml-auto h-4 w-24" /> : subjectUsername ? `@${subjectUsername}` : t('auditLogs.values.empty')}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.email')}</span><span className="max-w-[62%] break-all text-right font-medium text-foreground">{isLoadingDetail ? <Skeleton className="ml-auto h-4 w-36" /> : subjectEmail || t('auditLogs.values.empty')}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('auditLogs.role')}</span><span className="max-w-[62%] break-words text-right font-medium text-foreground">{isLoadingDetail ? <Skeleton className="ml-auto h-4 w-20" /> : subjectRole || t('auditLogs.values.empty')}</span></div>
              </div>
            </section>}

            <section className="space-y-2 text-xs text-muted-foreground">
              {maskedIp && <p>{t('auditLogs.ipAddress')}: <span className="font-medium text-foreground">{maskedIp}</span></p>}
            </section>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}

export default function AuditLogsPage() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  useHeaderInfo(t('auditLogs.title'));
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const auditViewerId = useAuthStore((state) => state.user?.id ?? null);
  const auditViewerRole = useAuthStore((state) => state.user?.role ?? null);
  const activeTenantId = useTenantStore((state) => state.activeTenantId);

  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [actionFilter, setActionFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [limit, setLimit] = useState(20);
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  const [auditScope, setAuditScope] = useState<'tenant' | 'platform'>('tenant');
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeCursor = cursorStack[cursorIndex] || undefined;
  const dateFrom = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
  const dateTo = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined;
  const resetCursor = () => { setCursorStack([null]); setCursorIndex(0); };

  useEffect(() => {
    setMounted(true);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  useEffect(() => { resetCursor(); }, [debouncedSearch, actionFilter, dateFrom, dateTo, activeTenantId, limit, auditViewerId, auditViewerRole, auditScope]);
  useEffect(() => { setSelectedLog(null); }, [activeTenantId, auditViewerId, auditViewerRole, auditScope]);
  useEffect(() => {
    if (auditViewerRole !== 'superadmin' && auditScope === 'platform') setAuditScope('tenant');
  }, [auditScope, auditViewerRole]);

  const { data: apiData, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'audit-logs-cursor',
      auditViewerId,
      auditViewerRole,
      activeTenantId,
      activeCursor,
      limit,
      debouncedSearch,
      actionFilter,
      dateFrom,
      dateTo,
      auditScope,
    ],
    queryFn: () => getAuditLogs({
      page_size: limit,
      cursor: activeCursor,
      search: debouncedSearch || undefined,
      action: actionFilter !== 'all' ? actionFilter : undefined,
      date_from: dateFrom,
      date_to: dateTo,
      scope: auditScope === 'platform' ? 'platform' : undefined,
    }),
    enabled: mounted && !isLoggingOut && Boolean(auditViewerId && auditViewerRole),
    staleTime: 30_000,
  });

  const { data: selectedDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['audit-log-detail', auditViewerId, auditViewerRole, activeTenantId, auditScope, selectedLog?.id],
    queryFn: () => getAuditLogDetail(selectedLog!.id, auditScope === 'platform' ? 'platform' : undefined),
    enabled: Boolean(selectedLog?.id && auditViewerId && auditViewerRole),
    staleTime: 0,
    gcTime: 0,
  });

  const activities = useMemo(() => apiData?.results || [], [apiData?.results]);
  const groupedByDate = useMemo(() => activities.reduce<Record<string, AuditLog[]>>((groups, log) => {
    const key = formatLocaleDate(log.created_at, locale, { month: 'short', day: 'numeric', year: 'numeric' });
    (groups[key] ||= []).push(log);
    return groups;
  }, {}), [activities, locale]);

  const handleRefresh = () => {
    if (refreshCooldown > 0) return;
    void refetch();
    toast.success(t('auditLogs.refreshed'));
    setRefreshCooldown(5);
    cooldownRef.current = setInterval(() => setRefreshCooldown((value) => {
      if (value <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); cooldownRef.current = null; return 0; }
      return value - 1;
    }), 1000);
  };

  const handleNext = () => {
    if (!apiData?.next_cursor) return;
    setCursorStack((stack) => [...stack.slice(0, cursorIndex + 1), apiData.next_cursor!]);
    setCursorIndex((index) => index + 1);
  };

  if (!mounted || isLoggingOut) return null;

  const filters = [{
    key: 'action',
    placeholder: t('auditLogs.actions'),
    options: [
      { value: 'CREATE', label: t('auditLogs.create') },
      { value: 'UPDATE', label: t('auditLogs.update') },
      { value: 'DELETE', label: t('auditLogs.delete') },
      { value: 'LOGIN', label: t('auditLogs.login') },
      { value: 'LOGOUT', label: t('auditLogs.logout') },
    ],
  }];
  const retentionDays = apiData?.retention_days || 30;
  const hasActiveFilters = Boolean(search || actionFilter !== 'all' || dateRange?.from || dateRange?.to);
  const dateRangeLabel = dateRange?.from
    ? `${formatLocaleDate(dateRange.from, locale, { month: 'short', day: 'numeric' })}${dateRange.to ? ` – ${formatLocaleDate(dateRange.to, locale, { month: 'short', day: 'numeric' })}` : ''}`
    : t('auditLogs.dateRange');
  const resetFilters = () => {
    setSearch('');
    setActionFilter('all');
    setDateRange(undefined);
  };

  const renderLogRow = (log: AuditLog, index: number) => {
    const visual = actionVisual(log.action);
    const maskedIp = maskIp(log.ip_address);
    const contextPreview = auditContextPreview(log, t);
    const changePreview = auditChangePreview(log, t);
    return (
      <button key={log.id} type="button" onClick={() => setSelectedLog(log)} className={`flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none ${index !== activities.length - 1 ? 'border-b border-border/70' : ''}`}>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${visual.className}`}><visual.Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{eventSummary(log, t)}</p>
          {(contextPreview || changePreview) && <p className="mt-1 truncate text-xs text-muted-foreground">{[contextPreview, changePreview].filter(Boolean).join(' · ')}</p>}
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{formatDate(log.created_at, locale)} · {getRelativeTime(log.created_at, locale, t)}{maskedIp && <span className="ml-1">· {maskedIp}</span>}</p>
        </div>
        <span className="hidden rounded-md border border-border/70 px-2 py-1 text-[11px] font-medium text-muted-foreground sm:inline">{t('auditLogs.viewDetail')}</span>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-10 sm:space-y-5 sm:p-6">
      <PageHeader icon={Activity} title={t('auditLogs.title')} description={t('auditLogs.description')} />

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/55 shadow-sm">
        <div className="flex flex-col gap-2.5 p-3 sm:p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex w-fit rounded-lg border border-border/60 bg-muted/50 p-0.5" role="tablist" aria-label={t('auditLogs.title')}>
            <button type="button" role="tab" aria-selected={viewMode === 'table'} onClick={() => setViewMode('table')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('auditLogs.table')}</button>
            <button type="button" role="tab" aria-selected={viewMode === 'timeline'} onClick={() => setViewMode('timeline')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === 'timeline' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('auditLogs.timeline')}</button>
          </div>
            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
              {auditViewerRole === 'superadmin' && <Select value={auditScope} onValueChange={(value) => setAuditScope(value as 'tenant' | 'platform')}><SelectTrigger className="h-9 min-w-0 flex-1 text-xs sm:w-[156px] sm:flex-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tenant">{t('auditLogs.tenantScope')}</SelectItem><SelectItem value="platform">{t('auditLogs.platformScope')}</SelectItem></SelectContent></Select>}
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshCooldown > 0} className="h-9 flex-1 gap-2 px-3 text-[13px] sm:flex-none"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />{refreshCooldown > 0 ? `${refreshCooldown}s` : t('auditLogs.refresh')}</Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-border/60 pt-2.5 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('auditLogs.searchPlaceholder')} className="h-9 border-border/60 bg-muted/35 pl-9 text-sm shadow-none placeholder:text-muted-foreground/55 focus-visible:bg-background" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-[148px]"><SelectValue placeholder={t('auditLogs.actions')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('table.all', { label: t('auditLogs.actions') })}</SelectItem>
                  {filters[0].options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger className={`flex h-9 w-full items-center justify-center rounded-lg border px-3 text-xs font-medium transition sm:w-auto sm:min-w-[136px] ${dateRange?.from ? 'border-primary/35 bg-primary/5 text-foreground' : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'}`}>{dateRangeLabel}</PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end"><Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} disabled={{ before: subDays(new Date(), 29), after: new Date() }} /></PopoverContent>
              </Popover>
              {hasActiveFilters && <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1.5 px-3 text-xs text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" />{t('table.resetFilters')}</Button>}
            </div>
          </div>
        </div>
        <div className="flex min-h-9 items-center gap-2 border-t border-primary/15 bg-primary/[0.035] px-3.5 py-2 text-xs text-muted-foreground sm:px-4">
          <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p>{t('auditLogs.retentionNotice', { count: retentionDays })}</p>
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {viewMode === 'table' ? (
          <div className={isFetching && activities.length ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'}>
            {isLoading && !activities.length ? [1, 2, 3, 4, 5].map((item) => <div key={item} className="flex gap-4 border-b border-border/70 p-4"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-2/5" /></div></div>) : !activities.length ? <div className="p-12 text-center"><Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" /><p className="font-medium">{t('auditLogs.emptyTitle')}</p><p className="mt-1 text-sm text-muted-foreground">{t('auditLogs.emptyDescription')}</p></div> : activities.map(renderLogRow)}
          </div>
        ) : (
          <div className="max-h-[560px] overflow-y-auto p-5 sm:p-6">
            {!activities.length && !isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">{t('auditLogs.emptyTitle')}</div> : Object.entries(groupedByDate).map(([date, logs]) => <section key={date} className="mb-6 last:mb-0"><div className="mb-3 flex items-center gap-3"><span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{date}</span><div className="h-px flex-1 bg-border/70" /></div><div className="relative ml-2 border-l border-border/70 pl-5">{logs.map((log) => { const visual = actionVisual(log.action); const contextPreview = auditContextPreview(log, t); const changePreview = auditChangePreview(log, t); return <button key={log.id} type="button" onClick={() => setSelectedLog(log)} className="relative mb-4 block w-full text-left last:mb-0"><span className={`absolute -left-[25px] top-1.5 h-3 w-3 rounded-full border-[3px] border-card ${visual.dot}`} /><p className="text-sm font-medium text-foreground">{eventSummary(log, t)}</p>{(contextPreview || changePreview) && <p className="mt-1 truncate text-xs text-muted-foreground">{[contextPreview, changePreview].filter(Boolean).join(' · ')}</p>}<p className="mt-1 text-xs text-muted-foreground">{formatLocaleDate(log.created_at, locale, { hour: 'numeric', minute: '2-digit' })}</p></button>; })}</div></section>)}
          </div>
        )}
        {activities.length > 0 && <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm text-muted-foreground"><span>{t('auditLogs.rowsPerPage')}</span><Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}><SelectTrigger className="h-8 w-16 bg-card"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select><span className="hidden sm:inline">{t('auditLogs.page', { count: cursorIndex + 1 })}</span></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={cursorIndex === 0} onClick={() => setCursorIndex((index) => Math.max(0, index - 1))} className="h-8 gap-1.5"><ChevronLeft className="h-3.5 w-3.5" />{t('auditLogs.previous')}</Button><Button variant="outline" size="sm" disabled={!apiData?.has_more} onClick={handleNext} className="h-8 gap-1.5">{t('auditLogs.next')}<ChevronRight className="h-3.5 w-3.5" /></Button></div></div>}
      </div>
      <AuditDetailSheet log={selectedLog} detail={selectedDetail} isLoadingDetail={isLoadingDetail} onOpenChange={(open) => { if (!open) setSelectedLog(null); }} />
    </div>
  );
}
