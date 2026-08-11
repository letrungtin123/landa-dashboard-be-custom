import { useState, useCallback, useEffect } from 'react';
import { storageUrl } from '@/utils/storage-url';
import {
  Search,
  Loader2,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  Info,
  Building2,
  UsersRound,
  Settings2,
  CheckCircle2,
  UserRoundPlus,
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebounce } from '@/hooks/use-debounce';
import { fetchUsers, type CustomUser, type UserTeamAssignment } from '@/api/custom-users';
import { addTeamMembers, getGroupNotificationSmtpStatus } from '@/api/custom-groups';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { useAuthStore } from '@/utils/store';
import { cn } from '@/utils/utils';

interface Props {
  open: boolean;
  teamId: string;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20];

function assignmentLabel(assignment: UserTeamAssignment, labels: ReturnType<typeof getGroupLabelSet>) {
  return `${labels.group}: ${assignment.group_name} / ${labels.subgroup}: ${assignment.subgroup_name} / ${labels.team}: ${assignment.team_name}`;
}

function getInitial(user: CustomUser) {
  return (user.full_name || user.username || user.email || '?').trim()[0]?.toUpperCase() ?? '?';
}

function MembershipSummary({ user, labels }: { user: CustomUser; labels: ReturnType<typeof getGroupLabelSet> }) {
  const assignments = user.team_assignments ?? [];
  if (assignments.length === 0) {
    return (
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/25 px-2.5 py-1 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Chưa thuộc phòng ban nào</span>
      </div>
    );
  }

  const visibleAssignments = assignments.slice(0, 2);
  const hiddenCount = assignments.length - visibleAssignments.length;

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {visibleAssignments.map((assignment) => (
        <Badge
          key={assignment.team_id}
          variant="secondary"
          className={cn(
            'max-w-full rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm',
            assignment.is_current_team && 'border-primary/35 bg-primary/10 text-primary'
          )}
          title={assignmentLabel(assignment, labels)}
        >
          <span className="max-w-[230px] truncate lg:max-w-[320px]">
            {assignment.group_name} / {assignment.subgroup_name} / {assignment.team_name}
          </span>
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge variant="secondary" className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
          +{hiddenCount} phòng ban
        </Badge>
      )}
    </div>
  );
}

