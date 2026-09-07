import { toIntlLocale, type AppLocale } from "@/i18n";
import { useLocaleStore } from "@/utils/locale-store";

export function formatLocaleDate(
  value: Date | number | string,
  locale: AppLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(toIntlLocale(locale), options).format(date);
}

export function formatLocaleNumber(
  value: number,
  locale: AppLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

/** Reactive UI helper for date and number display. */
export function useIntlLocale(): "vi-VN" | "en-US" {
  const locale = useLocaleStore((state) => state.locale);
  return toIntlLocale(locale);
}
