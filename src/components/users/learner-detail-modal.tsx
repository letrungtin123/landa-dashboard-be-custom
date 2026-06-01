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
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as ReTooltip,
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
    const dayLabel = d.toLocaleDateString('vi-VN', { weekday: 'short' });
    return {
      name: dayLabel,
      hours: Number((e.minutes / 60).toFixed(1)),
      minutes: e.minutes,
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

              {/* Weekly Momentum Chart */}
              <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-primary/80 p-3 sm:p-4 shadow-sm text-white min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-white/80 shrink-0" />
                  <h4 className="text-xs sm:text-sm font-bold">Weekly Momentum</h4>
                  <span className="ml-auto text-[9px] sm:text-[10px] font-medium text-white/70 whitespace-nowrap">Tuần hiện tại</span>
                </div>
                {!studyTimeData ? (
                  <Skeleton className="h-[100px] sm:h-[120px] w-full rounded-lg opacity-30" />
                ) : (
                  <div className="h-[100px] sm:h-[120px] w-full min-w-0 relative">
                    <ResponsiveContainer width="99%" height="100%">
                      <AreaChart data={studyChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="studyGradModal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#45FFCA" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#45FFCA" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 9 }} interval={0} padding={{ left: 15, right: 15 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 9 }} allowDecimals={false} width={25} />
                        <ReTooltip
                          contentStyle={{ background: '#1a1a2e', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#fff' }}
                          formatter={(val: number) => [`${val}h`, 'Giờ học']}
                        />
                        <Area type="monotone" dataKey="hours" stroke="#45FFCA" strokeWidth={2} fill="url(#studyGradModal)" />
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
