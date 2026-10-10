// How a Reports chart bucket (one day, one ISO week or one calendar month) is
// written on the axis and in the tooltip. The backend decides the bucket size
// (shared rule: up to 31 days by day, up to 120 days by week, longer by month)
// and returns it with the series; this module only formats it, the same way
// as the AI report PDF.
// No runtime imports: tested directly with node:test (report-chart-buckets.logic.test.mjs).

export type ReportChartBucketSize = 'day' | 'week' | 'month';
export type ReportChartLocale = 'vi' | 'en';
export interface ReportChartRange { dateFrom: string; dateTo: string }

export interface ReportChartBucketView {
  size: ReportChartBucketSize;
  /** Short x-axis label: the day, the week's first day inside the range, or the month. */
  tick: string;
  /** Tooltip dates: the day, the week's days inside the range, or the month. */
  label: string;
  /** Days of the bucket inside the range and the bucket's full length (7 for a week). */
  coveredDays: number;
  bucketDays: number;
  /** A week or month cut by the first or last day of the range. */
  partial: boolean;
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY_MS = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const match = YMD.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { year, month, day } : null;
}

const pad2 = (value: number) => String(value).padStart(2, '0');

function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** vi "01/07/2026", en "1 Jul 2026". */
export function formatReportChartDate(value: string, locale: ReportChartLocale): string {
  const parts = parseYmd(value);
  if (!parts) return value;
  return locale === 'en'
    ? `${parts.day} ${EN_MONTHS[parts.month - 1]} ${parts.year}`
    : `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

function formatShortDate(value: string, locale: ReportChartLocale): string {
  const parts = parseYmd(value);
  if (!parts) return value;
  return locale === 'en' ? `${parts.day} ${EN_MONTHS[parts.month - 1]}` : `${pad2(parts.day)}/${pad2(parts.month)}`;
}

/** vi "15/06–21/06/2026", "29/12/2025–04/01/2026"; en "15–21 Jun 2026", "29 Jun–5 Jul 2026". */
export function formatReportChartDayRange(from: string, to: string, locale: ReportChartLocale): string {
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end) return `${from}–${to}`;
  if (from === to) return formatReportChartDate(from, locale);
  const sameYear = start.year === end.year;
  const first = sameYear ? formatShortDate(from, locale) : formatReportChartDate(from, locale);
  if (locale === 'en' && sameYear && start.month === end.month) return `${start.day}–${formatReportChartDate(to, locale)}`;
  return `${first}–${formatReportChartDate(to, locale)}`;
}

/**
 * Formats one bucket of a Reports chart. Returns null when the bucket or its
 * size is unknown (older year charts send "T1".."T12"); the caller then keeps
 * the label sent by the server.
 */
export function describeReportChartBucket(
  bucket: string,
  size: string | undefined,
  range: ReportChartRange | null,
  locale: ReportChartLocale,
): ReportChartBucketView | null {
  const parts = parseYmd(bucket);
  if (!parts || (size !== 'day' && size !== 'week' && size !== 'month')) return null;
  const startMs = Date.UTC(parts.year, parts.month - 1, parts.day);
  const end = size === 'day' ? bucket : size === 'week' ? toYmd(startMs + 6 * DAY_MS) : toYmd(Date.UTC(parts.year, parts.month, 0));
  const from = range && range.dateFrom > bucket ? range.dateFrom : bucket;
  const to = range && range.dateTo < end ? range.dateTo : end;
  const bucketDays = dayCount(bucket, end);
  const coveredDays = to >= from ? dayCount(from, to) : 0;
  const spansYears = range ? range.dateFrom.slice(0, 4) !== range.dateTo.slice(0, 4) : false;
  const tick = size === 'month'
    ? (locale === 'en' ? `${EN_MONTHS[parts.month - 1]} ${parts.year}` : `T${parts.month}/${parts.year}`)
    : spansYears ? formatReportChartDate(from, locale) : formatShortDate(from, locale);
  const label = size === 'month'
    ? (locale === 'en' ? `${EN_MONTHS[parts.month - 1]} ${parts.year}` : `${pad2(parts.month)}/${parts.year}`)
    : size === 'week' ? formatReportChartDayRange(from, to, locale) : formatReportChartDate(bucket, locale);
  return { size, tick, label, coveredDays, bucketDays, partial: size !== 'day' && coveredDays < bucketDays };
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** i18n key of "what one point is" (Theo ngày / Theo tuần / Theo tháng), or null for an unknown size. */
export function reportChartBucketSizeKey(size: string | undefined): string | null {
  if (size === 'day') return 'reportChart.byDay';
  if (size === 'week') return 'reportChart.byWeek';
  if (size === 'month') return 'reportChart.byMonth';
  return null;
}

/** Tooltip title: vi "15/07/2026", "Tuần 13/07–19/07/2026", "Tháng 07/2026"; en "15 Jul 2026", "Week of 13–19 Jul 2026", "Jul 2026". */
export function formatReportChartBucketTitle(view: ReportChartBucketView, t: Translate): string {
  if (view.size === 'week') return t('reportChart.bucketWeek', { date: view.label });
  if (view.size === 'month') return t('reportChart.bucketMonth', { date: view.label });
  return view.label;
}

/** Tooltip note for a week or month cut by the range ("Tuần không trọn: 5/7 ngày ..."), else null. */
export function formatReportChartPartialNote(view: ReportChartBucketView, t: Translate): string | null {
  if (!view.partial) return null;
  return t(view.size === 'month' ? 'reportChart.partialMonth' : 'reportChart.partialWeek', { days: view.coveredDays, length: view.bucketDays });
}
