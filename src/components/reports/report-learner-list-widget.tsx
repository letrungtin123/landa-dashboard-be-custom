import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react';
import { getReportLearners } from '@/api/custom-reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLocaleDate, formatLocaleNumber } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { useTranslation } from 'react-i18next';
import type { AppLocale } from '@/i18n';

function clampPercent(value: number | null | undefined) { const numeric = Number(value ?? 0); return Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 100) : 0; }
function formatPercent(value: number | null | undefined, locale: AppLocale) { const rounded = Math.round(clampPercent(value) * 10) / 10; return formatLocaleNumber(rounded, locale, { maximumFractionDigits: 1 }) + '%'; }
export function ReportLearnerListWidget({ dateFrom, dateTo, onSelectLearner, groupId, subgroupId, teamId, modalLayer = false }: { dateFrom: string, dateTo: string, onSelectLearner: (u: string) => void, groupId: string | 'all', subgroupId: string | 'all', teamId: string | 'all', modalLayer?: boolean }) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
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
    not_started: { label: t('reports.notStarted'), avatarClass: 'bg-muted text-muted-foreground group-hover:bg-slate-500 group-hover:text-white', barClass: 'bg-slate-400', badgeClass: 'text-slate-600 bg-slate-500/10' },
    learning: { label: t('reports.learning'), avatarClass: 'bg-amber-500/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white', barClass: 'bg-amber-500', badgeClass: 'text-amber-600 bg-amber-500/10' },
    completed: { label: t('reports.learned'), avatarClass: 'bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white', barClass: 'bg-emerald-500', badgeClass: 'text-emerald-600 bg-emerald-500/10' },
  };

  return (
    <Card className="shadow-sm border-border h-full flex flex-col bg-muted/5 backdrop-blur-sm">
      <CardHeader className="p-5 pb-2 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {t('reports.learnerList')}
          </CardTitle>
          {data && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{formatLocaleNumber(data.count, locale)} {t('reports.learners')}</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder={t('reports.userSearch')}
              className="h-9 text-xs bg-background border-border"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(val: any) => { setStatusFilter(val); setPage(1); }}>
            <SelectTrigger className={`w-[110px] h-9 text-xs bg-background border-border shadow-sm ${statusFilter !== 'all' ? 'app-liquid-filter-active' : ''}`}>
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
      </CardHeader>
      <CardContent className="min-h-0 p-0 flex-grow flex flex-col">
        {isLoading ? (
          <div className="p-4 space-y-3 min-h-[200px] overflow-hidden">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : !data || data.results.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-center text-sm text-muted-foreground italic min-h-[200px]">
            {t('reports.noData')}
          </div>
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto custom-scrollbar max-h-[440px]">
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
                        <span className="text-[10px] font-medium text-foreground">{formatPercent(u.completion_rate, locale)}</span>
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
                            ? formatLocaleDate(u.last_completion_at, locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : t('reports.notStarted')}
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
          <span className="text-xs text-muted-foreground font-medium">{t('reports.page', { page, total: data.total_pages })}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
            <button disabled={page === data.total_pages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-md bg-background border border-border hover:bg-muted disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </Card>
  );
}

