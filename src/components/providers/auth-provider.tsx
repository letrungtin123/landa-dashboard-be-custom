import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/utils/store';
import { customExchangeOttApi } from '@/api/custom-auth';
import { storageUrl } from '@/utils/storage-url';

// Check OTT TRƯỚC khi React mount — đảm bảo isLoading=true
// trước lần render đầu tiên (AuthGuard kiểm tra isLoading).
function checkOttOnLoad(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ott = params.get('ott');
  if (ott) {
    // Set loading=true NGAY để AuthGuard không redirect /login
    useAuthStore.setState({ isLoading: true });
    // Xóa OTT khỏi URL ngay lập tức (tránh lộ token trong history)
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
  }
  return ott;
}

// Chạy synchronously trước khi component mount
const pendingOtt = checkOttOnLoad();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setLoading, isAuthenticated, tokenExpiresAt, scheduleTokenRefresh } = useAuthStore();
  const exchanged = useRef(false);

  useEffect(() => {
    if (pendingOtt && !exchanged.current) {
      exchanged.current = true;

      customExchangeOttApi(pendingOtt)
        .then((data) => {
          const user = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.full_name || data.user.username,
            username: data.user.username,
            role: data.user.role,
            avatar: storageUrl(data.user.avatar_url) || null,
            avatar_url: storageUrl(data.user.avatar_url) || null,
            status: 'active' as const,
            isStaff: data.user.role === 'staff' || data.user.role === 'superuser' || data.user.role === 'superadmin',
            isSuperuser: data.user.role === 'superuser' || data.user.role === 'superadmin',
            tenant_id: data.user.tenant_id,
            tenant_name: data.user.tenant_name,
          };

          useAuthStore.setState({
            user,
            permissions: data.permissions,
            tenantModules: data.tenant_modules,
            managedTenants: data.managed_tenants || [],
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenExpiresAt: Date.now() + data.expires_in * 1000,
            isAuthenticated: true,
            isLoading: false,
          });

          useAuthStore.getState().scheduleTokenRefresh();
        })
        .catch(() => {
          // OTT invalid/expired → set loading false để AuthGuard redirect /login
          setLoading(false);
        });
    } else if (!pendingOtt) {
      // Normal flow: rehydrate từ encrypted storage
      setLoading(false);

      if (isAuthenticated && tokenExpiresAt && Date.now() < tokenExpiresAt) {
        scheduleTokenRefresh();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
