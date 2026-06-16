import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/utils/store';
import { customExchangeOttApi } from '@/api/custom-auth';

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
  const { setLoading, setSession, isAuthenticated, tokenExpiresAt, scheduleTokenRefresh } = useAuthStore();
  const exchanged = useRef(false);

  useEffect(() => {
    if (pendingOtt && !exchanged.current) {
      exchanged.current = true;

      customExchangeOttApi(pendingOtt)
        .then(async (data) => {
          await setSession(data);
          setLoading(false);
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
