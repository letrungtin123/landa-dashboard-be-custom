import { useState, useEffect, useCallback } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { useLocation, Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/utils/store';
import { useBranding } from '@/hooks/useBranding';
import { getRoleLabel } from '@/utils/role-labels';
import { useTranslation } from 'react-i18next';

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
  titleKey: string;
  url: string;
  module: string;
  fallbackIcon: string;
}

interface NavGroup {
  groupKey: string;
  items: NavItem[];
}

// === Flat navigation config — each former subtab is now an independent module ===
const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'nav.groups.overview',
    items: [
      // { title: 'Bảng điều khiển', url: '/dashboard', module: 'dashboard', fallbackIcon: 'LayoutDashboard' },
    ],
  },
  {
    groupKey: 'nav.groups.content',
    items: [
      { titleKey: 'nav.items.library', url: '/library', module: 'library', fallbackIcon: 'Library' },
      { titleKey: 'nav.items.courses', url: '/courses', module: 'courses', fallbackIcon: 'GraduationCap' },
      { titleKey: 'nav.items.courseCategories', url: '/course-categories', module: 'course_categories', fallbackIcon: 'FolderKanban' },
      { titleKey: 'nav.items.badgeManagement', url: '/badge-management', module: 'badge_management', fallbackIcon: 'Award' },
      { titleKey: 'nav.items.aiChatbot', url: '/ai-chatbot', module: 'ai_chatbot', fallbackIcon: 'Bot' },
    ],
  },
  {
    groupKey: 'nav.groups.users',
    items: [
      { titleKey: 'nav.items.users', url: '/accounts', module: 'account', fallbackIcon: 'Users' },
      { titleKey: 'nav.items.groups', url: '/groups', module: 'groups', fallbackIcon: 'FolderTree' },
      { titleKey: 'nav.items.permissionGroups', url: '/permission-groups', module: 'permission_groups', fallbackIcon: 'ShieldCheck' },
      { titleKey: 'nav.items.auditLogs', url: '/audit-logs', module: 'audit_log', fallbackIcon: 'ScrollText' },
    ],
  },
  {
    groupKey: 'nav.groups.analytics',
    items: [
      { titleKey: 'nav.items.reportSummary', url: '/report-summary', module: 'report_summary', fallbackIcon: 'BarChart3' },
    ],
  },
  {
    groupKey: 'nav.groups.support',
    items: [
      { titleKey: 'nav.items.helpDocs', url: '/help-docs', module: 'help_docs', fallbackIcon: 'BookOpen' },
    ],
  },
  {
    groupKey: 'nav.groups.system',
    items: [
      { titleKey: 'nav.items.tenantManagement', url: '/tenants', module: 'tenant_management', fallbackIcon: 'Building2' },
      { titleKey: 'nav.items.branding', url: '/branding', module: 'branding', fallbackIcon: 'Palette' },
      { titleKey: 'nav.items.emailTemplates', url: '/email-templates', module: 'email_templates', fallbackIcon: 'MailCheck' },
      { titleKey: 'nav.items.promptTemplates', url: '/prompt-templates', module: 'tenant_management', fallbackIcon: 'Drama' },
      { titleKey: 'nav.items.badges', url: '/badges', module: 'superadmin_only', fallbackIcon: 'Award' },
      { titleKey: 'nav.items.ssoManagement', url: '/sso-management', module: 'superadmin_only', fallbackIcon: 'Key' },
      { titleKey: 'nav.items.demoLogin', url: '/demo-login-settings', module: 'superadmin_only', fallbackIcon: 'QrCode' },
    ],
  }
];

