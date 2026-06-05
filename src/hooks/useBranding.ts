// ═══════════════════════════════════════════════════════════════
// useBranding — Branding hook cho Admin Dashboard
// Lấy branding images theo tenant context (authenticated)
// hoặc theo domain (unauthenticated — login page)
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import { config } from '@/config/env';
import { storageUrl } from '@/utils/storage-url';
import { getBranding, type BrandingData } from '@/api/custom-branding';

// ── Static fallback imports ──
import fallbackLogoDark from '@/assets/WhiteLogoLeftPanel.png';
import fallbackLogoLight from '@/assets/leandassociate.webp';

// ── Types ──

export interface AdminBranding {
  /** Logo trắng cho login page (nền tối) */
  loginLogo: string;
  /** Logo sidebar - light mode */
  sidebarLogo: string;
  /** Logo sidebar - dark mode */
  sidebarLogoDark: string;
}

const DEFAULT_BRANDING: AdminBranding = {
  loginLogo: fallbackLogoDark,
  sidebarLogo: fallbackLogoLight,
  sidebarLogoDark: fallbackLogoDark,
};

// ── Helpers ──

function resolveFromData(data: BrandingData | null | undefined): AdminBranding {
  if (!data?.tenant_id) return DEFAULT_BRANDING;

  const bustCache = `?t=${Date.now()}`;
  const resolve = (path: string | null | undefined, fallback: string): string =>
    path ? (storageUrl(path) + bustCache) || fallback : fallback;

  return {
    loginLogo: resolve(data.images.white_logo, DEFAULT_BRANDING.loginLogo),
    sidebarLogo: resolve(data.images.header_logo, DEFAULT_BRANDING.sidebarLogo),
    sidebarLogoDark: resolve(data.images.header_logo_dark, DEFAULT_BRANDING.sidebarLogoDark),
  };
}

// ── Authenticated hook (sidebar, sau login) ──

/**
 * Hook lấy branding cho admin đã đăng nhập.
 * Dùng protected API `GET /api/branding` (auto X-Tenant-Id).
 */
export function useBranding() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-branding'],
    queryFn: async () => {
      const brandingData = await getBranding();
      return resolveFromData(brandingData);
    },
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    branding: data || DEFAULT_BRANDING,
    isLoading,
  };
}

// ── Public hook (login page, chưa đăng nhập) ──

async function fetchBrandingByDomain(domain: string): Promise<AdminBranding> {
  try {
    const baseUrl = config.customApiUrl;
    const response = await fetch(`${baseUrl}/api/branding/by-domain/${encodeURIComponent(domain)}`);
    if (!response.ok) return DEFAULT_BRANDING;

    const json = await response.json();
    return resolveFromData(json.data);
  } catch {
    return DEFAULT_BRANDING;
  }
}

/**
 * Hook lấy branding cho trang login (chưa auth).
 * Dùng public API `GET /api/branding/by-domain/:domain`.
 */
export function useBrandingPublic() {
  const domain = window.location.hostname;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-branding-public', domain],
    queryFn: () => fetchBrandingByDomain(domain),
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    branding: data || DEFAULT_BRANDING,
    isLoading,
  };
}

export { DEFAULT_BRANDING };
