import { useEffect, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input, PasswordInput } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/utils/store';
import { toast } from 'sonner';
import { UserPlus, Pencil, Building2, AlertTriangle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { createUser, updateUser, type CustomUser } from '@/api/custom-users';
import { fetchTenants, getUserTenants, setUserTenants, type Tenant } from '@/api/custom-tenants';
import { Checkbox } from '@/components/ui/checkbox';
import { useDebounce } from '@/hooks/use-debounce';
import { getRoleLabel } from '@/utils/role-labels';
import { getGroupLabelSet } from '@/utils/group-labels';

// ── Schemas ──
const createUserSchema = z.object({
  username: z.string().min(2, 'Tên đăng nhập là bắt buộc'),
  email: z.string().email('Email không hợp lệ'),
  full_name: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  password: z.string().min(6, 'Tối thiểu 6 ký tự'),
  role: z.enum(['superadmin', 'superuser', 'staff', 'learner_plus', 'learner']),
  is_active: z.string().transform(function toBool(v) { return v === 'true'; }),
  tenant_id: z.string().optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(2, 'Tên đăng nhập là bắt buộc'),
  email: z.string().email('Email không hợp lệ'),
  full_name: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  password: z.string().optional().or(z.literal('')),
  role: z.enum(['superadmin', 'superuser', 'staff', 'learner_plus', 'learner']),
  is_active: z.string().transform(function toBool(v) { return v === 'true'; }),
});

type UserFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: CustomUser;
  onSuccess: () => void;
};

