import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Real AI points logic (format, usage, admin, errors, access, nav, query keys).
// Only i18n, toasts and the network client are replaced.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const mocks = {
  'react-i18next': { useTranslation: () => ({ t: key => key }) },
  sonner: { toast: { success() {}, error() {} } },
  '@/utils/localized-error': { getLocalizedApiError: (_error, fallback) => fallback },
  '@/api/ai-credits': { aiCreditsApi: {} },
};
const loaded = new Map();
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  loaded.set(file, module.exports);
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      return load([`${base}.ts`, `${base}.tsx`, base].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile()));
    }
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  loaded.set(file, module.exports);
  return module.exports;
}
const at = relative => load(path.join(src, relative));
const { vi } = at('i18n/locales/vi.ts');
const { en } = at('i18n/locales/en.ts');
const locales = { vi, en };
const lookup = (locale, key) => key.split('.').reduce((node, part) => node?.[part], locales[locale]);
function t(locale, key, values = {}) {
  const value = lookup(locale, key);
  assert.equal(typeof value, 'string', `missing ${locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
const format = at('components/ai-credits/ai-credits-format.logic.ts');
const usage = at('components/ai-credits/ai-credits-usage.logic.ts');
const admin = at('components/ai-credits/ai-credits-admin.logic.ts');
const errors = at('api/ai-credit-errors.logic.ts');
const access = at('utils/ai-credit-access.ts');
const nav = at('layout/app-sidebar.nav.ts');
const hooks = at('hooks/queries/use-ai-credits.ts');
const spaces = text => text.replace(/\s/g, ' ');

test('features: report chat router and narrative are one group, unknown features are Other, labels in both languages', () => {
  assert.equal(usage.aiFeatureGroup('ai_id'), 'ai_id');
  assert.equal(usage.aiFeatureGroup('report_chat_router'), 'report_chat');
  assert.equal(usage.aiFeatureGroup('report_chat_narrative'), 'report_chat');
  assert.equal(usage.aiFeatureGroup('report_pdf_narrative'), 'report_pdf');
  for (const unknown of ['image_alt_text', '', null, undefined, 'toString', '__proto__']) assert.equal(usage.aiFeatureGroup(unknown), 'other');
  const expected = {
    vi: { ai_id: 'AI ID – tạo khoá học', chat: 'Trợ lý AI', report_chat: 'Chat báo cáo AI', report_pdf: 'Báo cáo PDF',
      document_indexing: 'Xử lý tài liệu', video_transcription: 'Chuyển video thành chữ', other: 'Khác' },
    en: { ai_id: 'AI ID – course creation', chat: 'AI assistant', report_chat: 'AI Report chat', report_pdf: 'PDF report',
      document_indexing: 'Document processing', video_transcription: 'Video to text', other: 'Other' },
  };
  for (const locale of ['vi', 'en']) {
    for (const group of usage.AI_FEATURE_GROUPS) assert.equal(t(locale, usage.aiFeatureLabelKey(group)), expected[locale][group]);
  }
});

test('features: totals merge groups, shares add up, and an unvalued month shares by uses', () => {
  const totals = usage.groupFeatureTotals([
    { feature: 'ai_id', points: 100, calls: 2 },
    { feature: 'report_chat_router', points: 10, calls: 5 },
    { feature: 'report_chat_narrative', points: 30, calls: 5 },
    { feature: 'image_alt_text', points: 10, calls: 1 },
  ]);
  assert.equal(totals.basis, 'points');
  assert.equal(totals.totalPoints, 150);
  assert.deepEqual(totals.items.map(item => [item.group, item.points, item.calls, item.share]),
    [['ai_id', 100, 2, 66.7], ['report_chat', 40, 10, 26.7], ['other', 10, 1, 6.7]]);
  const unvalued = usage.groupFeatureTotals([{ feature: 'chat', points: null, calls: 3 }, { feature: 'ai_id', points: null, calls: 1 }]);
  assert.equal(unvalued.basis, 'calls');
  assert.equal(unvalued.totalPoints, null);
  assert.deepEqual(unvalued.items.map(item => [item.group, item.share]), [['chat', 75], ['ai_id', 25]]);
  assert.equal(usage.isUsageEmpty({ features: [] }), true);
  assert.equal(usage.isUsageEmpty({ features: [{ feature: 'chat', points: null, calls: 1 }] }), false);
});

test('features: every group has a fixed color defined for light and dark', () => {
  const css = readFileSync(path.join(src, 'globals.css'), 'utf8');
  const colors = usage.AI_FEATURE_GROUPS.map(usage.aiFeatureColor);
  assert.equal(new Set(colors).size, colors.length);
  for (const color of colors) {
    const name = /var\((--[a-z-]+)\)/.exec(color)[1];
    assert.equal(css.split(`${name}:`).length - 1, 2, `${name} must be set once for light and once for dark`);
  }
  assert.equal(usage.aiFeatureColor('report_chat'), 'var(--ai-feature-report-chat)');
  assert.equal(usage.aiSeriesColor(0), 'var(--ai-series-1)');
  assert.equal(usage.aiSeriesColor(9), 'var(--ai-series-2)');
});

test('daily chart: one row per day of the month, stacked by group, nothing drawn without point values', () => {
  const chart = usage.dailyFeatureChart([
    { date: '2026-02-01', feature: 'report_chat_router', points: 1.25 },
    { date: '2026-02-01', feature: 'report_chat_narrative', points: 2 },
    { date: '2026-02-03', feature: 'ai_id', points: 10 },
    { date: '2026-03-01', feature: 'ai_id', points: 99 },
  ], '2026-02');
  assert.equal(chart.rows.length, 28);
  assert.deepEqual(chart.groups, ['ai_id', 'report_chat']);
  assert.equal(chart.rows[0].report_chat, 3.3);
  assert.equal(chart.rows[0].total, 3.3);
  assert.equal(chart.rows[2].ai_id, 10);
  assert.equal(chart.hasPoints, true);
  assert.equal(usage.dailyFeatureChart([{ date: '2026-02-01', feature: 'chat', points: null }], '2026-02').hasPoints, false);
});

test('people: system and deleted names, initials, accent-free search and sorting', () => {
  const labels = { system: 'Hệ thống', deletedUser: 'Người dùng đã xoá' };
  const users = [
    { user_key: 'a', name: 'Nguyễn Văn An', email: 'an@x.vn', deleted: false, system: false, points: 5, calls: 9, features: {} },
    { user_key: 'system', name: null, email: null, deleted: false, system: true, points: 20, calls: 1, features: { document_indexing: 20 } },
    { user_key: 'b', name: null, email: null, deleted: true, system: false, points: 10, calls: 3, features: {} },
    { user_key: 'c', name: 'Đỗ Bình', email: 'binh@x.vn', deleted: true, system: false, points: 1, calls: 30, features: {} },
  ];
  assert.equal(usage.aiUserDisplayName(users[1], labels), 'Hệ thống');
  assert.equal(usage.aiUserDisplayName(users[2], labels), 'Người dùng đã xoá');
  assert.equal(usage.aiUserDisplayName(users[3], labels), 'Đỗ Bình', 'deleted users keep their name');
  assert.equal(usage.aiUserInitials('Nguyễn Văn An'), 'NA');
  assert.equal(usage.aiUserInitials('linh'), 'L');
  assert.deepEqual(usage.filterAndSortUsers(users, 'nguyen van', 'points', labels).map(user => user.user_key), ['a']);
  assert.deepEqual(usage.filterAndSortUsers(users, 'do binh', 'points', labels).map(user => user.user_key), ['c']);
  assert.deepEqual(usage.filterAndSortUsers(users, '', 'points', labels).map(user => user.user_key), ['system', 'b', 'a', 'c']);
  assert.deepEqual(usage.filterAndSortUsers(users, '', 'name', labels).map(user => user.user_key), ['c', 'system', 'a', 'b']);
  // Before points can be counted, "most points" keeps the busiest people first (uses are never shown).
  const unvalued = users.map(user => ({ ...user, points: null }));
  assert.deepEqual(usage.filterAndSortUsers(unvalued, '', 'points', labels).map(user => user.user_key), ['c', 'a', 'b', 'system']);
  assert.deepEqual(usage.userFeatureSegments({ features: { report_chat_router: 1, report_chat_narrative: 3, ai_id: 4, chat: null } })
    .map(segment => [segment.group, segment.points, segment.share]), [['ai_id', 4, 50], ['report_chat', 4, 50]]);
});

test('top users chart: lines follow the list order and every day of the month', () => {
  const users = [{ user_key: 'u2', points: 9 }, { user_key: 'u1', points: 3 }];
  const chart = usage.userDailyChart([
    { date: '2026-10-02', user_key: 'u1', points: 1 },
    { date: '2026-10-02', user_key: 'u2', points: 4 },
  ], users, '2026-10');
  assert.deepEqual(chart.series.map(series => [series.key, series.color]), [['u2', 'var(--ai-series-1)'], ['u1', 'var(--ai-series-2)']]);
  assert.equal(chart.rows.length, 31);
  assert.equal(chart.rows[1].u2, 4);
  assert.equal(chart.rows[0].u1, 0);
  const running = usage.userDailyChart([
    { date: '2026-10-02', user_key: 'u1', points: 1 },
    { date: '2026-10-03', user_key: 'u1', points: 2.5 },
  ], users, '2026-10', { cumulative: true, until: '2026-10-17' });
  assert.deepEqual(running.rows.slice(0, 4).map(row => row.u1), [0, 1, 3.5, 3.5]);
  assert.equal(running.rows[16].u1, 3.5, 'today keeps the running total');
  assert.equal(running.rows[17].u1, null, 'days after today have no value, so the line stops');
  assert.equal(format.platformDate(new Date('2026-10-17T18:30:00Z')), '2026-10-18');
});

test('states: each state has its own color family, a label in both languages and a ring fill', () => {
  const families = { ok: 'emerald', warning: 'amber', exhausted: 'rose', unlimited: 'violet', unvalued: 'slate' };
  const labels = {
    vi: { ok: 'Đang dùng bình thường', warning: 'Sắp hết điểm', exhausted: 'Đã hết điểm', unlimited: 'Không giới hạn', unvalued: 'Chưa quy đổi được điểm' },
    en: { ok: 'On track', warning: 'Running low', exhausted: 'Used up', unlimited: 'Unlimited', unvalued: 'Points not available yet' },
  };
  const froms = new Set();
  for (const [state, family] of Object.entries(families)) {
    const tone = usage.aiStateTone(state);
    assert.equal(tone.state, state);
    assert.match(tone.chip, new RegExp(family));
    assert.match(tone.text, new RegExp(family));
    froms.add(tone.from);
    for (const locale of ['vi', 'en']) assert.equal(t(locale, tone.labelKey), labels[locale][state]);
  }
  assert.equal(froms.size, 5);
  assert.equal(usage.aiStateTone('bogus').state, 'unvalued');
  assert.equal(usage.aiRingProgress('unlimited', null), 100);
  assert.equal(usage.aiRingProgress('unvalued', 50), 0);
  assert.equal(usage.aiRingProgress('exhausted', 99), 100);
  assert.equal(usage.aiRingProgress('ok', 46.2), 46.2);
  assert.equal(usage.aiRingProgress('warning', 140), 100);
});

test('numbers and dates follow the locale (vi 1.234,5 · en 1,234.5)', () => {
  assert.equal(format.formatPoints(1234.5, 'vi'), '1.234,5');
  assert.equal(format.formatPoints(1234.5, 'en'), '1,234.5');
  assert.equal(format.formatPoints(1234.56, 'vi'), '1.234,6');
  assert.equal(format.formatPoints(null, 'vi'), '—');
  assert.equal(format.formatCount(12345, 'vi'), '12.345');
  assert.equal(format.formatPercent(82.5, 'vi'), '82,5%');
  assert.equal(format.formatPercent(82.5, 'en'), '82.5%');
  assert.equal(format.formatSignedPercent(3.2, 'vi'), '+3,2%');
  assert.equal(format.formatSignedPercent(-1.5, 'en'), '−1.5%');
  assert.equal(spaces(format.formatVnd(1234567, 'vi')), '1.234.567 ₫');
  assert.equal(format.formatVnd(1234567, 'en'), '₫1,234,567');
  assert.equal(format.formatUsd(12.345, 'en'), '$12.35');
  assert.equal(format.formatUsd(0.0051923, 'en'), '$0.00519');
  assert.equal(format.formatMonthLabel('2026-10', 'vi'), 'Tháng 10 năm 2026');
  assert.equal(format.formatMonthLabel('2026-10', 'en'), 'October 2026');
  assert.equal(format.formatShortDate('2026-11-01', 'vi'), '01/11');
  assert.equal(format.formatShortDate('2026-11-01', 'en'), 'Nov 1');
  assert.equal(format.formatDayTick('2026-10-05', 'vi'), '5/10');
  assert.equal(format.formatFullDate('2026-10-05', 'vi'), '05/10/2026');
  assert.equal(format.formatFullDate('2026-10-05', 'en'), 'Oct 5, 2026');
});

test('typed numbers are read per locale; months follow Vietnam time', () => {
  assert.equal(format.parseLocaleNumber('26.150', 'vi'), 26150);
  assert.equal(format.parseLocaleNumber('26150,5', 'vi'), 26150.5);
  assert.equal(format.parseLocaleNumber('26.150,5', 'vi'), 26150.5);
  assert.equal(format.parseLocaleNumber('26150.5', 'vi'), 26150.5);
  assert.equal(format.parseLocaleNumber('26,150.5', 'en'), 26150.5);
  assert.equal(format.parseLocaleNumber(' 1 000 ', 'vi'), 1000);
  for (const bad of ['', 'abc', '-5', '1,2,3']) assert.equal(format.parseLocaleNumber(bad, 'vi'), null);
  assert.equal(format.parseLocaleInteger('2,5', 'vi'), null, 'whole numbers only');
  assert.equal(format.parseLocaleInteger('6.000.000', 'vi'), 6000000);
  assert.equal(format.decimalInputValue('500000.00', 'vi'), '500000');
  assert.equal(format.decimalInputValue('0.45', 'vi'), '0,45');
  assert.deepEqual(format.mergeMonths(['2026-11'], ['2026-10', '2026-08'], ['2026-08', 'bad', '2026-09']), ['2026-11', '2026-10', '2026-09', '2026-08']);
  assert.equal(format.formatMonthShort('2026-09', 'vi'), '9/2026');
  assert.equal(format.formatMonthShort('2026-10', 'en'), 'October 2026');
  assert.equal(format.platformMonth(new Date('2026-10-31T18:00:00Z')), '2026-11', '01:00 on 1 Nov in Vietnam');
  assert.equal(format.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(format.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(format.daysOfMonth('2026-02').length, 28);
  assert.equal(format.daysOfMonth('2028-02').length, 29);
});

test('plan preview: point value = price x ratio x (1 - buffer) / fx / points, with budget and margin', () => {
  const preview = admin.aiPlanPreview({ priceVnd: 6_000_000, points: 20_000, costRatio: 0.5, bufferRatio: 0.1, fxVndPerUsd: 26_000 });
  assert.equal(preview.providerBudgetVnd, 2_700_000);
  assert.equal(preview.marginVnd, 3_300_000);
  assert.equal(preview.marginPercent, 55);
  assert.equal(preview.pointValueVnd, 135);
  assert.ok(Math.abs(preview.pointValueUsd - (6_000_000 * 0.5 * (1 - 0.1) / 26_000 / 20_000)) < 1e-12);
  const noFx = admin.aiPlanPreview({ priceVnd: 6_000_000, points: 20_000, costRatio: 0.5, bufferRatio: 0.1, fxVndPerUsd: null });
  assert.equal(noFx.pointValueUsd, null);
  assert.equal(noFx.pointValueVnd, 135);
  const free = admin.aiPlanPreview({ priceVnd: 0, points: 1000, costRatio: 0.5, bufferRatio: 0.1, fxVndPerUsd: 26_000 });
  assert.equal(free.pointValueVnd, null);
  assert.equal(free.marginPercent, null);
  assert.equal(admin.aiPlanPreview({ priceVnd: 1000, points: 10, costRatio: 1.5, bufferRatio: 0.1, fxVndPerUsd: 1 }).providerBudgetVnd, null);
  assert.deepEqual(admin.aiPlanDraftNumbers({ ...admin.DEFAULT_AI_PLAN_DRAFT, price: '6.000.000', points: '20.000' }, 'vi'),
    { priceVnd: 6_000_000, points: 20_000, costRatio: 0.5, bufferRatio: 0.1 });
});

test('plan form: owner defaults, backend limits as plain messages, ratios sent as 0-1', () => {
  assert.equal(admin.DEFAULT_AI_PLAN_DRAFT.costRatio, '50');
  assert.equal(admin.DEFAULT_AI_PLAN_DRAFT.buffer, '10');
  const bad = admin.validateAiPlanDraft({ ...admin.DEFAULT_AI_PLAN_DRAFT, code: 'Gói A', name: '', price: '-1', points: '0', costRatio: '0', buffer: '100', sortOrder: 'x' }, 'vi', true);
  assert.equal(bad.input, null);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['buffer', 'code', 'costRatio', 'name', 'points', 'price', 'sortOrder']);
  for (const key of Object.values(bad.errors)) for (const locale of ['vi', 'en']) assert.doesNotMatch(t(locale, key), /[A-Z]{2,}_[A-Z]|\bnull\b|undefined/);
  const ok = admin.validateAiPlanDraft({ ...admin.DEFAULT_AI_PLAN_DRAFT, code: 'pro-2026', name: ' Chuyên nghiệp ', price: '6.000.000', points: '20000', costRatio: '45,5' }, 'vi', true);
  assert.deepEqual(ok.input, { code: 'pro-2026', name: 'Chuyên nghiệp', description: null, monthly_price_vnd: 6_000_000, monthly_points: 20_000,
    provider_cost_ratio: 0.455, safety_buffer_ratio: 0.1, is_unlimited: false, is_active: true, sort_order: 0 });
  assert.equal(admin.validateAiPlanDraft({ ...admin.DEFAULT_AI_PLAN_DRAFT, code: '', name: 'A', price: '0', points: '1' }, 'en', false).input?.code, '',
    'the code is fixed after creation and not checked when editing');
  const draft = admin.aiPlanDraftFromPlan({ id: 'p', code: 'pro', name: 'Pro', description: null, monthly_price_vnd: '6000000.00', monthly_points: '20000',
    provider_cost_ratio: '0.45', safety_buffer_ratio: '0.1', is_unlimited: false, is_active: true, sort_order: 2, tenant_count: 0 }, 'vi');
  assert.deepEqual([draft.price, draft.points, draft.costRatio, draft.buffer, draft.sortOrder], ['6000000', '20000', '45', '10', '2']);
});

test('FX, top-up and reconciliation forms check the same limits as the backend', () => {
  assert.deepEqual(admin.validateAiFxDraft({ month: '2026-10', rate: '26.150,5', note: ' Hoá đơn ' }, 'vi').input,
    { month: '2026-10', vnd_per_usd: 26150.5, source_note: 'Hoá đơn' });
  assert.deepEqual(Object.keys(admin.validateAiFxDraft({ month: '2026-13', rate: '0', note: 'x'.repeat(501) }, 'vi').errors).sort(), ['month', 'note', 'rate']);
  assert.deepEqual(admin.validateAiTopupDraft({ points: '5.000', price: '', reason: '' }, 'vi').input, { points: 5000, price_vnd: null, reason: null });
  assert.deepEqual(Object.keys(admin.validateAiTopupDraft({ points: '0', price: 'abc', reason: '' }, 'vi').errors).sort(), ['points', 'price']);
  assert.deepEqual(admin.validateAiReconcileDraft({ cost: '2.310.000', note: '' }, 'vi').input, { cost_vnd: 2_310_000, note: null });
  assert.ok(admin.validateAiReconcileDraft({ cost: '1,5', note: '' }, 'vi').errors.cost);
});

test('overview: totals, near/over limit counts, missing FX keeps the cost in USD only, invoice check status', () => {
  const row = (state, overrides) => ({ state, revenue_vnd: 0, cost_usd: 0, cost_vnd: 0, reconciled_cost_vnd: null, reconciled_diff_percent: null, ...overrides });
  const totals = admin.aiOverviewTotals([
    row('ok', { revenue_vnd: 6_000_000, cost_usd: 100, cost_vnd: 2_600_000 }),
    row('warning', { revenue_vnd: 2_000_000, cost_usd: 30, cost_vnd: 780_000 }),
    row('exhausted', { revenue_vnd: 2_000_000, cost_usd: 40, cost_vnd: 1_040_000 }),
  ]);
  assert.deepEqual(totals, { tenantCount: 3, revenueVnd: 10_000_000, costUsd: 170, costVnd: 4_420_000, marginVnd: 5_580_000, marginPercent: 55.8, nearLimit: 1, exhausted: 1 });
  const noFx = admin.aiOverviewTotals([row('unvalued', { revenue_vnd: 1_000, cost_usd: 2, cost_vnd: null })]);
  assert.equal(noFx.costVnd, null);
  assert.equal(noFx.marginVnd, null);
  assert.equal(admin.aiReconciliationStatus({ reconciled_cost_vnd: null, reconciled_diff_percent: null }), 'none');
  assert.equal(admin.aiReconciliationStatus({ reconciled_cost_vnd: 100, reconciled_diff_percent: 4.9 }), 'match');
  assert.equal(admin.aiReconciliationStatus({ reconciled_cost_vnd: 100, reconciled_diff_percent: 12.5 }), 'over');
  assert.equal(admin.aiReconciliationStatus({ reconciled_cost_vnd: 100, reconciled_diff_percent: -8 }), 'under');
  assert.equal(errors.aiCreditAdminErrorKey('AI_CREDIT_PLAN_CODE_TAKEN'), 'aiCredits.admin.apiErrors.planCodeTaken');
  assert.equal(t('vi', errors.aiCreditAdminErrorKey('AI_CREDIT_PLAN_CODE_TAKEN')), 'Mã gói này đã có. Hãy chọn mã khác.');
  assert.equal(errors.aiCreditAdminErrorKey('SOMETHING_ELSE'), null);
  assert.equal(admin.aiFxNoticeKind({ month: '2026-10', fxVndPerUsd: null, fxRateMonth: null }), 'missing');
  assert.equal(admin.aiFxNoticeKind({ month: '2026-10', fxVndPerUsd: 26150, fxRateMonth: '2026-09' }), 'inherited');
  assert.equal(admin.aiFxNoticeKind({ month: '2026-10', fxVndPerUsd: 26150, fxRateMonth: '2026-10' }), 'own');
});

test('AI points refusals have the owner wording in Vietnamese and English', () => {
  const copy = {
    AI_CREDIT_LIMIT_REACHED: {
      vi: 'Đã dùng hết điểm AI của tháng này. Liên hệ quản trị viên để mua thêm điểm.',
      en: "This month's AI points are used up. Contact your administrator to buy more points.",
    },
    AI_CREDIT_INSUFFICIENT_FOR_RUN: {
      vi: 'Không đủ điểm AI để tạo khoá học. Liên hệ quản trị viên để mua thêm điểm.',
      en: 'Not enough AI points to create this course. Contact your administrator to buy more points.',
    },
  };
  for (const [code, text] of Object.entries(copy)) {
    assert.equal(errors.isAiCreditErrorCode(code), true);
    for (const locale of ['vi', 'en']) assert.equal(t(locale, errors.aiCreditErrorKey(code)), text[locale]);
  }
  assert.equal(errors.aiCreditErrorKey('AI_TOKEN_LIMIT_REACHED'), null);
  assert.equal(errors.aiCreditErrorKey(undefined), null);
  const localizedError = readFileSync(path.join(src, 'utils/localized-error.ts'), 'utf8');
  assert.match(localizedError, /const aiCreditKey = aiCreditErrorKey\(response\?\.data\?\.code\);\s*if \(aiCreditKey\) return i18n\.t\(aiCreditKey, \{ lng: locale \}\);/,
    'toasts use the same plain message in both languages');
});

test('access: AI usage (AI Chatbot > overview) follows the AI Chatbot module rule and is never shown to learners', () => {
  assert.equal(access.AI_CHATBOT_MODULE, 'ai_chatbot');
  const grant = (...modules) => (module, action) => action === 'can_view' && modules.includes(module);
  const cases = [
    // [role, tenant modules, permission check, sees usage]
    ['superadmin', [], grant(), true],
    ['superuser', ['ai_chatbot'], grant(), true],
    ['superuser', ['library'], grant('ai_chatbot'), false],
    ['staff', ['ai_chatbot'], grant('ai_chatbot'), true],
    ['staff', ['ai_chatbot'], grant('library'), false],
    ['staff', ['library'], grant('ai_chatbot'), false],
    ['learner_plus', ['ai_chatbot'], grant('ai_chatbot'), false],
    ['learner', ['ai_chatbot'], grant('ai_chatbot'), false],
    [null, ['ai_chatbot'], grant('ai_chatbot'), false],
    ['someone_else', ['ai_chatbot'], grant('ai_chatbot'), false],
  ];
  for (const [role, tenantModules, hasPermission, sees] of cases) {
    assert.equal(access.canViewAiUsage({ role, tenantModules, hasPermission }), sees, `${role} with ${tenantModules.join(',')}`);
  }
  for (const role of ['superadmin', 'superuser', 'staff', 'learner_plus', 'learner', null]) assert.equal(access.canManageAiCredits(role), role === 'superadmin');
});

test('sidebar: no separate AI usage item any more; AI plans stay for superadmin only, next to tenant management', () => {
  const items = nav.NAV_GROUPS.flatMap(group => group.items);
  assert.equal(items.find(item => item.url === '/ai-usage'), undefined);
  const plansItem = items.find(item => item.url === '/ai-credits');
  assert.equal(plansItem.module, 'superadmin_only');
  assert.ok(items.indexOf(plansItem) === items.findIndex(item => item.url === '/tenants') + 1, 'next to tenant management');
  for (const role of ['superadmin', 'superuser', 'staff', 'learner_plus', 'learner', '']) {
    const context = { role: role || null, tenantModules: ['ai_chatbot'], hasPermission: () => true };
    assert.equal(nav.canSeeNavItem(plansItem, context), role === 'superadmin', `${role} plans`);
    const urls = nav.visibleNavGroups(context).flatMap(group => group.items.map(item => item.url));
    assert.equal(urls.includes('/ai-usage'), false, `${role} has no AI usage item`);
    assert.equal(urls.includes('/ai-credits'), role === 'superadmin');
  }
  // The rest of the rules are unchanged.
  const staff = { role: 'staff', tenantModules: ['library', 'courses'], hasPermission: module => module === 'library' };
  assert.deepEqual(nav.visibleNavGroups(staff).flatMap(group => group.items.map(item => item.url)), ['/library']);
  const superuser = { role: 'superuser', tenantModules: ['library', 'permission_groups', 'tenant_management'], hasPermission: () => false };
  assert.deepEqual(nav.visibleNavGroups(superuser).flatMap(group => group.items.map(item => item.url)), ['/library', '/permission-groups']);
  assert.equal(lookup('vi', 'nav.items.aiUsage'), undefined);
  assert.equal(lookup('en', 'nav.items.aiUsage'), undefined);
  assert.equal(t('en', 'nav.items.aiCredits'), 'AI plans & points');
  assert.equal(t('vi', 'aiChatbot.overview'), 'Báo cáo tổng quan');
  assert.equal(t('en', 'aiChatbot.overview'), 'Overview report');
});

test('queries: keys carry the tenant and the month; only network and server failures are retried', () => {
  assert.deepEqual(hooks.aiCreditKeys.usage('tenant-1', '2026-09'), ['ai-credits', 'usage', 'tenant-1', '2026-09']);
  assert.deepEqual(hooks.aiCreditKeys.usage('tenant-1', null), ['ai-credits', 'usage', 'tenant-1', 'current']);
  assert.deepEqual(hooks.aiCreditKeys.tenantUsage('tenant-2', '2026-10'), ['ai-credits', 'admin', 'tenant-usage', 'tenant-2', '2026-10']);
  assert.deepEqual(hooks.aiCreditKeys.overview(null), ['ai-credits', 'admin', 'overview', 'current']);
  assert.deepEqual(hooks.aiCreditKeys.tenantPlan('tenant-3'), ['ai-credits', 'admin', 'tenant-plan', 'tenant-3']);
  assert.equal(hooks.AI_CREDIT_STALE_TIME_MS, 30_000);
  assert.equal(hooks.shouldRetryAiCreditQuery(0, { request: {} }), true, 'no answer');
  assert.equal(hooks.shouldRetryAiCreditQuery(1, { response: { status: 503 } }), true);
  assert.equal(hooks.shouldRetryAiCreditQuery(2, { response: { status: 503 } }), false, 'at most two retries');
  for (const status of [400, 401, 403, 404, 409, 429]) assert.equal(hooks.shouldRetryAiCreditQuery(0, { response: { status } }), false);
  assert.equal(hooks.shouldRetryAiCreditQuery(0, null), false);
});

test('every aiCredits key used by the pages exists in Vietnamese and English; tenant copy never mentions money, tokens or providers', () => {
  const files = [
    ...readdirSync(directory).filter(name => /\.tsx?$/.test(name) && !name.includes('.mock.')).map(name => path.join(directory, name)),
    path.join(src, 'pages/ai-chatbot.tsx'), path.join(src, 'pages/ai-credits.tsx'), path.join(src, 'hooks/queries/use-ai-credits.ts'),
  ];
  const used = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/['`](aiCredits\.[a-zA-Z0-9_.]+|tenantManagement\.aiPlan[a-zA-Z]*)['`]/g)) used.add(match[1]);
  }
  assert.ok(used.size > 80, `found ${used.size} keys`);
  for (const key of used) {
    for (const locale of ['vi', 'en']) {
      // A few constants are prefixes of a group of messages (for example the plan form errors).
      const value = lookup(locale, key);
      assert.ok(typeof value === 'string' || (value && typeof value === 'object'), `missing ${locale} translation ${key}`);
    }
  }
  const tenantCopy = JSON.stringify([vi.aiCredits.usage, vi.aiCredits.features, vi.aiCredits.states, vi.aiCredits.errors, vi.aiCredits.common,
    en.aiCredits.usage, en.aiCredits.features, en.aiCredits.states, en.aiCredits.errors, en.aiCredits.common]);
  assert.doesNotMatch(tenantCopy, /USD|VND|₫|\$|token|Google|Gemini|OpenAI|provider|nhà cung cấp/i);
});

