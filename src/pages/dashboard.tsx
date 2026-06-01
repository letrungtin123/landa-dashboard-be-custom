import { useState, useEffect } from 'react';
import { TenantFilter } from '@/components/shared/TenantFilter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/utils/store';
import { Users, Activity, ShieldCheck, Building2, AlertTriangle, TrendingUp, BarChart3, PieChart as PieChartIcon, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { useAnimatedCounter } from '@/hooks/use-animated-counter';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useHeaderInfo } from '@/utils/header-store';
// Removed useDashboardStats import

const userGrowthData = [
  { month: 'Jan', users: 120, newUsers: 28 },
  { month: 'Feb', users: 185, newUsers: 45 },
  { month: 'Mar', users: 240, newUsers: 38 },
  { month: 'Apr', users: 310, newUsers: 52 },
  { month: 'May', users: 420, newUsers: 68 },
  { month: 'Jun', users: 530, newUsers: 74 },
  { month: 'Jul', users: 680, newUsers: 92 },
];

const moduleActivityData = [
  { module: 'Chat', actions: 340, errors: 12 },
  { module: 'KB', actions: 210, errors: 8 },
  { module: 'Users', actions: 180, errors: 3 },
  { module: 'Bots', actions: 150, errors: 5 },
  { module: 'Settings', actions: 90, errors: 2 },
  { module: 'Audit', actions: 60, errors: 1 },
];

const workspaceData = [
  { name: 'Enterprise', value: 12 },
  { name: 'Pro', value: 28 },
  { name: 'Starter', value: 45 },
  { name: 'Free', value: 78 },
  { name: 'Trial', value: 15 },
];

const CHART_COLORS = ['#f97316', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

const healthData = [
  { metric: 'Uptime', value: 99, target: 99.9 },
  { metric: 'Latency', value: 85, target: 95 },
  { metric: 'CPU', value: 42, target: 70 },
  { metric: 'Memory', value: 68, target: 80 },
  { metric: 'Disk', value: 35, target: 70 },
  { metric: 'Network', value: 78, target: 90 },
];

const chartCardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--popover-foreground)',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
  const canView = hasPermission('dashboard', 'can_view');

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useHeaderInfo('Dashboard');

  // MOCK: Removed useDashboardStats hook
  const isLoading = false;
  const stats = { totalUsers: 842, activeTenants: 15, avgActivity: 78 };
  const { totalUsers, activeTenants, avgActivity } = stats;

  if (!mounted || isLoggingOut) return null;

  return (
    <div className="p-6">
      <TenantFilter className="mb-4" />
      <div className="space-y-6 max-w-7xl mx-auto pb-10 mt-4">

        {!canView ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-8 text-center mt-6">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-destructive mb-1">Access Restricted</h2>
            <p className="text-muted-foreground text-sm">
              You do not have permission to view the dashboard overview.
            </p>
          </div>
        ) : (
          <>
            <motion.div
              className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08 } },
              }}
            >
              <motion.div variants={chartCardVariant}>
                <StatCard title="Total Users" icon={<Users className="h-4 w-4 text-muted-foreground/70" />} value={totalUsers} isLoading={isLoading} />
              </motion.div>
              <motion.div variants={chartCardVariant}>
                <StatCard title="Active Tenants" icon={<Building2 className="h-4 w-4 text-muted-foreground/70" />} value={activeTenants} isLoading={isLoading} />
              </motion.div>
              <motion.div variants={chartCardVariant}>
                <StatCard title="Avg. Activity" icon={<Activity className="h-4 w-4 text-muted-foreground/70" />} value={avgActivity} suffix="%" isLoading={isLoading} />
              </motion.div>
              <motion.div variants={chartCardVariant}>
                <Card className="shadow-none border-border bg-muted/40">
                  <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                    <CardTitle className="text-sm font-semibold text-foreground">Your Role</CardTitle>
                    <ShieldCheck className="h-4 w-4 text-foreground/70" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex items-end">
                    <div className="text-lg font-mono font-bold uppercase tracking-wider text-foreground bg-background border border-border px-3 py-1 rounded-md shadow-sm">
                      {user?.role || '...'}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Charts Section */}
            <motion.div
              className="grid gap-4 md:grid-cols-2"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } },
              }}
            >
              {/* User Growth - Area Chart */}
              <motion.div variants={chartCardVariant}>
                <Card className="shadow-sm border-border">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      User Growth
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Monthly active users over time</p>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={userGrowthData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Area type="monotone" dataKey="users" stroke="var(--primary)" strokeWidth={2} fill="url(#colorUsers)" />
                        <Area type="monotone" dataKey="newUsers" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Activity by Module - Bar Chart */}
              <motion.div variants={chartCardVariant}>
                <Card className="shadow-sm border-border">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      Activity by Module
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Actions performed this week</p>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={moduleActivityData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                        <XAxis dataKey="module" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="actions" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="errors" fill="var(--destructive)" radius={[4, 4, 0, 0]} opacity={0.7} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Workspace Distribution - Donut Chart */}
              <motion.div variants={chartCardVariant}>
                <Card className="shadow-sm border-border">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                      Workspace Distribution
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Tenants by plan type</p>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={workspaceData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" strokeWidth={0}>
                          {workspaceData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" iconSize={8}
                          wrapperStyle={{ fontSize: '12px', color: 'var(--muted-foreground)', paddingLeft: '16px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* System Health - Radar Chart */}
              <motion.div variants={chartCardVariant}>
                <Card className="shadow-sm border-border">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      System Health
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Current performance metrics</p>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <ResponsiveContainer width="100%" height={240}>
                      <RadarChart data={healthData} cx="50%" cy="50%" outerRadius={80}>
                        <PolarGrid stroke="var(--border)" strokeOpacity={0.5} />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Current" dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} />
                        <Radar name="Target" dataKey="target" stroke="var(--muted-foreground)" fill="none" strokeWidth={1} strokeDasharray="4 4" />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, icon, value, suffix = '', isLoading }: {
  title: string;
  icon: React.ReactNode;
  value: number;
  suffix?: string;
  isLoading: boolean;
}) {
  const animatedValue = useAnimatedCounter(value, 800, !isLoading);
  return (
    <Card className="shadow-sm border-border">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <Skeleton className="h-8 w-16 mb-1" />
        ) : (
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {animatedValue}{suffix}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
