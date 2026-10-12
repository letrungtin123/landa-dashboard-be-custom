// ═══════════════════════════════════════════════════════════════
// useBranding — Branding hook cho Admin Dashboard
// Lấy branding images theo domain (public, không cần auth)
// Cả login page và sidebar đều dùng chung 1 cache key
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { config } from '@/config/env';
import { storageUrl } from '@/utils/storage-url';
import { safeHttpUrl } from '@/utils/external-url.logic';

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

/**
 * The branding of a domain, or null when the server could not be reached
 * (then the last known branding is kept instead of the default logo).
 */
async function fetchBrandingByDomain(domain: string): Promise<AdminBranding | null> {
  try {
    const baseUrl = config.customApiUrl;
    const response = await fetch(`${baseUrl}/api/branding/by-domain/${encodeURIComponent(domain)}`);
    if (response.status >= 500) return null;
    if (!response.ok) return DEFAULT_BRANDING;

    const json = await response.json();
    const data = json.data;
    if (!data?.tenant_id) return DEFAULT_BRANDING;

    // Each upload gets a new file name, so the address itself changes with
    // the image and the browser may reuse it after F5 (no time stamp).
    const resolve = (path: string | null | undefined, fallback: string): string =>
      path ? storageUrl(path) || fallback : fallback;

    return {
      loginLogo: resolve(data.images.white_logo, DEFAULT_BRANDING.loginLogo),
      sidebarLogo: resolve(data.images.header_logo, DEFAULT_BRANDING.sidebarLogo),
      sidebarLogoDark: resolve(data.images.header_logo_dark, DEFAULT_BRANDING.sidebarLogoDark),
      squareIcon: resolve(data.images.square_icon, DEFAULT_BRANDING.squareIcon),
      tenantName: data.tenant_name || null,
      // Only an absolute http(s) address becomes the learner-site link.
      learnerUrl: safeHttpUrl(data.domain_learner),
    };
  } catch {
    return null;
  }
}

// ── Shared query key — cả login page và sidebar dùng chung ──
const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
const BRANDING_QUERY_KEY = ['admin-branding', currentDomain];

// ── Last known branding of this domain ──
// After F5 the login page and the sidebar show the tenant's own logo at once
// instead of the default logo until the branding request answers.
const BRANDING_STORAGE_KEY = `admin-branding:v1:${currentDomain}`;

function readStoredBranding(): AdminBranding | undefined {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) as Partial<AdminBranding> : null;
    if (!value || typeof value.loginLogo !== 'string' || typeof value.sidebarLogo !== 'string'
      || typeof value.sidebarLogoDark !== 'string' || typeof value.squareIcon !== 'string') return undefined;
    return {
      loginLogo: value.loginLogo,
      sidebarLogo: value.sidebarLogo,
      sidebarLogoDark: value.sidebarLogoDark,
      squareIcon: value.squareIcon,
      tenantName: typeof value.tenantName === 'string' ? value.tenantName : null,
      learnerUrl: safeHttpUrl(value.learnerUrl ?? null),
    };
  } catch {
    return undefined;
  }
}

async function loadBranding(): Promise<AdminBranding> {
  const fresh = await fetchBrandingByDomain(currentDomain);
  if (!fresh) return readStoredBranding() ?? DEFAULT_BRANDING;
  try { localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(fresh)); } catch { /* Private-mode storage can be unavailable. */ }
  return fresh;
}

/** Default title from index.html — dùng làm fallback */
const DEFAULT_TITLE = 'Nesso';

/**
 * One cache for the login page and the sidebar. The last known branding is
 * shown at once and refreshed in the background; with none known yet,
 * `isLoading` stays true until the server answers so no default logo shows.
 */
function useDomainBranding() {
  const { data, isLoading } = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: loadBranding,
    initialData: readStoredBranding,
    initialDataUpdatedAt: 0,
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
      try { sessionStorage.setItem('__branding', JSON.stringify({ t: title, f: faviconUrl })); } catch { /* Private-mode storage can be unavailable. */ }
    }
  }, [data?.tenantName, data?.squareIcon]);

  return {
    branding: data || DEFAULT_BRANDING,
    isLoading: isLoading || !data,
  };
}

/**
 * Hook lấy branding cho sidebar (sau login).
 * Dùng public API — chia sẻ cache với useBrandingPublic().
 */
export function useBranding() {
  return useDomainBranding();
}

/**
 * Hook lấy branding cho trang login (chưa auth).
 * Chia sẻ cùng cache key với useBranding() → logo không flash khi navigate.
 */
export function useBrandingPublic() {
  return useDomainBranding();
}

export { DEFAULT_BRANDING };
