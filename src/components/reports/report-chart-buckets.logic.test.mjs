/* global URL, Buffer */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const toUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const logic = await import(toUrl(transpile(read('./report-chart-buckets.logic.ts'))));
const viUrl = toUrl(transpile(read('../../i18n/locales/vi.ts')));
const { vi } = await import(viUrl);
const { en } = await import(toUrl(transpile(read('../../i18n/locales/en.ts')).replace(/from\s+["']\.\/vi["']/, `from "${viUrl}"`)));

function translator(dictionary) {
  return (key, params = {}) => {
    const value = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary);
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(params[name] ?? ''));
  };
}

/**
 * What the Reports chart shows for a series: the axis ticks, the tooltip
 * titles and partial-bucket notes, and the "what one point is" badge, built
 * by the same helpers ReportWindowChart uses.
 */
function renderChart(points, response, dictionary, locale) {
  const t = translator(dictionary);
  const range = { dateFrom: response.date_from, dateTo: response.date_to };
  const views = points.map((point) => logic.describeReportChartBucket(point.bucket, response.granularity, range, locale));
  return {
    badge: `${t('reportChart.selectedPeriod')} · ${t(logic.reportChartBucketSizeKey(response.granularity))}`,
    ticks: views.map((view) => view.tick),
    titles: views.map((view) => logic.formatReportChartBucketTitle(view, t)),
    notes: views.map((view) => logic.formatReportChartPartialNote(view, t)),
    partial: views.map((view) => view.partial),
  };
}

// What GET /api/reports/chart returns for 17/06–31/07/2026 (45 days): ISO weeks starting on Monday.
const FORTY_FIVE_DAYS = { granularity: 'week', date_from: '2026-06-17', date_to: '2026-07-31' };
const WEEK_POINTS = ['2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']
  .map((bucket, index) => ({ bucket, bucket_label: `Tuần ${25 + index}/2026`, value: index }));

test('a 45-day Reports chart is drawn by week in Vietnamese', () => {
  const chart = renderChart(WEEK_POINTS, FORTY_FIVE_DAYS, vi, 'vi');
  assert.equal(chart.badge, 'Trong khoảng đã chọn · Theo tuần');
  // Each tick is the week's first day inside the period, so the first one is 17/06, not Monday 15/06.
  assert.deepEqual(chart.ticks, ['17/06', '22/06', '29/06', '06/07', '13/07', '20/07', '27/07']);
  assert.deepEqual(chart.titles, [
    'Tuần 17/06–21/06/2026',
    'Tuần 22/06–28/06/2026',
    'Tuần 29/06–05/07/2026',
    'Tuần 06/07–12/07/2026',
    'Tuần 13/07–19/07/2026',
    'Tuần 20/07–26/07/2026',
    'Tuần 27/07–31/07/2026',
  ]);
  assert.deepEqual(chart.partial, [true, false, false, false, false, false, true]);
  assert.equal(chart.notes[0], 'Tuần không trọn: 5/7 ngày nằm trong khoảng đã chọn');
  assert.equal(chart.notes[1], null);
  assert.equal(chart.notes[6], 'Tuần không trọn: 5/7 ngày nằm trong khoảng đã chọn');
  // The ISO week number sent by the server ("Tuần 25/2026") is no longer shown.
  assert.ok(chart.titles.every((title) => !/Tuần \d+\/2026$/.test(title)));
});

test('a 45-day Reports chart is drawn by week in English', () => {
  const chart = renderChart(WEEK_POINTS, FORTY_FIVE_DAYS, en, 'en');
  assert.equal(chart.badge, 'Selected period · By week');
  assert.deepEqual(chart.ticks, ['17 Jun', '22 Jun', '29 Jun', '6 Jul', '13 Jul', '20 Jul', '27 Jul']);
  assert.equal(chart.titles[0], 'Week of 17–21 Jun 2026');
  assert.equal(chart.titles[2], 'Week of 29 Jun–5 Jul 2026');
  assert.equal(chart.titles[6], 'Week of 27–31 Jul 2026');
  assert.equal(chart.notes[0], 'Partial week: 5 of 7 days are in the selected period');
  assert.ok(chart.titles.every((title) => !/Tuần|Tháng/.test(title)), 'no Vietnamese words in English');
});

test('weeks across the new year carry the year on the axis and in the tooltip', () => {
  const response = { granularity: 'week', date_from: '2025-12-10', date_to: '2026-02-10' };
  const points = [{ bucket: '2025-12-08' }, { bucket: '2025-12-29' }, { bucket: '2026-02-09' }];
  const viChart = renderChart(points, response, vi, 'vi');
  assert.deepEqual(viChart.ticks, ['10/12/2025', '29/12/2025', '09/02/2026']);
  assert.deepEqual(viChart.titles, ['Tuần 10/12–14/12/2025', 'Tuần 29/12/2025–04/01/2026', 'Tuần 09/02–10/02/2026']);
  assert.deepEqual(viChart.partial, [true, false, true]);
  assert.equal(viChart.notes[2], 'Tuần không trọn: 2/7 ngày nằm trong khoảng đã chọn');
  const enChart = renderChart(points, response, en, 'en');
  assert.deepEqual(enChart.ticks, ['10 Dec 2025', '29 Dec 2025', '9 Feb 2026']);
  assert.equal(enChart.titles[1], 'Week of 29 Dec 2025–4 Jan 2026');
});

test('day buckets are single dates and never partial', () => {
  const response = { granularity: 'day', date_from: '2026-07-01', date_to: '2026-07-31' };
  const points = [{ bucket: '2026-07-01' }, { bucket: '2026-07-15' }];
  const viChart = renderChart(points, response, vi, 'vi');
  assert.equal(viChart.badge, 'Trong khoảng đã chọn · Theo ngày');
  assert.deepEqual(viChart.ticks, ['01/07', '15/07']);
  assert.deepEqual(viChart.titles, ['01/07/2026', '15/07/2026']);
  assert.deepEqual(viChart.notes, [null, null]);
  const enChart = renderChart(points, response, en, 'en');
  assert.deepEqual(enChart.ticks, ['1 Jul', '15 Jul']);
  assert.deepEqual(enChart.titles, ['1 Jul 2026', '15 Jul 2026']);
});

test('month buckets name the month and explain a cut first or last month', () => {
  const response = { granularity: 'month', date_from: '2026-01-15', date_to: '2026-09-30' };
  const points = [{ bucket: '2026-01-01' }, { bucket: '2026-02-01' }, { bucket: '2026-09-01' }];
  const viChart = renderChart(points, response, vi, 'vi');
  assert.equal(viChart.badge, 'Trong khoảng đã chọn · Theo tháng');
  assert.deepEqual(viChart.ticks, ['T1/2026', 'T2/2026', 'T9/2026']);
  assert.deepEqual(viChart.titles, ['Tháng 01/2026', 'Tháng 02/2026', 'Tháng 09/2026']);
  assert.deepEqual(viChart.partial, [true, false, false]);
  assert.equal(viChart.notes[0], 'Tháng không trọn: 17/31 ngày nằm trong khoảng đã chọn');
  const enChart = renderChart(points, response, en, 'en');
  assert.deepEqual(enChart.ticks, ['Jan 2026', 'Feb 2026', 'Sep 2026']);
  assert.deepEqual(enChart.titles, ['Jan 2026', 'Feb 2026', 'Sep 2026']);
  assert.equal(enChart.notes[0], 'Partial month: 17 of 31 days are in the selected period');
});

test('older year charts and unknown sizes keep the server label', () => {
  assert.equal(logic.describeReportChartBucket('T1', 'month', null, 'vi'), null);
  assert.equal(logic.describeReportChartBucket('2026-07-01', undefined, null, 'vi'), null);
  assert.equal(logic.describeReportChartBucket('2026-07-01', 'auto', null, 'vi'), null);
  assert.equal(logic.reportChartBucketSizeKey('auto'), null);
  const noRange = logic.describeReportChartBucket('2026-07-06', 'week', null, 'vi');
  assert.equal(noRange.label, '06/07–12/07/2026');
  assert.equal(noRange.partial, false);
});

test('every chart text has Vietnamese and English wording', () => {
  for (const key of ['byDay', 'byWeek', 'byMonth', 'bucketWeek', 'bucketMonth', 'partialWeek', 'partialMonth']) {
    assert.equal(typeof vi.reportChart[key], 'string', `vi ${key}`);
    assert.equal(typeof en.reportChart[key], 'string', `en ${key}`);
  }
  assert.deepEqual(Object.keys(en.reportChart).sort(), Object.keys(vi.reportChart).sort());
});

test('the Reports chart draws its axis and tooltip with these helpers', () => {
  const chart = read('./ReportWindowChart.tsx');
  assert.match(chart, /describeReportChartBucket\(getBucketId\(point\), granularity, chartRange, locale\)/);
  assert.match(chart, /setChartRange\(response\.date_from && response\.date_to/);
  assert.match(chart, /ctx\.fillText\(visibleBuckets\[index\]\?\.tick \?\? getBucketId\(point\)/);
  assert.match(chart, /formatReportChartBucketTitle\(tooltipBucket, translate\)/);
  assert.match(chart, /formatReportChartPartialNote\(tooltipBucket, translate\)/);
  assert.doesNotMatch(chart, /Tuần|Tháng|Week of/, 'no hard-coded bucket words in the component');
  // Both Reports screen charts ask for the automatic buckets of the backend.
  assert.match(read('../../pages/report-summary.tsx'), /granularity: 'auto' as const/);
  assert.match(read('./report-metric-trend-modal.tsx'), /granularity: 'auto' as const/);
});
