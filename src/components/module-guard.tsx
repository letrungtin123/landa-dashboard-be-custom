// ============================================================
// ModuleGuard — Route-level module access guard
// Checks if the current user's tenant has access to the module.
// If not → renders 404 page.
// superadmin bypasses all checks.
// ============================================================

import { useAuthStore } from '@/utils/store';
import NotFoundPage from '@/pages/not-found';

interface ModuleGuardProps {
  /** Module code from the modules table, e.g. 'library', 'courses' */
  module: string;
  children: React.ReactNode;
}

/**
 * Wraps a page component. Renders children if the user has access to the module,
 * otherwise renders a 404 page.
 *
 * Access logic:
 * - superadmin: always allowed
 * - superuser: allowed if module is in tenantModules
 * - staff: allowed if module is in tenantModules AND user has can_view permission
 */
export function ModuleGuard({ module, children }: ModuleGuardProps) {
  const user = useAuthStore((s) => s.user);
  const tenantModules = useAuthStore((s) => s.tenantModules);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  if (!user) return <NotFoundPage />;

  // superadmin bypasses all module restrictions
  if (user.role === 'superadmin') return <>{children}</>;

  // Check if module is enabled for the tenant
  if (tenantModules.length > 0 && !tenantModules.includes(module)) {
    return <NotFoundPage />;
  }

  // superuser: allowed if module is enabled for tenant (already checked above)
  if (user.role === 'superuser') return <>{children}</>;

  // staff: must also have can_view permission
  if (!hasPermission(module, 'can_view')) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
