/**
 * LearnerDetailModal — shared component
 * Dùng ở: report-summary.tsx, users.tsx
 * Hiển thị chi tiết khóa học + badges + weekly momentum của 1 learner.
 */
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users, AlertTriangle, Award, BarChart3, Filter, RotateCcw, Check, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid,
} from 'recharts';
import {
  getLearnerDetail,
  getAdminUserBadges,
  getAdminUserStudyTime,
  type LearnerDetailResult,
  type ReportCourseCompletionStatus,
  type StudyTimeGranularity,
} from '@/api/custom-reports';

// ── Badge Icons (đồng bộ với FE-5173 BadgeIcon.tsx) ──
import badgeManhGhep from '@/assets/badges/ManhGhepHoanHao.png';
import badgeChienBinh from '@/assets/badges/ChienBinhOnboarding.png';
import badgeNguoiNamGiu from '@/assets/badges/NguoiNamGiuGiaTri.png';
import badgeDaiSuLA from '@/assets/badges/DaiSuL&A.png';
import badgeNguoiButPha from '@/assets/badges/NguoiButPhaL&A.png';
import badgeChuyenGiaLA from '@/assets/badges/ChuyenGiaL&A.png';
import badgeBacThayTD from '@/assets/badges/BacThayTuyenDung.png';
import badgeOTIF from '@/assets/badges/BacThayTuyenDung2.png';
import badgeDaiSuTinCay from '@/assets/badges/DaiSuTinCay.png';
import badgeBacThayTN from '@/assets/badges/BacThayToanNang.png';
import badgeHocGia from '@/assets/badges/HocGiaTocDo.png';
import badgeNhaThamHiem from '@/assets/badges/NhaThamHiemHeThong.png';

const BADGE_IMAGE_MAP: Record<string, { src: string; name: string }> = {
  perfect_profile: { src: badgeManhGhep, name: 'Mảnh Ghép Hoàn Hảo' },
  onboarding_warrior: { src: badgeChienBinh, name: 'Chiến Binh Onboarding' },
  value_holder: { src: badgeNguoiNamGiu, name: 'Người Nắm Giữ Giá Trị' },
  la_ambassador: { src: badgeDaiSuLA, name: 'Đại Sứ L&A' },
  la_breakthrough: { src: badgeNguoiButPha, name: 'Người Bức Phá L&A' },
  la_expert: { src: badgeChuyenGiaLA, name: 'Chuyên Gia L&A' },
  recruitment_master: { src: badgeBacThayTD, name: 'Bậc Thầy Tuyển Dụng' },
  otif_expert: { src: badgeOTIF, name: 'Chuyên Gia OTIF' },
  trusted_ambassador: { src: badgeDaiSuTinCay, name: 'Đại Sứ Tin Cậy' },
  omnipotent_master: { src: badgeBacThayTN, name: 'Bậc Thầy Toàn Năng' },
  speed_scholar: { src: badgeHocGia, name: 'Học Giả Tốc Độ' },
  system_explorer: { src: badgeNhaThamHiem, name: 'Nhà Thám Hiểm Hệ Thống' },
};

type MomentumFilterMode = 'week' | 'day' | 'month' | 'year' | 'custom';

interface MomentumFilterState {
  mode: MomentumFilterMode;
  date: string;
  month: string;
  year: string;
  from: string;
  to: string;
}

const toIsoDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDaysLocal = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getCurrentWeekRange = () => {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = (day + 6) % 7;
  const monday = addDaysLocal(today, -mondayOffset);
  return { from: toIsoDate(monday), to: toIsoDate(addDaysLocal(monday, 6)) };
};

const createDefaultMomentumFilter = (): MomentumFilterState => {
  const now = new Date();
  const week = getCurrentWeekRange();
  return {
    mode: 'week',
    date: toIsoDate(now),
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    year: String(now.getFullYear()),
    from: week.from,
    to: week.to,
  };
};

const countDaysInRange = (from: string, to: string) => {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
};

const pickGranularityForRange = (from: string, to: string): StudyTimeGranularity => {
  const days = countDaysInRange(from, to);
  if (days <= 370) return 'day';
  if (days <= 3650) return 'month';
  return 'year';
};

const getMonthRange = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 0);
  return { from: toIsoDate(start), to: toIsoDate(end) };
};