export function AddMembersModal({ open, teamId, onOpenChange, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedSearch = useDebounce(search, 400);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const targetLabelLower = lowerGroupLabel(labels.team);

  useEffect(() => { setPage(1); }, [debouncedSearch, pageSize, teamId]);

  const { data, isFetching } = useQuery({
    queryKey: ['users-for-group', teamId, debouncedSearch, page, pageSize],
    queryFn: () => fetchUsers({
      page,
      page_size: pageSize,
      search: debouncedSearch,
      role: 'learner,learner_plus',
      include_team_assignments: true,
      current_team_id: teamId,
    }),
    enabled: open,
    staleTime: 0,
  });

  const { data: smtpStatus, isFetching: isSmtpFetching, isError: isSmtpError } = useQuery({
    queryKey: ['group-notification-smtp-status', open],
    queryFn: getGroupNotificationSmtpStatus,
    enabled: open,
    staleTime: 60_000,
  });

  const emailAutomationReady = Boolean(smtpStatus?.can_send_email);
  const emailBadgeText = emailAutomationReady ? 'Email tự động đang bật' : 'Chỉ tạo thông báo trong hệ thống';
  const emailDescription = emailAutomationReady
    ? 'Hệ thống sẽ tự gửi email cho học viên sau khi thao tác hoàn tất.'
    : 'Chưa cấu hình email gửi đi nên học viên chỉ thấy thông báo trong hệ thống.';
  const emailTooltip = isSmtpError
    ? 'Không kiểm tra được cấu hình email gửi đi. Hệ thống sẽ chỉ tạo thông báo trong hệ thống cho đến khi kiểm tra lại thành công.'
    : 'Chưa cấu hình email gửi đi cho đơn vị này. Vui lòng vào phần cấu hình email để bật gửi email tự động.';

  const mutation = useMutation({
    mutationFn: () => addTeamMembers(teamId, selected),
    onSuccess: (res) => {
      const skippedText = res.skipped ? ` (${res.skipped} đã có hoặc không hợp lệ)` : '';
      const emailText = res.email_requested
        ? res.email_queued > 0
          ? ` Đã xếp hàng ${res.email_queued} email.`
          : ' Không có email nào được xếp hàng.'
        : '';
      toast.success(`Đã thêm ${res.added} học viên${skippedText}.${emailText}`);
      setSelected([]);
      setSearch('');
      setPage(1);
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast.error('Lỗi thêm thành viên'),
  });

  const users: CustomUser[] = data?.data ?? [];
  const availableUsers = users.filter(u => !u.is_current_team_member);
  const selectedOnPage = availableUsers.filter(u => selected.includes(u.id)).length;
  const allSelected = availableUsers.length > 0 && selectedOnPage === availableUsers.length;
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = total > 0 ? Math.min(page * pageSize, total) : 0;

  const toggle = useCallback((id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const toggleAll = useCallback(() => {
    if (availableUsers.length === 0) return;
    if (allSelected) {
      const pageIds = new Set(availableUsers.map(u => u.id));
      setSelected(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const newIds = availableUsers.map(u => u.id).filter(id => !selected.includes(id));
      setSelected(prev => [...prev, ...newIds]);
    }
  }, [allSelected, availableUsers, selected]);

  const handleClose = () => {
    setSearch('');
    setSelected([]);
    setPage(1);
    setPageSize(20);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? onOpenChange(true) : handleClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-background p-0 shadow-2xl sm:rounded-3xl">
        <DialogHeader className="shrink-0 border-b border-border/70 bg-card px-5 py-4 pr-12 sm:px-6 sm:py-5 sm:pr-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                <UserRoundPlus className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold leading-6 text-foreground sm:text-xl">
                  Thêm thành viên vào {targetLabelLower}
                </DialogTitle>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Tìm học viên, xem phòng ban hiện tại và chọn người cần thêm.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-2 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Đã chọn</p>
                <p className="text-lg font-bold text-primary">{selected.length}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-2 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Kết quả</p>
                <p className="text-lg font-bold text-foreground">{total}</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="shrink-0 border-b border-border/70 bg-muted/10 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 lg:w-[460px] lg:max-w-[46%] lg:flex-none xl:w-[520px]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-2xl border-border/80 bg-background pl-10 shadow-sm focus-visible:ring-primary/20"
                placeholder="Tìm học viên theo tên hoặc email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-border/80 bg-background px-3 shadow-sm sm:w-[220px] lg:flex-none">
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-semibold text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                Hiển thị
              </div>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger size="sm" className="w-[122px] min-w-[122px] bg-muted/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>{option}/trang</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              type="button"
              onClick={toggleAll}
              disabled={availableUsers.length === 0}
              className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background px-3.5 text-left text-sm font-semibold shadow-sm transition hover:border-primary/35 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[242px] lg:flex-none"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Checkbox checked={allSelected} disabled={availableUsers.length === 0} className="pointer-events-none" />
                <span className="whitespace-nowrap">Chọn tất cả trang này</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{selectedOnPage}/{availableUsers.length}</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="hidden shrink-0 border-b border-border/70 bg-muted/20 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[34px_minmax(240px,0.9fr)_minmax(280px,1fr)_150px] sm:gap-4 sm:px-6">
            <span />
            <span>Học viên</span>
            <span>Phòng ban hiện tại</span>
            <span className="text-right">Trạng thái</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border/70 custom-scrollbar">
            {isFetching ? (
              <div className="divide-y divide-border/70">
                {Array.from({ length: Math.min(pageSize, 7) }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[34px_minmax(0,1fr)] gap-4 px-5 py-4 sm:grid-cols-[34px_minmax(240px,0.9fr)_minmax(280px,1fr)_150px] sm:px-6">
                    <Skeleton className="mt-2 h-5 w-5 rounded-md" />
                    <div className="flex min-w-0 items-center gap-3">
                      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-32 rounded" />
                        <Skeleton className="h-3 w-44 rounded" />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-2 pl-[50px] sm:col-span-1 sm:pl-0">
                      <Skeleton className="h-6 w-full max-w-[300px] rounded-full" />
                    </div>
                    <Skeleton className="hidden h-6 w-24 justify-self-end rounded-full sm:block" />
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/40 text-muted-foreground">
                  <UsersRound className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">Không tìm thấy học viên</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  Thử đổi từ khóa tìm kiếm hoặc tăng số lượng hiển thị mỗi trang.
                </p>
              </div>
            ) : users.map(u => {
              const isExisting = Boolean(u.is_current_team_member);
              const isSelected = selected.includes(u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => !isExisting && toggle(u.id)}
                  className={cn(
                    'group grid grid-cols-[34px_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-4 transition-colors sm:grid-cols-[34px_minmax(240px,0.9fr)_minmax(280px,1fr)_150px] sm:items-center sm:px-6',
                    isExisting
                      ? 'cursor-not-allowed bg-muted/20 opacity-75'
                      : isSelected
                        ? 'cursor-pointer bg-primary/10 hover:bg-primary/12'
                        : 'cursor-pointer hover:bg-muted/35'
                  )}
                >
                  <div className={cn(
                    'mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors sm:mt-0',
                    isSelected || isExisting ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-transparent group-hover:border-primary/40'
                  )}>
                    {(isSelected || isExisting) && <UserCheck className="h-3.5 w-3.5" />}
                  </div>

                  <div className="flex min-w-0 items-center gap-3">
                    {u.avatar_url ? (
                      <img src={storageUrl(u.avatar_url)} alt={u.username} className="h-10 w-10 shrink-0 rounded-full border border-border object-cover shadow-sm" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-sm font-bold text-secondary-foreground shadow-sm">
                        {getInitial(u)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{u.full_name || u.username}</p>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 pl-[50px] sm:col-span-1 sm:pl-0">
                    <MembershipSummary user={u} labels={labels} />
                  </div>

                  <div className="col-span-2 flex pl-[50px] sm:col-span-1 sm:justify-end sm:pl-0">
                    {isExisting ? (
                      <Badge variant="secondary" className="rounded-full border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                        Đã có trong {targetLabelLower}
                      </Badge>
                    ) : isSelected ? (
                      <Badge variant="secondary" className="rounded-full border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                        Đang chọn
                      </Badge>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">Có thể thêm</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-card px-5 py-4 sm:px-6">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm">
              <div className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                emailAutomationReady ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
              )}>
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {isSmtpFetching ? (
                    <Skeleton className="h-6 w-40 rounded-full" />
                  ) : (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'rounded-full px-3 py-1 text-[11px] font-bold',
                        emailAutomationReady
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                      )}
                    >
                      {emailBadgeText}
                    </Badge>
                  )}
                  {!emailAutomationReady && !isSmtpFetching && (
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-600 transition hover:bg-red-500/15 dark:text-red-300"
                            aria-label="Vì sao email tự động chưa bật?"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px] border-red-500/20 bg-red-600 text-white">
                          {emailTooltip}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {isSmtpFetching ? (
                  <Skeleton className="mt-2 h-4 w-full max-w-[420px]" />
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{emailDescription}</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Quy tắc thêm thành viên
              </div>
              Học viên đã nằm trong {targetLabelLower} này sẽ bị khóa chọn. Học viên thuộc phòng ban khác vẫn có thể được thêm vào nhiều {lowerGroupLabel(labels.team)}.
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isFetching} className="h-9 w-9 rounded-xl p-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[124px] text-center text-xs font-semibold text-muted-foreground">
                Trang {page} / {Math.max(1, totalPages)} · {pageStart}-{pageEnd}/{total}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching} className="h-9 w-9 rounded-xl p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={handleClose} className="h-10 px-6 sm:min-w-[112px]">Hủy</Button>
              <Button
                disabled={selected.length === 0 || mutation.isPending}
                onClick={() => mutation.mutate()}
                className="h-10 gap-2 px-6 sm:min-w-[168px]"
              >
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Thêm {selected.length > 0 ? `(${selected.length})` : ''}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
