// @ts-nocheck

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/utils/store';
import { useHeaderStore } from '@/utils/header-store';
import { useTenantStore } from '@/utils/tenant-store';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Moon, Sun, ChevronDown, Building2, Check, RefreshCw, GraduationCap, HardDrive } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ThemeColorToggle } from '@/components/theme-color-toggle';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useBranding } from '@/hooks/useBranding';
import { customGenerateOttApi } from '@/api/custom-auth';
import { fetchCurrentTenantDataQuota } from '@/api/custom-tenants';
import { formatQuotaGigabytes } from '@/utils/locale-format';
import { useLocaleStore } from '@/utils/locale-store';
import { storageUrl } from '@/utils/storage-url';
import { subscribeTenantDataQuotaRefresh } from '@/utils/tenant-data-quota-refresh';
import { useTranslation } from 'react-i18next';

export function Header() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const startLogout = useAuthStore((state) => state.startLogout);
  const refreshRoleLabels = useAuthStore((state) => state.refreshRoleLabels);
  const refreshGroupLabels = useAuthStore((state) => state.refreshGroupLabels);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const locale = useLocaleStore((state) => state.locale);
  const { theme, setTheme } = useTheme();
  const { title, description } = useHeaderStore();

  const isSuperadmin = user?.role === 'superadmin';
  const { activeTenantId, activeTenantName, tenants, isLoading, fetchTenants, setActiveTenant } = useTenantStore();
  const quotaTenantId = isSuperadmin ? activeTenantId : user?.tenant_id;
  const quotaQueryKey = ['tenant-data-quota-header', quotaTenantId] as const;
  const dataQuotaQuery = useQuery({
    queryKey: quotaQueryKey,
    queryFn: fetchCurrentTenantDataQuota,
    enabled: Boolean(quotaTenantId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const { branding } = useBranding();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const userAvatar = user?.avatar_url || user?.avatar;
  const showUserAvatar = Boolean(userAvatar) && !avatarLoadFailed;
  const dataQuota = dataQuotaQuery.data;
  const hasVerifiedStorageUsage = dataQuota?.state === 'enforced';
  const storageUsage = hasVerifiedStorageUsage
    ? formatQuotaGigabytes(dataQuota.totalUsedBytes, locale)
    : '—';
  const storageLimit = dataQuota?.limitBytes === null
    ? t('header.storageUnlimited')
    : formatQuotaGigabytes(dataQuota?.limitBytes, locale);
  const compactStorageLimit = dataQuota?.limitBytes === null ? '∞' : storageLimit;
  const storagePercent = (() => {
    if (!hasVerifiedStorageUsage || !dataQuota?.limitBytes) return null;
    try {
      const limit = BigInt(dataQuota.limitBytes);
      const used = BigInt(dataQuota.totalUsedBytes);
      if (limit <= 0n) return 100;
      return Math.min(100, Number((used * 100n) / limit));
    } catch {
      return null;
    }
  })();
  const storageBarClass = storagePercent !== null && storagePercent >= 100
    ? 'bg-rose-500 dark:bg-rose-400'
    : storagePercent !== null && storagePercent >= 90
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-primary';

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [userAvatar]);

  // The mutation client emits only after a successful server response. Refetch
  // the authoritative total for this exact tenant instead of doing optimistic
  // byte arithmetic in the browser.
  useEffect(() => {
    return subscribeTenantDataQuotaRefresh((changedTenantId) => {
      if (!quotaTenantId || changedTenantId !== quotaTenantId) return;
      void qc.invalidateQueries({
        queryKey: ['tenant-data-quota-header', quotaTenantId],
        exact: true,
        refetchType: 'active',
      });
    });
  }, [qc, quotaTenantId]);

  // Fetch tenants on mount for superadmin
  useEffect(() => {
    if (isSuperadmin) {
      fetchTenants().then(() => Promise.all([refreshRoleLabels(), refreshGroupLabels()]));
    }
  }, [isSuperadmin, fetchTenants, refreshGroupLabels, refreshRoleLabels]);

  const handleTenantChange = async (tenantId: string, tenantName: string) => {
    if (tenantId === activeTenantId) return;
    await qc.cancelQueries();
    qc.removeQueries();
    setActiveTenant(tenantId, tenantName);
    await Promise.all([refreshRoleLabels(), refreshGroupLabels()]);
    await qc.invalidateQueries();
  };

  const handleLogout = async () => {
    // Set flag immediately so pages show blank instead of "Access Denied"
    startLogout();
    try {
      // Xoá React Query cache — GIỮ LẠI branding (public, không phải user-specific)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'admin-branding' });
      navigate('/login');
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/70 bg-white px-3 sm:px-6 dark:border-white/[0.06] dark:bg-[#080b16]">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1 h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-lg" />
        {title && (
          <div className="hidden md:flex flex-col ml-1 border-l border-border/40 pl-3">
            <h1 className="text-sm font-semibold tracking-tight text-foreground leading-tight">{title}</h1>
            {description && (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-none max-w-[400px] truncate">
                {description}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-0 sm:gap-1">
        {/* ── Tenant Switcher (superadmin only) ── */}
        {isSuperadmin && tenants.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="app-liquid-field flex items-center gap-1.5 rounded-lg px-2.5 h-8 transition-all duration-200 outline-none hover:bg-muted hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring mr-1">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground hidden sm:inline-block max-w-[140px] truncate">
                {activeTenantName || t('header.selectTenant')}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-1 rounded-lg">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('header.tenant')}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); fetchTenants(); }}
                >
                  <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {tenants.map(t => (
                <DropdownMenuItem
                  key={t.id}
                  className="cursor-pointer text-[13px] mx-1 rounded-md flex items-center justify-between"
                  onClick={() => handleTenantChange(t.id, t.name)}
                >
                  <span className={activeTenantId === t.id ? 'font-semibold text-primary' : ''}>{t.name}</span>
                  {activeTenantId === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* ── Tenant badge (non-superadmin, read-only) ── */}
        {!isSuperadmin && user && (
          <div
            className="app-liquid-field flex items-center gap-1.5 rounded-lg px-2.5 h-8 mr-1 bg-muted/50 border border-border/60 text-foreground cursor-default select-none"
            aria-label={t('header.currentTenant', { tenant: user.tenant_name || t('header.noTenant') })}
          >
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-medium hidden sm:inline-block max-w-[140px] truncate">
              {user.tenant_name || t('header.noTenant')}
            </span>
          </div>
        )}

        {quotaTenantId && (
          <div
            className="flex h-8 w-[126px] shrink-0 items-center rounded-lg border border-slate-200/80 bg-slate-50/75 px-2 sm:h-10 sm:w-[250px] sm:rounded-xl sm:px-3 dark:border-white/[0.08] dark:bg-white/[0.035]"
            aria-live="polite"
            aria-label={t('header.storageUsage')}
          >
            {dataQuotaQuery.isLoading ? (
              <div className="flex w-full items-center gap-2 animate-pulse">
                <div className="h-3.5 w-3.5 shrink-0 rounded bg-slate-200 dark:bg-white/10" />
                <div className="h-2.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10" />
                <div className="hidden h-2.5 w-16 rounded-full bg-slate-200 dark:bg-white/10 sm:block" />
              </div>
            ) : dataQuotaQuery.isError || !dataQuota ? (
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden truncate sm:inline">{t('header.storageUsageUnavailable')}</span>
                <span className="sr-only">{t('header.storageUsageUnavailable')}</span>
              </div>
            ) : (
              <div className="flex min-w-0 w-full items-center gap-1.5 sm:gap-2">
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center justify-between gap-1 sm:gap-2 leading-none">
                    <span className="hidden min-w-0 items-center gap-1.5 text-[10px] font-semibold text-muted-foreground sm:flex">
                      <span className="truncate">{t('header.storage')}</span>
                      {!hasVerifiedStorageUsage && (
                        <span
                          className="inline-flex h-3 w-3 shrink-0 items-center justify-center"
                          role="status"
                        >
                          <RefreshCw className="h-2.5 w-2.5 animate-spin text-amber-600 dark:text-amber-300" aria-hidden="true" />
                          <span className="sr-only">{t('header.storageUsagePreparing')}</span>
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums text-foreground sm:text-[11px]">
                      {storageUsage}{' '}
                      <span className="font-normal text-muted-foreground">
                        / <span className="sm:hidden">{compactStorageLimit}</span><span className="hidden sm:inline">{storageLimit}</span>
                      </span>
                    </span>
                  </div>
                  {hasVerifiedStorageUsage && (
                    <div className="mt-1 hidden h-1 overflow-hidden rounded-full bg-slate-200/90 sm:block dark:bg-white/[0.10]">
                      <div
                        className={`h-full rounded-full transition-[width,background-color] duration-300 ${storageBarClass}`}
                        style={{ width: `${storagePercent ?? 0}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <ThemeColorToggle />

        <LanguageSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 h-8 transition-all duration-200 outline-none hover:bg-muted hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring">
            {showUserAvatar ? (
              <img
                src={storageUrl(userAvatar)}
                alt={user?.name || t('common.user')}
                className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm ring-1 ring-border/70"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-muted border border-border text-foreground flex items-center justify-center font-semibold text-[11px] uppercase shrink-0">
                {user?.name?.[0] || 'U'}
              </div>
            )}
            <span className="text-sm font-medium text-foreground hidden sm:inline-block max-w-[120px] truncate">
              {user?.name}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 mt-1 rounded-lg">
            <div className="px-3 py-2.5 flex items-center gap-3">
              {showUserAvatar ? (
                <img
                  src={storageUrl(userAvatar)}
                  alt={user?.name || t('common.user')}
                  className="h-9 w-9 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-border/70"
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <div className="h-9 w-9 rounded-xl bg-muted border border-border text-foreground flex items-center justify-center font-semibold text-xs uppercase shrink-0">
                  {user?.name?.[0] || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-[13px] mx-1 rounded-md"
              onClick={() => navigate('/profile')}
            >
              <User className="mr-2 h-4 w-4 text-muted-foreground" />
              {t('header.profile')}
            </DropdownMenuItem>
            {branding.learnerUrl && (
              <DropdownMenuItem
                className="cursor-pointer text-[13px] mx-1 rounded-md text-primary focus:text-primary"
                onClick={async () => {
                  try {
                    const { ott } = await customGenerateOttApi();
                    const learnerUrl = branding.learnerUrl!;
                    const separator = learnerUrl.includes('?') ? '&' : '?';
                    window.open(`${learnerUrl}${separator}ott=${ott}`, '_blank');
                  } catch {
                    // Fallback: mở learner mà không có OTT
                    window.open(branding.learnerUrl!, '_blank');
                  }
                }}
              >
                <GraduationCap className="mr-2 h-4 w-4" />
                {t('header.learnerPortal')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-[13px] text-destructive focus:text-destructive mx-1 mb-1 rounded-md"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('header.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