const buildStudyTimeParams = (filter: MomentumFilterState) => {
  if (filter.mode === 'week') return undefined;
  if (filter.mode === 'day') return { from: filter.date, to: filter.date, granularity: 'day' as const };
  if (filter.mode === 'month') return { ...getMonthRange(filter.month), granularity: 'day' as const };
  if (filter.mode === 'year') return { from: `${filter.year}-01-01`, to: `${filter.year}-12-31`, granularity: 'month' as const };
  const from = filter.from <= filter.to ? filter.from : filter.to;
  const to = filter.from <= filter.to ? filter.to : filter.from;
  return { from, to, granularity: pickGranularityForRange(from, to) };
};

const formatBucketLabel = (date: string, granularity: StudyTimeGranularity = 'day') => {
  const [year, month, day] = date.split('-');
  if (granularity === 'year') return year;
  if (granularity === 'month') return `${month}/${year}`;
  return `${day}/${month}`;
};

const clampProgress = (value: number | null | undefined) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), 100);
};

const getCourseProgressTone = (progress: number, isCompleted: boolean) => {
  if (isCompleted || progress >= 100) {
    return {
      ringClass: 'text-emerald-400',
      trackClass: 'text-emerald-500/15',
      textClass: 'text-emerald-300',
      haloClass: 'bg-emerald-500/12',
      badgeClass: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25',
    };
  }
  if (progress >= 75) {
    return {
      ringClass: 'text-sky-400',
      trackClass: 'text-sky-500/15',
      textClass: 'text-sky-300',
      haloClass: 'bg-sky-500/12',
      badgeClass: 'bg-sky-500/12 text-sky-300 border-sky-500/25',
    };
  }
  if (progress >= 50) {
    return {
      ringClass: 'text-amber-400',
      trackClass: 'text-amber-500/15',
      textClass: 'text-amber-300',
      haloClass: 'bg-amber-500/12',
      badgeClass: 'bg-amber-500/12 text-amber-300 border-amber-500/25',
    };
  }
  if (progress > 0) {
    return {
      ringClass: 'text-orange-400',
      trackClass: 'text-orange-500/15',
      textClass: 'text-orange-300',
      haloClass: 'bg-orange-500/12',
      badgeClass: 'bg-orange-500/12 text-orange-300 border-orange-500/25',
    };
  }
  return {
    ringClass: 'text-slate-400',
    trackClass: 'text-slate-500/15',
    textClass: 'text-slate-300',
    haloClass: 'bg-slate-500/12',
    badgeClass: 'bg-slate-500/12 text-slate-300 border-slate-500/25',
  };
};

const LEARNER_DETAIL_PAGE_SIZE = 10;

const COURSE_STATUS_OPTIONS: Array<{ value: ReportCourseCompletionStatus; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'completed', label: 'Đã học' },
  { value: 'learning', label: 'Đang học' },
  { value: 'not_started', label: 'Chưa học' },
];

const normalizeScopeId = (value?: string | 'all' | null) => {
  if (!value || value === 'all') return undefined;
  return value;
};

interface Props {
  username: string | null;
  isOpen: boolean;
  onClose: () => void;
  groupId?: string | 'all' | null;
  subgroupId?: string | 'all' | null;
  teamId?: string | 'all' | null;
}

