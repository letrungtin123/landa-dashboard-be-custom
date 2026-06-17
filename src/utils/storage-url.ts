import { config } from '@/config/env';

const STORAGE_PROXY_PREFIX = '/api/storage/';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeProxyPath(path: string): string {
  return path.replace(/^\/+/, '');
}

export function isTransientHtmlImageSrc(src: string | null | undefined): boolean {
  const value = (src || '').trim().toLowerCase();
  return value.startsWith('blob:') || value.startsWith('data:image/');
}

export function extractStoragePathFromProxyUrl(src: string | null | undefined): string | null {
  const value = (src || '').trim();
  if (!value) return null;

  if (value.startsWith(STORAGE_PROXY_PREFIX)) {
    return decodeURIComponent(value.slice(STORAGE_PROXY_PREFIX.length));
  }

  try {
    const url = new URL(value);
    const apiUrl = new URL(config.customApiUrl);
    const sameApiHost = url.origin === apiUrl.origin;
    const samePageHost = typeof window !== 'undefined' && url.origin === window.location.origin;

    if ((sameApiHost || samePageHost) && url.pathname.startsWith(STORAGE_PROXY_PREFIX)) {
      return decodeURIComponent(url.pathname.slice(STORAGE_PROXY_PREFIX.length));
    }
  } catch {
    return null;
  }

  return null;
}

export function isStoragePath(src: string | null | undefined): boolean {
  const value = (src || '').trim();
  if (!value || isHttpUrl(value) || value.startsWith('//') || value.startsWith('/') || value.includes('://')) {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(courses|library|avatars|branding|help-docs|kb-files|kb-faqs|kb-articles)\//i.test(value);
}

export function htmlImageStoragePath(src: string | null | undefined): string | null {
  const value = (src || '').trim();
  if (!value) return null;

  const proxiedPath = extractStoragePathFromProxyUrl(value);
  if (proxiedPath) return normalizeProxyPath(proxiedPath);
  if (isStoragePath(value)) return normalizeProxyPath(value);
  return null;
}

export function isUploadedStorageImageSrc(src: string | null | undefined): boolean {
  return htmlImageStoragePath(src) !== null;
}

export function htmlImageDisplaySrc(src: string | null | undefined): string {
  const value = (src || '').trim();
  if (!value) return '';

  const proxiedPath = extractStoragePathFromProxyUrl(value);
  if (proxiedPath) return storageUrl(proxiedPath);
  if (isStoragePath(value)) return storageUrl(value);
  return value;
}

export function htmlImagePersistSrc(src: string | null | undefined): string {
  const value = (src || '').trim();
  if (!value) return '';

  const proxiedPath = extractStoragePathFromProxyUrl(value);
  if (proxiedPath) return proxiedPath;
  return value;
}

export function storageUrl(path: string | null | undefined): string {
  if (!path) return '';

  const proxyPath = extractStoragePathFromProxyUrl(path);
  if (proxyPath) {
    return `${config.customApiUrl}${STORAGE_PROXY_PREFIX}${normalizeProxyPath(proxyPath)}`;
  }

  if (isHttpUrl(path)) return path;

  const cleanPath = normalizeProxyPath(path);
  return `${config.customApiUrl}${STORAGE_PROXY_PREFIX}${cleanPath}`;
}
