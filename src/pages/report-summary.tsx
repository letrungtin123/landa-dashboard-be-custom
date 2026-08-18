import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useTenantStore } from '@/utils/tenant-store';
import { useHeaderInfo } from '@/utils/header-store';
import { PageHeader } from '@/components/shared/page-header';
import { useAuthStore } from '@/utils/store';
import {
  getReportSummary,
  getReportCourseCompletionLearners,
  getReportCourseCompletionRanking,
  getReportLearners,
  getReportGroups,
  getReportSubGroups,
  getReportTeams,
  type ReportCourseCompletionRanking,
  type ReportCourseCompletionStatus,
} from '@/api/custom-reports';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, BookOpen, GraduationCap, UserCheck, Percent, Award, AlertTriangle, ShieldAlert,
  Calendar as CalendarIcon, Clock, Download, RefreshCcw, ChevronLeft, ChevronRight, BarChart3, ChevronDown, Check, CheckCircle2, TrendingUp, Search, ArrowLeft, X
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, Cell, LabelList
} from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { exportReportExcel } from '@/utils/export-report';
import { LearnerDetailModal } from '@/components/users/learner-detail-modal';
import { ReportWindowChart } from '@/components/reports/ReportWindowChart';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { AppTooltip } from '@/components/ui/tooltip';

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

const softPageTransition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1] as const,
};

const paginatedListVariants = {
  hidden: { opacity: 0, y: 6, filter: 'blur(2px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...softPageTransition, staggerChildren: 0.018 } },
  exit: { opacity: 0, y: -6, filter: 'blur(2px)', transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const } },
};

const paginatedRowVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: softPageTransition },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};


const REPORT_PAGE_SIZE_OPTIONS = [5, 10, 15, 20] as const;
type DateDraftTarget = 'from' | 'to';

