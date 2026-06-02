/**
 * LearnerDetailModal — shared component
 * Dùng ở: report-summary.tsx, users.tsx
 * Hiển thị chi tiết khóa học + badges + weekly momentum của 1 learner.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, AlertTriangle, Award, BarChart3, RefreshCcw,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid,
} from 'recharts';
import {
  getLearnerDetail,
  getAdminUserBadges,
  getAdminUserStudyTime,
  type LearnerDetailResult,
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

interface Props {
  username: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function LearnerDetailModal({ username, isOpen, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['learner-detail', username, debouncedSearch],
    queryFn: ({ pageParam = 1 }) =>
      getLearnerDetail(username!, pageParam as number, debouncedSearch),
    enabled: !!username && isOpen,
    getNextPageParam: (lastPage) =>
      lastPage.current_page < lastPage.total_pages
        ? lastPage.current_page + 1
        : undefined,
    initialPageParam: 1,
  });

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const element = observerTarget.current;
    if (!element) return;
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [handleObserver]);

  const allResults = data?.pages.flatMap((page) => page.results) || [];
  const userGroups = data?.pages[0]?.groups || [];

  const { data: badgesData } = useQuery({
    queryKey: ['admin-user-badges', username],
    queryFn: () => getAdminUserBadges(username!),
    enabled: !!username && isOpen,
  });

  const { data: studyTimeData } = useQuery({
    queryKey: ['admin-user-study-time', username],
    queryFn: () => getAdminUserStudyTime(username!),
    enabled: !!username && isOpen,
  });

  const studyChartData = (studyTimeData?.entries || []).map((e) => {
    const d = new Date(e.date);
    // Format dd/MM giống FE 5173 (ví dụ: 02/06)
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return {
      name: `${dd}/${mm}`,
      hours: Number((e.minutes / 60).toFixed(1)),
      rawMinutes: e.minutes,
    };
  });

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
                  Danh sách các khóa học đã đăng ký và tiến độ học tập.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-4 sm:px-6 py-3 sm:py-4 bg-muted/10 border-b border-border/40 z-10 shrink-0">
            <div className="relative max-w-md">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm khóa học..."
                className="pl-9 h-9 sm:h-10 bg-background border-border shadow-sm focus-visible:ring-primary/30 text-sm rounded-xl transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-white/80 shrink-0" />
                      Weekly Momentum
                    </h4>
                    {studyTimeData && (() => {
                      const todayMins = studyChartData[studyChartData.length - 1]?.rawMinutes || 0;
                      const pastDays = studyChartData.slice(0, -1).filter(d => d.rawMinutes > 0);
                      const avgMins = pastDays.length > 0
                        ? Math.round(pastDays.reduce((a, d) => a + d.rawMinutes, 0) / pastDays.length)
                        : 0;
                      const fmtTime = (m: number) => {
                        if (m < 60) return `${m} phút`;
                        const h = Math.floor(m / 60);
                        const r = m % 60;
                        return r > 0 ? `${h} tiếng ${r} phút` : `${h} tiếng`;
                      };
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
                  <span className="text-[9px] sm:text-[10px] font-medium text-white/60 whitespace-nowrap self-start">Tuần hiện tại</span>
                </div>
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
                          interval={0}
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
              <div className="grid gap-3">
                <AnimatePresence>
                  {allResults.map((course: LearnerDetailResult) => {
                    const radius = 16;
                    const stroke = 3;
                    const normalizedRadius = radius - stroke;
                    const circumference = normalizedRadius * 2 * Math.PI;
                    const strokeDashoffset =
                      circumference - ((course.progress || 0) / 100) * circumference;

                    return (
                      <motion.div
                        key={course.course_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
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
                            <div className="relative flex items-center justify-center w-10 h-10">
                              <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
                                <circle
                                  stroke="currentColor"
                                  fill="transparent"
                                  strokeWidth={stroke}
                                  className="text-primary/10"
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
                                  className={course.is_completed ? 'text-primary' : 'text-primary/40'}
                                  strokeLinecap="round"
                                  r={normalizedRadius}
                                  cx={radius}
                                  cy={radius}
                                />
                              </svg>
                              <span
                                className={`absolute text-[9px] font-black tabular-nums ${
                                  course.is_completed ? 'text-primary' : 'text-muted-foreground'
                                }`}
                              >
                                {Math.round(course.progress || 0)}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`hidden sm:inline-block w-[75px] text-center text-[9px] font-bold uppercase tracking-tighter px-1.5 py-1 rounded-full ${
                              course.is_completed
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {course.is_completed ? 'Hoàn thành' : 'Đang học'}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                <div ref={observerTarget} className="h-10 flex items-center justify-center">
                  {isFetchingNextPage && (
                    <RefreshCcw className="h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
