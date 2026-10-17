// Number, money and date display for the AI points pages. Pure functions:
// vi uses 1.234,5 and dd/MM, en uses 1,234.5 and "Nov 1".
import type { AppLocale } from '@/i18n';

export const EMPTY_VALUE = '—';

/** Platform month: the backend counts AI months in Vietnam time. */
const PLATFORM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function intlLocale(locale: AppLocale): 'vi-VN' | 'en-US' {
  return locale === 'en' ? 'en-US' : 'vi-VN';
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** AI points: at most one decimal (vi 1.234,5 · en 1,234.5). */
export function formatPoints(value: number | null | undefined, locale: AppLocale): string {
  if (!finite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value);
}

/** Whole counts (number of uses, tenants). */
export function formatCount(value: number | null | undefined, locale: AppLocale): string {
  if (!finite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
}

/** Short axis ticks: 1,2 N / 1.2K. */
export function formatCompact(value: number | null | undefined, locale: AppLocale): string {
  if (!finite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Chart axis ticks: whole numbers up to 9.999, short form above (12 N / 12K). */
export function formatAxisTick(value: number | null | undefined, locale: AppLocale): string {
  if (!finite(value)) return EMPTY_VALUE;
  return Math.abs(value) < 10_000 ? formatCount(value, locale) : formatCompact(value, locale);
}

/** A value that is already a percentage (82.5 -> "82,5%"). */
export function formatPercent(value: number | null | undefined, locale: AppLocale, maximumFractionDigits = 1): string {
  if (!finite(value)) return EMPTY_VALUE;
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits }).format(value)}%`;
}

/** Signed percentage for differences ("+3,2%" / "−1,5%"). */
export function formatSignedPercent(value: number | null | undefined, locale: AppLocale): string {
  if (!finite(value)) return EMPTY_VALUE;
  const text = formatPercent(Math.abs(value), locale);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/** Superadmin only. */
export function formatVnd(value: number | null | undefined, locale: AppLocale): string {
  if (!finite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

/** Superadmin only. Small amounts (a point's value) keep three significant digits. */
export function formatUsd(value: number | null | undefined, locale: AppLocale): string {
  if (!finite(value)) return EMPTY_VALUE;
  const small = value !== 0 && Math.abs(value) < 1;
  return new Intl.NumberFormat(intlLocale(locale), small
    ? { style: 'currency', currency: 'USD', minimumSignificantDigits: 2, maximumSignificantDigits: 3 }
    : { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function localDate(iso: string): Date | null {
  const match = DATE.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

/** "2026-10" -> "Tháng 10 năm 2026" / "October 2026". */
export function formatMonthLabel(month: string, locale: AppLocale): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return capitalize(new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric' }).format(date));
}

/** Month inside a sentence: "2026-10" -> "10/2026" / "October 2026". */
export function formatMonthShort(month: string, locale: AppLocale): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  if (locale === 'en') return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  return `${Number(match[2])}/${match[1]}`;
}

/** "2026-11-01" -> "01/11" / "Nov 1". */
export function formatShortDate(iso: string, locale: AppLocale): string {
  const date = localDate(iso);
  if (!date) return iso;
  if (locale === 'en') return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Chart axis day: "5/10" / "Oct 5". */
export function formatDayTick(iso: string, locale: AppLocale): string {
  const date = localDate(iso);
  if (!date) return iso;
  if (locale === 'en') return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

/** Full date: "05/10/2026" / "Oct 5, 2026". Accepts a date or an ISO timestamp. */
export function formatFullDate(value: string, locale: AppLocale): string {
  const date = DATE.test(value) && value.length === 10 ? localDate(value) : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), locale === 'en'
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** The platform month of a moment ("2026-10"). */
export function platformMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = parts.find(part => part.type === 'year')?.value ?? String(now.getFullYear());
  const month = parts.find(part => part.type === 'month')?.value ?? String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** The platform day of a moment ("2026-10-17"). */
export function platformDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Adds whole months to "YYYY-MM". */
export function shiftMonth(month: string, delta: number): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Distinct "YYYY-MM" values, newest first (month pickers). */
export function mergeMonths(...lists: ReadonlyArray<readonly string[]>): string[] {
  return [...new Set(lists.flat().filter(month => MONTH.test(month)))].sort().reverse();
}

/** Every day of a month as YYYY-MM-DD. */
export function daysOfMonth(month: string): string[] {
  const match = MONTH.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const last = new Date(year, monthIndex, 0).getDate();
  return Array.from({ length: last }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

/**
 * Reads a number typed by a person. vi: "26.150,5" or "26150,5"; en:
 * "26,150.5". A lone "." in vi is a decimal point unless it groups
 * thousands ("26.150"). Returns null when the text is not a number.
 */
export function parseLocaleNumber(text: string, locale: AppLocale): number | null {
  let value = text.replace(/[\s\u00a0\u202f]/g, '');
  if (!value) return null;
  if (locale === 'en') {
    value = value.replace(/,/g, '');
  } else if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Whole number typed by a person (grouping separators allowed), or null. */
export function parseLocaleInteger(text: string, locale: AppLocale): number | null {
  const parsed = parseLocaleNumber(text, locale);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

/** Plain digits for an input field from a stored decimal string ("500000.00" -> "500000"). */
export function decimalInputValue(value: string | number | null | undefined, locale: AppLocale): string {
  const parsed = typeof value === 'number' ? value : Number(value ?? '');
  if (!Number.isFinite(parsed)) return '';
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 4, useGrouping: false }).format(parsed);
}
