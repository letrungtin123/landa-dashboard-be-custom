export type LessonAuthorContentLocale = 'vi' | 'en';

export function getLessonAuthorContentLocale(value: unknown): LessonAuthorContentLocale | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.startsWith('en_')) return 'en';
  if (normalized === 'vi' || normalized.startsWith('vi-') || normalized.startsWith('vi_')) return 'vi';
  return undefined;
}

export function resolveLessonAuthorContentLocale(
  value: unknown,
  fallbackLanguage: string | undefined,
): LessonAuthorContentLocale {
  return getLessonAuthorContentLocale(value)
    ?? getLessonAuthorContentLocale(fallbackLanguage)
    ?? 'vi';
}
