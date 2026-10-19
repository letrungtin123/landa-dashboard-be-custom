// Branch enrollment chart of the summary report: series ranked by total with
// their share, the rows the chart draws, and the summary figures.
// No runtime imports: tested directly with node:test (report-branch-chart.logic.test.mjs).
import type { ReportChartPoint } from '@/api/custom-reports';

/** Series name the backend gives the branches beyond its limit, added up. */
export const REPORT_CHART_OTHER_KEY = 'Khác';
/** Lines drawn at most: 8 colors plus a gray "Khác". */
export const BRANCH_CHART_MAX_SERIES = 9;
const FOLDED_OTHER_KEY = '__other__';

export interface BranchSeries {
  /** Series name sent by the backend (branch name, "Khác", or "value" for one series). */
  key: string;
  /** Safe chart data key ("s0", "s1"...): branch names may hold dots, which charts read as paths. */
  slot: string;
  total: number;
  /** Share of all enrollments on the chart, in % with one decimal; the shares add up to 100. */
  share: number;
  /** 1-based rank by total ("Khác" is always last). */
  rank: number;
  isOther: boolean;
}

export type BranchChartRow = { bucket: string } & Record<string, number | string>;

export interface BranchChartModel {
  series: BranchSeries[];
  rows: BranchChartRow[];
  grandTotal: number;
  /** Bucket with the most enrollments (first one on a tie), null when nothing was enrolled. */
  peak: { bucket: string; total: number } | null;
  bucketCount: number;
  /** Buckets with at least one enrollment. */
  activeBuckets: number;
}

const bucketIdOf = (point: ReportChartPoint) => String(point.bucket || point.month || '');
const valueOf = (point: ReportChartPoint, key: string) => Math.max(0, Number(point[key]) || 0);

/**
 * Shares in % with `decimals` decimals that add up to exactly 100 (largest
 * remainder), so the legend never reads 99.9% or 100.1% in total.
 */
export function sharePercents(values: readonly number[], decimals = 1): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return values.map(() => 0);
  const scale = 10 ** decimals;
  const units = 100 * scale;
  const exact = values.map(value => (Math.max(0, value) / total) * units);
  const floors = exact.map(Math.floor);
  let left = units - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of order) {
    if (left <= 0) break;
    floors[item.index] += 1;
    left -= 1;
  }
  return floors.map(value => value / scale);
}

/**
 * Ranks the series by total. With more than `maxSeries` series, the smallest
 * ones are added to "Khác" so that at most `maxSeries` lines are drawn.
 * `otherKey` is the backend's "Khác" series when it sent one (series_overflow).
 */
export function buildBranchChart(
  points: readonly ReportChartPoint[],
  seriesKeys: readonly string[],
  { otherKey = null, maxSeries = BRANCH_CHART_MAX_SERIES }: { otherKey?: string | null; maxSeries?: number } = {},
): BranchChartModel {
  const totals = new Map(seriesKeys.map(key => [key, points.reduce((sum, point) => sum + valueOf(point, key), 0)]));
  const named = seriesKeys
    .filter(key => key !== otherKey)
    .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a.localeCompare(b, 'vi'));
  const hasOther = otherKey !== null && seriesKeys.includes(otherKey);
  const fold = named.length + (hasOther ? 1 : 0) > maxSeries;
  const kept = fold ? named.slice(0, Math.max(1, maxSeries - 1)) : named;
  const folded = fold ? named.slice(kept.length) : [];
  const otherParts = [...folded, ...(hasOther && otherKey !== null ? [otherKey] : [])];
  const groups = [
    ...kept.map(key => ({ key, parts: [key], isOther: false })),
    ...(otherParts.length ? [{ key: hasOther && otherKey !== null ? otherKey : FOLDED_OTHER_KEY, parts: otherParts, isOther: true }] : []),
  ];

  const groupTotals = groups.map(group => group.parts.reduce((sum, key) => sum + (totals.get(key) ?? 0), 0));
  const shares = sharePercents(groupTotals);
  const series: BranchSeries[] = groups.map((group, index) => ({
    key: group.key,
    slot: `s${index}`,
    total: groupTotals[index],
    share: shares[index],
    rank: index + 1,
    isOther: group.isOther,
  }));

  let peak: BranchChartModel['peak'] = null;
  let activeBuckets = 0;
  const rows = points.map((point) => {
    const row: BranchChartRow = { bucket: bucketIdOf(point) };
    let bucketTotal = 0;
    groups.forEach((group, index) => {
      const value = group.parts.reduce((sum, key) => sum + valueOf(point, key), 0);
      row[series[index].slot] = value;
      bucketTotal += value;
    });
    if (bucketTotal > 0) activeBuckets += 1;
    if (bucketTotal > 0 && (!peak || bucketTotal > peak.total)) peak = { bucket: row.bucket, total: bucketTotal };
    return row;
  });

  return {
    series,
    rows,
    grandTotal: groupTotals.reduce((sum, value) => sum + value, 0),
    peak,
    bucketCount: points.length,
    activeBuckets,
  };
}

/** Rows of the tooltip at one bucket: shown series with a value, largest first, and their total. */
export function branchTooltipRows(row: BranchChartRow, series: readonly BranchSeries[], hidden: ReadonlySet<string>) {
  const rows = series
    .filter(item => !hidden.has(item.key))
    .map(item => ({ series: item, value: Math.max(0, Number(row[item.slot]) || 0) }));
  return {
    rows: rows.filter(item => item.value > 0).sort((a, b) => b.value - a.value || a.series.rank - b.series.rank),
    total: rows.reduce((sum, item) => sum + item.value, 0),
  };
}
