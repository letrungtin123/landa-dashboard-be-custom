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

/**
 * Formats a byte counter without converting the source value to Number.  Quota
 * counters use PostgreSQL bigint, which can exceed JavaScript's safe integer
 * range.  Display rounding is deliberately isolated from quota arithmetic.
 */
export function formatStorageBytes(value: string | null | undefined, locale: AppLocale): string {
  let bytes: bigint;
  try {
    bytes = value === null || value === undefined ? 0n : BigInt(value);
  } catch {
    return "—";
  }

  if (bytes < 0n) return "—";

  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  const base = 1024n;
  let unitIndex = 0;
  let divisor = 1n;
  while (unitIndex < units.length - 1 && bytes >= divisor * base) {
    divisor *= base;
    unitIndex += 1;
  }

  const hundredths = (bytes * 100n + divisor / 2n) / divisor;
  const whole = hundredths / 100n;
  const fraction = hundredths % 100n;
  const integer = new Intl.NumberFormat(toIntlLocale(locale)).format(whole);
  if (unitIndex === 0 || fraction === 0n) return `${integer} ${units[unitIndex]}`;

  const decimal = new Intl.NumberFormat(toIntlLocale(locale))
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ".";
  return `${integer}${decimal}${fraction.toString().padStart(2, "0")} ${units[unitIndex]}`;
}

/**
 * Quota tenant is intentionally presented in one business unit only. Keep the
 * underlying bigint in bytes for exact quota arithmetic, but never switch this
 * UI between MB/GB/TB based on the value.
 */
export function formatQuotaGigabytes(value: string | null | undefined, locale: AppLocale): string {
  let bytes: bigint;
  try {
    bytes = value === null || value === undefined ? 0n : BigInt(value);
  } catch {
    return "—";
  }

  if (bytes < 0n) return "—";

  // Product limits are sold and displayed in decimal GB: 1 GB = 1,000,000,000
  // bytes. Keep the calculation in bigint so the displayed value never alters
  // the byte-precise quota guard in PostgreSQL.
  const gigabyte = 1_000_000_000n;
  const scale = 100n;
  const hundredths = (bytes * scale + gigabyte / 2n) / gigabyte;
  if (bytes > 0n && hundredths === 0n) return `< 0.01 GB`;

  const whole = hundredths / scale;
  const fraction = hundredths % scale;
  const integer = new Intl.NumberFormat(toIntlLocale(locale)).format(whole);
  if (fraction === 0n) return `${integer} GB`;

  const decimal = new Intl.NumberFormat(toIntlLocale(locale))
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ".";
  return `${integer}${decimal}${fraction.toString().padStart(2, "0")} GB`;
}

/** Reactive UI helper for date and number display. */
export function useIntlLocale(): "vi-VN" | "en-US" {
  const locale = useLocaleStore((state) => state.locale);
  return toIntlLocale(locale);
}