export function LearnerDetailModal({ username, isOpen, onClose, groupId, subgroupId, teamId }: Props) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [coursePage, setCoursePage] = useState(1);
  const [courseStatus, setCourseStatus] = useState<ReportCourseCompletionStatus>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [momentumFilter, setMomentumFilter] = useState<MomentumFilterState>(() => createDefaultMomentumFilter());

  const studyTimeParams = useMemo(() => buildStudyTimeParams(momentumFilter), [momentumFilter]);
  const isDefaultWeekly = !studyTimeParams;
  const scopedGroupId = normalizeScopeId(groupId);
  const scopedSubgroupId = normalizeScopeId(subgroupId);
  const scopedTeamId = normalizeScopeId(teamId);
  const selectedCourseStatus = COURSE_STATUS_OPTIONS.find((option) => option.value === courseStatus) || COURSE_STATUS_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setDebouncedSearch('');
    setCourseStatus('all');
    setCoursePage(1);
  }, [username, isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setCoursePage(1);
  }, [username, debouncedSearch, courseStatus, scopedGroupId, scopedSubgroupId, scopedTeamId]);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'learner-detail',
      username,
      coursePage,
      debouncedSearch,
      courseStatus,
      scopedGroupId,
      scopedSubgroupId,
      scopedTeamId,
    ],
    queryFn: () =>
      getLearnerDetail({
        username: username!,
        page: coursePage,
        page_size: LEARNER_DETAIL_PAGE_SIZE,
        search: debouncedSearch,
        status: courseStatus,
        group_id: scopedGroupId,
        subgroup_id: scopedSubgroupId,
        team_id: scopedTeamId,
      }),
    enabled: !!username && isOpen,
    placeholderData: (previousData) => previousData,
  });

  const allResults = data?.results || [];
  const userGroups = data?.groups || [];
  const totalCoursePages = data?.total_pages || 0;
  const totalCourses = data?.total_count || 0;
  const currentCoursePage = data?.current_page || coursePage;

  const { data: badgesData } = useQuery({
    queryKey: ['admin-user-badges', username],
    queryFn: () => getAdminUserBadges(username!),
    enabled: !!username && isOpen,
  });

  const { data: studyTimeData } = useQuery({
    queryKey: ['admin-user-study-time', username, studyTimeParams],
    queryFn: () => getAdminUserStudyTime(username!, studyTimeParams),
    enabled: !!username && isOpen,
  });

  const studyChartData = (studyTimeData?.entries || []).map((e) => {
    const granularity = studyTimeData?.meta?.granularity || studyTimeParams?.granularity || 'day';
    return {
      name: formatBucketLabel(e.date, granularity),
      hours: Number((e.minutes / 60).toFixed(1)),
      rawMinutes: e.minutes,
    };
  });
  const totalStudyMinutes = (studyTimeData?.entries || []).reduce((sum, e) => sum + e.minutes, 0);

  const resetMomentumFilter = () => {
    setMomentumFilter(createDefaultMomentumFilter());
    setFilterOpen(false);
  };

  const fmtTime = (m: number) => {
    if (m < 60) return `${m} phút`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r > 0 ? `${h} tiếng ${r} phút` : `${h} tiếng`;
  };

  const renderMomentumFilterPanel = () => (
    <div className="absolute right-3 top-11 z-30 w-[calc(100%-1.5rem)] rounded-xl border border-white/20 bg-[#071827]/95 p-3 shadow-2xl backdrop-blur sm:w-[360px]">
      <div className="mb-3 grid grid-cols-2 gap-1 sm:grid-cols-5">
        {[
          ['week', '7 ngày'],
          ['day', 'Ngày'],
          ['month', 'Tháng'],
          ['year', 'Năm'],
          ['custom', 'Từ - đến'],
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setMomentumFilter((current) => ({ ...current, mode: mode as MomentumFilterMode }))}
            className={`h-8 rounded-md px-2 text-[11px] font-semibold transition ${momentumFilter.mode === mode ? 'bg-[#45FFCA] text-[#071827]' : 'bg-white/10 text-white/80 hover:bg-white/15'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {momentumFilter.mode === 'day' && (
        <Input
          type="date"
          value={momentumFilter.date}
          onChange={(e) => setMomentumFilter((current) => ({ ...current, date: e.target.value }))}
          className="h-9 border-white/15 bg-white/10 text-sm text-white"
        />
      )}
      {momentumFilter.mode === 'month' && (
        <Input
          type="month"
          value={momentumFilter.month}
          onChange={(e) => setMomentumFilter((current) => ({ ...current, month: e.target.value }))}
          className="h-9 border-white/15 bg-white/10 text-sm text-white"
        />
      )}
      {momentumFilter.mode === 'year' && (
        <Input
          type="number"
          min="2000"
          max="2100"
          value={momentumFilter.year}
          onChange={(e) => setMomentumFilter((current) => ({ ...current, year: e.target.value }))}
          className="h-9 border-white/15 bg-white/10 text-sm text-white"
        />
      )}
      {momentumFilter.mode === 'custom' && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            type="date"
            value={momentumFilter.from}
            onChange={(e) => setMomentumFilter((current) => ({ ...current, from: e.target.value }))}
            className="h-9 border-white/15 bg-white/10 text-sm text-white"
          />
          <Input
            type="date"
            value={momentumFilter.to}
            onChange={(e) => setMomentumFilter((current) => ({ ...current, to: e.target.value }))}
            className="h-9 border-white/15 bg-white/10 text-sm text-white"
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={resetMomentumFilter}
          className="h-8 px-2 text-white hover:bg-white/10 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => setFilterOpen(false)}
          className="h-8 bg-[#45FFCA] px-3 text-[#071827] hover:bg-[#45FFCA]/90"
        >
          <Check className="h-3.5 w-3.5" />
          Apply
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[100vw] max-w-[100vw] sm:w-[95vw] sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[1200px] h-[100dvh] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 overflow-hidden bg-background border-0 sm:border sm:border-border shadow-2xl rounded-none sm:rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-muted/10 pointer-events-none z-0" />
        <div className="z-10 flex flex-col h-full overflow-hidden">
          <DialogHeader className="p-4 sm:p-6 pb-4 sm:pb-5 border-b border-border/40 bg-muted/20 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-base sm:text-xl font-bold text-primary shadow-inner border border-primary/10 shrink-0">
                {username?.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <DialogTitle className="text-lg sm:text-2xl font-bold text-foreground truncate">
                  Chi tiết: {username}
                </DialogTitle>
                {userGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-2 mb-1">
                    {userGroups.map((g: any, i: number) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        {g.group_name} <span className="mx-1 opacity-50">•</span> {g.subgroup_name}
                      </span>
                    ))}
                  </div>
                )}
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">
                  Danh sách khóa học được phân và tiến độ học tập.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-4 sm:px-6 py-3 sm:py-4 bg-muted/10 border-b border-border/40 z-10 shrink-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-md">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm khóa học..."
                  className="pl-9 h-9 sm:h-10 bg-background border-border shadow-sm focus-visible:ring-primary/30 text-sm rounded-xl transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 sm:h-10 w-full justify-between rounded-xl border-border bg-background px-3 text-xs font-semibold shadow-sm sm:w-[150px]"
                  >
                    {selectedCourseStatus.label}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[170px]">
                  {COURSE_STATUS_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setCourseStatus(option.value)}
                      className="cursor-pointer justify-between text-xs font-medium"
                    >
                      {option.label}
                      {courseStatus === option.value && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 custom-scrollbar space-y-4 z-10 bg-muted/5">
            {/* Badges & Weekly Momentum Row */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 mb-2">
              {/* Badges Card */}
              <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="h-4 w-4 text-amber-500 shrink-0" />
                  <h4 className="text-xs sm:text-sm font-bold text-foreground">Danh hiệu đạt được</h4>
                  {badgesData && (
                    <span className="ml-auto text-[9px] sm:text-[10px] font-bold bg-primary/10 text-primary px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                      {badgesData.badges.length} danh hiệu
                    </span>
                  )}
                </div>
                {!badgesData ? (
                  <div className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-9 w-20 sm:h-10 sm:w-24 rounded-lg" />
                    ))}
                  </div>
                ) : badgesData.badges.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Chưa đạt danh hiệu nào.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {badgesData.badges.map((b) => {
                      const info = BADGE_IMAGE_MAP[b.badge_id];
                      if (!info) return null;
                      return (
                        <div
                          key={b.badge_id}
                          className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20 border border-amber-200/50 dark:border-amber-700/30 text-[10px] sm:text-xs font-medium text-amber-800 dark:text-amber-300 shadow-sm"
                          title={`${info.name} — Đạt: ${new Date(b.earned_at).toLocaleDateString('vi-VN')}`}
                        >
                          <motion.div
                            className="relative flex items-center justify-center shrink-0 w-5 h-5 sm:w-7 sm:h-7"
                            whileHover={{ scale: 1.15 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          >
                            <img src={info.src} alt={info.name} className="w-full h-full object-contain drop-shadow-sm" />
                            <div
                              className="absolute inset-0 z-10 pointer-events-none"
                              style={{
                                WebkitMaskImage: `url(${info.src})`,
                                WebkitMaskSize: 'contain',
                                WebkitMaskRepeat: 'no-repeat',
                                WebkitMaskPosition: 'center',
                                maskImage: `url(${info.src})`,
                                maskSize: 'contain',
                                maskRepeat: 'no-repeat',
                                maskPosition: 'center',
                              }}
                            >
                              <motion.div
                                className="absolute top-[-50%] w-[60%] h-[200%] bg-gradient-to-r from-transparent via-white/80 to-transparent skew-x-[-25deg]"
                                animate={{ left: ['-100%', '250%'] }}
                                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
                              />
                            </div>
                          </motion.div>
                          <span className="truncate max-w-[80px] sm:max-w-none">{info.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Weekly Momentum Chart — giống FE 5173 WelcomeBanner */}
              <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-primary/80 p-3 sm:p-4 shadow-sm text-white min-w-0 overflow-hidden relative">
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-white/80 shrink-0" />
                      Weekly Momentum
                    </h4>
                    {studyTimeData && (() => {
                      if (!isDefaultWeekly) {
                        const meta = studyTimeData.meta;
                        const from = meta?.from || studyTimeParams?.from || momentumFilter.from;
                        const to = meta?.to || studyTimeParams?.to || momentumFilter.to;
                        const granularity = meta?.granularity || studyTimeParams?.granularity || 'day';
                        const bucket = granularity === 'day' ? 'ngày' : granularity === 'month' ? 'tháng' : 'năm';
                        return <p className="text-[10px] sm:text-[11px] text-white/70 mt-1">
                          {from === to ? from : `${from} → ${to}`} theo {bucket}: <span className="text-[#45FFCA] font-semibold">{fmtTime(totalStudyMinutes)}</span>
                        </p>;
                      }
                      const todayMins = studyChartData[studyChartData.length - 1]?.rawMinutes || 0;
                      const pastDays = studyChartData.slice(0, -1).filter(d => d.rawMinutes > 0);
                      const avgMins = pastDays.length > 0
                        ? Math.round(pastDays.reduce((a, d) => a + d.rawMinutes, 0) / pastDays.length)
                        : 0;
                      if (todayMins === 0) {
                        return <p className="text-[10px] sm:text-[11px] text-white/70 mt-1">Hôm nay chưa bắt đầu học.</p>;
                      }
                      if (avgMins > 0) {
                        const pct = Math.round((todayMins / avgMins) * 100);
                        return <p className="text-[10px] sm:text-[11px] text-white/70 mt-1">
                          Hôm nay: <span className="text-[#45FFCA] font-semibold">{fmtTime(todayMins)}</span>
                          {pct >= 100 ? ` — cao hơn ${pct - 100}% so với TB tuần` : ` — TB tuần: ${fmtTime(avgMins)}/ngày`}
                        </p>;
                      }
                      return <p className="text-[10px] sm:text-[11px] text-white/70 mt-1">
                        Hôm nay: <span className="text-[#45FFCA] font-semibold">{fmtTime(todayMins)}</span>
                      </p>;
                    })()}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setFilterOpen((open) => !open)}
                    className="h-7 shrink-0 rounded-full bg-white/10 px-2 text-[10px] font-semibold text-white hover:bg-white/15 hover:text-white"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Bộ lọc
                  </Button>
                </div>
                {filterOpen && renderMomentumFilterPanel()}
                {!studyTimeData ? (
                  <Skeleton className="h-[130px] sm:h-[150px] w-full rounded-lg opacity-30" />
                ) : (
                  <div className="h-[130px] sm:h-[150px] w-full min-w-0 relative">
                    <div className="absolute top-[0px] left-[18px] text-[10px] text-white/70 z-10">(h)</div>
                    <ResponsiveContainer width="99%" height="100%">
                      <AreaChart
                        data={[...studyChartData, { name: '', hours: studyChartData[studyChartData.length - 1]?.hours ? studyChartData[studyChartData.length - 1].hours * 1.1 : 0, rawMinutes: 0 }]}
                        margin={{ top: 20, right: 15, left: -5, bottom: 10 }}
                      >
                        <defs>
                          <linearGradient id="studyGradModal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#45FFCA" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#45FFCA" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="4 4"
                          vertical={true}
                          horizontal={false}
                          stroke="rgba(255,255,255,0.15)"
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }}
                          tickLine={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }}
                          tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 10 }}
                          tickMargin={8}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          axisLine={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }}
                          tickLine={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }}
                          tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 10 }}
                          allowDecimals={false}
                          tickFormatter={(val) => val === 0 ? '' : val}
                          tickCount={4}
                          domain={[0, 'auto']}
                          width={30}
                        />
                        <ReTooltip
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.[0]) return null;
                            const mins = payload[0].payload.rawMinutes || 0;
                            if (mins === 0) return null;
                            const timeText = mins < 60
                              ? `${mins} phút`
                              : mins % 60 > 0
                                ? `${Math.floor(mins / 60)} tiếng ${mins % 60} phút`
                                : `${Math.floor(mins / 60)} tiếng`;
                            return (
                              <div className="relative bg-[#45FFCA] text-[#0a1628] px-2.5 py-1.5 rounded-lg shadow-lg text-center min-w-[90px] -mt-8 flex flex-col items-center">
                                <span className="text-[10px] font-normal">Đã học</span>
                                <span className="text-[12px] font-bold">{timeText}</span>
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#45FFCA] rotate-45 rounded-[1px]" />
                              </div>
                            );
                          }}
                          cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="hours"
                          stroke="#45FFCA"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#studyGradModal)"
                          activeDot={{ r: 4, fill: '#45FFCA', stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Course list */}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : isError ? (
              <div className="text-center py-10 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Lỗi khi tải dữ liệu chi tiết.</p>
                <button onClick={() => refetch()} className="text-primary text-sm font-bold mt-2">
                  Thử lại
                </button>
              </div>
            ) : allResults.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground italic">
                Không tìm thấy khóa học nào.
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`grid gap-3 transition-opacity duration-200 ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
                  <AnimatePresence mode="popLayout">
                    {allResults.map((course: LearnerDetailResult) => {
                      const radius = 16;
                      const stroke = 3;
                      const normalizedRadius = radius - stroke;
                      const circumference = normalizedRadius * 2 * Math.PI;
                      const progress = clampProgress(course.progress);
                      const tone = getCourseProgressTone(progress, course.is_completed);
                      const strokeDashoffset =
                        circumference - (progress / 100) * circumference;
                      const statusLabel = course.status === 'not_started'
                        ? 'Chưa học'
                        : course.status === 'completed' || course.is_completed
                          ? 'Hoàn thành'
                          : 'Đang học';

                      return (
                        <motion.div
                          key={course.course_id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          layout
                          className="group p-3 sm:p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex items-center justify-between gap-2 sm:gap-4"
                        >
                          <div className="min-w-0 flex-grow">
                            <p className="text-xs sm:text-sm font-bold truncate group-hover:text-primary transition-colors">
                              {course.course_name}
                            </p>
                            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1 truncate">
                              ID: {course.course_id}
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center justify-end w-auto sm:w-[140px] gap-2 sm:gap-3">
                            <div className="flex flex-col items-center justify-center">
                              <div className={`relative flex items-center justify-center w-10 h-10 rounded-full ${tone.haloClass} shadow-inner transition-transform group-hover:scale-105`}>
                                <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
                                  <circle
                                    stroke="currentColor"
                                    fill="transparent"
                                    strokeWidth={stroke}
                                    className={tone.trackClass}
                                    r={normalizedRadius}
                                    cx={radius}
                                    cy={radius}
                                  />
                                  <motion.circle
                                    stroke="currentColor"
                                    fill="transparent"
                                    strokeWidth={stroke}
                                    strokeDasharray={`${circumference} ${circumference}`}
                                    initial={{ strokeDashoffset: circumference }}
                                    animate={{ strokeDashoffset }}
                                    transition={{ duration: 1, ease: 'easeOut' }}
                                    className={tone.ringClass}
                                    strokeLinecap="round"
                                    r={normalizedRadius}
                                    cx={radius}
                                    cy={radius}
                                  />
                                </svg>
                                <span
                                  className={`absolute text-[9px] font-black tabular-nums ${tone.textClass}`}
                                >
                                  {Math.round(progress)}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`hidden sm:inline-block w-[75px] text-center text-[9px] font-bold uppercase tracking-tighter px-1.5 py-1 rounded-full border ${tone.badgeClass}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                <div className="flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Trang {currentCoursePage} / {Math.max(totalCoursePages, 1)} · {totalCourses} khóa học
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-xl"
                      disabled={currentCoursePage <= 1 || isFetching}
                      onClick={() => setCoursePage((current) => Math.max(current - 1, 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-xl"
                      disabled={currentCoursePage >= totalCoursePages || isFetching}
                      onClick={() => setCoursePage((current) => Math.min(current + 1, Math.max(totalCoursePages, 1)))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
