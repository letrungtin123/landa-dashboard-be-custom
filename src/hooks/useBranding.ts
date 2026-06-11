// ═══════════════════════════════════════════════════════════════
// useBranding — Branding hook cho Admin Dashboard
// Lấy branding images theo domain (public, không cần auth)
// Cả login page và sidebar đều dùng chung 1 cache key
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { config } from '@/config/env';
import { storageUrl } from '@/utils/storage-url';

// ── Static fallback imports ──
import fallbackLogoDark from '@/assets/WhiteLogoLeftPanel.png';
import fallbackLogoLight from '@/assets/leandassociate.webp';
import fallbackSquareIcon from '@/assets/WhiteLogoLeftPanel.png';

// ── Types ──

export interface AdminBranding {
  /** Logo trắng cho login page (nền tối) */
  loginLogo: string;
  /** Logo sidebar - light mode */
  sidebarLogo: string;
  /** Logo sidebar - dark mode */
  sidebarLogoDark: string;
  /** Icon vuông — dùng cho favicon */
  squareIcon: string;
  /** Tên tenant từ API */
  tenantName: string | null;
  /** URL trang FE Learner — dùng cho button E-learning */
  learnerUrl: string | null;
}

const DEFAULT_BRANDING: AdminBranding = {
  loginLogo: fallbackLogoDark,
  sidebarLogo: fallbackLogoLight,
  sidebarLogoDark: fallbackLogoDark,
  squareIcon: fallbackSquareIcon,
  tenantName: null,
  learnerUrl: null,
};

// ── Shared fetch function ──

async function fetchBrandingByDomain(domain: string): Promise<AdminBranding> {
  try {
    const baseUrl = config.customApiUrl;
    const response = await fetch(`${baseUrl}/api/branding/by-domain/${encodeURIComponent(domain)}`);
    if (!response.ok) return DEFAULT_BRANDING;

    const json = await response.json();
    const data = json.data;
    if (!data?.tenant_id) return DEFAULT_BRANDING;

    const bustCache = `?t=${Date.now()}`;
    const resolve = (path: string | null | undefined, fallback: string): string =>
      path ? (storageUrl(path) + bustCache) || fallback : fallback;

    return {
      loginLogo: resolve(data.images.white_logo, DEFAULT_BRANDING.loginLogo),
      sidebarLogo: resolve(data.images.header_logo, DEFAULT_BRANDING.sidebarLogo),
      sidebarLogoDark: resolve(data.images.header_logo_dark, DEFAULT_BRANDING.sidebarLogoDark),
      squareIcon: resolve(data.images.square_icon, DEFAULT_BRANDING.squareIcon),
      tenantName: data.tenant_name || null,
      learnerUrl: data.domain_learner || null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

// ── Shared query key — cả login page và sidebar dùng chung ──
const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
const BRANDING_QUERY_KEY = ['admin-branding', currentDomain];

/** Default title from index.html — dùng làm fallback */
const DEFAULT_TITLE = 'Nesso';

/**
 * Hook lấy branding cho sidebar (sau login).
 * Dùng public API — chia sẻ cache với useBrandingPublic().
 * Data đã được fetch sẵn ở login page → sidebar hiển thị logo ngay lập tức.
 */
export function useBranding() {
  const { data, isLoading } = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: () => fetchBrandingByDomain(currentDomain),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Cập nhật document.title + favicon theo tenant từ API + cache vào sessionStorage
  useEffect(() => {
    const title = data?.tenantName ? `${data.tenantName} | Admin` : '';
    if (title) document.title = title;

    const faviconUrl = data?.squareIcon && data.squareIcon !== fallbackSquareIcon
      ? data.squareIcon : '';
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (link && faviconUrl) {
      link.type = 'image/png';
      link.href = faviconUrl;
    }

    if (title || faviconUrl) {
      try { sessionStorage.setItem('__branding', JSON.stringify({ t: title, f: faviconUrl })); } catch {}
    }
  }, [data?.tenantName, data?.squareIcon]);

  return {
    branding: data || DEFAULT_BRANDING,
    isLoading,
  };
}

/**
 * Hook lấy branding cho trang login (chưa auth).
 * Chia sẻ cùng cache key với useBranding() → logo không flash khi navigate.
 */
export function useBrandingPublic() {
  const { data, isLoading } = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: () => fetchBrandingByDomain(currentDomain),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Cập nhật document.title + favicon trên trang login + cache vào sessionStorage
  useEffect(() => {
    const title = data?.tenantName ? `${data.tenantName} | Admin` : '';
    if (title) document.title = title;

    const faviconUrl = data?.squareIcon && data.squareIcon !== fallbackSquareIcon
      ? data.squareIcon : '';
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (link && faviconUrl) {
      link.type = 'image/png';
      link.href = faviconUrl;
    }

    if (title || faviconUrl) {
      try { sessionStorage.setItem('__branding', JSON.stringify({ t: title, f: faviconUrl })); } catch {}
    }
  }, [data?.tenantName, data?.squareIcon]);

  return {
    branding: data || DEFAULT_BRANDING,
    isLoading,
  };
}

export { DEFAULT_BRANDING };
