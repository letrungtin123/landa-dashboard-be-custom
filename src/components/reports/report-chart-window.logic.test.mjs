/* global URL, Buffer */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const logic = await import(`data:text/javascript;base64,${Buffer.from(transpile(read('./report-chart-window.logic.ts'))).toString('base64')}`);

const REQUEST = {
  date_from: '2026-09-20',
  date_to: '2026-10-19',
  metric: 'total_enrollments',
  group_id: undefined,
  group_by_org: true,
  grouped: undefined,
  subgroup_id: undefined,
  team_id: undefined,
  granularity: 'auto',
};

test('window requests carry the same parameters ReportWindowChart always sent', () => {
  // Keys and values of the object literal the chart built before the helper existed.
  const before = { ...REQUEST, mode: 'window', direction: 'initial', anchor_bucket: undefined, limit_buckets: 72, series_limit: 8, granularity: 'auto' };
  assert.deepEqual(logic.reportChartWindowParams(REQUEST, 'initial'), before);
  assert.deepEqual(Object.keys(logic.reportChartWindowParams(REQUEST, 'initial')), Object.keys(before));
  assert.deepEqual(logic.reportChartWindowParams(REQUEST, 'before', '2026-07-01'), { ...before, direction: 'before', anchor_bucket: '2026-07-01' });
  assert.equal(logic.reportChartWindowParams({ ...REQUEST, granularity: undefined }, 'after', 'x').granularity, 'auto');
  assert.equal(logic.reportChartWindowParams({ ...REQUEST, granularity: 'month' }, 'initial').granularity, 'month');
});

const point = (bucket, values) => ({ month: bucket, month_label: bucket, bucket, bucket_label: bucket, ...values });

test('merged windows keep one point per bucket, in bucket order, the newer point winning', () => {
  const merged = logic.mergeReportChartPoints(
    [point('2026-10-02', { A: 1 }), point('2026-10-01', { A: 2 })],
    [point('2026-10-02', { A: 9 }), point('2026-09-30', { A: 3 }), { month: '', month_label: '' }],
  );
  assert.deepEqual(merged.map(item => [item.bucket, item.A]), [['2026-09-30', 3], ['2026-10-01', 2], ['2026-10-02', 9]]);
});

test('series names are every numeric key except the bucket fields', () => {
  const points = [point('2026-10-01', { 'Chi nhánh TP. Hồ Chí Minh': 4, note: 'x' }), point('2026-10-02', { 'Chi nhánh Huế': '2' })];
  assert.deepEqual(logic.resolveReportChartSeriesKeys(points, true), ['Chi nhánh TP. Hồ Chí Minh', 'Chi nhánh Huế']);
  assert.deepEqual(logic.resolveReportChartSeriesKeys([point('2026-10-01', { value: 5 })], false), ['value']);
  assert.deepEqual(logic.resolveReportChartSeriesKeys([point('2026-10-01', {})], false), []);
  assert.equal(logic.reportChartSeriesValue({ a: -3 }, 'a'), 0);
  assert.equal(logic.reportChartSeriesValue({ a: 'abc' }, 'a'), 0);
  assert.equal(logic.sumReportChartPoint({ a: 2, b: '3', c: null }, ['a', 'b', 'c']), 5);
});

test('pages loaded before and after the first window make one chart', () => {
  const page = (buckets, extra = {}) => ({
    year: 2026, metric: 'total_enrollments', is_grouped: true, granularity: 'month',
    date_from: '2019-01-01', date_to: '2026-10-19', data: buckets.map(bucket => point(bucket, { A: 1 })), ...extra,
  });
  const chart = logic.mergeReportChartWindows([
    page(['2019-01-01', '2019-02-01']),
    page(['2019-03-01', '2019-04-01'], { series_overflow: true }),
  ]);
  assert.deepEqual(chart.points.map(item => item.bucket), ['2019-01-01', '2019-02-01', '2019-03-01', '2019-04-01']);
  assert.equal(chart.granularity, 'month');
  assert.deepEqual(chart.range, { dateFrom: '2019-01-01', dateTo: '2026-10-19' });
  assert.equal(chart.isGrouped, true);
  assert.equal(chart.seriesOverflow, true, 'one window with "Khác" is enough');
  assert.equal(chart.loadedFrom, '2019-01-01');
  assert.equal(chart.loadedTo, '2019-04-01');

  const empty = logic.mergeReportChartWindows([]);
  assert.deepEqual(empty.points, []);
  assert.equal(empty.range, null);
  assert.equal(empty.loadedFrom, null);
});
