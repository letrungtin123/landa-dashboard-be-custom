/**
 * SmartRedirect — Redirect đến module đầu tiên mà user có quyền can_view.
 * Dùng thay cho <Navigate to="/library" /> để tránh 404 khi user không có quyền library.
 */

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/utils/store';

/** Thứ tự ưu tiên: module_code → route path */
const MODULE_ROUTES: { module: string; path: string }[] = [
  { module: 'library', path: '/library' },
  { module: 'courses', path: '/courses' },
  { module: 'report_summary', path: '/report-summary' },
  { module: 'account', path: '/accounts' },
  { module: 'groups', path: '/groups' },
  { module: 'course_categories', path: '/course-categories' },
  { module: 'badge_management', path: '/badge-management' },
  { module: 'permission_groups', path: '/permission-groups' },
  { module: 'ai_chatbot', path: '/ai-chatbot' },
  { module: 'help_docs', path: '/help-docs' },
  { module: 'audit_log', path: '/audit-logs' },
  { module: 'branding', path: '/branding' },
  { module: 'tenant_management', path: '/tenants' },
];

export function SmartRedirect() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const user = useAuthStore((s) => s.user);

  // superadmin luôn có thể vào library; các role khác phải qua feature gate.
  if (user?.role === 'superadmin') {
    return <Navigate to="/library" replace />;
  }

  // Tìm module đầu tiên mà user có quyền can_view
  const firstAllowed = MODULE_ROUTES.find((m) => hasPermission(m.module, 'can_view'));

  if (firstAllowed) {
    return <Navigate to={firstAllowed.path} replace />;
  }

  // Không có quyền gì → profile page (luôn accessible)
  return <Navigate to="/profile" replace />;
}
