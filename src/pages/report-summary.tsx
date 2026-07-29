import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useTenantStore } from '@/utils/tenant-store';
import { useHeaderInfo } from '@/utils/header-store';
import { PageHeader } from '@/components/shared/page-header';
import { useAuthStore } from '@/utils/store';
import {
  getReportSummary,
  getReportChart,
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
  ArrowUpRight, Calendar, Clock, Download, RefreshCcw, ChevronLeft, ChevronRight, BarChart3, ChevronDown, Check, CheckCircle2, TrendingUp, Search, ArrowLeft
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart, Area, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, Cell, CartesianGrid,
  LineChart, Line, Legend, LabelList
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
import { toast } from 'sonner';
import { exportReportExcel } from '@/utils/export-report';
import { LearnerDetailModal } from '@/components/users/learner-detail-modal';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';

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

const generateSparkline = (base: number) => {
  const data = [];
  let current = base * 0.8;
  for (let i = 0; i < 10; i++) {
    current = current + (Math.random() - 0.4) * (base * 0.1);
    data.push({ value: Math.max(0, Math.floor(current)) });
  }
  data[data.length - 1].value = base;
  return data;
};

const REPORT_PAGE_SIZE_OPTIONS = [5, 10, 15, 20] as const;

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
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/80 px-2.5 text-[11px] font-bold text-foreground shadow-sm outline-none transition-all hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary/40">
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

function ChartTrendModal({
  metricKey,
  title,
  isOpen,
  onClose,
  groupId,
  subgroupId,
  teamId,
}: {
  metricKey: string | null;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  groupId: string | 'all';
  subgroupId: string | 'all';
  teamId: string | 'all';
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-chart', year, metricKey, groupId, subgroupId, teamId],
    queryFn: () => getReportChart(
      year, metricKey!,
      groupId === 'all' ? undefined : groupId,
      false, false,
      subgroupId === 'all' ? undefined : subgroupId,
      teamId === 'all' ? undefined : teamId
    ),
    enabled: !!metricKey && isOpen,
  });

  const CHART_COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#06b6d4', '#84cc16', '#6366f1', '#14b8a6'
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[90vw] lg:max-w-[1200px] bg-background border-border shadow-2xl sm:rounded-2xl p-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-muted/10 pointer-events-none z-0" />
        <div className="z-10 flex flex-col w-full h-full">
          <DialogHeader className="p-6 border-b border-border/40 bg-muted/20 backdrop-blur-md">
            <div className="flex justify-between items-center pr-8">
              <div>
                <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
                <DialogDescription className="text-sm mt-1">Biểu đồ xu hướng 12 tháng</DialogDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-background shadow-sm text-sm font-medium outline-none focus-visible:ring-1 focus-visible:ring-primary hover:bg-muted transition-all">
                  Năm {year}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[120px] rounded-lg">
                  {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                    <DropdownMenuItem
                      key={y}
                      onClick={() => setYear(y)}
                      className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${year === y ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                    >
                      Năm {y}
                      <div className={`w-1.5 h-1.5 rounded-full transition-colors ${year === y ? 'bg-foreground' : 'bg-transparent'}`} />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogHeader>
          <div className="h-[450px] w-full p-6">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : isError ? (
              <div className="flex flex-col h-full items-center justify-center text-muted-foreground gap-2">
                <AlertTriangle className="h-8 w-8 opacity-50" />
                <span>Lỗi tải biểu đồ</span>
              </div>
            ) : data && data.data ? (
              <ResponsiveContainer width="100%" height="100%">
                {data.is_grouped ? (
                  <LineChart data={data.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="month_label" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <ReTooltip
                      cursor={{ stroke: 'var(--muted)', strokeWidth: 2 }}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        color: 'var(--popover-foreground)',
                        boxShadow: '0 14px 32px rgba(15, 23, 42, 0.16)',
                        fontSize: '12px',
                      }}
                      labelStyle={{
                        color: 'var(--foreground)',
                        fontWeight: 700,
                        marginBottom: '6px',
                      }}
                      itemStyle={{
                        color: 'var(--popover-foreground)',
                        fontWeight: 600,
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    {Object.keys(data.data[0] || {}).filter(k => k !== 'month' && k !== 'month_label').map((key, index) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                ) : (
                  <BarChart data={data.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="month_label" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <ReTooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.35 }}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        color: 'var(--popover-foreground)',
                        boxShadow: '0 14px 32px rgba(15, 23, 42, 0.16)',
                        fontSize: '12px',
                      }}
                      labelStyle={{
                        color: 'var(--foreground)',
                        fontWeight: 700,
                        marginBottom: '6px',
                      }}
                      itemStyle={{
                        color: 'var(--popover-foreground)',
                        fontWeight: 600,
                      }}
                    />
                    <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                )}
              </ResponsiveContainer>
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
      <p className="font-bold text-foreground mb-2 max-w-[280px] truncate" title={course.name}>{course.name}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Tỉ lệ hoàn thành</span>
          <span className="font-bold text-primary">{course.completion_rate}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-amber-600">Đang học</span>
          <span className="font-semibold">{course.learning_count.toLocaleString('en-US')}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-600">Đã học</span>
          <span className="font-semibold">{course.completed_count.toLocaleString('en-US')}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Chưa học</span>
          <span className="font-semibold">{course.not_started_count.toLocaleString('en-US')}</span>
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
  month,
  year,
  groupId,
  subgroupId,
  teamId,
  onSelectLearner,
}: {
  month: number;
  year: number;
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
  }, [month, year, groupId, subgroupId, teamId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLearnerSearch(learnerSearch), 300);
    return () => clearTimeout(timer);
  }, [learnerSearch]);

  const { data, isLoading, isFetching: isFetchingRanking } = useQuery({
    queryKey: ['report-course-completion-ranking', month, year, page, pageSize, groupId, subgroupId, teamId],
    queryFn: () => getReportCourseCompletionRanking({
      month, year, page, page_size: pageSize,
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
      month,
      year,
      learnerPage,
      learnerPageSize,
      debouncedLearnerSearch,
      learnerStatus,
      groupId,
      subgroupId,
      teamId,
    ],
    queryFn: () => getReportCourseCompletionLearners(selectedCourse!.course_id, {
      month,
      year,
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
                  <CardTitle className="text-base font-bold text-foreground truncate" title={selectedCourseData.name}>
                    {selectedCourseData.name}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                    <span className="text-primary">{selectedCourseData.completion_rate}% hoàn thành</span>
                    <span className="text-emerald-600">{selectedCourseData.completed_count.toLocaleString('en-US')} đã học</span>
                    <span className="text-amber-600">{selectedCourseData.learning_count.toLocaleString('en-US')} đang học</span>
                    <span className="text-slate-500">{selectedCourseData.not_started_count.toLocaleString('en-US')} chưa học</span>
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
                  Bảng xếp hạng tỉ lệ hoàn thành từng khóa học
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">Tính theo số học viên được phân khóa học trong bộ lọc hiện tại.</p>
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
                  <SelectTrigger className="w-full sm:w-[140px] h-10 text-xs bg-background/80 border-border shadow-sm">
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
                            <div className="min-w-0">
                              {u.status !== 'not_started' && (
                                <>
                                  <div className="flex justify-between text-[10px] mb-1">
                                    <span className="font-medium">{formatPercent(u.progress)}</span>
                                  </div>
                                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                    <div className={`h-full rounded-full ${cfg.barClass}`} style={{ width: `${clampPercent(u.progress)}%` }} />
                                  </div>
                                </>
                              )}
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
  year,
  selectedGroupId,
  selectedSubGroupId,
  selectedTeamId,
}: {
  year: number;
  selectedGroupId: string | 'all';
  selectedSubGroupId: string | 'all';
  selectedTeamId: string | 'all';
}) {
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const { data, isLoading } = useQuery({
    queryKey: ['group-enrollments-trend', year, selectedGroupId, selectedSubGroupId, selectedTeamId],
    queryFn: () => getReportChart(
      year,
      'total_enrollments',
      selectedGroupId === 'all' ? undefined : selectedGroupId,
      selectedGroupId === 'all' && selectedTeamId === 'all',
      selectedTeamId !== 'all' ? false : undefined,
      selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
      selectedTeamId === 'all' ? undefined : selectedTeamId
    ),
  });

  const groupKeys = useMemo(() => {
    if (!data?.data || data.data.length === 0) return [];
    return Object.keys(data.data[0]).filter(k => k !== 'month' && k !== 'month_label');
  }, [data]);

  const chartData = useMemo(() => {
    if (!data?.data) return [];

    return data.data.map(row => {
      const next = { ...row };
      groupKeys.forEach(key => {
        const value = Number(row[key]) || 0;
        next[key] = value > 0 ? value : null;
      });
      return next;
    });
  }, [data, groupKeys]);

  const hasLineData = useMemo(() => {
    return chartData.some(row => groupKeys.some(key => row[key] !== null && row[key] !== undefined));
  }, [chartData, groupKeys]);

  const totalThisYear = useMemo(() => {
    if (!data?.data) return 0;
    return data.data.reduce((sum, row) => {
      return sum + groupKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
    }, 0);
  }, [data, groupKeys]);

  return (
    <Card className="shadow-sm border-border/70 h-full flex flex-col bg-card/95 overflow-hidden relative">
      <CardHeader className="p-5 pb-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                <TrendingUp className="h-4 w-4" />
              </span>
              {selectedTeamId !== 'all'
                ? `Tổng lượt ghi danh của ${lowerGroupLabel(labels.team)}`
                : selectedSubGroupId !== 'all'
                ? `Tổng lượt ghi danh theo ${lowerGroupLabel(labels.team)}`
                : selectedGroupId !== 'all'
                  ? `Tổng lượt ghi danh theo ${lowerGroupLabel(labels.subgroup)}`
                  : `Tổng lượt ghi danh theo ${lowerGroupLabel(labels.group)}`}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Xu hướng ghi danh theo tháng - năm {year}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-2xl font-bold text-foreground leading-none">
              {isLoading ? '—' : totalThisYear.toLocaleString('en-US')}
            </span>
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Cả năm</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 flex-grow flex flex-col">
        {isLoading ? (
          <Skeleton className="w-full h-[240px] rounded-xl" />
        ) : !data?.data || groupKeys.length === 0 || !hasLineData ? (
          <div className="flex-grow flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl bg-muted/20">
            Không có dữ liệu ghi danh
          </div>
        ) : (
          <div className="w-full mt-3 h-[248px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 16, right: 18, left: -10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="var(--border)" opacity={0.24} />
                <XAxis
                  dataKey="month_label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }}
                  allowDecimals={false}
                />
                <ReTooltip
                  cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.35 }}
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--popover)',
                    color: 'var(--popover-foreground)',
                    fontSize: '12px',
                    boxShadow: '0 14px 36px rgba(15, 23, 42, 0.16)',
                  }}
                  formatter={(value: number, name: string) => [
                    `${Number(value).toLocaleString('vi-VN')} lượt`,
                    name === 'value' ? 'Ghi danh' : name,
                  ]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px', fontWeight: 600 }}
                />
                {groupKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key === 'value' ? 'Ghi danh' : key}
                    stroke={GROUP_BAR_COLORS[i % GROUP_BAR_COLORS.length]}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    connectNulls={false}
                    dot={{ r: 3.5, strokeWidth: 2, fill: 'var(--background)' }}
                    activeDot={{ r: 6, strokeWidth: 3, fill: 'var(--background)' }}
                    isAnimationActive
                    animationDuration={650}
                    style={{ filter: 'drop-shadow(0 5px 10px rgba(37, 99, 235, 0.12))' }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UncompletedWidget({ month, year, onSelectLearner, groupId, subgroupId, teamId }: { month: number, year: number, onSelectLearner: (u: string) => void, groupId: string | 'all', subgroupId: string | 'all', teamId: string | 'all' }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_started' | 'learning' | 'completed'>('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-learners', month, year, page, debouncedSearch, groupId, subgroupId, teamId, statusFilter],
    queryFn: () => getReportLearners({
      month, year, page, page_size: 5,
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
            <SelectTrigger className="w-[110px] h-9 text-xs bg-background border-border shadow-sm">
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
                    className="flex items-center p-4 hover:bg-muted/50 transition-all cursor-pointer group gap-4"
                    onClick={() => onSelectLearner(u.username)}
                  >
                    {/* User Info Column */}
                    <div className="flex items-center gap-3 w-[30%] min-w-[140px] shrink-0">
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

                    {/* Course Name Column */}
                    <div className="flex-1 min-w-0">
                      {u.course_name ? (
                        <p className="text-xs text-foreground truncate" title={u.course_name}>
                          {u.course_name}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">{u.enrolled_courses > 0 ? `${u.enrolled_courses} khóa học` : 'Chưa ghi danh'}</span>
                      )}
                    </div>

                    {/* Progress Column */}
                    <div className="w-[15%] min-w-[60px] shrink-0 flex flex-col justify-center">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-foreground">{formatPercent(u.progress)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.barClass}`}
                          style={{ width: `${clampPercent(u.progress)}%` }}
                        />
                      </div>
                    </div>

                    {/* Status Column */}
                    <div className="w-[20%] min-w-[90px] shrink-0 text-right flex flex-col items-end justify-center">
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

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
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
    queryKey: ['report-summary', selectedMonth, selectedYear, selectedGroupId, selectedSubGroupId, selectedTeamId, activeTenantId],
    queryFn: () => getReportSummary({
      month: selectedMonth,
      year: selectedYear,
      group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
      subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId,
      team_id: selectedTeamId === 'all' ? undefined : selectedTeamId
    }),
    // learner_plus phải có group được chọn (auto-set hoặc manual)
    enabled: canViewReport && !hasNoGroups && (isSuperadmin || isStaff || selectedGroupId !== 'all'),
  });

  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

  const { data: prevData } = useQuery({
    queryKey: ['report-summary', prevMonth, prevMonthYear, selectedGroupId, selectedSubGroupId, selectedTeamId, activeTenantId],
    queryFn: () => getReportSummary({
      month: prevMonth,
      year: prevMonthYear,
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
        selectedMonth,
        selectedYear,
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
    if (previous === undefined || previous === null) return { text: '', type: 'up' as const };

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
    { title: 'Tổng học viên', value: overview.total_learners, icon: Users, colorClass: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400', trend: learnersTrend.text, trendType: learnersTrend.type, key: 'total_learners', suffix: '' },
    { title: 'Học viên đang hoạt động', value: overview.active_learners, icon: UserCheck, colorClass: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400', trend: activeTrend.text, trendType: activeTrend.type, key: 'active_learners', suffix: '' },
    { title: 'Tỷ lệ hoàn thành', value: overview.completion_rate, icon: CheckCircle2, colorClass: 'text-purple-500 bg-purple-50 dark:bg-purple-500/10 dark:text-purple-400', trend: completionTrend.text, trendType: completionTrend.type, key: 'completion_rate', suffix: '%' },
    { title: 'Lượt ghi danh hàng tháng', value: overview.total_enrollments, icon: Calendar, colorClass: 'text-red-500 bg-red-50 dark:bg-red-500/10 dark:text-red-400', trend: enrollmentsTrend.text, trendType: enrollmentsTrend.type, key: 'total_enrollments', suffix: '' },
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
      />

      <ChartTrendModal
        metricKey={chartMetric?.key || null}
        title={chartMetric?.title || ''}
        isOpen={!!chartMetric}
        onClose={() => setChartMetric(null)}
        groupId={selectedGroupId}
        subgroupId={selectedSubGroupId}
        teamId={selectedTeamId}
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
            <DropdownMenuTrigger className="flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-primary transition-all text-foreground shadow-sm max-w-full sm:max-w-none">
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
              <DropdownMenuTrigger className="flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-primary transition-all text-foreground shadow-sm max-w-full sm:max-w-none">
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
              <DropdownMenuTrigger className="flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-primary transition-all text-foreground shadow-sm max-w-full sm:max-w-none">
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

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-primary transition-all text-foreground shadow-sm shrink-0">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="whitespace-nowrap">Tháng {selectedMonth}/{selectedYear}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[140px] max-h-[300px] overflow-y-auto rounded-lg custom-scrollbar">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(offset => {
                const d = new Date();
                d.setMonth(d.getMonth() - offset);
                const m = d.getMonth() + 1;
                const y = d.getFullYear();
                const isSelected = selectedMonth === m && selectedYear === y;
                return (
                  <DropdownMenuItem
                    key={`${m}-${y}`}
                    onClick={() => {
                      setSelectedMonth(m);
                      setSelectedYear(y);
                    }}
                    className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${isSelected ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                  >
                    Tháng {m}/{y}
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isSelected ? 'bg-foreground' : 'bg-transparent'}`} />
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
              className="shadow-sm border-border/60 hover:border-border transition-all cursor-pointer overflow-hidden relative bg-card"
              onClick={() => setChartMetric({ key: stat.key, title: stat.title })}
            >
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-md ${stat.colorClass}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <span className="text-[13px] font-medium text-muted-foreground">{stat.title}</span>
                  </div>
                  <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                    !
                  </div>
                </div>

                <div>
                  <div className="text-[34px] font-bold tracking-tight text-foreground leading-none mb-4">
                    {typeof stat.value === 'number' ? stat.value.toLocaleString('en-US') : stat.value}{stat.suffix}
                  </div>

                  {stat.trend && (
                    <div className="inline-flex">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${stat.trendType === 'up'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
                        }`}>
                        {stat.trend} so với tháng trước
                      </span>
                    </div>
                  )}
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
            month={selectedMonth}
            year={selectedYear}
            groupId={selectedGroupId}
            subgroupId={selectedSubGroupId}
            teamId={selectedTeamId}
            onSelectLearner={setSelectedLearner}
          />
        </motion.div>

        {((groupsData && groupsData.groups.length > 0) || (isLearnerPlus && learnerPlusMemberGroups.length > 0)) && (
          <motion.div variants={cardVariant}>
            <GroupEnrollmentsWidget
              year={selectedYear}
              selectedGroupId={selectedGroupId}
              selectedSubGroupId={selectedSubGroupId}
              selectedTeamId={selectedTeamId}
            />
          </motion.div>
        )}

        <motion.div variants={cardVariant}>
          <UncompletedWidget
            month={selectedMonth}
            year={selectedYear}
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
