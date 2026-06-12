import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useTenantStore } from '@/utils/tenant-store';
import { useHeaderInfo } from '@/utils/header-store';
import { PageHeader } from '@/components/shared/page-header';
import { useAuthStore } from '@/utils/store';
import {
  getReportSummary,
  getReportChart,
  getReportTopCourses,
  getReportLearners,
} from '@/api/custom-reports';
import { getOrgGroups, getSubGroups } from '@/api/custom-groups';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, BookOpen, GraduationCap, UserCheck, Percent, Award, AlertTriangle, ShieldAlert,
  ArrowUpRight, Calendar, Clock, Download, RefreshCcw, ChevronLeft, ChevronRight, BarChart3, ChevronDown, Check, CheckCircle2, TrendingUp
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
  LineChart, Line, Legend
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

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
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

function ChartTrendModal({
  metricKey,
  title,
  isOpen,
  onClose,
  groupId,
  subgroupId
}: {
  metricKey: string | null;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  groupId: string | 'all';
  subgroupId: string | 'all';
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-chart', year, metricKey, groupId, subgroupId],
    queryFn: () => getReportChart(
      year, metricKey!,
      groupId === 'all' ? undefined : groupId,
      false, false,
      subgroupId === 'all' ? undefined : subgroupId
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
                    <ReTooltip cursor={{ stroke: 'var(--muted)', strokeWidth: 2 }} contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }} />
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
                    <ReTooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }} />
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

