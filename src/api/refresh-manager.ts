// ═══════════════════════════════════════════════════════════════
// Refresh Token Manager — Thin wrapper, delegate tới store mutex
// KHÔNG có mutex riêng — chỉ dùng refreshMutex trong useAuthStore
// để tránh race condition giữa 2 lớp mutex.
// ═══════════════════════════════════════════════════════════════

/**
 * Đảm bảo chỉ có 1 refresh request tại 1 thời điểm.
 * Delegate hoàn toàn cho store.performTokenRefresh() (có mutex + cooldown).
 * File này tồn tại chỉ để tránh circular dependency:
 *   client.ts → store.ts → client.ts
 */
export async function ensureTokenRefresh(): Promise<boolean> {
  // Lazy import để tránh circular dependency
  const { useAuthStore } = await import('@/utils/store');
  return useAuthStore.getState().performTokenRefresh();
}
