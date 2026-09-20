import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Percent, Search, Users } from 'lucide-react';
import { ResponsiveContainer, Bar, BarChart, Cell, LabelList, Tooltip as ReTooltip, XAxis, YAxis } from 'recharts';
import { getReportCourseCompletionLearners, getReportCourseCompletionRanking, type ReportCourseCompletionRanking, type ReportCourseCompletionStatus } from '@/api/custom-reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AppTooltip } from '@/components/ui/tooltip';
import { formatLocaleDate, formatLocaleNumber } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { useTranslation } from 'react-i18next';

const REPORT_PAGE_SIZE_OPTIONS = [5, 10, 15, 20] as const;
const softPageTransition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };
const paginatedListVariants = { hidden: { opacity: 0, y: 6, filter: 'blur(2px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...softPageTransition, staggerChildren: 0.018 } }, exit: { opacity: 0, y: -6, filter: 'blur(2px)', transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const } } };
const paginatedRowVariants = { hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: softPageTransition }, exit: { opacity: 0, y: -4, transition: { duration: 0.12 } } };
function ReportPageSizeDropdown({
  value,
  onChange,
  contentClassName,
}: {
  value: (typeof REPORT_PAGE_SIZE_OPTIONS)[number];
  onChange: (value: (typeof REPORT_PAGE_SIZE_OPTIONS)[number]) => void;
  contentClassName?: string;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="app-liquid-field inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/80 px-2.5 text-[11px] font-bold text-foreground shadow-sm outline-none transition-all hover:bg-muted focus-visible:ring-1 focus-visible:ring-border">
        <span>{value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={`w-[72px] rounded-lg border-border bg-popover p-1 shadow-xl ${contentClassName ?? ''}`}
      >
        {REPORT_PAGE_SIZE_OPTIONS.map(size => {
          const active = value === size;
          return (
            <DropdownMenuItem
              key={size}
              onClick={() => onChange(size)}
              className={`h-8 cursor-pointer rounded-md px-2 text-xs justify-between ${active
                ? 'bg-primary/10 text-primary font-bold focus:bg-primary/10 focus:text-primary'
                : 'text-muted-foreground focus:text-foreground'
                }`}
            >
              <span>{size}</span>
              {active && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CourseCompletionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ReportCourseCompletionRanking }>;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  if (!active || !payload?.length) return null;
  const course = payload[0]?.payload;
  if (!course) return null;

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl min-w-[220px]">
      <AppTooltip content={course.name}><p className="font-bold text-foreground mb-2 max-w-[280px] truncate" >{course.name}</p></AppTooltip>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t('reports.averageProgress')}</span>
          <span className="font-bold text-primary">{course.completion_rate}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t('reports.enrollments')}</span>
          <span className="font-semibold">{formatLocaleNumber(course.total_enrollments, locale)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-600">{t('reports.completed')}</span>
          <span className="font-semibold">{formatLocaleNumber(course.completed_enrollments, locale)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">{t('reports.incomplete')}</span>
          <span className="font-semibold">{formatLocaleNumber(course.incomplete_enrollments, locale)}</span>
        </div>
      </div>
    </div>
  );
}

function CourseCompletionRateLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value ?? 0);
  const label = `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      dy={4}
      fill="var(--foreground)"
      className="text-[11px] font-black"
      textAnchor="start"
    >
      {label}
    </text>
  );
}

export function CourseCompletionRankingWidget({
  dateFrom,
  dateTo,
  groupId,
  subgroupId,
  teamId,
  onSelectLearner,
  disablePageScrollRestore = false,
  scrollableContent = false,
  modalLayer = false,
  initialCourse = null,
}: {
  dateFrom: string;
  dateTo: string;
  groupId: string | 'all';
  subgroupId: string | 'all';
  teamId: string | 'all';
  onSelectLearner: (u: string) => void;
  disablePageScrollRestore?: boolean;
  scrollableContent?: boolean;
  modalLayer?: boolean;
  initialCourse?: ReportCourseCompletionRanking | null;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof REPORT_PAGE_SIZE_OPTIONS)[number]>(5);
  const [selectedCourse, setSelectedCourse] = useState<ReportCourseCompletionRanking | null>(null);
  const [learnerPage, setLearnerPage] = useState(1);
  const [learnerPageSize, setLearnerPageSize] = useState<(typeof REPORT_PAGE_SIZE_OPTIONS)[number]>(5);
  const [learnerSearch, setLearnerSearch] = useState('');
  const [debouncedLearnerSearch, setDebouncedLearnerSearch] = useState('');
  const [learnerStatus, setLearnerStatus] = useState<ReportCourseCompletionStatus>('all');
  const pendingScrollRestoreRef = useRef<{ target: HTMLElement | null; top: number; left: number } | null>(null);
  const initialCourseId = initialCourse?.course_id ?? null;

  const getDashboardScrollContainer = useCallback(() => {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>('[data-dashboard-scroll-container="true"]');
  }, []);

  const rememberScrollPosition = useCallback(() => {
    if (disablePageScrollRestore) return;
    if (typeof window === 'undefined') return;
    const target = getDashboardScrollContainer();
    pendingScrollRestoreRef.current = {
      target,
      top: target ? target.scrollTop : window.scrollY,
      left: target ? target.scrollLeft : window.scrollX,
    };
  }, [disablePageScrollRestore, getDashboardScrollContainer]);

  const restoreScrollPosition = useCallback(() => {
    if (disablePageScrollRestore) return;
    if (typeof window === 'undefined') return;
    const scroll = pendingScrollRestoreRef.current;
    if (!scroll) return;
    if (scroll.target) {
      scroll.target.scrollTo({ top: scroll.top, left: scroll.left, behavior: 'auto' });
      return;
    }
    window.scrollTo({ top: scroll.top, left: scroll.left, behavior: 'auto' });
  }, [disablePageScrollRestore]);

  useEffect(() => {
    setPage(1);
    setSelectedCourse(initialCourse);
    setLearnerPage(1);
    setLearnerSearch('');
    setDebouncedLearnerSearch('');
    setLearnerStatus('all');
  }, [dateFrom, dateTo, groupId, subgroupId, teamId, initialCourse, initialCourseId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLearnerSearch(learnerSearch), 300);
    return () => clearTimeout(timer);
  }, [learnerSearch]);

  const { data, isLoading, isFetching: isFetchingRanking } = useQuery({
    queryKey: ['report-course-completion-ranking', dateFrom, dateTo, page, pageSize, groupId, subgroupId, teamId],
    queryFn: () => getReportCourseCompletionRanking({
      date_from: dateFrom, date_to: dateTo, page, page_size: pageSize,
      group_id: groupId === 'all' ? undefined : groupId,
      subgroup_id: subgroupId === 'all' ? undefined : subgroupId,
      team_id: teamId === 'all' ? undefined : teamId
    }),
    placeholderData: (previous) => previous,
  });

  const selectedCourseData = useMemo(() => {
    if (!selectedCourse) return null;
    return data?.results.find(c => c.course_id === selectedCourse.course_id) || selectedCourse;
  }, [data, selectedCourse]);

  const { data: learnersData, isLoading: isLoadingLearners, isFetching: isFetchingLearners } = useQuery({
    queryKey: [
      'report-course-completion-learners',
      selectedCourse?.course_id,
      dateFrom,
      dateTo,
      learnerPage,
      learnerPageSize,
      debouncedLearnerSearch,
      learnerStatus,
      groupId,
      subgroupId,
      teamId,
    ],
    queryFn: () => getReportCourseCompletionLearners(selectedCourse!.course_id, {
      date_from: dateFrom,
      date_to: dateTo,
      page: learnerPage,
      page_size: learnerPageSize,
      search: debouncedLearnerSearch,
      status: learnerStatus,
      group_id: groupId === 'all' ? undefined : groupId,
      subgroup_id: subgroupId === 'all' ? undefined : subgroupId,
      team_id: teamId === 'all' ? undefined : teamId,
    }),
    enabled: !!selectedCourse,
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (!pendingScrollRestoreRef.current) return;

    restoreScrollPosition();
    const frame = window.requestAnimationFrame(restoreScrollPosition);
    const timer = window.setTimeout(() => {
      restoreScrollPosition();
      pendingScrollRestoreRef.current = null;
    }, 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [
    restoreScrollPosition,
    pageSize,
    learnerPageSize,
    data?.results.length,
    learnersData?.results.length,
    isLoading,
    isLoadingLearners,
  ]);

  const showRankingInitialSkeleton = isLoading && !data;
  const showLearnersInitialSkeleton = isLoadingLearners && !learnersData;
  const isRankingRefreshing = isFetchingRanking && !!data;
  const isLearnersRefreshing = isFetchingLearners && !!learnersData;

  const statusConfig = {
    not_started: { label: t('reports.notStarted'), badgeClass: 'text-slate-600 bg-slate-500/10', barClass: 'bg-slate-400' },
    learning: { label: t('reports.learning'), badgeClass: 'text-amber-600 bg-amber-500/10', barClass: 'bg-amber-500' },
    completed: { label: t('reports.learned'), badgeClass: 'text-emerald-600 bg-emerald-500/10', barClass: 'bg-emerald-500' },
  };

  const handleCourseSelect = (course: ReportCourseCompletionRanking) => {
    setSelectedCourse(course);
    setLearnerPage(1);
  };

  const handleChartClick = (state: unknown) => {
    const payload = (state as { activePayload?: Array<{ payload?: ReportCourseCompletionRanking }> })?.activePayload?.[0]?.payload;
    if (payload) handleCourseSelect(payload);
  };

  const handleBackToRanking = () => {
    setSelectedCourse(null);
    setLearnerPage(1);
    setLearnerSearch('');
    setDebouncedLearnerSearch('');
    setLearnerStatus('all');
  };

  const rankingChartHeight = Math.max(270, (data?.results.length || pageSize) * 54);

  return (
    <Card className="shadow-sm border-border/70 h-full flex flex-col bg-card/95 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
      <CardHeader className="p-5 pb-0 min-h-[84px]">
        <AnimatePresence mode="wait" initial={false}>
          {selectedCourseData ? (
            <motion.div
              key="course-detail-header"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start justify-between gap-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  aria-label={t('reports.backToRanking')}
                  onClick={handleBackToRanking}
                  className="mt-0.5 h-8 w-8 rounded-lg border border-border bg-background/80 hover:bg-muted flex items-center justify-center shrink-0 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 space-y-1">
                  <AppTooltip content={selectedCourseData.name}><CardTitle className="text-base font-bold text-foreground truncate" >
                    {selectedCourseData.name}
                  </CardTitle></AppTooltip>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                    <span className="text-primary">{t('reports.averageProgressValue', { value: selectedCourseData.completion_rate })}</span>
                    <span className="text-emerald-600">{t('reports.completedEnrollmentValue', { completed: formatLocaleNumber(selectedCourseData.completed_enrollments, locale), total: formatLocaleNumber(selectedCourseData.total_enrollments, locale) })}</span>
                    <span className="text-slate-500">{t('reports.incompleteEnrollmentValue', { count: formatLocaleNumber(selectedCourseData.incomplete_enrollments, locale) })}</span>
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md border border-primary/20 shrink-0">
                <Users className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-black text-primary tracking-widest uppercase">{t('reports.learners')}</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="course-ranking-header"
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center justify-between"
            >
              <div className="space-y-1">
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  {t('reports.courseRankingTitle')}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">{t('reports.courseRankingDescription')}</p>
              </div>
              <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md border border-primary/20">
                <Percent className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-black text-primary tracking-widest uppercase">{t('reports.completion')}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardHeader>
      <CardContent className={`p-5 flex-grow flex flex-col ${scrollableContent ? 'min-h-0 overflow-y-auto custom-scrollbar' : 'min-h-[360px]'}`}>
        <AnimatePresence mode="wait" initial={false}>
          {selectedCourseData ? (
            <motion.div
              key="course-detail-view"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-grow flex-col"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t('reports.learnerSearch')}
                    className="h-10 pl-8 text-xs bg-background/80 border-border"
                    value={learnerSearch}
                    onChange={e => { setLearnerSearch(e.target.value); setLearnerPage(1); }}
                  />
                </div>
                <Select value={learnerStatus} onValueChange={(val) => { setLearnerStatus(val as ReportCourseCompletionStatus); setLearnerPage(1); }}>
                  <SelectTrigger className={`w-full sm:w-[140px] h-10 text-xs bg-background/80 border-border shadow-sm ${learnerStatus !== 'all' ? 'app-liquid-filter-active' : ''}`}>
                    <SelectValue placeholder={t('reports.status')} />
                  </SelectTrigger>
                  <SelectContent className={modalLayer ? 'z-[10060]' : undefined}>
                    <SelectItem value="all" className="text-xs">{t('reports.all')}</SelectItem>
                    <SelectItem value="not_started" className="text-xs font-medium text-slate-600 focus:text-slate-700">{t('reports.notStarted')}</SelectItem>
                    <SelectItem value="learning" className="text-xs font-medium text-amber-600 focus:text-amber-700">{t('reports.learning')}</SelectItem>
                    <SelectItem value="completed" className="text-xs font-medium text-emerald-600 focus:text-emerald-700">{t('reports.learned')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="-mx-5 mt-4 relative flex-grow overflow-hidden border-y border-border/50 bg-background/35 min-h-[292px]">
                {showLearnersInitialSkeleton ? (
                  <div className="px-5 py-3 space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
                  </div>
                ) : !learnersData || learnersData.results.length === 0 ? (
                  <div className="flex min-h-[260px] items-center justify-center p-8 text-center text-xs text-muted-foreground">
                    {t('reports.noMatchingLearners')}
                  </div>
                ) : (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={`learners-${learnersData.current_page}-${learnerPageSize}-${debouncedLearnerSearch}-${learnerStatus}`}
                      variants={paginatedListVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className={`divide-y divide-border/40 max-h-[360px] overflow-y-auto custom-scrollbar transition-opacity duration-200 ${isLearnersRefreshing ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}
                    >
                      {learnersData.results.map((u) => {
                        const cfg = statusConfig[u.status] || statusConfig.not_started;
                        const displayName = u.full_name || u.username;
                        return (
                          <motion.div
                            key={u.user_id}
                            layout="position"
                            variants={paginatedRowVariants}
                            className="grid grid-cols-[minmax(0,1fr)_120px_78px] sm:grid-cols-[minmax(0,1fr)_150px_92px] items-center gap-3 px-5 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => onSelectLearner(u.username)}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {u.avatar ? (
                                <img src={u.avatar} alt={displayName} className="h-8 w-8 rounded-full object-cover border border-border shrink-0" />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {displayName.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                              </div>
                            </div>
                            <div className="min-w-0 text-[10px] text-muted-foreground">
                              {u.completed_at
                                ? t('reports.completedOn', { date: formatLocaleDate(u.completed_at, locale) })
                                : t('reports.notCompletedInPeriod')}
                            </div>
                            <span className={`justify-self-end text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter shrink-0 ${cfg.badgeClass}`}>
                              {cfg.label}
                            </span>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                )}
                <AnimatePresence>
                  {isLearnersRefreshing && (
                    <motion.div
                      key="learners-refreshing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14 }}
                      className="absolute inset-0 z-10 flex items-center justify-center bg-background/35 backdrop-blur-[1px] pointer-events-none"
                    >
                      <div className="h-7 rounded-full border border-border bg-background/90 px-3 text-[11px] font-semibold text-muted-foreground shadow-sm flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        {t('reports.loading')}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground font-medium">
                  {learnersData
                    ? t('reports.pageSummary', { page: learnerPage, total: Math.max(learnersData.total_pages, 1), count: formatLocaleNumber(learnersData.count, locale), label: t('reports.learners') })
                    : t('reports.loadingLearners')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">{t('reports.pageLimit')}</span>
                  <ReportPageSizeDropdown
                    value={learnerPageSize}
                    onChange={(size) => { rememberScrollPosition(); setLearnerPageSize(size); setLearnerPage(1); }}
                    contentClassName={modalLayer ? 'z-[10060]' : undefined}
                  />
                  {learnersData && learnersData.total_pages > 1 && (
                    <div className="flex gap-2">
                      <button disabled={learnerPage === 1 || isFetchingLearners} onClick={() => { rememberScrollPosition(); setLearnerPage(p => p - 1); }} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                      <button disabled={learnerPage === learnersData.total_pages || isFetchingLearners} onClick={() => { rememberScrollPosition(); setLearnerPage(p => p + 1); }} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : showRankingInitialSkeleton ? (
            <motion.div
              key="course-ranking-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-grow"
            >
              <Skeleton className="w-full h-full min-h-[260px] rounded-xl" />
            </motion.div>
          ) : !data || data.results.length === 0 ? (
            <motion.div
              key="course-ranking-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-grow flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl bg-muted/20"
            >
              {t('reports.noData')}
            </motion.div>
          ) : (
            <motion.div
              key="course-ranking-view"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-grow flex-col"
            >
            <div key={`ranking-chart-${data.current_page}-${pageSize}`} className="relative w-full mt-4" style={{ height: rankingChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.results}
                    margin={{ left: 10, right: 60, top: 0, bottom: 0 }}
                    barGap={12}
                    onClick={handleChartClick}
                  >
                    <XAxis type="number" hide domain={[0, 100]} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={({ x, y, payload, index }) => {
                        const rank = index + 1 + (page - 1) * pageSize;
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <circle cx={-25} cy={-12} r={9} fill={rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#92400e' : 'transparent'} opacity={rank <= 3 ? 1 : 0} />
                            <text x={-25} y={-12} dy={3.5} textAnchor="middle" fill={rank <= 3 ? 'white' : 'var(--muted-foreground)'} className="text-[9px] font-black">{rank}</text>
                            <text x={10} y={-15} dy={0} textAnchor="start" fill="var(--foreground)" className="text-[11px] font-bold fill-foreground">
                              {payload.value.length > 35 ? payload.value.substring(0, 35) + '...' : payload.value}
                            </text>
                          </g>
                        )
                      }}
                      width={40}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReTooltip
                      cursor={{ fill: 'var(--primary)', opacity: 0.08 }}
                      content={<CourseCompletionTooltip />}
                    />
                    <Bar dataKey="completion_rate" radius={[0, 4, 4, 0]} barSize={8} minPointSize={(value) => Number(value) > 0 ? 4 : 0} fill="var(--primary)" background={{ fill: 'var(--muted)', radius: 4, opacity: 0.2 }} cursor="pointer">
                      {data.results.map((course, index) => {
                        const rank = index + 1 + (page - 1) * pageSize;
                        const isSelected = selectedCourse?.course_id === course.course_id;
                        return <Cell key={`cell-${course.course_id}`} fill={isSelected ? '#10b981' : rank === 1 ? '#3b82f6' : rank === 2 ? '#60a5fa' : rank === 3 ? '#93c5fd' : '#bfdbfe'} />;
                      })}
                      <LabelList dataKey="completion_rate" content={<CourseCompletionRateLabel />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <AnimatePresence>
                  {isRankingRefreshing && (
                    <motion.div
                      key="ranking-refreshing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14 }}
                      className="absolute inset-0 z-10 flex items-center justify-center bg-background/25 backdrop-blur-[1px] pointer-events-none"
                    >
                      <div className="h-7 rounded-full border border-border bg-background/90 px-3 text-[11px] font-semibold text-muted-foreground shadow-sm flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        {t('reports.loading')}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground font-medium">
                {t('reports.pageSummary', { page, total: Math.max(data.total_pages, 1), count: formatLocaleNumber(data.count, locale), label: t('reports.courses') })}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">{t('reports.pageLimit')}</span>
                <ReportPageSizeDropdown
                  value={pageSize}
                  onChange={(size) => { rememberScrollPosition(); setPageSize(size); setPage(1); }}
                  contentClassName={modalLayer ? 'z-[10060]' : undefined}
                />
                {data.total_pages > 1 && (
                  <div className="flex gap-2">
                    <button disabled={page === 1 || isFetchingRanking} onClick={() => { rememberScrollPosition(); setPage(p => p - 1); }} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                    <button disabled={page === data.total_pages || isFetchingRanking} onClick={() => { rememberScrollPosition(); setPage(p => p + 1); }} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

