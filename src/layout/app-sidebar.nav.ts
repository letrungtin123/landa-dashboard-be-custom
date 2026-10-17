// Sidebar entries and who sees them. Pure: the sidebar passes the signed-in
// user's role, the tenant's modules and the permission check.

export interface NavItem {
  titleKey: string;
  url: string;
  module: string;
  fallbackIcon: string;
}

export interface NavGroup {
  groupKey: string;
  items: NavItem[];
}

// === Flat navigation config — each former subtab is now an independent module ===
export const NAV_GROUPS: NavGroup[] = [
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
      { titleKey: 'nav.items.news', url: '/news', module: 'news', fallbackIcon: 'Newspaper' },
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
      { titleKey: 'nav.items.aiCredits', url: '/ai-credits', module: 'superadmin_only', fallbackIcon: 'CreditCard' },
      { titleKey: 'nav.items.branding', url: '/branding', module: 'branding', fallbackIcon: 'Palette' },
      { titleKey: 'nav.items.emailTemplates', url: '/email-templates', module: 'email_templates', fallbackIcon: 'MailCheck' },
      { titleKey: 'nav.items.promptTemplates', url: '/prompt-templates', module: 'tenant_management', fallbackIcon: 'Drama' },
      { titleKey: 'nav.items.badges', url: '/badges', module: 'superadmin_only', fallbackIcon: 'Award' },
      { titleKey: 'nav.items.ssoManagement', url: '/sso-management', module: 'superadmin_only', fallbackIcon: 'Key' },
      { titleKey: 'nav.items.demoLogin', url: '/demo-login-settings', module: 'superadmin_only', fallbackIcon: 'QrCode' },
    ],
  }
];

export interface NavAccess {
  role: string | null | undefined;
  tenantModules: readonly string[];
  hasPermission: (moduleCode: string, action: 'can_view') => boolean;
}

// Check if user can see a module (based on permissions + tenant modules)
export function canSeeNavItem(item: Pick<NavItem, 'module'>, access: NavAccess): boolean {
  const { role } = access;
  if (!role) return false;

  // This manager is role-protected server-side as well. Do not let a staff
  // permission-matrix entry make it discoverable in the navigation.
  if (item.module === 'permission_groups' && role !== 'superuser' && role !== 'superadmin') return false;

  // superadmin thấy tất cả (cross-tenant)
  if (role === 'superadmin') return true;

  // Các module dành riêng cho superadmin
  if (item.module === 'tenant_management' || item.module === 'superadmin_only') return false;

  // Kiểm tra module có được bật cho tenant không
  if (!access.tenantModules.includes(item.module)) {
    return false;
  }

  // superuser thấy tất cả module ĐƯỢC BẬT cho tenant
  if (role === 'superuser') return true;

  // staff: kiểm tra quyền can_view
  return access.hasPermission(item.module, 'can_view');
}

export function visibleNavGroups(access: NavAccess): NavGroup[] {
  return NAV_GROUPS.map(group => ({
    groupKey: group.groupKey,
    items: group.items.filter(item => canSeeNavItem(item, access)),
  })).filter(group => group.items.length > 0);
}