export function UserFormDialog({ open, onOpenChange, user, onSuccess }: UserFormProps) {
  const currentUser = useAuthStore(function getUser(s) { return s.user; });
  const syncCurrentUser = useAuthStore(function getUpdateUser(s) { return s.updateUser; });
  const roleLabels = useAuthStore(function getRoleLabels(s) { return s.roleLabels; });
  const groupLabels = useAuthStore(function getGroupLabels(s) { return s.groupLabels; });
  const isSuperadmin = currentUser?.role === 'superadmin';
  const isSuperuser = currentUser?.role === 'superuser';
  const isEditing = !!user;
  const [isLoading, setIsLoading] = useState(false);
  const [managedTenantIds, setManagedTenantIds] = useState<string[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantPage, setTenantPage] = useState(1);
  const debouncedTenantSearch = useDebounce(tenantSearch, 400);
  const queryClient = useQueryClient();
  const TENANT_PAGE_SIZE = 5;
  const tenantGroupLabels = getGroupLabelSet(groupLabels);
  const groupHierarchyLabel = `${tenantGroupLabels.group} / ${tenantGroupLabels.subgroup} / ${tenantGroupLabels.team}`;

  // Reset page when search changes
  useEffect(function resetTenantPage() { setTenantPage(1); }, [debouncedTenantSearch]);

  // Paginated tenant query
  const { data: tenantData } = useQuery({
    queryKey: ['tenants-for-form', tenantPage, debouncedTenantSearch],
    queryFn: function queryTenants() {
      return fetchTenants({ page: tenantPage, page_size: TENANT_PAGE_SIZE, search: debouncedTenantSearch || undefined });
    },
    enabled: isSuperadmin && open,
    staleTime: 10000,
  });
  const tenantList = tenantData?.data ?? [];
  const tenantTotalPages = tenantData?.totalPages ?? 1;
  const tenantTotal = tenantData?.total ?? 0;

  // Load managed tenants nếu đang edit superuser — KHÔNG CÒN CẦN vì superuser chỉ 1 tenant
  // Giữ lại managed tenants state cho superadmin assignment flow (nếu có)
  useEffect(function loadManagedTenants() {
    if (!isSuperadmin || !open) return;
    // Chỉ load nếu edit user có role superadmin (multi-tenant)
    if (isEditing && user?.role === 'superadmin') {
      getUserTenants(user.id)
        .then(function onOk(res) { setManagedTenantIds(res.map(r => r.tenant_id)); })
        .catch(function onErr() { /* ignore */ });
    }
  }, [isSuperadmin, open, isEditing, user?.id, user?.role]);

  const form = useForm<any>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues: {
      username: '', email: '', full_name: '', phone: '',
      password: '', role: 'learner', is_active: 'true', tenant_id: '',
    },
  });
  const watchedRole = form.watch('role');
  const currentRoleLabel = getRoleLabel(user?.role, roleLabels, user?.role || '');
  const watchedRoleLabel = getRoleLabel(watchedRole, roleLabels, watchedRole || '');

  useEffect(function resetForm() {
    if (user && open) {
      form.reset({
        username: user.username,
        email: user.email,
        full_name: user.full_name || '',
        phone: user.phone || '',
        role: user.role,
        is_active: user.is_active ? 'true' : 'false',
        password: '',
      });
    } else if (!user && open) {
      form.reset({
        username: '', email: '', full_name: '', phone: '',
        password: '', role: 'learner', is_active: 'true', tenant_id: '',
      });
    }
  }, [user, open, form]);

  async function onSubmit(values: any) {
    try {
      setIsLoading(true);
      const payload: any = { ...values };

      // Bỏ password rỗng khi update
      if (isEditing && !payload.password) {
        delete payload.password;
      }

      // Bỏ tenant_id nếu không phải superadmin
      if (!isSuperadmin) {
        delete payload.tenant_id;
      }

      if (isEditing) {
        const updatedUser = await updateUser(user!.id, payload);
        if (currentUser?.id && updatedUser.id === currentUser.id) {
          const nextAvatarUrl = updatedUser.avatar_url || currentUser.avatar_url || currentUser.avatar;
          syncCurrentUser({
            name: updatedUser.full_name || updatedUser.username || currentUser.name,
            username: updatedUser.username || currentUser.username,
            email: updatedUser.email || currentUser.email,
            avatar: nextAvatarUrl,
            avatar_url: nextAvatarUrl,
            role: updatedUser.role || currentUser.role,
            status: updatedUser.is_active === false ? 'inactive' : 'active',
          });
        }

        // Lưu managed tenants nếu đang edit superadmin (multi-tenant)
        if (isSuperadmin && user!.role === 'superadmin') {
          try {
            await setUserTenants(user!.id, managedTenantIds);
          } catch { /* ignore — non-critical */ }
        }

        toast.success('Đã cập nhật tài khoản');
      } else {
        const newUser = await createUser(payload);

        // Gán managed tenants cho superadmin mới tạo (multi-tenant)
        if (isSuperadmin && payload.role === 'superadmin' && managedTenantIds.length > 0) {
          try {
            await setUserTenants(newUser.id, managedTenantIds);
          } catch { /* ignore — non-critical */ }
        }

        toast.success('Đã tạo tài khoản mới');
      }
      queryClient.invalidateQueries({ queryKey: ['custom-users'] });
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom: '1px solid transparent', borderImage: 'linear-gradient(to right, transparent, var(--border), transparent) 1' }}>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            {isEditing ? <Pencil className="h-4 w-4 text-primary" /> : <UserPlus className="h-4 w-4 text-primary" />}
          </div>
          <div>
            <DialogTitle className="text-[15px] font-semibold">
              {isEditing ? 'Chỉnh sửa tài khoản' : 'Tạo tài khoản mới'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {isEditing ? `Đang chỉnh sửa tài khoản ${user?.username}` : 'Thêm thành viên mới vào hệ thống'}
            </DialogDescription>
          </div>
        </div>

        {/* Form */}
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="overflow-y-auto max-h-[60vh]">
            {/* Section: Account */}
            <div className="px-6 pt-5 pb-4">
              <div className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.12em] mb-3">Thông tin tài khoản</div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="username" render={function renderField({ field }) {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Tên đăng nhập</FormLabel>
                        <FormControl><Input disabled={isEditing} placeholder="nguyenvana" {...field} className="h-9 text-sm" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                  <FormField control={form.control} name="email" render={function renderField({ field }) {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Email</FormLabel>
                        <FormControl><Input placeholder="email@congty.com" {...field} className="h-9 text-sm" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="full_name" render={function renderField({ field }) {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Họ tên</FormLabel>
                        <FormControl><Input placeholder="Nguyễn Văn A" {...field} className="h-9 text-sm" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                  <FormField control={form.control} name="phone" render={function renderField({ field }) {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Số điện thoại</FormLabel>
                        <FormControl><Input placeholder="0123456789" {...field} className="h-9 text-sm" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                </div>

                <FormField control={form.control} name="password" render={function renderField({ field }) {
                  return (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">
                        {isEditing ? 'Mật khẩu mới' : 'Mật khẩu'}
                        {isEditing && <span className="text-muted-foreground/40 ml-1 font-normal">— bỏ trống nếu không đổi</span>}
                      </FormLabel>
                      <FormControl><PasswordInput placeholder="••••••••" {...field} className="h-9 text-sm" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }} />
              </div>
            </div>

            {/* Divider */}
            <div className="mx-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

            {/* Section: Access Control */}
            <div className="px-6 pt-4 pb-5">
              <div className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.12em] mb-3">Phân quyền</div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="role" render={function renderField({ field }) {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Vai trò</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn vai trò" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isSuperadmin && (
                              <SelectItem value="superadmin">
                                <span className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {getRoleLabel('superadmin', roleLabels, 'Super Admin')}
                                </span>
                              </SelectItem>
                            )}
                            {(isSuperadmin || isSuperuser) && (
                              <>
                                <SelectItem value="superuser">
                                  <span className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {getRoleLabel('superuser', roleLabels, 'Superuser')}
                                  </span>
                                </SelectItem>
                                <SelectItem value="staff">
                                  <span className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {getRoleLabel('staff', roleLabels, 'Staff')}
                                  </span>
                                </SelectItem>
                              </>
                            )}
                            <SelectItem value="learner_plus">
                              <span className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> {getRoleLabel('learner_plus', roleLabels, 'Learner+')}
                              </span>
                            </SelectItem>
                            <SelectItem value="learner">
                              <span className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {getRoleLabel('learner', roleLabels, 'Learner')}
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                  <FormField control={form.control} name="is_active" render={function renderField({ field }) {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Trạng thái</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="true">
                              <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Hoạt động</span>
                            </SelectItem>
                            <SelectItem value="false">
                              <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Đã khóa</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                </div>

                {/* Warning: changing learner role removes from teams */}
                {isEditing && (user?.role === 'learner' || user?.role === 'learner_plus') && watchedRole !== 'learner' && watchedRole !== 'learner_plus' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      <span className="font-semibold">Cảnh báo:</span> Đổi vai trò của <span className="font-semibold">{user.username}</span> từ <span className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5 rounded">{currentRoleLabel}</span> sang <span className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5 rounded">{watchedRoleLabel}</span> sẽ tự động xóa người dùng này khỏi toàn bộ <span className="font-semibold">{groupHierarchyLabel}</span> hiện tại.
                    </div>
                  </div>
                )}

                {/* Warning: changing staff/superuser role to learner removes from permission groups + teams */}
                {isEditing && (user?.role === 'staff' || user?.role === 'superuser') && (watchedRole === 'learner' || watchedRole === 'learner_plus') && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                      <span className="font-semibold">Cảnh báo:</span> Đổi vai trò của <span className="font-semibold">{user.username}</span> từ <span className="font-mono bg-red-100 dark:bg-red-500/20 px-1 py-0.5 rounded">{currentRoleLabel}</span> sang <span className="font-mono bg-red-100 dark:bg-red-500/20 px-1 py-0.5 rounded">{watchedRoleLabel}</span> sẽ tự động:<br/>
                      • Xóa khỏi <span className="font-semibold">Nhóm quyền</span> hiện tại<br/>
                      • Xóa khỏi toàn bộ <span className="font-semibold">{groupHierarchyLabel}</span> hiện tại
                    </div>
                  </div>
                )}

                {/* Tenant selector — superadmin tạo mới (learner/staff/superuser đều chọn 1 tenant) */}
                {isSuperadmin && !isEditing && watchedRole !== 'superadmin' && (
                  <FormField control={form.control} name="tenant_id" render={function renderField({ field }) {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Tenant</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn tenant" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tenantList.map(function renderOpt(t) {
                              return <SelectItem key={t.id} value={t.id}>{t.name} ({t.slug})</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                )}

                {/* Managed Tenants — CHỈ khi tạo/edit superadmin (multi-tenant) */}
                {isSuperadmin && watchedRole === 'superadmin' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Tenants được quản lý</span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto">
                        Đã chọn: {managedTenantIds.length} / {tenantTotal}
                      </span>
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                      <Input
                        value={tenantSearch}
                        onChange={function onSearch(e) { setTenantSearch(e.target.value); }}
                        placeholder="Tìm tenant..."
                        className="h-8 pl-8 text-xs"
                      />
                    </div>

                    {/* List */}
                    <div className="rounded-lg border border-border/50 divide-y divide-border/30">
                      {tenantList.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground/60">Không tìm thấy tenant</div>
                      ) : (
                        tenantList.map(function renderTenantCheck(t) {
                          const isChecked = managedTenantIds.includes(t.id);
                          return (
                            <label
                              key={t.id}
                              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-all text-sm hover:bg-muted/40 ${isChecked ? 'bg-primary/5' : ''}`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={function toggle(checked) {
                                  setManagedTenantIds(function update(prev) {
                                    return checked ? [...prev, t.id] : prev.filter(id => id !== t.id);
                                  });
                                }}
                                className="h-4 w-4"
                              />
                              <span className={`text-[13px] truncate ${isChecked ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                {t.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">{t.slug}</span>
                              {!t.is_active && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium shrink-0">Inactive</span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* Pagination */}
                    {tenantTotalPages > 1 && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-muted-foreground/60">
                          Trang {tenantPage}/{tenantTotalPages}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button" variant="ghost" size="icon"
                            disabled={tenantPage <= 1}
                            onClick={function prev() { setTenantPage(function p(v) { return Math.max(1, v - 1); }); }}
                            className="h-7 w-7"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="icon"
                            disabled={tenantPage >= tenantTotalPages}
                            onClick={function next() { setTenantPage(function p(v) { return Math.min(tenantTotalPages, v + 1); }); }}
                            className="h-7 w-7"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid transparent', borderImage: 'linear-gradient(to right, transparent, var(--border), transparent) 1' }}>
              <Button type="button" variant="ghost" onClick={function close() { onOpenChange(false); }} className="h-9 px-4 text-[13px]">Hủy</Button>
              <Button type="submit" disabled={isLoading} className="h-9 px-5 text-[13px] transition-all duration-200 active:scale-[0.97]">
                {isLoading ? (isEditing ? 'Đang lưu...' : 'Đang tạo...') : (isEditing ? 'Lưu thay đổi' : 'Tạo tài khoản')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
