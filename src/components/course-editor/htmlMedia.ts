import { htmlImageDisplaySrc, htmlImageStoragePath } from '@/utils/storage-url';

export interface HtmlMediaImage {
  src: string;
  alt: string;
  asset_id?: string;
}

export function normalizeHtmlMediaImages(raw: unknown): HtmlMediaImage[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const images: HtmlMediaImage[] = [];

  raw.forEach((item: any) => {
    const src = htmlImageStoragePath(typeof item?.src === 'string' ? item.src : '');
    if (!src || seen.has(src)) return;
    seen.add(src);

    images.push({
      src,
      alt: typeof item?.alt === 'string' ? item.alt : '',
      ...(typeof item?.asset_id === 'string' ? { asset_id: item.asset_id } : {}),
    });
  });

  return images;
}

export function getHtmlMediaImages(metadata: any): HtmlMediaImage[] {
  return normalizeHtmlMediaImages(metadata?.html_media?.images);
}

export function htmlMediaMetadata(metadata: any, images: HtmlMediaImage[]): Record<string, unknown> {
  const { display_name: _displayName, ...rest } = metadata || {};
  const next: Record<string, unknown> = { ...rest };
  const normalizedImages = normalizeHtmlMediaImages(images);

  if (normalizedImages.length > 0) {
    next.html_media = { images: normalizedImages };
  } else {
    delete next.html_media;
  }

  return next;
}

export function htmlMediaCarouselImages(images: HtmlMediaImage[]): { src: string; alt: string }[] {
  return normalizeHtmlMediaImages(images).map((image) => ({
    src: htmlImageDisplaySrc(image.src),
    alt: image.alt || '',
  }));
}
