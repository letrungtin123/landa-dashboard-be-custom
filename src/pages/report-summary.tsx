import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useTenantStore } from '@/utils/tenant-store';
import { useHeaderInfo } from '@/utils/header-store';
import { PageHeader } from '@/components/shared/page-header';
import { useAuthStore } from '@/utils/store';
import {
  getReportSummary,
  getReportGroups,
  getReportSubGroups,
  getReportTeams,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { exportReportExcel } from '@/utils/export-report';
import { LearnerDetailModal } from '@/components/users/learner-detail-modal';
import { ReportWindowChart } from '@/components/reports/ReportWindowChart';
import { ReportMetricTrendModal } from '@/components/reports/report-metric-trend-modal';
import { CourseCompletionRankingWidget } from '@/components/reports/course-completion-ranking-widget';
import { ReportLearnerListWidget } from '@/components/reports/report-learner-list-widget';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { AppTooltip } from '@/components/ui/tooltip';
import { formatLocaleDate, formatLocaleNumber } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import type { AppLocale } from '@/i18n';

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

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

function formatDateLabel(date: Date, locale: AppLocale): string {
  return formatLocaleDate(date, locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDateRangeLabel(from: Date, to: Date, locale: AppLocale): string {
  if (formatDateParam(from) === formatDateParam(to)) return formatDateLabel(from, locale);
  return `${formatDateLabel(from, locale)} - ${formatDateLabel(to, locale)}`;
}

function getPreviousDateRange(from: Date, to: Date): { from: Date; to: Date } {
  const dayCount = Math.max(1, differenceInCalendarDays(to, from) + 1);
  const previousTo = addDays(from, -1);
  return { from: addDays(previousTo, -(dayCount - 1)), to: previousTo };
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
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const title = selectedTeamId !== 'all'
    ? t('reports.totalEnrollmentOf', { group: lowerGroupLabel(labels.team) })
    : selectedSubGroupId !== 'all'
      ? t('reports.totalEnrollmentBy', { group: lowerGroupLabel(labels.team) })
      : selectedGroupId !== 'all'
        ? t('reports.totalEnrollmentBy', { group: lowerGroupLabel(labels.subgroup) })
        : t('reports.totalEnrollmentBy', { group: lowerGroupLabel(labels.group) });

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

  const formatEnrollmentValue = useCallback((value: number) => `${formatLocaleNumber(value, locale)} ${t('reports.enrollment')}`, [locale, t]);

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
              {t('reports.enrollmentTrend', { dateRange: dateLabel })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-2xl font-bold text-foreground leading-none">
              {formatLocaleNumber(totalEnrollments, locale)}
            </span>
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{t('reports.duringPeriod')}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 flex-grow flex flex-col min-w-0">
        <ReportWindowChart
          request={chartRequest}
          height={340}
          valueLabel={t('reports.enrollment')}
          emptyLabel={t('reports.noEnrollmentData')}
          formatValue={formatEnrollmentValue}
          colors={GROUP_BAR_COLORS}
          variant="line"
        />
      </CardContent>
    </Card>
  );
}
// LearnerDetailModal được import từ shared component:
// import { LearnerDetailModal } from '@/components/users/learner-detail-modal';

export default function ReportSummaryPage() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  useHeaderInfo(t('reports.title'));
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
  const dateLabel = useMemo(() => getDateRangeLabel(normalizedDateRange.from, normalizedDateRange.to, locale), [locale, normalizedDateRange.from, normalizedDateRange.to]);
  const draftDateLabel = useMemo(() => getDateRangeLabel(normalizedDraftDateRange.from, normalizedDraftDateRange.to, locale), [locale, normalizedDraftDateRange.from, normalizedDraftDateRange.to]);
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
  const allGroupLabel = t('reports.allGroup', { group: lowerGroupLabel(labels.group) });
  const allSubgroupLabel = t('reports.allGroup', { group: lowerGroupLabel(labels.subgroup) });
  const allTeamLabel = t('reports.allGroup', { group: lowerGroupLabel(labels.team) });
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
          <h2 className="text-xl font-bold text-destructive mb-2">{t('reports.noAccessTitle')}</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {t('reports.noAccessDescription')}
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
          <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400 mb-2">{t('reports.noHierarchyTitle', { hierarchy: hierarchyLabel })}</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {t('reports.noHierarchyDescription', { hierarchy: hierarchyLabel })}
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
        <p>{t('reports.analysisLoadFailed')}</p>
        <button onClick={() => refetch()} className="text-sm text-primary font-medium hover:underline flex items-center gap-2">
          <RefreshCcw className="h-4 w-4" /> {t('common.retry')}
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
      const formatted = suffix === '' ? formatLocaleNumber(Math.abs(diff), locale) : Math.abs(diff).toFixed(1);
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
    { title: t('reports.totalLearnersCreated'), value: overview.total_learners, icon: Users, colorClass: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400', trend: learnersTrend.text, trendType: learnersTrend.type, key: 'total_learners', suffix: '', description: t('reports.totalLearnersDescription'), supportingText: '', notice: '', disabled: false },
    { title: t('reports.activeLearners'), value: overview.active_learners, icon: UserCheck, colorClass: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400', trend: activeTrend.text, trendType: activeTrend.type, key: 'active_learners', suffix: '', description: t('reports.activeLearnersDescription'), supportingText: '', notice: '', disabled: false },
    { title: t('reports.averageCompletionRate'), value: Math.round(overview.completion_rate), icon: CheckCircle2, colorClass: 'text-purple-500 bg-purple-50 dark:bg-purple-500/10 dark:text-purple-400', trend: completionTrend.text, trendType: completionTrend.type, key: 'completion_rate', suffix: '%', description: t('reports.completionRateDescription'), supportingText: '', notice: '', disabled: false },
    { title: t('reports.periodEnrollments'), value: overview.total_enrollments, icon: CalendarIcon, colorClass: 'text-red-500 bg-red-50 dark:bg-red-500/10 dark:text-red-400', trend: enrollmentsTrend.text, trendType: enrollmentsTrend.type, key: 'total_enrollments', suffix: '', description: t('reports.enrollmentsDescription'), supportingText: '', notice: '', disabled: false },
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

      <ReportMetricTrendModal
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
          title={t('reports.overviewTitle')}
          description={t('reports.overviewDescription')}
        />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className={`app-liquid-field flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-border transition-all text-foreground shadow-sm max-w-full sm:max-w-none ${selectedGroupId !== 'all' ? 'app-liquid-filter-active' : ''}`}>
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[100px] sm:max-w-[120px]">
                {selectedGroupId === 'all'
                  ? allGroupLabel
                  : groupsData?.groups.find(g => g.id === selectedGroupId)?.name || t('reports.loading')}
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
                    : subGroupsData?.subgroups.find(sg => sg.id === selectedSubGroupId)?.name || t('reports.loading')}
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
                    : teamsData?.teams.find(team => team.id === selectedTeamId)?.name || t('reports.loading')}
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
                  <p className="text-xs font-bold text-foreground">{t('reports.dateFilter')}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{t('reports.currentlyApplied', { dateRange: dateLabel })}</p>
                </div>
                <button
                  type="button"
                  onClick={handleDraftCurrentMonth}
                  className="h-7 rounded-lg border border-border bg-background px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  {t('reports.thisMonth')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 border-b border-border/60 bg-muted/20">
                <button
                  type="button"
                  onClick={() => setDateDraftTarget('from')}
                  aria-pressed={dateDraftTarget === 'from'}
                  className={`h-[72px] rounded-xl border px-3 text-left transition-all ${dateDraftTarget === 'from' ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/15' : 'border-border bg-background hover:bg-muted'}`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('reports.fromDate')}</span>
                  <span className="mt-1 block text-sm font-bold text-foreground">{formatDateLabel(normalizedDraftDateRange.from, locale)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDateDraftTarget('to')}
                  aria-pressed={dateDraftTarget === 'to'}
                  className={`h-[72px] rounded-xl border px-3 text-left transition-all ${dateDraftTarget === 'to' ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/15' : 'border-border bg-background hover:bg-muted'}`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('reports.toDate')}</span>
                  <span className="mt-1 block text-sm font-bold text-foreground">{formatDateLabel(normalizedDraftDateRange.to, locale)}</span>
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
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDateFilter}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t('common.confirm')}
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <AppTooltip content={t('reports.resetDateRange')}><button
            type="button"
            onClick={handleResetDateFilter}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-border bg-background hover:bg-muted transition-all text-muted-foreground hover:text-foreground active:scale-95 shadow-sm shrink-0"
            aria-label={t('reports.resetDateRange')}
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
              <span className="whitespace-nowrap">{isExporting ? t('reports.exporting') : t('reports.exportData')}</span>
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
                    {typeof stat.value === 'number' ? formatLocaleNumber(stat.value, locale) : stat.value}{stat.suffix}
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
                          {stat.trend} {t('reports.comparedToPrevious')}
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
          <ReportLearnerListWidget
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
