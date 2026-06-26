import { storageUrl } from '@/utils/storage-url';

export interface ProblemMediaImage {
  src: string;
  alt: string;
}

export interface ProblemMedia {
  youtube_id?: string;
  youtube_url?: string;
  video_storage_path?: string;
  images: ProblemMediaImage[];
}

export function extractYoutubeId(input: string | null | undefined): string {
  const value = (input || '').trim();
  if (!value) return '';

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  return '';
}

export function toYoutubeUrl(youtubeId: string): string {
  return youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : '';
}

export function normalizeProblemMedia(raw: any): ProblemMedia {
  const images = Array.isArray(raw?.images)
    ? raw.images
        .map((img: any) => ({
          src: typeof img?.src === 'string' ? img.src.trim() : '',
          alt: typeof img?.alt === 'string' ? img.alt : '',
        }))
        .filter((img: ProblemMediaImage) => img.src)
    : [];

  const youtubeId = extractYoutubeId(raw?.youtube_id || raw?.youtube_url || raw?.video_url || '');
  const videoStoragePath = typeof raw?.video_storage_path === 'string' && raw.video_storage_path.trim()
    ? raw.video_storage_path.trim()
    : undefined;

  return {
    ...(youtubeId ? { youtube_id: youtubeId, youtube_url: toYoutubeUrl(youtubeId) } : {}),
    ...(videoStoragePath ? { video_storage_path: videoStoragePath } : {}),
    images,
  };
}

export function hasProblemMedia(media: ProblemMedia | null | undefined): boolean {
  return !!(media?.youtube_id || media?.video_storage_path || media?.images?.length);
}

export function problemMediaForSave(raw: any): ProblemMedia | undefined {
  const media = normalizeProblemMedia(raw);
  return hasProblemMedia(media) ? media : undefined;
}

export function resolveProblemMediaImageUrl(src: string): string {
  return storageUrl(src) || src;
}
