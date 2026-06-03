// ═══════════════════════════════════════════════════════════════
// Refresh Token Manager — Singleton, shared giữa tất cả clients
// Giải quyết race condition: 2 clients cùng refresh → token cũ
// bị revoke → BE revoke ALL → forced logout.
// ═══════════════════════════════════════════════════════════════

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Đảm bảo chỉ có 1 refresh request tại 1 thời điểm.
 * Tất cả callers nhận cùng promise → tránh double-refresh.
 */
export async function ensureTokenRefresh(): Promise<boolean> {
  // Nếu đang refresh → đợi promise hiện tại
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  // Lazy import để tránh circular dependency
  const { useAuthStore } = await import('@/utils/store');
  const store = useAuthStore;

  isRefreshing = true;
  refreshPromise = store
    .getState()
    .performTokenRefresh()
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

/** Kiểm tra có đang refresh không */
export function isCurrentlyRefreshing(): boolean {
  return isRefreshing;
}