function getDefaultReportDateRange(): DateRange {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

function normalizeReportDateRange(range: DateRange | undefined): { from: Date; to: Date } {
  const fallback = getDefaultReportDateRange();
  const from = range?.from || fallback.from!;
  const to = range?.to || range?.from || fallback.to!;
  return from.getTime() <= to.getTime() ? { from, to } : { from: to, to: from };
}

function formatDateParam(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function formatDateLabel(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

function getDateRangeLabel(from: Date, to: Date): string {
  if (formatDateParam(from) === formatDateParam(to)) return formatDateLabel(from);
  return `${formatDateLabel(from)} - ${formatDateLabel(to)}`;
}

function getPreviousDateRange(from: Date, to: Date): { from: Date; to: Date } {
  const dayCount = Math.max(1, differenceInCalendarDays(to, from) + 1);
  const previousTo = addDays(from, -1);
  return { from: addDays(previousTo, -(dayCount - 1)), to: previousTo };
}



function clampPercent(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(Math.max(numericValue, 0), 100);
}

function formatPercent(value: number | null | undefined) {
  const roundedValue = Math.round(clampPercent(value) * 10) / 10;
  return `${roundedValue.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

function ReportPageSizeDropdown({
  value,
  onChange,
}: {
  value: (typeof REPORT_PAGE_SIZE_OPTIONS)[number];
  onChange: (value: (typeof REPORT_PAGE_SIZE_OPTIONS)[number]) => void;
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
        className="w-[72px] rounded-lg border-border bg-popover p-1 shadow-xl"
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

function getMetricChartColors(metricKey: string | null): string[] {
  if (metricKey === 'active_learners') return ['#10b981'];
  if (metricKey === 'completion_rate') return ['#8b5cf6'];
  if (metricKey === 'total_enrollments') return ['#ef4444'];
  return ['#3b82f6'];
}

function formatChartMetricValue(metricKey: string | null, value: number): string {
  if (metricKey === 'completion_rate') return formatPercent(value);
  return value.toLocaleString('vi-VN');
}

function ChartTrendModal({
  metricKey,
  title,
  isOpen,
  onClose,
  groupId,
  subgroupId,
  teamId,
  dateFrom,
  dateTo,
  dateLabel,
}: {
  metricKey: string | null;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  groupId: string | 'all';
  subgroupId: string | 'all';
  teamId: string | 'all';
  dateFrom: string;
  dateTo: string;
  dateLabel: string;
}) {
  const chartRequest = useMemo(() => {
    if (!metricKey) return null;
    return {
      date_from: dateFrom,
      date_to: dateTo,
      metric: metricKey,
      group_id: groupId === 'all' ? undefined : groupId,
      grouped: false,
      subgroup_id: subgroupId === 'all' ? undefined : subgroupId,
      team_id: teamId === 'all' ? undefined : teamId,
      granularity: 'auto' as const,
    };
  }, [dateFrom, dateTo, groupId, metricKey, subgroupId, teamId]);

  const chartColors = useMemo(() => getMetricChartColors(metricKey), [metricKey]);
  const formatValue = useCallback((value: number) => formatChartMetricValue(metricKey, value), [metricKey]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[90vw] lg:max-w-[1200px] bg-background border-border shadow-2xl sm:rounded-2xl p-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-muted/10 pointer-events-none z-0" />
        <div className="z-10 flex flex-col w-full h-full">
          <DialogHeader className="p-5 sm:p-6 border-b border-border/40 bg-muted/20 backdrop-blur-md">
            <div className="flex justify-between items-center pr-8 gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-xl sm:text-2xl font-bold truncate">{title}</DialogTitle>
                <DialogDescription className="text-sm mt-1">
                  Dữ liệu trong khoảng · {dateLabel}
                </DialogDescription>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Chart theo thời gian
              </div>
            </div>
          </DialogHeader>
          <div className="w-full p-4 sm:p-6">
            {chartRequest ? (
              <ReportWindowChart
                request={chartRequest}
                height={420}
                valueLabel={title}
                valueSuffix={metricKey === 'completion_rate' ? '%' : ''}
                formatValue={formatValue}
                colors={chartColors}
                emptyLabel="Không có dữ liệu trong khoảng này"
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function CourseCompletionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ReportCourseCompletionRanking }>;
}) {
  if (!active || !payload?.length) return null;
  const course = payload[0]?.payload;
  if (!course) return null;

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl min-w-[220px]">
      <AppTooltip content={course.name}><p className="font-bold text-foreground mb-2 max-w-[280px] truncate" >{course.name}</p></AppTooltip>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Tiến độ trung bình</span>
          <span className="font-bold text-primary">{course.completion_rate}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Lượt ghi danh</span>
          <span className="font-semibold">{course.total_enrollments.toLocaleString('vi-VN')}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-600">Đã hoàn thành</span>
          <span className="font-semibold">{course.completed_enrollments.toLocaleString('vi-VN')}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Chưa hoàn thành</span>
          <span className="font-semibold">{course.incomplete_enrollments.toLocaleString('vi-VN')}</span>
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

function CourseCompletionRankingWidget({
  dateFrom,
  dateTo,
  groupId,
  subgroupId,
  teamId,
  onSelectLearner,
}: {
  dateFrom: string;
  dateTo: string;
  groupId: string | 'all';
  subgroupId: string | 'all';
  teamId: string | 'all';
  onSelectLearner: (u: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof REPORT_PAGE_SIZE_OPTIONS)[number]>(5);
  const [selectedCourse, setSelectedCourse] = useState<ReportCourseCompletionRanking | null>(null);
  const [learnerPage, setLearnerPage] = useState(1);
  const [learnerPageSize, setLearnerPageSize] = useState<(typeof REPORT_PAGE_SIZE_OPTIONS)[number]>(5);
  const [learnerSearch, setLearnerSearch] = useState('');
  const [debouncedLearnerSearch, setDebouncedLearnerSearch] = useState('');
  const [learnerStatus, setLearnerStatus] = useState<ReportCourseCompletionStatus>('all');
  const pendingScrollRestoreRef = useRef<{ target: HTMLElement | null; top: number; left: number } | null>(null);

  const getDashboardScrollContainer = useCallback(() => {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>('[data-dashboard-scroll-container="true"]');
  }, []);

  const rememberScrollPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const target = getDashboardScrollContainer();
    pendingScrollRestoreRef.current = {
      target,
      top: target ? target.scrollTop : window.scrollY,
      left: target ? target.scrollLeft : window.scrollX,
    };
  }, [getDashboardScrollContainer]);

  const restoreScrollPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const scroll = pendingScrollRestoreRef.current;
    if (!scroll) return;
    if (scroll.target) {
      scroll.target.scrollTo({ top: scroll.top, left: scroll.left, behavior: 'auto' });
      return;
    }
    window.scrollTo({ top: scroll.top, left: scroll.left, behavior: 'auto' });
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedCourse(null);
  }, [dateFrom, dateTo, groupId, subgroupId, teamId]);

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
    not_started: { label: 'Chưa học', badgeClass: 'text-slate-600 bg-slate-500/10', barClass: 'bg-slate-400' },
    learning: { label: 'Đang học', badgeClass: 'text-amber-600 bg-amber-500/10', barClass: 'bg-amber-500' },
    completed: { label: 'Đã học', badgeClass: 'text-emerald-600 bg-emerald-500/10', barClass: 'bg-emerald-500' },
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
                  aria-label="Quay lại bảng xếp hạng"
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
                    <span className="text-primary">{selectedCourseData.completion_rate}% tiến độ trung bình</span>
                    <span className="text-emerald-600">{selectedCourseData.completed_enrollments.toLocaleString('vi-VN')}/{selectedCourseData.total_enrollments.toLocaleString('vi-VN')} lượt đã hoàn thành</span>
                    <span className="text-slate-500">{selectedCourseData.incomplete_enrollments.toLocaleString('vi-VN')} lượt chưa hoàn thành</span>
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md border border-primary/20 shrink-0">
                <Users className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-black text-primary tracking-widest uppercase">Học viên</span>
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
                  Bảng xếp hạng tiến độ trung bình từng khóa học
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">Tiến độ học trung bình của các lượt ghi danh trong khoảng thời gian và phạm vi đang lọc.</p>
              </div>
              <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md border border-primary/20">
                <Percent className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-black text-primary tracking-widest uppercase">Hoàn thành</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardHeader>
      <CardContent className="p-5 flex-grow flex flex-col min-h-[360px]">
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
                    placeholder="Tìm tên học viên/email..."
                    className="h-10 pl-8 text-xs bg-background/80 border-border"
                    value={learnerSearch}
                    onChange={e => { setLearnerSearch(e.target.value); setLearnerPage(1); }}
                  />
                </div>
                <Select value={learnerStatus} onValueChange={(val) => { setLearnerStatus(val as ReportCourseCompletionStatus); setLearnerPage(1); }}>
                  <SelectTrigger className={`w-full sm:w-[140px] h-10 text-xs bg-background/80 border-border shadow-sm ${learnerStatus !== 'all' ? 'app-liquid-filter-active' : ''}`}>
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Tất cả</SelectItem>
                    <SelectItem value="not_started" className="text-xs font-medium text-slate-600 focus:text-slate-700">Chưa học</SelectItem>
                    <SelectItem value="learning" className="text-xs font-medium text-amber-600 focus:text-amber-700">Đang học</SelectItem>
                    <SelectItem value="completed" className="text-xs font-medium text-emerald-600 focus:text-emerald-700">Đã học</SelectItem>
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
                    Không có học viên phù hợp
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
                                ? `Hoàn thành ngày ${new Date(u.completed_at).toLocaleDateString('vi-VN')}`
                                : 'Chưa hoàn thành trong kỳ'}
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
                        {"\u0110ang t\u1ea3i..."}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground font-medium">
                  {learnersData
                    ? `Trang ${learnerPage} / ${Math.max(learnersData.total_pages, 1)} · ${learnersData.count.toLocaleString('en-US')} học viên`
                    : 'Đang tải học viên...'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Giới hạn 1 trang:</span>
                  <ReportPageSizeDropdown
                    value={learnerPageSize}
                    onChange={(size) => { rememberScrollPosition(); setLearnerPageSize(size); setLearnerPage(1); }}
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
              Không có dữ liệu
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
                        {"\u0110ang t\u1ea3i..."}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground font-medium">
                Trang {page} / {Math.max(data.total_pages, 1)} · {data.count.toLocaleString('en-US')} khóa học
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Giới hạn 1 trang:</span>
                <ReportPageSizeDropdown
                  value={pageSize}
                  onChange={(size) => { rememberScrollPosition(); setPageSize(size); setPage(1); }}
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

const GROUP_BAR_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#84cc16', '#14b8a6',
];

function GroupEnrollmentsWidget({
  dateFrom,
  dateTo,
  dateLabel,
  selectedGroupId,
  selectedSubGroupId,
  selectedTeamId,
  totalEnrollments,
}: {
  dateFrom: string;
  dateTo: string;
  dateLabel: string;
  selectedGroupId: string | 'all';
  selectedSubGroupId: string | 'all';
  selectedTeamId: string | 'all';
  totalEnrollments: number;
}) {
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const title = selectedTeamId !== 'all'
    ? `Tổng lượt ghi danh của ${lowerGroupLabel(labels.team)}`
    : selectedSubGroupId !== 'all'
      ? `Tổng lượt ghi danh theo ${lowerGroupLabel(labels.team)}`
      : selectedGroupId !== 'all'
        ? `Tổng lượt ghi danh theo ${lowerGroupLabel(labels.subgroup)}`
        : `Tổng lượt ghi danh theo ${lowerGroupLabel(labels.group)}`;

  const chartRequest = useMemo(() => ({
    date_from: dateFrom,
    date_to: dateTo,
    metric: 'total_enrollments',
    group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
    group_by_org: selectedGroupId === 'all' && selectedTeamId === 'all',
    grouped: selectedTeamId !== 'all' ? false : undefined,
    subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
    team_id: selectedTeamId === 'all' ? undefined : selectedTeamId,
    granularity: 'auto' as const,
  }), [dateFrom, dateTo, selectedGroupId, selectedSubGroupId, selectedTeamId]);

  const formatEnrollmentValue = useCallback((value: number) => `${value.toLocaleString('vi-VN')} lượt`, []);

  return (
    <Card className="shadow-sm border-border/70 h-full flex flex-col bg-card/95 overflow-hidden relative">
      <CardHeader className="p-5 pb-0">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                <TrendingUp className="h-4 w-4" />
              </span>
              {title}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Xu hướng ghi danh · {dateLabel}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-2xl font-bold text-foreground leading-none">
              {totalEnrollments.toLocaleString('en-US')}
            </span>
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Trong khoảng</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 flex-grow flex flex-col min-w-0">
        <ReportWindowChart
          request={chartRequest}
          height={340}
          valueLabel="Ghi danh"
          emptyLabel="Không có dữ liệu ghi danh"
          formatValue={formatEnrollmentValue}
          colors={GROUP_BAR_COLORS}
          variant="line"
        />
      </CardContent>
    </Card>
  );
}
function UncompletedWidget({ dateFrom, dateTo, onSelectLearner, groupId, subgroupId, teamId }: { dateFrom: string, dateTo: string, onSelectLearner: (u: string) => void, groupId: string | 'all', subgroupId: string | 'all', teamId: string | 'all' }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_started' | 'learning' | 'completed'>('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-learners', dateFrom, dateTo, page, debouncedSearch, groupId, subgroupId, teamId, statusFilter],
    queryFn: () => getReportLearners({
      date_from: dateFrom, date_to: dateTo, page, page_size: 5,
      search: debouncedSearch,
      group_id: groupId === 'all' ? undefined : groupId,
      subgroup_id: subgroupId === 'all' ? undefined : subgroupId,
      team_id: teamId === 'all' ? undefined : teamId,
      status: statusFilter
    }),
  });

  const statusConfig = {
    not_started: { label: 'Chưa học', avatarClass: 'bg-muted text-muted-foreground group-hover:bg-slate-500 group-hover:text-white', barClass: 'bg-slate-400', badgeClass: 'text-slate-600 bg-slate-500/10' },
    learning: { label: 'Đang học', avatarClass: 'bg-amber-500/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white', barClass: 'bg-amber-500', badgeClass: 'text-amber-600 bg-amber-500/10' },
    completed: { label: 'Đã học', avatarClass: 'bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white', barClass: 'bg-emerald-500', badgeClass: 'text-emerald-600 bg-emerald-500/10' },
  };

  return (
    <Card className="shadow-sm border-border h-full flex flex-col bg-muted/5 backdrop-blur-sm">
      <CardHeader className="p-5 pb-2 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Danh sách học viên
          </CardTitle>
          {data && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{data.count.toLocaleString('en-US')} học viên</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Tìm user/email..."
              className="h-9 text-xs bg-background border-border"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(val: any) => { setStatusFilter(val); setPage(1); }}>
            <SelectTrigger className={`w-[110px] h-9 text-xs bg-background border-border shadow-sm ${statusFilter !== 'all' ? 'app-liquid-filter-active' : ''}`}>
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tất cả</SelectItem>
              <SelectItem value="not_started" className="text-xs font-medium text-slate-600 focus:text-slate-700">Chưa học</SelectItem>
              <SelectItem value="learning" className="text-xs font-medium text-amber-600 focus:text-amber-700">Đang học</SelectItem>
              <SelectItem value="completed" className="text-xs font-medium text-emerald-600 focus:text-emerald-700">Đã học</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-grow flex flex-col">
        {isLoading ? (
          <div className="p-4 space-y-3 min-h-[200px] overflow-hidden">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : !data || data.results.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-center text-sm text-muted-foreground italic min-h-[200px]">
            Không có dữ liệu
          </div>
        ) : (
          <div className="divide-y divide-border/40 overflow-y-auto custom-scrollbar max-h-[440px]">
            <AnimatePresence>
              {data.results.map((u, i) => {
                const cfg = statusConfig[u.status] || statusConfig.not_started;
                return (
                  <motion.div key={u.username}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center p-4 hover:bg-muted/50 transition-all cursor-pointer group gap-6"
                    onClick={() => onSelectLearner(u.username)}
                  >
                    {/* User Info Column */}
                    <div className="flex items-center gap-3 w-[32%] min-w-[140px] shrink-0">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.username} className="h-8 w-8 rounded-full object-cover border border-border shrink-0" />
                      ) : (
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${cfg.avatarClass}`}>
                          {u.username.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{u.username}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-[140px] flex flex-col justify-center">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-foreground">{formatPercent(u.completion_rate)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.barClass}`}
                          style={{ width: `${clampPercent(u.completion_rate)}%` }}
                        />
                      </div>
                    </div>

                    {/* Status Column */}
                    <div className="w-[20%] min-w-[100px] shrink-0 text-right flex flex-col items-end justify-center">
                      <div className="flex items-center justify-end gap-1 mb-1">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {u.last_completion_at
                            ? new Date(u.last_completion_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : 'Chưa học'}
                        </span>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter ${cfg.badgeClass}`}>{cfg.label}</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
      {data && data.total_pages > 1 && (
        <div className="p-3 border-t border-border/40 flex items-center justify-between bg-muted/5">
          <span className="text-xs text-muted-foreground font-medium">Trang {page} / {data.total_pages}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
            <button disabled={page === data.total_pages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </Card>
  );
}

// LearnerDetailModal được import từ shared component:
// import { LearnerDetailModal } from '@/components/users/learner-detail-modal';

export default function ReportSummaryPage() {
  useHeaderInfo('Báo cáo tổng hợp');
  const [selectedLearner, setSelectedLearner] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<{ key: string, title: string } | null>(null);

  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultReportDateRange());
  const [draftDateRange, setDraftDateRange] = useState<DateRange>(() => getDefaultReportDateRange());
  const [dateDraftTarget, setDateDraftTarget] = useState<DateDraftTarget>('from');
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const normalizedDateRange = useMemo(() => normalizeReportDateRange(dateRange), [dateRange]);
  const normalizedDraftDateRange = useMemo(() => normalizeReportDateRange(draftDateRange), [draftDateRange]);
  const dateFrom = useMemo(() => formatDateParam(normalizedDateRange.from), [normalizedDateRange.from]);
  const dateTo = useMemo(() => formatDateParam(normalizedDateRange.to), [normalizedDateRange.to]);
  const defaultDateRange = useMemo(() => normalizeReportDateRange(getDefaultReportDateRange()), []);
  const defaultDateFrom = useMemo(() => formatDateParam(defaultDateRange.from), [defaultDateRange.from]);
  const defaultDateTo = useMemo(() => formatDateParam(defaultDateRange.to), [defaultDateRange.to]);
  const isDateRangeFiltered = dateFrom !== defaultDateFrom || dateTo !== defaultDateTo;
  const draftDateFrom = useMemo(() => formatDateParam(normalizedDraftDateRange.from), [normalizedDraftDateRange.from]);
  const draftDateTo = useMemo(() => formatDateParam(normalizedDraftDateRange.to), [normalizedDraftDateRange.to]);
  const dateLabel = useMemo(() => getDateRangeLabel(normalizedDateRange.from, normalizedDateRange.to), [normalizedDateRange.from, normalizedDateRange.to]);
  const draftDateLabel = useMemo(() => getDateRangeLabel(normalizedDraftDateRange.from, normalizedDraftDateRange.to), [normalizedDraftDateRange.from, normalizedDraftDateRange.to]);
  const previousDateRange = useMemo(() => getPreviousDateRange(normalizedDateRange.from, normalizedDateRange.to), [normalizedDateRange.from, normalizedDateRange.to]);
  const previousDateFrom = useMemo(() => formatDateParam(previousDateRange.from), [previousDateRange.from]);
  const previousDateTo = useMemo(() => formatDateParam(previousDateRange.to), [previousDateRange.to]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'all'>('all');
  const [selectedSubGroupId, setSelectedSubGroupId] = useState<string | 'all'>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string | 'all'>('all');
  const [isExporting, setIsExporting] = useState(false);

  const user = useAuthStore((s) => s.user);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const allGroupLabel = `Tất cả ${lowerGroupLabel(labels.group)}`;
  const allSubgroupLabel = `Tất cả ${lowerGroupLabel(labels.subgroup)}`;
  const allTeamLabel = `Tất cả ${lowerGroupLabel(labels.team)}`;
  const hierarchyLabel = `${lowerGroupLabel(labels.group)}/${lowerGroupLabel(labels.subgroup)}/${lowerGroupLabel(labels.team)}`;
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const isSuperadmin = user?.role === 'superadmin' || user?.role === 'superuser';
  const isStaff = user?.role === 'staff';
  const isLearnerPlus = user?.role === 'learner_plus';
  const canViewReport = isSuperadmin || isStaff || isLearnerPlus;

  // learner_plus: lấy danh sách groups từ auth store (BE trả về qua member_groups)
  const learnerPlusMemberGroups = isLearnerPlus && user?.memberGroupIds
    ? user.memberGroupIds.map((id, i) => ({ id, name: user.memberGroupNames?.[i] || `${labels.group} ${id}` }))
    : [];
  const hasNoGroups = isLearnerPlus && learnerPlusMemberGroups.length === 0;

  const syncDraftDateRange = useCallback(() => {
    setDraftDateRange({ from: normalizedDateRange.from, to: normalizedDateRange.to });
    setDateDraftTarget('from');
  }, [normalizedDateRange.from, normalizedDateRange.to]);

  const handleDateFilterOpenChange = useCallback((open: boolean) => {
    setIsDateFilterOpen(open);
    if (open) {
      setDraftDateRange({ from: normalizedDateRange.from, to: normalizedDateRange.to });
      setDateDraftTarget('from');
    }
  }, [normalizedDateRange.from, normalizedDateRange.to]);

  const handleDraftDateSelect = useCallback((selectedDate?: Date) => {
    if (!selectedDate) return;
    setDraftDateRange(current => {
      const currentRange = normalizeReportDateRange(current);
      if (dateDraftTarget === 'from') {
        return {
          from: selectedDate,
          to: selectedDate.getTime() > currentRange.to.getTime() ? selectedDate : currentRange.to,
        };
      }
      return {
        from: selectedDate.getTime() < currentRange.from.getTime() ? selectedDate : currentRange.from,
        to: selectedDate,
      };
    });
  }, [dateDraftTarget]);

  const handleApplyDateFilter = useCallback(() => {
    setDateRange({ from: normalizedDraftDateRange.from, to: normalizedDraftDateRange.to });
    setIsDateFilterOpen(false);
  }, [normalizedDraftDateRange.from, normalizedDraftDateRange.to]);

  const handleResetDateFilter = useCallback(() => {
    const nextRange = getDefaultReportDateRange();
    setDateRange(nextRange);
    setDraftDateRange(nextRange);
    setDateDraftTarget('from');
    setIsDateFilterOpen(false);
  }, []);

  const handleDraftCurrentMonth = useCallback(() => {
    const nextRange = getDefaultReportDateRange();
    setDraftDateRange(nextRange);
    setDateDraftTarget('from');
  }, []);

  const handleCancelDateFilter = useCallback(() => {
    syncDraftDateRange();
    setIsDateFilterOpen(false);
  }, [syncDraftDateRange]);

  const { data: groupsData } = useQuery({
    queryKey: ['report-groups-list', activeTenantId],
    queryFn: () => getReportGroups(),
    enabled: canViewReport && !hasNoGroups,
  });

  // Fetch subgroups when a group is selected
  const { data: subGroupsData } = useQuery({
    queryKey: ['report-subgroups-list', selectedGroupId, activeTenantId],
    queryFn: () => getReportSubGroups(selectedGroupId as string),
    enabled: canViewReport && selectedGroupId !== 'all',
  });

  const { data: teamsData } = useQuery({
    queryKey: ['report-teams-list', selectedGroupId, selectedSubGroupId, activeTenantId],
    queryFn: () => getReportTeams(selectedGroupId as string, selectedSubGroupId as string),
    enabled: canViewReport && selectedGroupId !== 'all' && selectedSubGroupId !== 'all',
  });

  // learner_plus: auto-set selectedGroupId vào group đầu tiên
  useEffect(() => {
    if (isLearnerPlus && selectedGroupId === 'all') {
      const firstGroup = groupsData?.groups?.[0] || learnerPlusMemberGroups[0];
      if (firstGroup) setSelectedGroupId(firstGroup.id);
    }
  }, [isLearnerPlus, selectedGroupId, groupsData?.groups?.length, learnerPlusMemberGroups.length]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo, selectedGroupId, selectedSubGroupId, selectedTeamId, activeTenantId],
    queryFn: () => getReportSummary({
      date_from: dateFrom,
      date_to: dateTo,
      group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
      subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
      team_id: selectedTeamId === 'all' ? undefined : selectedTeamId
    }),
    // learner_plus phải có group được chọn (auto-set hoặc manual)
    enabled: canViewReport && !hasNoGroups && (isSuperadmin || isStaff || selectedGroupId !== 'all'),
  });

  const { data: prevData } = useQuery({
    queryKey: ['report-summary-prev', previousDateFrom, previousDateTo, selectedGroupId, selectedSubGroupId, selectedTeamId, activeTenantId],
    queryFn: () => getReportSummary({
      date_from: previousDateFrom,
      date_to: previousDateTo,
      group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
      subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
      team_id: selectedTeamId === 'all' ? undefined : selectedTeamId
    }),
    enabled: canViewReport && !hasNoGroups && (isSuperadmin || isStaff || selectedGroupId !== 'all'),
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportReportExcel({
        dateFrom,
        dateTo,
        selectedGroupId,
        selectedSubGroupId,
        selectedTeamId,
        groupLabel: labels.group,
        subgroupLabel: labels.subgroup,
        teamLabel: labels.team,
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!canViewReport) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto pb-10">
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-12 text-center mt-12 backdrop-blur-sm">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold text-destructive mb-2">Truy cập bị hạn chế</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Bạn không có quyền cần thiết để xem phân tích hệ thống.
            Chỉ quản trị viên cấp cao (superuser) hoặc người dùng Learner Plus mới có thể truy cập báo cáo.
          </p>
        </div>
      </div>
    );
  }

  if (hasNoGroups) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto pb-10">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-12 text-center mt-12 backdrop-blur-sm">
          <Users className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400 mb-2">Chưa được gán {hierarchyLabel}</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Bạn chưa được thêm vào {hierarchyLabel} nào trong hệ thống.
            Vui lòng liên hệ quản trị viên để được thêm vào đơn vị phù hợp.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-8 max-w-7xl mx-auto pb-10">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="shadow-sm border-border overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between p-4 pb-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <Skeleton className="h-8 w-16 mb-4" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-4">
        <div className="p-4 bg-muted rounded-full">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <p>Không thể tải dữ liệu phân tích thời gian thực. Vui lòng kiểm tra kết nối.</p>
        <button onClick={() => refetch()} className="text-sm text-primary font-medium hover:underline flex items-center gap-2">
          <RefreshCcw className="h-4 w-4" /> Thử lại
        </button>
      </div>
    );
  }

  const overview = data.overview;

  const calculateTrend = (current: number | string, previous: number | string | undefined, isAbsolute: boolean = false, suffix: string = '%') => {
    if (previous === undefined) return { text: '', type: 'up' as const };

    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;

    const diff = cur - prev;
    const type = diff >= 0 ? 'up' as const : 'down' as const;
    const sign = diff > 0 ? '+' : (diff < 0 ? '-' : '');

    if (isAbsolute) {
      const formatted = suffix === '' ? Math.abs(diff).toLocaleString('en-US') : Math.abs(diff).toFixed(1);
      return { text: `${sign}${formatted}${suffix}`, type };
    }

    if (prev === 0) {
      if (cur > 0) return { text: `+100.0${suffix}`, type: 'up' as const };
      return { text: `0.0${suffix}`, type: 'up' as const };
    }

    const percent = (diff / Math.abs(prev)) * 100;
    return { text: `${sign}${Math.abs(percent).toFixed(1)}${suffix}`, type };
  };

  const prevOverview = prevData?.overview;
  const learnersTrend = calculateTrend(overview.total_learners, prevOverview?.total_learners, true, '');
  const activeTrend = calculateTrend(overview.active_learners, prevOverview?.active_learners, true, '');
  const completionTrend = calculateTrend(overview.completion_rate, prevOverview?.completion_rate, true, '%');
  const enrollmentsTrend = calculateTrend(overview.total_enrollments, prevOverview?.total_enrollments, true, '');

  const stats = [
    { title: 'Tổng học viên đã tạo', value: overview.total_learners, icon: Users, colorClass: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400', trend: learnersTrend.text, trendType: learnersTrend.type, key: 'total_learners', suffix: '', description: 'Tổng số tài khoản học viên được tạo trong khoảng thời gian đã chọn và thuộc phạm vi nhóm đang lọc. Mỗi học viên chỉ được tính một lần.', supportingText: '', notice: '', disabled: false },
    { title: 'Học viên có hoạt động học', value: overview.active_learners, icon: UserCheck, colorClass: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400', trend: activeTrend.text, trendType: activeTrend.type, key: 'active_learners', suffix: '', description: 'Số học viên đã hoàn thành ít nhất một nội dung học trong khoảng thời gian đã chọn. Mỗi học viên chỉ được tính một lần.', supportingText: '', notice: '', disabled: false },
    { title: 'Tỷ lệ hoàn thành trung bình', value: Math.round(overview.completion_rate), icon: CheckCircle2, colorClass: 'text-purple-500 bg-purple-50 dark:bg-purple-500/10 dark:text-purple-400', trend: completionTrend.text, trendType: completionTrend.type, key: 'completion_rate', suffix: '%', description: 'Tính trên toàn bộ học viên thuộc phạm vi đang lọc. Học viên chưa có khóa trong khoảng thời gian đã chọn được tính 0%. Với mỗi học viên, hệ thống lấy trung bình tiến độ các khóa trong khoảng thời gian đó, rồi lấy trung bình tất cả học viên.', supportingText: '', notice: '', disabled: false },
    { title: 'Lượt ghi danh trong kỳ', value: overview.total_enrollments, icon: CalendarIcon, colorClass: 'text-red-500 bg-red-50 dark:bg-red-500/10 dark:text-red-400', trend: enrollmentsTrend.text, trendType: enrollmentsTrend.type, key: 'total_enrollments', suffix: '', description: 'Số lần học viên được ghi danh vào khóa học trong khoảng thời gian đã chọn. Một học viên được ghi danh nhiều khóa sẽ có nhiều lượt ghi danh.', supportingText: '', notice: '', disabled: false },
  ];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto pb-20 relative">

      <LearnerDetailModal
        username={selectedLearner}
        isOpen={!!selectedLearner}
        onClose={() => setSelectedLearner(null)}
        groupId={selectedGroupId}
        subgroupId={selectedSubGroupId}
        teamId={selectedTeamId}
        reportDateFrom={dateFrom}
        reportDateTo={dateTo}
      />

      <ChartTrendModal
        metricKey={chartMetric?.key || null}
        title={chartMetric?.title || ''}
        isOpen={!!chartMetric}
        onClose={() => setChartMetric(null)}
        groupId={selectedGroupId}
        subgroupId={selectedSubGroupId}
        teamId={selectedTeamId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        dateLabel={dateLabel}
      />

      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, var(--foreground) 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <PageHeader
          icon={BarChart3}
          title="Tổng quan phân tích"
          description="Chỉ số hệ thống thời gian thực và hiệu suất người học."
        />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className={`app-liquid-field flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-border transition-all text-foreground shadow-sm max-w-full sm:max-w-none ${selectedGroupId !== 'all' ? 'app-liquid-filter-active' : ''}`}>
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[100px] sm:max-w-[120px]">
                {selectedGroupId === 'all'
                  ? allGroupLabel
                  : groupsData?.groups.find(g => g.id === selectedGroupId)?.name || 'Đang tải...'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto rounded-lg custom-scrollbar">
              {/* Staff/Superadmin: option 'Tất cả' */}
              {(isSuperadmin || isStaff) && (
                <DropdownMenuItem
                  onClick={() => { setSelectedGroupId('all'); setSelectedSubGroupId('all'); setSelectedTeamId('all'); }}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedGroupId === 'all' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {allGroupLabel}
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedGroupId === 'all' ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
              )}
              {/* All roles: list groups from report API (BE auto-filter cho learner_plus) */}
              {groupsData?.groups.map(g => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => { setSelectedGroupId(g.id); setSelectedSubGroupId('all'); setSelectedTeamId('all'); }}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedGroupId === g.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  <span className="truncate">{g.name}</span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedGroupId === g.id ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* SubGroup Filter — chỉ hiện khi đã chọn Group */}
          {selectedGroupId !== 'all' && canViewReport && (
            <DropdownMenu>
              <DropdownMenuTrigger className={`app-liquid-field flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-border transition-all text-foreground shadow-sm max-w-full sm:max-w-none ${selectedSubGroupId !== 'all' ? 'app-liquid-filter-active' : ''}`}>
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[100px] sm:max-w-[120px]">
                  {selectedSubGroupId === 'all'
                    ? allSubgroupLabel
                    : subGroupsData?.subgroups.find(sg => sg.id === selectedSubGroupId)?.name || 'Đang tải...'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto rounded-lg custom-scrollbar">
                <DropdownMenuItem
                  onClick={() => { setSelectedSubGroupId('all'); setSelectedTeamId('all'); }}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedSubGroupId === 'all' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {allSubgroupLabel}
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedSubGroupId === 'all' ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
                {subGroupsData?.subgroups.map(sg => (
                  <DropdownMenuItem
                    key={sg.id}
                    onClick={() => { setSelectedSubGroupId(sg.id); setSelectedTeamId('all'); }}
                    className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedSubGroupId === sg.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                  >
                    <span className="truncate">{sg.name}</span>
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedSubGroupId === sg.id ? 'bg-foreground' : 'bg-transparent'}`} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {selectedSubGroupId !== 'all' && canViewReport && (
            <DropdownMenu>
              <DropdownMenuTrigger className={`app-liquid-field flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-border transition-all text-foreground shadow-sm max-w-full sm:max-w-none ${selectedTeamId !== 'all' ? 'app-liquid-filter-active' : ''}`}>
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[100px] sm:max-w-[120px]">
                  {selectedTeamId === 'all'
                    ? allTeamLabel
                    : teamsData?.teams.find(t => t.id === selectedTeamId)?.name || 'Đang tải...'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto rounded-lg custom-scrollbar">
                <DropdownMenuItem
                  onClick={() => setSelectedTeamId('all')}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedTeamId === 'all' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {allTeamLabel}
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedTeamId === 'all' ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
                {teamsData?.teams.map(t => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => setSelectedTeamId(t.id)}
                    className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedTeamId === t.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                  >
                    <span className="truncate">{t.name}</span>
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedTeamId === t.id ? 'bg-foreground' : 'bg-transparent'}`} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Popover open={isDateFilterOpen} onOpenChange={handleDateFilterOpenChange}>
            <PopoverTrigger className={`app-liquid-field flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-border transition-all text-foreground shadow-sm shrink-0 ${isDateRangeFiltered ? 'app-liquid-filter-active' : ''}`}>
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="whitespace-nowrap">{dateLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(calc(100vw-2rem),640px)] max-h-[min(82vh,720px)] overflow-y-auto p-0 rounded-xl border-border/70 shadow-xl bg-popover">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">Bộ lọc thời gian</p>
                  <p className="text-[11px] text-muted-foreground truncate">Đang áp dụng: {dateLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={handleDraftCurrentMonth}
                  className="h-7 rounded-lg border border-border bg-background px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  Tháng này
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 border-b border-border/60 bg-muted/20">
                <button
                  type="button"
                  onClick={() => setDateDraftTarget('from')}
                  aria-pressed={dateDraftTarget === 'from'}
                  className={`h-[72px] rounded-xl border px-3 text-left transition-all ${dateDraftTarget === 'from' ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/15' : 'border-border bg-background hover:bg-muted'}`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Từ ngày</span>
                  <span className="mt-1 block text-sm font-bold text-foreground">{formatDateLabel(normalizedDraftDateRange.from)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDateDraftTarget('to')}
                  aria-pressed={dateDraftTarget === 'to'}
                  className={`h-[72px] rounded-xl border px-3 text-left transition-all ${dateDraftTarget === 'to' ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/15' : 'border-border bg-background hover:bg-muted'}`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Đến ngày</span>
                  <span className="mt-1 block text-sm font-bold text-foreground">{formatDateLabel(normalizedDraftDateRange.to)}</span>
                </button>
              </div>
              <div className="px-2 sm:px-3">
                <Calendar
                  mode="single"
                  selected={dateDraftTarget === 'from' ? normalizedDraftDateRange.from : normalizedDraftDateRange.to}
                  onSelect={handleDraftDateSelect}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                  modifiers={{
                    range_start: normalizedDraftDateRange.from,
                    range_end: normalizedDraftDateRange.to,
                    range_middle: { after: normalizedDraftDateRange.from, before: normalizedDraftDateRange.to },
                  }}
                  className="mx-auto"
                />
              </div>
              <div className="flex flex-col gap-2 border-t border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-xs font-semibold text-muted-foreground">
                  {draftDateLabel}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelDateFilter}
                    className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDateFilter}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Áp dụng
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <AppTooltip content="Đặt lại khoảng thời gian"><button
            type="button"
            onClick={handleResetDateFilter}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-border bg-background hover:bg-muted transition-all text-muted-foreground hover:text-foreground active:scale-95 shadow-sm shrink-0"
            aria-label="Đặt lại khoảng thời gian"
          >
            <X className="h-3.5 w-3.5" />
          </button></AppTooltip>
          <button onClick={() => refetch()} className={`inline-flex items-center justify-center h-9 w-9 rounded-full border border-border bg-background hover:bg-muted transition-all text-muted-foreground hover:text-foreground active:scale-95 shadow-sm shrink-0 ${isFetching ? 'animate-spin' : ''}`}>
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
          {/* Ẩn nút Export cho learner_plus */}
          {!isLearnerPlus && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={`inline-flex items-center gap-2 h-9 px-4 text-xs font-medium rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 shadow-md shrink-0 ${isExporting ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isExporting ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span className="whitespace-nowrap">{isExporting ? 'Đang xuất...' : 'Xuất dữ liệu'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards Grid */}
      <motion.div
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.05 } },
        }}
      >
        {stats.map((stat) => (
          <motion.div key={stat.title} variants={cardVariant}>
            <Card
              className={`shadow-sm border-border/60 transition-all overflow-hidden relative bg-card ${stat.disabled ? 'cursor-default' : 'hover:border-border cursor-pointer'}`}
              onClick={() => {
                if (!stat.disabled) setChartMetric({ key: stat.key, title: stat.title });
              }}
            >
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-md ${stat.colorClass}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <span className="text-[13px] font-medium text-muted-foreground">{stat.title}</span>
                  </div>
                  <AppTooltip content={stat.description}>
                    <div
                      className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      !
                    </div>
                  </AppTooltip>
                </div>

                <div className="min-w-0">
                  <div className="text-[34px] font-bold tracking-tight text-foreground leading-none mb-4">
                    {typeof stat.value === 'number' ? stat.value.toLocaleString('en-US') : stat.value}{stat.suffix}
                  </div>

                  <div className="flex min-h-[22px] flex-col items-start gap-1.5">
                    {stat.supportingText && (
                      <span className="max-w-full text-[10px] font-semibold text-muted-foreground truncate">{stat.supportingText}</span>
                    )}
                    {stat.notice ? (
                      <span className="inline-flex max-w-full text-[10px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                        {stat.notice}
                      </span>
                    ) : stat.trend && (
                      <div className="inline-flex max-w-full">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full truncate ${stat.trendType === 'up'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
                          }`}>
                          {stat.trend} so với khoảng trước
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Charts & Lists */}
      <motion.div
        className="flex flex-col gap-6"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
        }}
      >
        <motion.div variants={cardVariant}>
          <CourseCompletionRankingWidget
            dateFrom={dateFrom}
            dateTo={dateTo}
            groupId={selectedGroupId}
            subgroupId={selectedSubGroupId}
            teamId={selectedTeamId}
            onSelectLearner={setSelectedLearner}
          />
        </motion.div>

        {((groupsData && groupsData.groups.length > 0) || (isLearnerPlus && learnerPlusMemberGroups.length > 0)) && (
          <motion.div variants={cardVariant}>
            <GroupEnrollmentsWidget
              dateFrom={dateFrom}
              dateTo={dateTo}
              dateLabel={dateLabel}
              selectedGroupId={selectedGroupId}
              selectedSubGroupId={selectedSubGroupId}
              selectedTeamId={selectedTeamId}
              totalEnrollments={overview.total_enrollments}
            />
          </motion.div>
        )}

        <motion.div variants={cardVariant}>
          <UncompletedWidget
            dateFrom={dateFrom}
            dateTo={dateTo}
            groupId={selectedGroupId}
            subgroupId={selectedSubGroupId}
            teamId={selectedTeamId}
            onSelectLearner={setSelectedLearner}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
