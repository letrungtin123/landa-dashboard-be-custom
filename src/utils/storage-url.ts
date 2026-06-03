// ═══════════════════════════════════════════════════════════════
// Storage URL — Convert storage path → BE proxy URL
// Ảnh/file được stream qua BE, không lộ Supabase URL
// ═══════════════════════════════════════════════════════════════

import { config } from '@/config/env';

/**
 * Convert storage path thành URL qua BE proxy.
 * 
 * @example
 * storageUrl("tenant123/avatars/abc.jpg")
 * → "http://localhost:3001/api/storage/tenant123/avatars/abc.jpg"
 * 
 * storageUrl(null)  → ""
 * storageUrl("")    → ""
 * storageUrl("http://...") → "http://..." (backward compat)
 */
export function storageUrl(path: string | null | undefined): string {
  if (!path) return '';
  // Backward compat: nếu đã là full URL (data cũ) → trả nguyên
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // Loại bỏ leading slash nếu có
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${config.customApiUrl}/api/storage/${cleanPath}`;
}
