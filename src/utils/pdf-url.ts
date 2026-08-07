import { extractStoragePathFromProxyUrl, isStoragePath, storageUrl } from '@/utils/storage-url';

const SUPABASE_PUBLIC_MARKER = '/object/public/landa-storage/';
const LEGACY_ASSET_RE = /(?:\/asset-v1:|\/c4x\/)/i;
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]+$/;

function normalizeStoragePath(path: string): string {
  return path.replace(/^\/+/, '').split(/[?#]/, 1)[0];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractSupabaseStoragePath(value: string): string | null {
  const markerIndex = value.indexOf(SUPABASE_PUBLIC_MARKER);
  if (markerIndex === -1) return null;
  return normalizeStoragePath(safeDecode(value.substring(markerIndex + SUPABASE_PUBLIC_MARKER.length)));
}

function sanitizeDriveFileId(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = safeDecode(value.trim());
  return DRIVE_FILE_ID_RE.test(decoded) ? decoded : null;
}

function extractGoogleDriveFileId(value: string): string | null {
  const directMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  const directId = sanitizeDriveFileId(directMatch?.[1]);
  if (directId) return directId;

  try {
    const parsed = new URL(value);
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return null;
    return sanitizeDriveFileId(parsed.searchParams.get('id'));
  } catch {
    return null;
  }
}

function withPdfViewerHash(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  const [base, currentHash = ''] = trimmed.split('#', 2);
  const params = new URLSearchParams(currentHash);
  params.set('toolbar', '0');
  params.set('navpanes', '0');
  return `${base}#${params.toString()}`;
}

export function extractPdfStoragePath(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  const proxyPath = extractStoragePathFromProxyUrl(trimmed);
  if (proxyPath) return normalizeStoragePath(proxyPath);

  const supabasePath = extractSupabaseStoragePath(trimmed);
  if (supabasePath) return supabasePath;

  if (isStoragePath(trimmed)) return normalizeStoragePath(trimmed);
  return null;
}

export function isUploadedPdfAssetUrl(value: string | null | undefined): boolean {
  const trimmed = (value || '').trim();
  return !!extractPdfStoragePath(trimmed) || LEGACY_ASSET_RE.test(trimmed);
}

export function getPdfFileName(value: string | null | undefined, fallback = 'file.pdf'): string {
  const trimmed = (value || '').trim();
  const source = extractPdfStoragePath(trimmed) || trimmed;
  if (!source) return fallback;

  try {
    const parsed = new URL(source);
    const name = parsed.pathname.split('/').filter(Boolean).pop();
    return name ? safeDecode(name) : fallback;
  } catch {
    const name = source.split(/[?#]/, 1)[0].split('/').filter(Boolean).pop();
    return name ? safeDecode(name) : fallback;
  }
}

export function resolvePdfFileUrl(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  const storagePath = extractPdfStoragePath(trimmed);
  if (storagePath) return storageUrl(storagePath);
  return trimmed;
}

export function resolvePdfEmbedUrl(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  const driveFileId = extractGoogleDriveFileId(trimmed);
  if (driveFileId) return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`;

  return withPdfViewerHash(resolvePdfFileUrl(trimmed));
}