test('tenants table: one AI points read for the whole table; the token column and the token-limit copy are gone', () => {
  const page = readFileSync(path.join(src, 'pages/tenant-management.tsx'), 'utf8');
  assert.equal(page.match(/useAiCreditOverviewByTenant\(\)/g)?.length, 1, 'one overview read for the table');
  assert.doesNotMatch(page, /useAiTenantUsage|useAiCreditOverview\(/, 'never a call per row');
  assert.match(page, /<TenantAiPointsCell loading={aiPoints\.loading} failed={aiPoints\.failed} tenant={aiPoints\.byTenant\.get\(tenant\.id\)} \/>/);
  assert.match(page, /{t\("tenantManagement\.aiPoints"\)}<\/TableHead>/);
  assert.doesNotMatch(page, /formatTokenCount|aiTokenMonth|aiTokenTooltip|ai_monthly_token_limit|ai_token_total_used|ai_token_reserved/);
  // A new or removed tenant refreshes the cached overview.
  assert.equal(page.match(/invalidateQueries\({ queryKey: aiCreditKeys\.overviewAll\(\) }\)/g)?.length, 2);
  assert.equal(hooks.aiCreditKeys.overview(null).join('/'), 'ai-credits/admin/overview/current');

  for (const locale of ['vi', 'en']) {
    for (const key of ['tenantManagement.aiTokenMonth', 'tenantManagement.aiTokenLimit', 'tenantManagement.aiTokenTooltip',
      'tenantManagement.invalidAiTokenLimit', 'chatWidget.aiTokenLimitReached']) {
      assert.equal(lookup(locale, key), undefined, `${locale} ${key} removed`);
    }
    for (const key of ['aiPoints', 'aiPointsLoading', 'aiPointsUnavailable', 'aiPointsUnvalued', 'aiPointsUsed']) t(locale, `tenantManagement.${key}`);
    // Still used by the user and course limit fields.
    t(locale, 'tenantManagement.unlimited');
    t(locale, 'tenantManagement.unlimitedHint');
  }
  assert.equal(t('vi', 'tenantManagement.aiPoints'), 'Điểm AI');
  assert.equal(t('vi', 'tenantManagement.aiPointsUnvalued'), 'Chưa quy đổi');
  assert.equal(t('vi', 'tenantManagement.aiPointsUsed', { used: '9.240', total: '20.000' }), 'Đã dùng 9.240 / 20.000 điểm trong tháng này');
  assert.equal(t('en', 'tenantManagement.aiPoints'), 'AI points');
  assert.doesNotMatch(JSON.stringify([vi.tenantManagement, en.tenantManagement]), /token/i);

  assert.doesNotMatch(readFileSync(path.join(src, 'api/custom-chat.ts'), 'utf8'), /AI_TOKEN_LIMIT_REACHED/);
  assert.doesNotMatch(readFileSync(path.join(src, 'api/custom-tenants.ts'), 'utf8'), /token_limit|monthlyTokenLimit|tokenRemaining/);
});
