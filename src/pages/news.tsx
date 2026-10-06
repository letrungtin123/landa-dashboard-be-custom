import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Newspaper,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { archiveNewsPost, getManagedNews, restoreNewsPost, type NewsPostSummary, type NewsStatus } from '@/api/custom-news';
import { NewsEditorDialog } from '@/components/news/NewsEditorDialog';
import { PageHeader } from '@/components/shared/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHeaderInfo } from '@/utils/header-store';
import { formatLocaleDate } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { getLocalizedApiError } from '@/utils/localized-error';
import { storageUrl } from '@/utils/storage-url';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';

function NewsCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <Skeleton className="aspect-[16/8] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  );
}

export default function NewsManagementPage() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const activeTenantId = useTenantStore((state) => state.activeTenantId);
  const tenantScope = activeTenantId || user?.tenant_id || null;
  const [status, setStatus] = useState<NewsStatus>('active');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);
  const [cursorScope, setCursorScope] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [confirmPost, setConfirmPost] = useState<NewsPostSummary | null>(null);

  useHeaderInfo(t('news.title'));

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const paginationScope = `${tenantScope || ''}:${status}:${search}:${pageSize}`;
  const effectivePageIndex = cursorScope === paginationScope ? pageIndex : 0;
  const currentPageCursor = cursorScope === paginationScope ? pageCursors[effectivePageIndex] : undefined;

  useEffect(() => {
    setPageIndex(0);
    setPageCursors([undefined]);
    setCursorScope(paginationScope);
  }, [paginationScope]);

  const canAdd = hasPermission('news', 'can_add');
  const canEdit = hasPermission('news', 'can_edit');
  const canDelete = hasPermission('news', 'can_delete');

  const newsQuery = useQuery({
    queryKey: ['news-manage', tenantScope, status, search, pageSize, currentPageCursor || null],
    queryFn: () => getManagedNews({
      cursor: currentPageCursor,
      limit: pageSize,
      search: search || undefined,
      status,
    }),
    enabled: Boolean(tenantScope),
    staleTime: 20_000,
  });

  const posts = useMemo(() => newsQuery.data?.results || [], [newsQuery.data]);

  const goToNextPage = () => {
    const nextCursor = newsQuery.data?.next_cursor;
    if (!nextCursor) return;
    setPageCursors((current) => {
      const next = current.slice(0, effectivePageIndex + 1);
      next[effectivePageIndex + 1] = nextCursor;
      return next;
    });
    setPageIndex(effectivePageIndex + 1);
  };

  const paginationPageIndexes = useMemo(() => {
    const loadedPageCount = cursorScope === paginationScope ? pageCursors.length : 1;
    const knownPageCount = Math.max(
      loadedPageCount,
      effectivePageIndex + 1 + (newsQuery.data?.has_more ? 1 : 0),
    );
    return Array.from({ length: knownPageCount }, (_, index) => index)
      .filter((index) => index === 0 || index === knownPageCount - 1 || Math.abs(index - effectivePageIndex) <= 1);
  }, [cursorScope, effectivePageIndex, newsQuery.data?.has_more, pageCursors.length, paginationScope]);

  const archiveMutation = useMutation({
    mutationFn: (post: NewsPostSummary) => (
      post.archived_at ? restoreNewsPost(post.id) : archiveNewsPost(post.id)
    ),
    onSuccess: async (_result, post) => {
      toast.success(t(post.archived_at ? 'news.restored' : 'news.archived'));
      setConfirmPost(null);
      await queryClient.invalidateQueries({ queryKey: ['news-manage'] });
    },
    onError: (error: unknown) => toast.error(getLocalizedApiError(error, t('news.statusUpdateFailed'))),
  });

  const openCreate = () => {
    setEditingPostId(null);
    setEditorOpen(true);
  };

  const openEdit = (postId: string) => {
    setEditingPostId(postId);
    setEditorOpen(true);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-primary/[0.035] via-background to-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          icon={Newspaper}
          title={t('news.title')}
          description={t('news.description')}
          actions={canAdd ? (
            <Button onClick={openCreate} className="rounded-xl shadow-sm">
              <Plus className="mr-1.5 h-4 w-4" /> {t('news.create')}
            </Button>
          ) : undefined}
        />

        <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/90 p-3 shadow-[0_10px_30px_-24px_hsl(var(--foreground)/0.35)] backdrop-blur sm:grid-cols-[auto_minmax(280px,420px)] sm:items-center sm:justify-between">
          <Tabs value={status} onValueChange={(value) => setStatus(value as NewsStatus)} className="w-full sm:w-auto">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted/70 p-1 sm:inline-grid sm:w-auto">
              <TabsTrigger
                value="active"
                className="h-9 min-w-36 rounded-lg px-4 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <Newspaper className="h-4 w-4" />{t('news.active')}
              </TabsTrigger>
              <TabsTrigger
                value="archived"
                className="h-9 min-w-32 rounded-lg px-4 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                <Archive className="h-4 w-4" />{t('news.archive')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary/70" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('news.searchPlaceholder')}
              className="h-11 rounded-xl border-border/70 bg-background pl-10 pr-10 shadow-none transition-[border-color,box-shadow] focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/10"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label={t('news.clearSearch')}
                className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {!tenantScope ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            {t('news.selectTenant')}
          </div>
        ) : newsQuery.isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <NewsCardSkeleton key={index} />)}
          </div>
        ) : newsQuery.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-12 text-center">
            <p className="font-medium text-destructive">{t('news.loadFailed')}</p>
            <Button variant="outline" onClick={() => newsQuery.refetch()}>{t('common.retry')}</Button>
          </div>
        ) : posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 px-6 py-20 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {status === 'archived' ? <Archive className="h-7 w-7" /> : <Newspaper className="h-7 w-7" />}
            </div>
            <h3 className="text-base font-semibold">{t(search ? 'news.noSearchResults' : 'news.emptyTitle')}</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t(search ? 'news.tryAnotherSearch' : 'news.emptyDescription')}</p>
            {canAdd && status === 'active' && !search && (
              <Button onClick={openCreate} variant="outline" className="mt-5 rounded-xl">
                <Plus className="mr-1.5 h-4 w-4" /> {t('news.createFirst')}
              </Button>
            )}
          </motion.div>
        ) : (
          <>
            <motion.div layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {posts.map((post, index) => (
                  <motion.article
                    layout
                    key={post.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.24, delay: Math.min(index, 8) * 0.025 }}
                    className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-lg"
                  >
                    <div className="relative aspect-[16/8] overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-muted">
                      {post.preview_image_path ? (
                        <img
                          src={storageUrl(post.preview_image_path)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center"><Newspaper className="h-10 w-10 text-primary/35" /></div>
                      )}
                      {post.archived_at && (
                        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
                          {t('news.archivedBadge')}
                        </span>
                      )}
                    </div>
                    <div className="flex min-h-52 flex-col p-5">
                      <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-foreground">{post.title}</h2>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {post.excerpt || t('news.noExcerpt')}
                      </p>
                      <div className="mt-auto flex items-center gap-1.5 pt-5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatLocaleDate(post.archived_at || post.created_at, locale, { dateStyle: 'medium' })}
                      </div>
                      <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4">
                        {canEdit && (
                          <Button variant="outline" size="sm" onClick={() => openEdit(post.id)} className="rounded-lg">
                            <Edit3 className="mr-1.5 h-3.5 w-3.5" /> {t('common.edit')}
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="sm" onClick={() => setConfirmPost(post)} className="ml-auto rounded-lg">
                            {post.archived_at
                              ? <><ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />{t('news.restore')}</>
                              : <><Archive className="mr-1.5 h-3.5 w-3.5" />{t('news.archiveAction')}</>}
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </motion.div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={effectivePageIndex === 0 || newsQuery.isFetching} onClick={() => setPageIndex(Math.max(0, effectivePageIndex - 1))} className="h-9 w-9 rounded-lg bg-card" aria-label={t('news.previous')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {paginationPageIndexes.map((index, position) => (
                  <span key={index} className="contents">
                    {position > 0 && paginationPageIndexes[position - 1] !== index - 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
                    <Button
                      variant={index === effectivePageIndex ? 'default' : 'outline'}
                      size="icon"
                      disabled={newsQuery.isFetching}
                      onClick={() => index === effectivePageIndex + 1 ? goToNextPage() : setPageIndex(index)}
                      className="h-9 w-9 rounded-lg text-sm data-[disabled]:opacity-50"
                      aria-current={index === effectivePageIndex ? 'page' : undefined}
                    >
                      {index + 1}
                    </Button>
                  </span>
                ))}
                <Button variant="outline" size="icon" disabled={!newsQuery.data?.has_more || newsQuery.isFetching} onClick={goToNextPage} className="h-9 w-9 rounded-lg bg-card" aria-label={t('news.next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="mx-2 hidden h-8 w-px bg-border sm:block" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t('news.show')}</span>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="h-9 w-[70px] rounded-lg bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
      </div>

      <NewsEditorDialog open={editorOpen} postId={editingPostId} onOpenChange={setEditorOpen} />

      <AlertDialog open={Boolean(confirmPost)} onOpenChange={(open) => !open && setConfirmPost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(confirmPost?.archived_at ? 'news.restoreConfirmTitle' : 'news.archiveConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(confirmPost?.archived_at ? 'news.restoreConfirmDescription' : 'news.archiveConfirmDescription', { title: confirmPost?.title || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmPost && archiveMutation.mutate(confirmPost)} disabled={archiveMutation.isPending}>
              {archiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(confirmPost?.archived_at ? 'news.restore' : 'news.archiveAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
