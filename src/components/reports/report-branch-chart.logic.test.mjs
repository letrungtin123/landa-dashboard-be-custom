/* global URL, Buffer */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const toUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const logic = await import(toUrl(transpile(read('./report-branch-chart.logic.ts'))));
const viUrl = toUrl(transpile(read('../../i18n/locales/vi.ts')));
const { vi } = await import(viUrl);
const { en } = await import(toUrl(transpile(read('../../i18n/locales/en.ts')).replace(/from\s+["']\.\/vi["']/, `from "${viUrl}"`)));

const point = (bucket, values) => ({ month: bucket, month_label: bucket, bucket, bucket_label: bucket, ...values });
const sum = (values) => values.reduce((total, value) => total + value, 0);

test('shares have one decimal and always add up to 100', () => {
  assert.deepEqual(logic.sharePercents([1, 1, 1]), [33.4, 33.3, 33.3]);
  assert.deepEqual(logic.sharePercents([50, 25, 25]), [50, 25, 25]);
  assert.deepEqual(logic.sharePercents([0, 0]), [0, 0]);
  assert.deepEqual(logic.sharePercents([7, 0]), [100, 0]);
  for (const values of [[3, 7, 11, 13], [1, 2, 3, 4, 5, 6, 7, 8, 9], [998, 1, 1], [42, 37, 24, 18, 15, 12, 9]]) {
    const shares = logic.sharePercents(values);
    assert.equal(Math.round(sum(shares) * 10), 1000, `${values} -> ${shares}`);
    shares.forEach(share => assert.equal(Math.round(share * 10) / 10, share));
  }
});

const POINTS = [
  point('2026-10-01', { 'Chi nhánh Huế': 1, 'Chi nhánh Hà Nội': 5, 'Chi nhánh TP. Hồ Chí Minh': 3 }),
  point('2026-10-02', { 'Chi nhánh Huế': 0, 'Chi nhánh Hà Nội': 2, 'Chi nhánh TP. Hồ Chí Minh': 6 }),
  point('2026-10-03', {}),
];
const KEYS = ['Chi nhánh Huế', 'Chi nhánh Hà Nội', 'Chi nhánh TP. Hồ Chí Minh'];

test('branches are ranked by total, with safe chart keys and shares', () => {
  const model = logic.buildBranchChart(POINTS, KEYS);
  assert.deepEqual(model.series.map(item => [item.key, item.total, item.rank, item.slot, item.isOther]), [
    ['Chi nhánh TP. Hồ Chí Minh', 9, 1, 's0', false],
    ['Chi nhánh Hà Nội', 7, 2, 's1', false],
    ['Chi nhánh Huế', 1, 3, 's2', false],
  ]);
  assert.deepEqual(model.series.map(item => item.share), [52.9, 41.2, 5.9]);
  assert.equal(model.grandTotal, 17);
  // A name with a dot ("TP. Hồ Chí Minh") is never used as a data key.
  assert.deepEqual(model.rows[0], { bucket: '2026-10-01', s0: 3, s1: 5, s2: 1 });
  assert.deepEqual(model.rows[2], { bucket: '2026-10-03', s0: 0, s1: 0, s2: 0 });
  assert.deepEqual(model.peak, { bucket: '2026-10-01', total: 9 }, 'first bucket wins a tie');
  assert.equal(model.bucketCount, 3);
  assert.equal(model.activeBuckets, 2);
});

test('the backend "Khác" series stays last even when it is large', () => {
  const points = [point('2026-10-01', { Khác: 50, A: 10, B: 20 })];
  const withOther = logic.buildBranchChart(points, ['Khác', 'A', 'B'], { otherKey: 'Khác' });
  assert.deepEqual(withOther.series.map(item => [item.key, item.rank, item.isOther]), [['B', 1, false], ['A', 2, false], ['Khác', 3, true]]);
  // Without series_overflow a branch really named "Khác" is an ordinary branch.
  const named = logic.buildBranchChart(points, ['Khác', 'A', 'B']);
  assert.deepEqual(named.series.map(item => [item.key, item.isOther]), [['Khác', false], ['B', false], ['A', false]]);
});

test('more lines than the limit are added up into "Khác"', () => {
  const keys = Array.from({ length: 12 }, (_, index) => `Chi nhánh ${index + 1}`);
  const points = [point('2026-10-01', Object.fromEntries(keys.map((key, index) => [key, 12 - index])))];
  const model = logic.buildBranchChart(points, keys);
  assert.equal(model.series.length, 9);
  assert.deepEqual(model.series.slice(0, 8).map(item => item.key), keys.slice(0, 8));
  assert.deepEqual(model.series[8], { key: '__other__', slot: 's8', total: 4 + 3 + 2 + 1, share: model.series[8].share, rank: 9, isOther: true });
  assert.equal(model.rows[0].s8, 10);
  assert.equal(model.grandTotal, sum(keys.map((_, index) => 12 - index)));

  // With the backend "Khác" already there, the extra branches join it.
  const withOther = logic.buildBranchChart(
    [point('2026-10-01', { ...Object.fromEntries(keys.slice(0, 9).map((key, index) => [key, 20 - index])), Khác: 5 })],
    [...keys.slice(0, 9), 'Khác'],
    { otherKey: 'Khác' },
  );
  assert.equal(withOther.series.length, 9);
  assert.deepEqual(withOther.series.at(-1), { key: 'Khác', slot: 's8', total: 12 + 5, share: withOther.series.at(-1).share, rank: 9, isOther: true });
});

test('nothing enrolled gives no peak and zero shares', () => {
  const model = logic.buildBranchChart([point('2026-10-01', { A: 0 })], ['A']);
  assert.equal(model.grandTotal, 0);
  assert.equal(model.peak, null);
  assert.deepEqual(model.series.map(item => item.share), [0]);
  assert.deepEqual(logic.buildBranchChart([], []).series, []);
});

test('the tooltip lists shown branches with a value, largest first, and their total', () => {
  const model = logic.buildBranchChart(POINTS, KEYS);
  const all = logic.branchTooltipRows(model.rows[0], model.series, new Set());
  assert.deepEqual(all.rows.map(item => [item.series.key, item.value]), [['Chi nhánh Hà Nội', 5], ['Chi nhánh TP. Hồ Chí Minh', 3], ['Chi nhánh Huế', 1]]);
  assert.equal(all.total, 9);
  const someHidden = logic.branchTooltipRows(model.rows[1], model.series, new Set(['Chi nhánh Hà Nội']));
  assert.deepEqual(someHidden.rows.map(item => item.series.key), ['Chi nhánh TP. Hồ Chí Minh'], 'zero values and hidden lines are left out');
  assert.equal(someHidden.total, 6);
});

test('every text of the chart exists in Vietnamese and English', () => {
  for (const dictionary of [vi, en]) {
    const texts = dictionary.reports.branchChart;
    for (const size of ['day', 'week', 'month']) {
      for (const group of ['peak', 'average', 'active']) assert.equal(typeof texts[group][size], 'string', `${group}.${size}`);
    }
    for (const key of ['leader', 'leaderValue', 'activeValue', 'enrollments', 'unit', 'rankingTitle', 'rankingHint', 'shareHint', 'otherHint',
      'partialWeekHint', 'partialMonthHint', 'showAll', 'hideSeries', 'showSeries', 'hiddenSeries', 'allHidden', 'tooltipTotal', 'emptyHint', 'loadFailed', 'showing', 'earlier', 'later', 'chartLabel']) {
      assert.equal(typeof texts[key], 'string', key);
    }
  }
  const englishTexts = Object.values(en.reports.branchChart).flatMap(value => (typeof value === 'string' ? [value] : Object.values(value)));
  assert.ok(englishTexts.every(text => !/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(text)), 'no Vietnamese in English');
});
