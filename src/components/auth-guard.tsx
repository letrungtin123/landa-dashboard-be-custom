import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/utils/store';

interface AuthGuardProps {
  requireAuth: boolean;
}

/**
 * AuthGuard — Route protection cho React Router.
 *
 * - requireAuth=true: phải đăng nhập → redirect /login nếu chưa
 * - requireAuth=false: phải CHƯA đăng nhập → redirect /library nếu đã login
 */
export function AuthGuard({ requireAuth }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'learner') {
      void logout();
    }
  }, [isAuthenticated, logout, user?.role]);

  // Đang kiểm tra auth → render nothing (tránh flash)
  if (isLoading) return null;

  // Đang logout → render nothing (tránh flash "Access Denied")
  if (isLoggingOut) return null;

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isAuthenticated && user?.role === 'learner') {
    return <Navigate to="/login?error=admin_forbidden" replace />;
  }

  if (!requireAuth && isAuthenticated) {
    return <Navigate to="/library" replace />;
  }

  return <Outlet />;
}
