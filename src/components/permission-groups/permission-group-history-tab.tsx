import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Trans, useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  CalendarDays, ChevronLeft, ChevronRight, History, Loader2, RefreshCw,
  Search, ShieldCheck, UserRound, Users,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  fetchPermissionGroupHistory,
  fetchPermissionGroupHistoryDetail,
  type PermissionGroupHistoryAction,
  type PermissionGroupHistoryDetail,
  type PermissionGroupHistoryListItem,
  type PermissionMatrixHistorySnapshot,
} from '@/api/custom-permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getModuleDisplayName } from '@/utils/module-labels';
import { formatLocaleDate } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { useTenantStore } from '@/utils/tenant-store';

const PAGE_SIZES = [10, 20, 50, 100];

function actionTone(action: PermissionGroupHistoryAction): string {
  if (action === 'deleted' || action === 'member_removed') return 'bg-destructive/10 text-destructive border-destructive/20';
  if (action === 'created' || action === 'members_assigned') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  return 'bg-primary/10 text-primary border-primary/20';
}

function formatDateParam(value: Date | undefined): string | undefined {
  return value ? format(value, 'yyyy-MM-dd') : undefined;
}

function SnapshotMatrix({ matrix, title }: { matrix: PermissionMatrixHistorySnapshot[]; title: string }) {
  const { t } = useTranslation();
  const actions = [
    ['can_view', t('permissionGroups.actions.view')],
    ['can_add', t('permissionGroups.actions.add')],
    ['can_edit', t('permissionGroups.actions.edit')],
    ['can_delete', t('permissionGroups.actions.delete')],
  ] as const;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Badge variant="outline" className="text-[10px] rounded-full">{matrix.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-44">{t('permissionGroups.features')}</TableHead>
              {actions.map(([, label]) => <TableHead key={label} className="text-center min-w-16 text-[11px]">{label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.map((permission) => (
              <TableRow key={permission.module_code}>
                <TableCell className="text-xs font-medium whitespace-nowrap">
                  {getModuleDisplayName(permission.module_code, permission.module_name)}
                </TableCell>
                {actions.map(([key]) => (
                  <TableCell key={key} className="text-center">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${permission[key] ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground/40'}`}>
                      {permission[key] ? '✓' : '–'}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function HistoryDetailDialog({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const [detail, setDetail] = useState<PermissionGroupHistoryDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setDetail(null); return; }
    let active = true;
    setLoading(true);
    fetchPermissionGroupHistoryDetail(id)
      .then((value) => { if (active) setDetail(value); })
      .catch(() => { if (active) toast.error(t('permissionGroups.history.detailLoadFailed')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, t]);

  const beforeMatrix = detail?.before_state?.matrix || [];
  const afterMatrix = detail?.after_state?.matrix || [];
  const actionKey = detail ? `permissionGroups.history.actions.${detail.action}` : '';

  return (
    <Dialog open={Boolean(id)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto rounded-2xl p-0 gap-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> {t('permissionGroups.history.detailTitle')}
          </DialogTitle>
          <DialogDescription className="truncate">
            {detail ? `${t(actionKey)} · ${detail.permission_group_name} · ${formatLocaleDate(detail.created_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}` : t('common.loading')}
          </DialogDescription>
        </DialogHeader>

        {loading || !detail ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('permissionGroups.history.actor')}</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{detail.actor_display_name || detail.actor_username}</p>
                    <p className="truncate text-xs text-muted-foreground">{detail.actor_username}</p>
                    {detail.actor_email && <p className="truncate text-xs text-muted-foreground">{detail.actor_email}</p>}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('permissionGroups.groupName')}</p>
                <p className="text-sm font-semibold">{detail.permission_group_name}</p>
                <Badge variant="outline" className={`mt-2 text-[10px] ${actionTone(detail.action)}`}>{t(actionKey)}</Badge>
              </div>
            </section>

            {(detail.before_state || detail.after_state) && (
              <section className="grid gap-3 sm:grid-cols-2">
                {detail.before_state && (
                  <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('permissionGroups.history.groupBefore')}</p>
                    <p className="truncate text-sm font-semibold">{detail.before_state.group.name}</p>
                    {detail.before_state.group.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail.before_state.group.description}</p>}
                  </div>
                )}
                {detail.after_state && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.035] p-4">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('permissionGroups.history.groupAfter')}</p>
                    <p className="truncate text-sm font-semibold">{detail.after_state.group.name}</p>
                    {detail.after_state.group.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail.after_state.group.description}</p>}
                  </div>
                )}
              </section>
            )}

            {detail.participants.length > 0 && (
              <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
                <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h4 className="text-sm font-semibold">{t('permissionGroups.history.affectedMembers')}</h4></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {detail.participants.map((participant) => (
                    <div key={`${participant.change}-${participant.user_id}`} className="rounded-xl border border-border/50 bg-background/50 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{participant.display_name || participant.username}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{participant.username}{participant.email ? ` · ${participant.email}` : ''}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[9px]">{t(`permissionGroups.history.memberChanges.${participant.change}`)}</Badge>
                      </div>
                      {participant.previous_group_name && participant.change !== 'removed' && <p className="mt-1 text-[10px] text-muted-foreground">{t('permissionGroups.history.previousGroup', { group: participant.previous_group_name })}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {beforeMatrix.length > 0 && <SnapshotMatrix matrix={beforeMatrix} title={t('permissionGroups.history.matrixBefore')} />}
            {afterMatrix.length > 0 && <SnapshotMatrix matrix={afterMatrix} title={beforeMatrix.length > 0 ? t('permissionGroups.history.matrixAfter') : t('permissionGroups.history.matrixAtEvent')} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PermissionGroupHistoryTab() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const activeTenantId = useTenantStore((state) => state.activeTenantId);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [pageSize, setPageSize] = useState(20);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [items, setItems] = useState<PermissionGroupHistoryListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const resetPagination = useCallback(() => {
    setCursorStack([null]);
    setPageIndex(0);
  }, []);

  const from = formatDateParam(dateRange?.from);
  const to = formatDateParam(dateRange?.to || dateRange?.from);
  useEffect(() => { resetPagination(); }, [activeTenantId, search, from, to, pageSize, resetPagination]);

  const cursor = cursorStack[pageIndex] || null;
  useEffect(() => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    fetchPermissionGroupHistory({ cursor, page_size: pageSize, search: search || undefined, from: from || undefined, to: to || undefined })
      .then((result) => {
        if (requestId !== latestRequest.current) return;
        setItems(result.data);
        setTotal(result.total);
        setHasMore(result.has_more);
        setNextCursor(result.next_cursor);
      })
      .catch(() => {
        if (requestId !== latestRequest.current) return;
        setItems([]);
        setTotal(0);
        setHasMore(false);
        setNextCursor(null);
        toast.error(t('permissionGroups.history.loadFailed'));
      })
      .finally(() => { if (requestId === latestRequest.current) setLoading(false); });
  }, [activeTenantId, cursor, from, pageSize, refreshVersion, search, t, to]);

  const empty = !loading && items.length === 0;
  const actionLabel = useCallback((action: PermissionGroupHistoryAction) => t(`permissionGroups.history.actions.${action}`), [t]);
  const rangeStart = items.length > 0 ? pageIndex * pageSize + 1 : 0;
  const rangeEnd = items.length > 0 ? rangeStart + items.length - 1 : 0;
  const visiblePages = useMemo(() => {
    const current = pageIndex + 1;
    const pages = new Set<number>([1, current]);
    if (current > 2) pages.add(current - 1);
    if (hasMore && nextCursor) pages.add(current + 1);
    return [...pages].sort((left, right) => left - right);
  }, [hasMore, nextCursor, pageIndex]);

  function goNext() {
    if (!hasMore || !nextCursor) return;
    setCursorStack((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
  }

  function goToPage(targetIndex: number) {
    if (targetIndex === pageIndex || targetIndex < 0) return;
    if (targetIndex < cursorStack.length) {
      setPageIndex(targetIndex);
      return;
    }
    if (targetIndex === pageIndex + 1) goNext();
  }

  function refresh() {
    setRefreshVersion((value) => value + 1);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1 xl:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/55" />
            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t('permissionGroups.history.searchPlaceholder')} className="h-10 rounded-xl border-border/60 bg-background pl-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Popover>
              <PopoverTrigger className={`flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium transition sm:min-w-56 ${dateRange?.from ? 'border-primary/35 bg-primary/5 text-foreground' : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'}`}>
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{dateRange?.from ? `${formatLocaleDate(dateRange.from, locale, { dateStyle: 'medium' })}${dateRange.to ? ` – ${formatLocaleDate(dateRange.to, locale, { dateStyle: 'medium' })}` : ''}` : t('permissionGroups.history.dateRange')}</span>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center justify-end gap-2 xl:ml-auto">
            <Button type="button" variant="outline" size="sm" onClick={refresh} className="h-10 rounded-xl gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{t('permissionGroups.history.refresh')}</Button>
          </div>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border/60 bg-card/60 md:block">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>{t('permissionGroups.history.action')}</TableHead><TableHead>{t('permissionGroups.groupName')}</TableHead><TableHead>{t('permissionGroups.history.actor')}</TableHead><TableHead className="text-right">{t('permissionGroups.history.time')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 6 }).map((_, index) => <TableRow key={index}><TableCell colSpan={4}><Skeleton className="h-7 w-full rounded-lg" /></TableCell></TableRow>) : items.map((item) => (
              <TableRow key={item.id} onClick={() => setDetailId(item.id)} className="cursor-pointer transition-colors hover:bg-primary/5">
                <TableCell><Badge variant="outline" className={`text-[10px] ${actionTone(item.action)}`}>{actionLabel(item.action)}</Badge></TableCell>
                <TableCell className="max-w-48 truncate text-xs font-semibold">{item.permission_group_name}</TableCell>
                <TableCell><div className="max-w-48"><p className="truncate text-xs font-medium">{item.actor_display_name || item.actor_username}</p><p className="truncate text-[11px] text-muted-foreground">{item.actor_username}</p></div></TableCell>
                <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{formatLocaleDate(item.created_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {loading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />) : items.map((item, index) => (
          <motion.button key={item.id} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} onClick={() => setDetailId(item.id)} className="w-full rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-primary/30">
            <div className="flex items-start justify-between gap-2"><Badge variant="outline" className={`text-[10px] ${actionTone(item.action)}`}>{actionLabel(item.action)}</Badge><span className="text-[10px] text-muted-foreground">{formatLocaleDate(item.created_at, locale, { dateStyle: 'short', timeStyle: 'short' })}</span></div>
            <p className="mt-2 truncate text-sm font-semibold">{item.permission_group_name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.actor_display_name || item.actor_username}</p>
          </motion.button>
        ))}
      </div>

      {empty && <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 p-8 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><History className="h-5 w-5" /></div><p className="text-sm font-semibold">{t('permissionGroups.history.emptyTitle')}</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">{t('permissionGroups.history.emptyDescription')}</p></div>}

      {(loading || total !== 0) && <div className="flex flex-col gap-3 border-t border-border/50 bg-muted/[0.16] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>{t('pagination.rowsPerPage')}</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[65px] rounded-xl border-border/60 bg-background text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {total === null ? <Skeleton className="h-4 w-52 rounded" /> : (
            <p className="text-xs sm:text-sm">
              <Trans
                i18nKey="pagination.showing"
                values={{ start: rangeStart, end: rangeEnd, total, label: t('permissionGroups.history.records') }}
                components={{ accent: <span className="font-semibold text-foreground" /> }}
              />
            </p>
          )}
        </div>
        <nav className="flex items-center gap-2 self-end sm:self-auto" aria-label={t('permissionGroups.history.paginationLabel')}>
          <Button variant="ghost" size="icon" className="pagination-page-button h-8 w-8 text-muted-foreground" aria-label={t('common.previous')} disabled={pageIndex === 0 || loading} onClick={() => goToPage(pageIndex - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-2">
            {visiblePages.map((pageNumber, index) => (
              <span key={pageNumber} className="contents">
                {index > 0 && visiblePages[index - 1] !== pageNumber - 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
                <Button
                  variant={pageNumber === pageIndex + 1 ? 'default' : 'ghost'}
                  size="icon"
                  className={`h-8 w-8 text-xs ${pageNumber === pageIndex + 1 ? 'pagination-page-active font-bold' : 'pagination-page-button text-muted-foreground'}`}
                  aria-current={pageNumber === pageIndex + 1 ? 'page' : undefined}
                  disabled={loading || (pageNumber > pageIndex + 2)}
                  onClick={() => goToPage(pageNumber - 1)}
                >{pageNumber}</Button>
              </span>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="pagination-page-button h-8 w-8 text-muted-foreground" aria-label={t('common.next')} disabled={!hasMore || !nextCursor || loading} onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
        </nav>
      </div>}

      <HistoryDetailDialog id={detailId} onOpenChange={(open) => { if (!open) setDetailId(null); }} />
    </div>
  );
}