export function AppSidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { theme } = useTheme();
  const { branding, isLoading: brandingLoading } = useBranding();
  const user = useAuthStore((state) => state.user);
  const roleLabels = useAuthStore((state) => state.roleLabels);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [moduleIcons, setModuleIcons] = useState<Record<string, string>>({});
  const [collapsedIconError, setCollapsedIconError] = useState(false);

  // Fetch module icons from DB (Mocked)
  const fetchIcons = useCallback(() => {
    // Mock empty icons since this is shell
    setModuleIcons({});
  }, []);

  useEffect(() => {
    fetchIcons();
  }, [fetchIcons]);

  useEffect(() => {
    setCollapsedIconError(false);
  }, [branding.squareIcon]);

  const permissions = useAuthStore((state) => state.permissions);

  const tenantModules = useAuthStore((state) => state.tenantModules);

  // Check if user can see a module (based on permissions + tenant modules)
  const canSeeModule = (item: NavItem): boolean => {
    if (!user) return false;

    // This manager is role-protected server-side as well. Do not let a staff
    // permission-matrix entry make it discoverable in the navigation.
    if (item.module === 'permission_groups' && user.role !== 'superuser' && user.role !== 'superadmin') return false;

    // superadmin thấy tất cả (cross-tenant)
    if (user.role === 'superadmin') return true;

    // Các module dành riêng cho superadmin
    if (item.module === 'tenant_management' || item.module === 'superadmin_only') return false;

    // Kiểm tra module có được bật cho tenant không
    if (!tenantModules.includes(item.module)) {
      return false;
    }

    // superuser thấy tất cả module ĐƯỢC BẬT cho tenant
    if (user.role === 'superuser') return true;

    // staff: kiểm tra quyền can_view
    return hasPermission(item.module, 'can_view');
  };

  // Build filtered nav groups
  const filteredNavGroups = NAV_GROUPS.map((group) => ({
    groupKey: group.groupKey,
    items: group.items.filter(canSeeModule),
  })).filter((group) => group.items.length > 0);
  const tenantInitials = (branding.tenantName || user?.tenant_name || 'LA')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'LA';
  const showCollapsedTenantIcon = Boolean(branding.squareIcon) && !collapsedIconError;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/70 bg-transparent">
      {/* Header */}
      <SidebarHeader className="h-16 flex justify-center px-5 group-data-[collapsible=icon]:px-0 py-0 border-b border-sidebar-border/70">
        <Link to="/" className="flex items-center justify-center w-full overflow-hidden">
          {/* Full Logo - hidden when collapsed */}
          <img src={theme === 'dark' ? branding.sidebarLogoDark : branding.sidebarLogo} alt="Logo" className={`h-8 w-auto shrink-0 group-data-[collapsible=icon]:hidden transition-opacity duration-300 ${brandingLoading ? 'opacity-0' : 'opacity-100'}`} />

          {/* Square icon - visible only when collapsed */}
          <div className={`hidden group-data-[collapsible=icon]:flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg sidebar-liquid-control shrink-0 transition-opacity duration-300 ${brandingLoading ? 'opacity-0' : 'opacity-100'}`}>
            {showCollapsedTenantIcon ? (
              <img
                src={branding.squareIcon}
                alt={branding.tenantName || user?.tenant_name || 'Tenant'}
                className="h-full w-full rounded-lg object-contain"
                onError={() => setCollapsedIconError(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center rounded-lg text-[10px] font-bold uppercase text-sidebar-foreground/70">
                {tenantInitials}
              </span>
            )}
          </div>
        </Link>
      </SidebarHeader>

      {/* Body */}
      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-2 pt-5 group-data-[collapsible=icon]:pt-2">
        {filteredNavGroups.map((group, groupIdx) => (
          <SidebarGroup key={group.groupKey} className={`!py-0.5 ${groupIdx > 0 ? 'mt-0.5 group-data-[collapsible=icon]:mt-0.5' : ''}`}>
            {/* Group label */}
            <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/45 uppercase tracking-[0.15em] px-2 mb-0.5 group-data-[collapsible=icon]:hidden">
              {t(group.groupKey)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:items-center">
                {group.items.map((item) => {
                  const Icon = getIconComponent(moduleIcons[item.module] || item.fallbackIcon);
                  const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);

                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={t(item.titleKey)}
                        className={`h-9 rounded-xl group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!rounded-xl ${isActive
                          ? 'sidebar-liquid-active font-semibold'
                          : 'text-sidebar-foreground/68 hover:bg-white/45 hover:text-sidebar-foreground dark:hover:bg-white/[0.07]'
                          }`}
                      >
                        <Link to={item.url}>
                          <Icon className={`shrink-0 transition-colors duration-200 ${isActive ? 'text-current' : 'text-sidebar-foreground/45'} group-data-[collapsible=icon]:w-[18px] group-data-[collapsible=icon]:h-[18px]`} />
                          <span className={`font-medium text-[13px] group-data-[collapsible=icon]:hidden ${isActive ? 'text-current' : ''}`}>
                            {t(item.titleKey)}
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
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2 mt-auto border-t border-sidebar-border/70 group-data-[collapsible=icon]:items-center">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={user?.name || 'Profile'}
              className="h-auto p-2.5 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!size-8 rounded-xl hover:bg-white/45 dark:hover:bg-white/[0.07] group-data-[collapsible=icon]:justify-center"
            >
              <Link to="/profile">
                {(user?.avatar_url || user?.avatar) ? (
                  <img
                    src={storageUrl(user.avatar_url || user.avatar || '')}
                    alt={user?.name || 'User'}
                    className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-sidebar-border/70"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                  />
                ) : null}
                <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center text-xs font-bold uppercase shrink-0 shadow-sm ring-1 ring-white/25 ${(user?.avatar_url || user?.avatar) ? 'hidden' : ''}`} style={{ background: 'linear-gradient(135deg, var(--sidebar-active-from), var(--sidebar-active-to))' }}>
                  {user?.name?.[0] || 'U'}
                </div>
                <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden ml-0.5">
                  <span className="text-[13px] font-semibold text-sidebar-foreground leading-tight truncate">
                    {user?.name || 'Admin User'}
                  </span>
                  <span className="text-[11px] font-medium text-sidebar-foreground/40 truncate leading-tight mt-0.5">
                    {getRoleLabel(
                      user?.role,
                      roleLabels,
                      user?.role === 'superadmin' ? t('nav.roles.systemAdmin') : user?.role === 'superuser' ? t('nav.roles.administrator') : user?.role === 'staff' ? t('nav.roles.staff') : user?.role === 'learner_plus' ? t('nav.roles.advancedLearner') : t('nav.roles.learner'),
                    )}
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
