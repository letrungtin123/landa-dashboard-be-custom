// Window mode of "GET /api/reports/chart": the request a Reports chart sends
// and how the windows it loads are merged into one series. Shared by
// ReportWindowChart (metric trend modal) and the branch enrollment chart, so
// both send exactly the same requests.
// No runtime imports: tested directly with node:test (report-chart-window.logic.test.mjs).
import type {
  getReportChart,
  ReportChartGranularity,
  ReportChartPoint,
  ReportChartResponse,
  ReportChartWindowDirection,
} from '@/api/custom-reports';
import type { ReportChartRange } from './report-chart-buckets.logic';

export type ReportChartRequest = Parameters<typeof getReportChart>[0];

/** Buckets asked per window, and series kept before the backend adds the rest up as "Khác". */
export const REPORT_CHART_WINDOW_LIMIT_BUCKETS = 72;
export const REPORT_CHART_SERIES_LIMIT = 8;

const META_KEYS = new Set(['month', 'month_label', 'bucket', 'bucket_label']);

/** Parameters of one window request: the first one, or the one before / after a known bucket. */
export function reportChartWindowParams(
  request: ReportChartRequest,
  direction: ReportChartWindowDirection,
  anchorBucket?: string,
): ReportChartRequest {
  return {
    ...request,
    mode: 'window',
    direction,
    anchor_bucket: anchorBucket,
    limit_buckets: REPORT_CHART_WINDOW_LIMIT_BUCKETS,
    series_limit: REPORT_CHART_SERIES_LIMIT,
    granularity: request.granularity || 'auto',
  };
}

export function reportChartBucketId(point: ReportChartPoint): string {
  return String(point.bucket || point.month || '');
}

/** Points of both lists, one per bucket (the incoming one wins), in bucket order. */
export function mergeReportChartPoints(existing: readonly ReportChartPoint[], incoming: readonly ReportChartPoint[]): ReportChartPoint[] {
  const points = new Map<string, ReportChartPoint>();
  for (const point of [...existing, ...incoming]) {
    const id = reportChartBucketId(point);
    if (id) points.set(id, point);
  }
  return [...points.values()].sort((a, b) => reportChartBucketId(a).localeCompare(reportChartBucketId(b)));
}

/** Series names of a grouped chart (every numeric key that is not bucket metadata), or ['value']. */
export function resolveReportChartSeriesKeys(points: readonly ReportChartPoint[], grouped: boolean): string[] {
  if (!grouped) return points.some(point => typeof point.value === 'number') ? ['value'] : [];
  const keys = new Set<string>();
  for (const point of points) {
    Object.keys(point).forEach((key) => {
      if (!META_KEYS.has(key) && Number.isFinite(Number(point[key]))) keys.add(key);
    });
  }
  return [...keys];
}

/** A series value of a point; missing, negative or non-numeric values count as 0. */
export function reportChartSeriesValue(point: ReportChartPoint, key: string): number {
  return Math.max(0, Number(point[key]) || 0);
}

export function sumReportChartPoint(point: ReportChartPoint, keys: readonly string[]): number {
  return keys.reduce((sum, key) => sum + reportChartSeriesValue(point, key), 0);
}

export interface MergedReportChartWindows {
  points: ReportChartPoint[];
  granularity: Exclude<ReportChartGranularity, 'auto'> | undefined;
  range: ReportChartRange | null;
  isGrouped: boolean;
  /** The backend added branches beyond the limit up as "Khác". */
  seriesOverflow: boolean;
  /** First and last bucket loaded, and whether the selected range goes on before / after them. */
  loadedFrom: string | null;
  loadedTo: string | null;
}

/** All loaded windows (earliest first, as useInfiniteQuery keeps them) as one chart. */
export function mergeReportChartWindows(pages: readonly ReportChartResponse[]): MergedReportChartWindows {
  const points = pages.reduce<ReportChartPoint[]>((merged, page) => mergeReportChartPoints(merged, page.data || []), []);
  const first = pages[0];
  const withRange = pages.find(page => page.date_from && page.date_to);
  return {
    points,
    granularity: pages.find(page => page.granularity)?.granularity,
    range: withRange ? { dateFrom: String(withRange.date_from), dateTo: String(withRange.date_to) } : null,
    isGrouped: !!first?.is_grouped,
    seriesOverflow: pages.some(page => !!page.series_overflow),
    loadedFrom: points.length ? reportChartBucketId(points[0]) : null,
    loadedTo: points.length ? reportChartBucketId(points[points.length - 1]) : null,
  };
}
