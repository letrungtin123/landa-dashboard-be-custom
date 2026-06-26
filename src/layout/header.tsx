// @ts-nocheck

import { useEffect } from 'react';
import { useAuthStore } from '@/utils/store';
import { useHeaderStore } from '@/utils/header-store';
import { useTenantStore } from '@/utils/tenant-store';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

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
import { LogOut, User, Moon, Sun, ChevronDown, Building2, Check, RefreshCw, GraduationCap } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ThemeColorToggle } from '@/components/theme-color-toggle';
import { useBranding } from '@/hooks/useBranding';
import { customGenerateOttApi } from '@/api/custom-auth';

export function Header() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const startLogout = useAuthStore((state) => state.startLogout);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { title, description } = useHeaderStore();

  const isSuperadmin = user?.role === 'superadmin';
  const { activeTenantId, activeTenantName, tenants, isLoading, fetchTenants, setActiveTenant } = useTenantStore();
  const { branding } = useBranding();

  // Fetch tenants on mount for superadmin
  useEffect(() => {
    if (isSuperadmin) {
      fetchTenants();
    }
  }, [isSuperadmin, fetchTenants]);

  const handleTenantChange = (tenantId: string, tenantName: string) => {
    setActiveTenant(tenantId, tenantName);
    qc.invalidateQueries();
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
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/60 bg-card/90 backdrop-blur-xl px-6 dark:bg-[#080b16]/80 dark:border-white/[0.06]">
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

      <div className="flex items-center gap-1">
        {/* ── Tenant Switcher (superadmin only) ── */}
        {isSuperadmin && tenants.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg px-2.5 h-8 transition-all duration-200 outline-none hover:bg-muted hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring mr-1">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground hidden sm:inline-block max-w-[140px] truncate">
                {activeTenantName || 'Chọn tenant'}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-1 rounded-lg">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tổ chức</span>
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

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 h-8 transition-all duration-200 outline-none hover:bg-muted hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring">
            <div className="w-6 h-6 rounded-full bg-muted border border-border text-foreground flex items-center justify-center font-semibold text-[11px] uppercase shrink-0">
              {user?.name?.[0] || 'U'}
            </div>
            <span className="text-sm font-medium text-foreground hidden sm:inline-block max-w-[120px] truncate">
              {user?.name}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 mt-1 rounded-lg">
            <div className="px-3 py-2.5">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-[13px] mx-1 rounded-md"
              onClick={() => navigate('/profile')}
            >
              <User className="mr-2 h-4 w-4 text-muted-foreground" />
              Hồ sơ cá nhân
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
                Trang học viên
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-[13px] text-destructive focus:text-destructive mx-1 mb-1 rounded-md"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