function TopCoursesWidget({ month, year, groupId, subgroupId }: { month: number, year: number, groupId: string | 'all', subgroupId: string | 'all' }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['report-top-courses', month, year, page, groupId, subgroupId],
    queryFn: () => getReportTopCourses({
      month, year, page, page_size: 5,
      group_id: groupId === 'all' ? undefined : groupId,
      subgroup_id: subgroupId === 'all' ? undefined : subgroupId
    }),
  });

  return (
    <Card className="shadow-sm border-border h-full flex flex-col bg-gradient-to-br from-background to-muted/20 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
      <CardHeader className="p-5 pb-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Bảng xếp hạng Khóa học
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">Top các khóa học có lượng đăng ký cao nhất.</p>
          </div>
          <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md border border-primary/20">
            <ArrowUpRight className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-black text-primary tracking-widest uppercase">Thịnh hành</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 flex-grow flex flex-col">
        {isLoading ? (
          <Skeleton className="w-full flex-grow rounded-xl" />
        ) : !data || data.results.length === 0 ? (
          <div className="flex-grow flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl bg-muted/20">Không có dữ liệu</div>
        ) : (
          <>
            <div className="w-full mt-4 h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={data.results}
                  margin={{ left: 10, right: 60, top: 0, bottom: 0 }}
                  barGap={12}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={({ x, y, payload, index }) => {
                      const rank = index + 1 + (page - 1) * 5;
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
                  <ReTooltip cursor={{ fill: 'var(--primary)', opacity: 0.05 }} />
                  <Bar dataKey="enrollments" radius={[0, 4, 4, 0]} barSize={8} fill="var(--primary)" background={{ fill: 'var(--muted)', radius: 4, opacity: 0.2 }}>
                    {data.results.map((_, index) => {
                      const rank = index + 1 + (page - 1) * 5;
                      return <Cell key={`cell-${index}`} fill={rank === 1 ? '#3b82f6' : rank === 2 ? '#60a5fa' : rank === 3 ? '#93c5fd' : '#bfdbfe'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {data.total_pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground font-medium">Trang {page} / {data.total_pages}</span>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                  <button disabled={page === data.total_pages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
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
}: {
  year: number;
  selectedGroupId: string | 'all';
  selectedSubGroupId: string | 'all';
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['group-enrollments-trend', year, selectedGroupId, selectedSubGroupId],
    queryFn: () => getReportChart(
      year,
      'total_enrollments',
      selectedGroupId === 'all' ? undefined : selectedGroupId,
      selectedGroupId === 'all',
      undefined,
      selectedSubGroupId === 'all' ? undefined : selectedSubGroupId
    ),
  });

  const groupKeys = useMemo(() => {
    if (!data?.data || data.data.length === 0) return [];
    return Object.keys(data.data[0]).filter(k => k !== 'month' && k !== 'month_label');
  }, [data]);

  const totalThisYear = useMemo(() => {
    if (!data?.data) return 0;
    return data.data.reduce((sum, row) => {
      return sum + groupKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
    }, 0);
  }, [data, groupKeys]);

  return (
    <Card className="shadow-sm border-border h-full flex flex-col bg-gradient-to-br from-background to-muted/20 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
      <CardHeader className="p-5 pb-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              {selectedSubGroupId !== 'all'
                ? 'Tổng lượt đăng ký theo Team'
                : selectedGroupId !== 'all'
                  ? 'Tổng lượt đăng ký theo SubGroup'
                  : 'Tổng lượt đăng ký theo Group'}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Xu hướng đăng ký theo tháng — Năm {year}
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
        ) : !data?.data || groupKeys.length === 0 ? (
          <div className="flex-grow flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl bg-muted/20">
            Không có dữ liệu
          </div>
        ) : (
          <div className="w-full mt-2 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                <defs>
                  {groupKeys.map((key, i) => (
                    <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GROUP_BAR_COLORS[i % GROUP_BAR_COLORS.length]} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={GROUP_BAR_COLORS[i % GROUP_BAR_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                <XAxis
                  dataKey="month_label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <ReTooltip
                  cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--background)',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  formatter={(value: number, name: string) => [
                    value.toLocaleString('en-US') + ' lượt',
                    name,
                  ]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                />
                {groupKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={GROUP_BAR_COLORS[i % GROUP_BAR_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 2, fill: 'var(--background)' }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
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

function UncompletedWidget({ month, year, onSelectLearner, groupId, subgroupId }: { month: number, year: number, onSelectLearner: (u: string) => void, groupId: string | 'all', subgroupId: string | 'all' }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_started' | 'learning' | 'completed'>('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-learners', month, year, page, debouncedSearch, groupId, subgroupId, statusFilter],
    queryFn: () => getReportLearners({
      month, year, page, page_size: 5,
      search: debouncedSearch,
      group_id: groupId === 'all' ? undefined : groupId,
      subgroup_id: subgroupId === 'all' ? undefined : subgroupId,
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
            Danh sách Học viên
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
                        <span className="text-xs text-muted-foreground italic">{u.enrolled_courses > 0 ? `${u.enrolled_courses} khóa học` : 'Chưa đăng ký'}</span>
                      )}
                    </div>

                    {/* Progress Column */}
                    <div className="w-[15%] min-w-[60px] shrink-0 flex flex-col justify-center">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-foreground">{u.progress}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.barClass}`}
                          style={{ width: `${Math.min(u.progress, 100)}%` }}
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
  useHeaderInfo('Báo cáo Tổng hợp');
  const [selectedLearner, setSelectedLearner] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<{ key: string, title: string } | null>(null);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'all'>('all');
  const [selectedSubGroupId, setSelectedSubGroupId] = useState<string | 'all'>('all');
  const [isExporting, setIsExporting] = useState(false);

  const user = useAuthStore((s) => s.user);
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const isSuperadmin = user?.role === 'superadmin' || user?.role === 'superuser';
  const isStaff = user?.role === 'staff';
  const isLearnerPlus = user?.role === 'staff';
  const canViewReport = isSuperadmin || isStaff || isLearnerPlus;

  // learner_plus: auto-set group từ membership, không fetch all groups
  const learnerPlusGroupId = user?.memberGroupIds?.[0];

  const { data: groupsData } = useQuery({
    queryKey: ['admin-groups-list', activeTenantId],
    queryFn: () => getOrgGroups({ page_size: 100 }),
    enabled: isSuperadmin || isStaff,
  });

  // Fetch subgroups when a group is selected
  const { data: subGroupsData } = useQuery({
    queryKey: ['admin-subgroups-list', selectedGroupId, activeTenantId],
    queryFn: () => getSubGroups(selectedGroupId as string),
    enabled: (isSuperadmin || isStaff) && selectedGroupId !== 'all',
  });

  // learner_plus groups data giả lập từ auth store
  const learnerPlusGroups = isLearnerPlus && user?.memberGroupIds
    ? user.memberGroupIds.map((id, i) => ({ id, name: user.memberGroupNames?.[i] || `Group ${id}` }))
    : [];

  // Nếu learner_plus, auto-set selectedGroupId
  const effectiveDefaultGroupId = isLearnerPlus ? (learnerPlusGroupId || 'all') : 'all';

  // Override selectedGroupId nếu learner_plus chưa set (dùng useEffect tránh setState trong render)
  useEffect(() => {
    if (isLearnerPlus && selectedGroupId === 'all' && learnerPlusGroupId) {
      setSelectedGroupId(learnerPlusGroupId);
    }
  }, [isLearnerPlus, selectedGroupId, learnerPlusGroupId]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['report-summary', selectedMonth, selectedYear, selectedGroupId, selectedSubGroupId, activeTenantId],
    queryFn: () => getReportSummary({
      month: selectedMonth,
      year: selectedYear,
      group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
      subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId
    }),
    enabled: canViewReport && (isSuperadmin || isStaff || selectedGroupId !== 'all'),
  });

  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

  const { data: prevData } = useQuery({
    queryKey: ['report-summary', prevMonth, prevMonthYear, selectedGroupId, selectedSubGroupId, activeTenantId],
    queryFn: () => getReportSummary({
      month: prevMonth,
      year: prevMonthYear,
      group_id: selectedGroupId === 'all' ? undefined : selectedGroupId,
      subgroup_id: selectedSubGroupId === 'all' ? undefined : selectedSubGroupId
    }),
    enabled: canViewReport && (isSuperadmin || isStaff || selectedGroupId !== 'all'),
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const groupName = selectedGroupId === 'all'
        ? 'Tất cả'
        : (groupsData?.groups.find(g => g.id === selectedGroupId)?.name || String(selectedGroupId));
      await exportReportExcel({
        selectedYear,
        selectedGroupId,
        groupName,
        exporterName: user?.username || 'Admin',
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
    { title: 'Lượt đăng ký hàng tháng', value: overview.total_enrollments, icon: Calendar, colorClass: 'text-red-500 bg-red-50 dark:bg-red-500/10 dark:text-red-400', trend: enrollmentsTrend.text, trendType: enrollmentsTrend.type, key: 'total_enrollments', suffix: '' },
  ];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto pb-20 relative">

      <LearnerDetailModal
        username={selectedLearner}
        isOpen={!!selectedLearner}
        onClose={() => setSelectedLearner(null)}
      />

      <ChartTrendModal
        metricKey={chartMetric?.key || null}
        title={chartMetric?.title || ''}
        isOpen={!!chartMetric}
        onClose={() => setChartMetric(null)}
        groupId={selectedGroupId}
        subgroupId={selectedSubGroupId}
      />

      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, var(--foreground) 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <PageHeader
          icon={BarChart3}
          title="Tổng quan Phân tích"
          description="Chỉ số hệ thống thời gian thực và hiệu suất người học."
        />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-primary transition-all text-foreground shadow-sm max-w-full sm:max-w-none">
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[100px] sm:max-w-[120px]">
                {isLearnerPlus
                  ? (learnerPlusGroups.find(g => g.id === selectedGroupId)?.name || 'Nhóm của bạn')
                  : selectedGroupId === 'all'
                    ? 'Tất cả các doanh nghiệp'
                    : groupsData?.groups.find(g => g.id === selectedGroupId)?.name || 'Đang tải...'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto rounded-lg custom-scrollbar">
              {/* Superadmin / Staff: hiện 'Tất cả' + all groups */}
              {(isSuperadmin || isStaff) && (
                <DropdownMenuItem
                  onClick={() => { setSelectedGroupId('all'); setSelectedSubGroupId('all'); }}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedGroupId === 'all' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  Tất cả các doanh nghiệp
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedGroupId === 'all' ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
              )}
              {/* Superadmin / Staff: list all groups from API */}
              {(isSuperadmin || isStaff) && groupsData?.groups.map(g => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => { setSelectedGroupId(g.id); setSelectedSubGroupId('all'); }}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedGroupId === g.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  <span className="truncate">{g.name}</span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedGroupId === g.id ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
              ))}
              {/* Learner Plus: chỉ hiện groups của user */}
              {isLearnerPlus && learnerPlusGroups.map(g => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedGroupId === g.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  <span className="truncate">{g.name}</span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedGroupId === g.id ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* SubGroup Filter — chỉ hiện khi đã chọn Group */}
          {selectedGroupId !== 'all' && (isSuperadmin || isStaff) && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 h-9 pl-3 pr-2 py-0 text-xs font-medium rounded-full border border-border bg-background hover:bg-muted outline-none focus-visible:ring-1 focus-visible:ring-primary transition-all text-foreground shadow-sm max-w-full sm:max-w-none">
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[100px] sm:max-w-[120px]">
                  {selectedSubGroupId === 'all'
                    ? 'Tất cả phòng ban'
                    : subGroupsData?.subgroups.find(sg => sg.id === selectedSubGroupId)?.name || 'Đang tải...'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto rounded-lg custom-scrollbar">
                <DropdownMenuItem
                  onClick={() => setSelectedSubGroupId('all')}
                  className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedSubGroupId === 'all' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  Tất cả phòng ban
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedSubGroupId === 'all' ? 'bg-foreground' : 'bg-transparent'}`} />
                </DropdownMenuItem>
                {subGroupsData?.subgroups.map(sg => (
                  <DropdownMenuItem
                    key={sg.id}
                    onClick={() => setSelectedSubGroupId(sg.id)}
                    className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${selectedSubGroupId === sg.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                  >
                    <span className="truncate">{sg.name}</span>
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedSubGroupId === sg.id ? 'bg-foreground' : 'bg-transparent'}`} />
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
          <TopCoursesWidget month={selectedMonth} year={selectedYear} groupId={selectedGroupId} subgroupId={selectedSubGroupId} />
        </motion.div>

        {groupsData && groupsData.groups.length > 0 && (
          <motion.div variants={cardVariant}>
            <GroupEnrollmentsWidget
              year={selectedYear}
              selectedGroupId={selectedGroupId}
              selectedSubGroupId={selectedSubGroupId}
            />
          </motion.div>
        )}

        <motion.div variants={cardVariant}>
          <UncompletedWidget
            month={selectedMonth}
            year={selectedYear}
            groupId={selectedGroupId}
            subgroupId={selectedSubGroupId}
            onSelectLearner={setSelectedLearner}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
