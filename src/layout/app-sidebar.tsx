import { useState, useEffect, useCallback } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { useLocation, Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/utils/store';
import logoDark from '@/assets/WhiteLogoLeftPanel.png';
import logoLight from '@/assets/leandassociate.webp';

import { getIconComponent } from '@/utils/icon-map';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

// === Types ===
interface NavItem {
  title: string;
  url: string;
  module: string;
  fallbackIcon: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

// === Flat navigation config — each former subtab is now an independent module ===
const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      // { title: 'Dashboard', url: '/dashboard', module: 'dashboard', fallbackIcon: 'LayoutDashboard' },
    ],
  },
  {
    group: 'Content',
    items: [
      { title: 'Library', url: '/library', module: 'library', fallbackIcon: 'Library' },
      { title: 'Courses', url: '/courses', module: 'courses', fallbackIcon: 'GraduationCap' },
      { title: 'Course Categories', url: '/course-categories', module: 'course_categories', fallbackIcon: 'FolderKanban' },
    ],
  },
  {
    group: 'User',
    items: [
      { title: 'Users', url: '/accounts', module: 'account', fallbackIcon: 'Users' },
      { title: 'Groups', url: '/groups', module: 'groups', fallbackIcon: 'FolderTree' },
      { title: 'Permission Groups', url: '/permission-groups', module: 'permission_groups', fallbackIcon: 'ShieldCheck' },
      { title: 'Audit Logs', url: '/audit-logs', module: 'audit_log', fallbackIcon: 'ScrollText' },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { title: 'Report Summary', url: '/report-summary', module: 'report_summary', fallbackIcon: 'BarChart3' },
    ],
  },
  {
    group: 'Support',
    items: [
      { title: 'Help Docs', url: '/help-docs', module: 'help_docs', fallbackIcon: 'BookOpen' },
    ],
  },
  {
    group: 'System',
    items: [
      { title: 'Tenant Management', url: '/tenants', module: 'tenant_management', fallbackIcon: 'Building2' },
    ],
  }
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const { theme } = useTheme();
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [moduleIcons, setModuleIcons] = useState<Record<string, string>>({});

  // Fetch module icons from DB (Mocked)
  const fetchIcons = useCallback(() => {
    // Mock empty icons since this is shell
    setModuleIcons({});
  }, []);

  useEffect(() => {
    fetchIcons();
  }, [fetchIcons]);

  const permissions = useAuthStore((state) => state.permissions);

  const tenantModules = useAuthStore((state) => state.tenantModules);

  // Check if user can see a module (based on permissions + tenant modules)
  const canSeeModule = (item: NavItem): boolean => {
    if (!user) return false;

    // superadmin thấy tất cả (cross-tenant)
    if (user.role === 'superadmin') return true;

    // Kiểm tra module có được bật cho tenant không
    if (tenantModules.length > 0 && !tenantModules.includes(item.module)) {
      return false;
    }

    // superuser thấy tất cả module ĐƯỢC BẬT cho tenant
    if (user.role === 'superuser') return true;

    // staff: kiểm tra quyền can_view
    return hasPermission(item.module, 'can_view');
  };

  // Build filtered nav groups
  const filteredNavGroups = NAV_GROUPS.map((group) => ({
    group: group.group,
    items: group.items.filter(canSeeModule),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <SidebarHeader className="h-16 flex justify-center px-5 group-data-[collapsible=icon]:px-0 py-0 border-b border-sidebar-border">
        <Link to="/library" className="flex items-center justify-center w-full overflow-hidden">
          {/* Full Logo - hidden when collapsed */}
          <img src={theme === 'dark' ? logoDark : logoLight} alt="L&A Logo" className="h-8 w-auto shrink-0 group-data-[collapsible=icon]:hidden" />

          {/* Badge Icon - visible only when collapsed */}
          <div className="hidden group-data-[collapsible=icon]:flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs shrink-0 shadow-sm">
            L&A
          </div>
        </Link>
      </SidebarHeader>

      {/* Body */}
      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-2 pt-5 group-data-[collapsible=icon]:pt-2">
        {filteredNavGroups.map((group, groupIdx) => (
          <SidebarGroup key={group.group} className={`!py-0.5 ${groupIdx > 0 ? 'mt-0.5 group-data-[collapsible=icon]:mt-0.5' : ''}`}>
            {/* Group label */}
            <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-[0.15em] px-2 mb-0.5 group-data-[collapsible=icon]:hidden">
              {group.group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:items-center">
                {group.items.map((item) => {
                  const Icon = getIconComponent(moduleIcons[item.module] || item.fallbackIcon);
                  const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);

                  return (
                    <SidebarMenuItem key={item.module}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className={`h-9 rounded-xl group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!rounded-xl ${isActive
                          ? 'bg-primary/10 text-primary font-semibold dark:bg-primary/15'
                          : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                          }`}
                      >
                        <Link to={item.url}>
                          <Icon className={`shrink-0 transition-colors duration-200 ${isActive ? 'text-primary' : 'text-sidebar-foreground/45'} group-data-[collapsible=icon]:w-[18px] group-data-[collapsible=icon]:h-[18px]`} />
                          <span className={`font-medium text-[13px] group-data-[collapsible=icon]:hidden ${isActive ? 'text-primary' : ''}`}>
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2 mt-auto border-t border-sidebar-border group-data-[collapsible=icon]:items-center">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={user?.name || 'Profile'}
              className="h-auto p-2.5 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!size-8 rounded-xl hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
            >
              <Link to="/profile">
                {(user?.avatar_url || user?.avatar) ? (
                  <img
                    src={storageUrl(user.avatar_url || user.avatar || '')}
                    alt={user?.name || 'User'}
                    className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-sidebar-border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                  />
                ) : null}
                <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center text-xs font-bold uppercase shrink-0 shadow-sm ${(user?.avatar_url || user?.avatar) ? 'hidden' : ''}`} style={{ background: 'linear-gradient(135deg, var(--sidebar-active-from), var(--sidebar-active-to))' }}>
                  {user?.name?.[0] || 'U'}
                </div>
                <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden ml-0.5">
                  <span className="text-[13px] font-semibold text-sidebar-foreground leading-tight truncate">
                    {user?.name || 'Admin User'}
                  </span>
                  <span className="text-[11px] font-medium text-sidebar-foreground/40 truncate leading-tight mt-0.5">
                    {user?.role === 'superadmin' ? 'Super Administrator' : user?.role === 'superuser' ? 'Tenant Admin' : user?.role === 'staff' ? 'Staff' : 'Learner'}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
