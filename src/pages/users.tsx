import { useState, useEffect } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { useHeaderInfo } from '@/utils/header-store';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';

import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Pencil, Ban, Trash2, Users as UsersIcon, ShieldAlert, CheckCircle2, Eye, ShieldCheck, LockKeyhole } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { format } from 'date-fns';
import { UserFormDialog } from '@/components/users/user-form-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/utils/confirm-store';
import { useDebounce } from '@/hooks/use-debounce';
import { Pagination } from '@/components/shared/pagination';
import { TableToolbar } from '@/components/shared/table-toolbar';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { fetchUsers, updateUser, deleteUser, type CustomUser } from '@/api/custom-users';
import { toast } from 'sonner';
import { LearnerDetailModal } from '@/components/users/learner-detail-modal';
import { getRoleLabel } from '@/utils/role-labels';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  inactive: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20',
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20',
  superuser: 'text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
  staff: 'text-blue-600 dark:text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
  learner: 'text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
  learner_plus: 'text-teal-600 dark:text-teal-500 bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20',
};

export default function UsersPage() {
  useHeaderInfo('Tài Khoản');

  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CustomUser | undefined>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedLearner, setSelectedLearner] = useState<string | null>(null);

  const currentUser = useAuthStore(function getUser(s) { return s.user; });
  const roleLabels = useAuthStore(function getRoleLabels(s) { return s.roleLabels; });
  const isLoggingOut = useAuthStore(function getLogout(s) { return s.isLoggingOut; });
  const queryClient = useQueryClient();

  const isSuperadmin = currentUser?.role === 'superadmin';
  const isSuperuser = currentUser?.role === 'superuser';
  const hasPermission = useAuthStore(function getPerm(s) { return s.hasPermission; });
  const canAdd = hasPermission('account', 'can_add');
  const canEdit = hasPermission('account', 'can_edit');
  const canDelete = hasPermission('account', 'can_delete');
  const activeTenantId = useTenantStore((s) => s.activeTenantId);

  useEffect(function mount() { setMounted(true); }, []);
  useEffect(function resetPage() { setPage(1); }, [debouncedSearch, roleFilter, statusFilter, limit]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['custom-users', page, limit, debouncedSearch, roleFilter, statusFilter, activeTenantId],
    queryFn: function queryUsers() {
      return fetchUsers({
        page,
        page_size: limit,
        search: debouncedSearch || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        is_active: statusFilter === 'all' ? undefined : statusFilter === 'active' ? 'true' : 'false',
      });
    },
    enabled: mounted && !isLoggingOut,
    staleTime: 5000,
  });

  const deactivateMutation = useMutation({
    mutationFn: function deactivate(id: string) { return updateUser(id, { is_active: false }); },
    onSuccess: function onOk() {
      toast.success('Đã vô hiệu hóa tài khoản');
      queryClient.invalidateQueries({ queryKey: ['custom-users'] });
    },
    onError: function onErr(error: any) {
      toast.error(error.response?.data?.message || 'Vô hiệu hóa thất bại');
    },
  });

  const activateMutation = useMutation({
    mutationFn: function activate(id: string) { return updateUser(id, { is_active: true }); },
    onSuccess: function onOk() {
      toast.success('Đã kích hoạt tài khoản');
      queryClient.invalidateQueries({ queryKey: ['custom-users'] });
    },
    onError: function onErr(error: any) {
      toast.error(error.response?.data?.message || 'Kích hoạt thất bại');
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: function hardDel(id: string) { return deleteUser(id); },
    onSuccess: function onOk() {
      toast.success('Đã xóa vĩnh viễn tài khoản');
      queryClient.invalidateQueries({ queryKey: ['custom-users'] });
    },
    onError: function onErr(error: any) {
      toast.error(error.response?.data?.error || 'Xóa thất bại');
    },
  });

  const users = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  function isDemoIframeLocked(user: CustomUser) {
    return user.is_demo_iframe_active === true;
  }

  function handleDeactivate(user: CustomUser) {
    if (isDemoIframeLocked(user)) {
      toast.warning('Learner này đang được khóa cho demo iframe');
      return;
    }
    confirmDialog({
      title: 'Vô hiệu hóa tài khoản',
      description: `Bạn có chắc muốn vô hiệu hóa ${user.username}? Người dùng này sẽ không thể đăng nhập.`,
      variant: 'destructive',
      onConfirm: function confirm() { deactivateMutation.mutate(user.id); },
    });
  }

  function handleHardDelete(user: CustomUser) {
    if (isDemoIframeLocked(user)) {
      toast.warning('Learner này đang được khóa cho demo iframe');
      return;
    }
    confirmDialog({
      title: 'Xóa vĩnh viễn tài khoản',
      description: `Bạn có chắc muốn xóa vĩnh viễn "${user.full_name || user.username}"? Toàn bộ dữ liệu (tiến độ học, nhóm, quyền) sẽ bị xóa và KHÔNG thể khôi phục.`,
      variant: 'destructive',
      onConfirm: function confirm() { hardDeleteMutation.mutate(user.id); },
    });
  }

  if (!mounted || isLoggingOut) return null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-10">

      <PageHeader
        icon={UsersIcon}
        title="Tài khoản"
        description="Quản lý người dùng, phân quyền và trạng thái tài khoản"
      />

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm theo tên, email hoặc họ tên..."
        filters={[
          {
            key: 'role',
            placeholder: 'Vai trò',
            options: [
              ...(isSuperadmin ? [{ value: 'superadmin', label: getRoleLabel('superadmin', roleLabels, 'Super Admin') }] : []),
              { value: 'superuser', label: getRoleLabel('superuser', roleLabels, 'Superuser') },
              { value: 'staff', label: getRoleLabel('staff', roleLabels, 'Staff') },
              { value: 'learner', label: getRoleLabel('learner', roleLabels, 'Learner') },
              { value: 'learner_plus', label: getRoleLabel('learner_plus', roleLabels, 'Learner+') },
            ],
          },
          {
            key: 'status',
            placeholder: 'Trạng thái',
            options: [
              { value: 'active', label: 'Hoạt động' },
              { value: 'inactive', label: 'Đã khóa' },
            ],
          },
        ]}
        filterValues={{ role: roleFilter, status: statusFilter }}
        onFilterChange={function onFilter(key, val) {
          if (key === 'role') setRoleFilter(val);
          if (key === 'status') setStatusFilter(val);
        }}
        onReset={function onReset() { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); }}
        actions={
          canAdd ? (
            <Button onClick={function openCreate() { setSelectedUser(undefined); setIsDialogOpen(true); }} className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Thêm tài khoản
            </Button>
          ) : undefined
        }
      />

      <TooltipProvider delayDuration={300}>
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider h-11 pl-5">Người dùng</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Vai trò</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Nhóm quyền</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Điện thoại</TableHead>
                {isSuperadmin && <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Tenant</TableHead>}
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Trạng thái</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Ngày tham gia</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider text-right pr-5">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={isFetching && users.length > 0 ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
              {isLoading && users.length === 0 ? (
                Array.from({ length: limit }).map(function renderSkeleton(_, i) {
                  return (
                    <TableRow key={i} className="border-border">
                      <TableCell className="pl-5 py-3"><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-36" /></div></div></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      {isSuperadmin && <TableCell><Skeleton className="h-4 w-20" /></TableCell>}
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="pr-5"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  );
                })
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isSuperadmin ? 8 : 7} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <UsersIcon className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm font-medium">Không tìm thấy người dùng</p>
                      <p className="text-xs mt-1 text-muted-foreground/70">Hãy thử thay đổi từ khóa hoặc bộ lọc.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map(function renderRow(u) {
                  const statusKey = u.is_active ? 'active' : 'inactive';
                  const demoIframeLocked = isDemoIframeLocked(u);

                  // Role-based actions logic
                  let canEditDelete = true;
                  if (!isSuperadmin && !isSuperuser) {
                    if (u.role === 'superuser' || u.role === 'superadmin' || u.role === 'staff') {
                      canEditDelete = false;
                    }
                  }
                  if (!isSuperadmin && u.role === 'superadmin') {
                    canEditDelete = false;
                  }
                  if (demoIframeLocked) {
                    canEditDelete = false;
                  }

                  return (
                    <TableRow key={u.id} className="group hover:bg-muted/30 transition-colors border-border">
                      <TableCell className="pl-5 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            <img src={storageUrl(u.avatar_url)} alt={u.username} className="w-9 h-9 flex-shrink-0 rounded-full object-cover border border-border" />
                          ) : (
                            <div className="w-9 h-9 flex-shrink-0 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground font-semibold text-xs">
                              {u.username?.[0]?.toUpperCase() || 'U'}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-sm text-foreground truncate">{u.full_name || u.username}</span>
                            <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[11px] font-mono font-medium px-2.5 py-1 rounded-md border ${ROLE_COLORS[u.role] || ROLE_COLORS.learner}`}>
                          {getRoleLabel(u.role, roleLabels, u.role)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {u.permission_group_name ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/20">
                            <ShieldCheck className="h-3 w-3" />
                            {u.permission_group_name}
                          </span>
                        ) : (u.role === 'staff' || u.role === 'superuser' || u.role === 'learner_plus') ? (
                          <span className="text-[11px] text-muted-foreground/40 italic">Chưa gán</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground text-sm font-medium">
                        {u.phone || <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      {isSuperadmin && (
                        <TableCell className="text-sm text-muted-foreground">
                          {u.tenant_name || <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant="outline" className={`font-medium shadow-none font-sans ${STATUS_COLORS[statusKey]}`}>
                          <span className="capitalize">{statusKey === 'active' ? 'Hoạt động' : 'Đã khóa'}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1">
                          {(u.role === 'learner' || u.role === 'learner_plus' || u.role === 'staff') && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={function viewDetail() { setSelectedLearner(u.username); }}
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Xem chi tiết</TooltipContent>
                            </Tooltip>
                          )}
                          {!canEditDelete ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md">
                                  {demoIframeLocked ? (
                                    <LockKeyhole className="h-4 w-4 text-amber-500" />
                                  ) : (
                                    <ShieldAlert className="h-4 w-4 text-muted-foreground/50" />
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{demoIframeLocked ? 'Đang khóa bởi demo iframe' : 'Không có quyền'}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <>
                              {!u.is_active && canEdit && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={function approve() { activateMutation.mutate(u.id); }}
                                      disabled={activateMutation.isPending}
                                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors rounded-md">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Kích hoạt</TooltipContent>
                                </Tooltip>
                              )}
                              {canEdit && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={function edit() { setSelectedUser(u); setIsDialogOpen(true); }}
                                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-md">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Chỉnh sửa</TooltipContent>
                                </Tooltip>
                              )}
                              {u.is_active && canDelete && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={function deact() { handleDeactivate(u); }}
                                      className="h-8 w-8 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-950/30 transition-colors rounded-md">
                                      <Ban className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Vô hiệu hóa</TooltipContent>
                                </Tooltip>
                              )}
                              {canDelete && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={function del() { handleHardDelete(u); }}
                                      disabled={hardDeleteMutation.isPending}
                                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors rounded-md">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Xóa vĩnh viễn</TooltipContent>
                                </Tooltip>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} limit={limit} total={total} totalPages={totalPages} onPageChange={setPage} onLimitChange={setLimit} label="tài khoản" />
      </div>
      </TooltipProvider>

      <UserFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        user={selectedUser}
        onSuccess={function onDone() { setIsDialogOpen(false); }}
      />

      <LearnerDetailModal
        username={selectedLearner}
        isOpen={!!selectedLearner}
        onClose={function closeDetail() { setSelectedLearner(null); }}
      />
    </div>
  );
}
