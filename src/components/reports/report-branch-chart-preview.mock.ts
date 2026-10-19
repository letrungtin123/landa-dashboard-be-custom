// Mock "GET /api/reports/chart" for the development preview of the branch
// enrollment chart (pages/dev-report-branch-chart-preview.tsx). Deterministic
// numbers, Vietnamese branch names, the same response shape as the backend
// window mode: top 8 branches plus "Khác" when there are more.
import type { getReportChart, ReportChartPoint, ReportChartResponse } from '@/api/custom-reports';

type ReportChartParams = Parameters<typeof getReportChart>[0];

export const REPORT_BRANCH_PREVIEW_SCENARIOS = ['branches', 'few', 'many', 'weeks', 'single', 'empty', 'loading', 'error'] as const;
export type ReportBranchPreviewScenario = typeof REPORT_BRANCH_PREVIEW_SCENARIOS[number];

/** 30 days by day; the "weeks" scenario covers 120 days, drawn by week. */
export function reportBranchPreviewRange(scenario: ReportBranchPreviewScenario): { from: string; to: string } {
  return scenario === 'weeks' ? { from: '2026-06-22', to: '2026-10-19' } : { from: '2026-09-20', to: '2026-10-19' };
}

const BRANCHES: Array<[name: string, perDay: number]> = [
  ['Chi nhánh Hà Nội', 42],
  ['Chi nhánh TP. Hồ Chí Minh', 37],
  ['Chi nhánh Đà Nẵng', 24],
  ['Chi nhánh Hải Phòng', 18],
  ['Chi nhánh Cần Thơ', 15],
  ['Chi nhánh Nha Trang', 12],
  ['Chi nhánh Biên Hòa', 9],
  ['Chi nhánh Huế', 7],
  ['Chi nhánh Vũng Tàu', 5],
  ['Chi nhánh Quy Nhơn', 4],
  ['Chi nhánh Đà Lạt', 3],
  ['Chi nhánh Buôn Ma Thuột', 2],
];
const SERIES_LIMIT = 8;
const OTHER = 'Khác';
const DAY_MS = 86_400_000;

function branchCount(scenario: ReportBranchPreviewScenario): number {
  if (scenario === 'few') return 4;
  if (scenario === 'many') return 12;
  return 7;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const toMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const toYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Enrollments of each branch on each day of the range. */
function dailyValues(scenario: ReportBranchPreviewScenario, from: string, to: string) {
  const random = mulberry32(20261019);
  const branches = BRANCHES.slice(0, branchCount(scenario));
  const days: string[] = [];
  for (let ms = toMs(from); ms <= toMs(to); ms += DAY_MS) days.push(toYmd(ms));
  const values = branches.map(([, perDay], branchIndex) => days.map((day, dayIndex) => {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.42 : 1;
    const trend = 0.8 + (dayIndex / Math.max(1, days.length - 1)) * 0.45;
    const campaign = branchIndex === 2 && dayIndex % 11 === 6 ? 2.1 : 1;
    const noise = 0.65 + random() * 0.7;
    return Math.max(0, Math.round(perDay * weekend * trend * campaign * noise - (perDay < 6 ? random() * 3 : 0)));
  }));
  return { branches: branches.map(([name]) => name), days, values };
}

function isoWeekStart(ymd: string): string {
  const ms = toMs(ymd);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7;
  return toYmd(ms - weekday * DAY_MS);
}

function resolveGranularity(params: ReportChartParams): 'day' | 'week' | 'month' {
  if (params.granularity && params.granularity !== 'auto') return params.granularity;
  const days = Math.round((toMs(String(params.date_to)) - toMs(String(params.date_from))) / DAY_MS) + 1;
  if (days <= 31) return 'day';
  return days <= 120 ? 'week' : 'month';
}

/** The response the backend would send for this request and scenario. */
export function buildReportBranchPreviewChart(scenario: ReportBranchPreviewScenario, params: ReportChartParams): ReportChartResponse {
  const from = String(params.date_from);
  const to = String(params.date_to);
  const granularity = resolveGranularity(params);
  const grouped = params.grouped !== false && (params.group_by_org || !!params.group_id || !!params.subgroup_id);
  const daily = scenario === 'empty'
    ? { branches: BRANCHES.slice(0, 4).map(([name]) => name), days: [] as string[], values: [] as number[][] }
    : dailyValues(scenario, from, to);

  const totals = daily.values.map(row => row.reduce((sum, value) => sum + value, 0));
  const ranked = daily.branches.map((name, index) => ({ name, index, total: totals[index] })).sort((a, b) => b.total - a.total);
  const overflow = ranked.length > SERIES_LIMIT;
  const kept = new Set(ranked.slice(0, overflow ? SERIES_LIMIT : ranked.length).map(item => item.index));

  const buckets = new Map<string, ReportChartPoint>();
  daily.days.forEach((day, dayIndex) => {
    const bucket = granularity === 'day' ? day : granularity === 'week' ? isoWeekStart(day) : `${day.slice(0, 7)}-01`;
    const point = buckets.get(bucket) ?? { month: bucket, month_label: bucket, bucket, bucket_label: bucket };
    if (!grouped || scenario === 'single') {
      point.value = Number(point.value ?? 0) + daily.values.reduce((sum, row) => sum + row[dayIndex], 0);
    } else {
      daily.branches.forEach((name, branchIndex) => {
        const key = kept.has(branchIndex) ? name : OTHER;
        point[key] = Number(point[key] ?? 0) + daily.values[branchIndex][dayIndex];
      });
    }
    buckets.set(bucket, point);
  });
  const data = [...buckets.values()];

  return {
    year: Number(to.slice(0, 4)),
    metric: params.metric,
    is_grouped: grouped && scenario !== 'single',
    granularity,
    date_from: from,
    date_to: to,
    bucket_count: data.length,
    window: {
      mode: 'window',
      range_start: from,
      range_end: to,
      window_start: data[0]?.bucket ?? from,
      window_end: data[data.length - 1]?.bucket ?? to,
      has_before: false,
      has_after: false,
      next_before: null,
      next_after: null,
      limit_buckets: Number(params.limit_buckets ?? 72),
    },
    series_limit: grouped ? SERIES_LIMIT : undefined,
    series_overflow: grouped && overflow && scenario !== 'single',
    data,
  };
}

/** Total enrollments of the range, as the summary card would show it. */
export function reportBranchPreviewTotal(scenario: ReportBranchPreviewScenario): number {
  if (scenario === 'empty' || scenario === 'loading' || scenario === 'error') return 0;
  const range = reportBranchPreviewRange(scenario);
  return dailyValues(scenario, range.from, range.to).values.flat().reduce((sum, value) => sum + value, 0);
}

/** A stand-in for getReportChart: answers after a short wait, never (loading) or with an error. */
export function createReportChartPreviewFetcher(scenario: ReportBranchPreviewScenario): typeof getReportChart {
  return (params) => {
    if (scenario === 'loading') return new Promise<ReportChartResponse>(() => undefined);
    return new Promise<ReportChartResponse>((resolve, reject) => {
      window.setTimeout(() => {
        if (scenario === 'error') reject(new Error('Preview: the chart could not be loaded'));
        else resolve(buildReportBranchPreviewChart(scenario, params));
      }, 350);
    });
  };
}
