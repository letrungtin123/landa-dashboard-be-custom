import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Real AI usage page components rendered on the server. Only i18n, the locale
// store, animation, charts, tooltips, the select primitive and the auth store
// are replaced; SSR proves markup and copy, not browser layout or animation.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(directory, '../..');
const h = React.createElement;
const env = { locale: 'vi', user: null };
const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'layout', 'whileHover', 'whileTap', 'variants']);
const clean = props => Object.fromEntries(Object.entries(props).filter(([name]) => !MOTION_PROPS.has(name)));
const passthrough = tag => ({ children, ...props }) => h(tag, clean(props), children);
const chartTag = name => (name === 'ResponsiveContainer' ? 'div' : name.endsWith('Chart') ? 'svg' : 'g');
const locales = {};
const lookup = (locale, key) => key.split('.').reduce((node, part) => node?.[part], locales[locale]);
function translate(key, values = {}) {
  const value = lookup(env.locale, key);
  assert.equal(typeof value, 'string', `missing ${env.locale} translation ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name]));
}
const mocks = {
  'react-i18next': { useTranslation: () => ({ t: translate }) },
  '@/utils/locale-store': { useLocaleStore: select => select({ locale: env.locale, setLocale() {} }) },
  'framer-motion': {
    motion: new Proxy({}, { get: (_, tag) => passthrough(String(tag)) }),
    AnimatePresence: ({ children }) => children,
    animate: () => ({ stop() {} }),
  },
  recharts: new Proxy({}, { get: (_, name) => ({ children }) => h(chartTag(String(name)), { 'data-chart': String(name) }, children) }),
  '@/components/ui/tooltip': { AppTooltip: ({ children }) => children },
  '@/components/ui/select': {
    Select: ({ children }) => h('div', { 'data-select': '' }, children),
    SelectTrigger: ({ children }) => h('button', { type: 'button' }, children),
    SelectValue: ({ placeholder }) => h('span', null, placeholder ?? ''),
    SelectContent: ({ children }) => h('div', null, children),
    SelectItem: ({ children, value }) => h('div', { 'data-value': value }, children),
  },
  '@/utils/store': { useAuthStore: select => select({ user: env.user, tenantModules: [], hasPermission: () => false }) },
  '@/pages/not-found': { __esModule: true, default: () => h('p', null, 'NOT_FOUND') },
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
locales.vi = at('i18n/locales/vi.ts').vi;
locales.en = at('i18n/locales/en.ts').en;
const { AiUsageHeader, AiUsageView } = at('components/ai-credits/ai-usage-view.tsx');
const { AiUsageSkeleton, AiUsageError, AiUsageEmpty } = at('components/ai-credits/ai-usage-states.tsx');
const { AiCreditsKpis } = at('components/ai-credits/ai-credits-kpis.tsx');
const { AiCreditsTenantTable } = at('components/ai-credits/ai-credits-tenant-table.tsx');
const { ModuleGuard } = at('components/module-guard.tsx');
const { AiFxNotice } = at('components/ai-credits/ai-fx-notice.tsx');
const noop = () => undefined;

function summary(state) {
  const valued = state !== 'unvalued';
  const unlimited = state === 'unlimited';
  const empty = state === 'empty';
  const points = value => (valued ? value : null);
  const topup = state === 'warning' ? 5000 : 0;
  return {
    month: '2026-10',
    months: ['2026-10', '2026-09'],
    available_months: ['2026-10', '2026-09', '2026-08'],
    has_month: true,
    resets_on: '2026-11-01',
    plan: unlimited ? { code: 'demo_unlimited', name: 'Dùng thử', is_unlimited: true } : { code: 'pro', name: 'Chuyên nghiệp', is_unlimited: false },
    state: empty ? 'ok' : state,
    percent: { ok: 46.2, warning: 86.4, exhausted: 100 }[state] ?? (empty ? 0 : null),
    points: {
      plan: unlimited ? null : 20000,
      topup,
      total: unlimited ? null : 20000 + topup,
      used: valued ? (empty ? 0 : 1234.5) : null,
      reserved: points(empty ? 0 : 12.5),
      remaining: unlimited || !valued ? null : 18753,
    },
    features: empty ? [] : [
      { feature: 'ai_id', points: points(800), calls: 4 },
      { feature: 'report_chat_router', points: points(14.5), calls: 9 },
      { feature: 'report_chat_narrative', points: points(20), calls: 11 },
      { feature: 'document_indexing', points: points(400), calls: 12 },
    ],
    daily: empty ? [] : [
      { date: '2026-10-01', feature: 'ai_id', points: points(500) },
      { date: '2026-10-02', feature: 'report_chat_narrative', points: points(20) },
    ],
    users: empty ? [] : [
      { user_key: 'u1', name: 'Nguyễn Minh Anh', email: 'minhanh@example.vn', deleted: false, system: false, points: points(700), calls: 8, features: { ai_id: points(700) } },
      { user_key: 'system', name: null, email: null, deleted: false, system: true, points: points(400), calls: 12, features: { document_indexing: points(400) } },
      { user_key: 'u2', name: 'Phạm Đức Huy', email: 'duchuy@example.vn', deleted: true, system: false, points: points(100), calls: 3, features: { chat: points(100) } },
      { user_key: 'u3', name: null, email: null, deleted: true, system: false, points: points(34.5), calls: 1, features: {} },
    ],
    user_daily: empty ? [] : [{ date: '2026-10-01', user_key: 'u1', points: points(700) }],
  };
}

function renderUsage(state, locale) {
  env.locale = locale;
  const data = summary(state);
  return renderToStaticMarkup(h('div', null,
    h(AiUsageHeader, { summary: data, month: null, onMonthChange: noop }),
    h(AiUsageView, { summary: data })));
}

const FORBIDDEN_FOR_TENANTS = /USD|VND|₫|\$|token|Google|Gemini|OpenAI|provider|nhà cung cấp/i;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('usage page: every state renders translated copy with no money, tokens or provider names (vi and en)', () => {
  for (const state of ['ok', 'warning', 'exhausted', 'unlimited', 'unvalued', 'empty']) {
    for (const locale of ['vi', 'en']) {
      const html = renderUsage(state, locale);
      assert.doesNotMatch(html, /aiCredits\./, `${state}/${locale}: untranslated key`);
      assert.doesNotMatch(text(html), FORBIDDEN_FOR_TENANTS, `${state}/${locale}: tenants see points and % only`);
    }
  }
});

test('usage page (ok): plan, renewal date, month, ring %, points of total, by-feature groups and people', () => {
  const vi = text(renderUsage('ok', 'vi'));
  assert.match(vi, /Mức dùng AI/);
  assert.match(vi, /Chuyên nghiệp/);
  assert.match(vi, /Làm mới vào ngày 01\/11/);
  assert.match(vi, /Tháng 10 năm 2026/);
  assert.match(vi, /46,2%/);
  assert.match(vi, /1\.234,5/);
  assert.match(vi, /trên 20\.000 điểm/);
  assert.match(vi, /Đang dùng bình thường/);
  assert.match(vi, /Đang giữ cho việc đang chạy: 12,5 điểm/);
  assert.match(vi, /Chat báo cáo AI/, 'router + narrative shown as one feature');
  assert.equal((vi.match(/Chat báo cáo AI/g) || []).length >= 1, true);
  assert.match(vi, /Theo tính năng/);
  assert.match(vi, /Theo ngày/);
  assert.match(vi, /Ai dùng nhiều nhất/);
  assert.match(vi, /Hệ thống/);
  assert.match(vi, /Phạm Đức Huy \(đã xoá\)/, 'deleted users keep their name with a mark');
  assert.match(vi, /Người dùng đã xoá/);
  assert.doesNotMatch(vi, /Người dùng đã xoá \(đã xoá\)/, 'the mark is not repeated when the name is unknown');
  assert.match(vi, /minhanh@example\.vn/);
  assert.doesNotMatch(vi, /Sắp hết điểm|Đã hết điểm AI/, 'no banner below 80%');
  const en = text(renderUsage('ok', 'en'));
  assert.match(en, /AI usage/);
  assert.match(en, /Renews on Nov 1/);
  assert.match(en, /October 2026/);
  assert.match(en, /46\.2%/);
  assert.match(en, /1,234\.5/);
  assert.match(en, /of 20,000 points/);
  assert.match(en, /AI Report chat/);
  assert.match(en, /Phạm Đức Huy \(deleted\)/);
  assert.match(en, /Deleted user/);
});

test('usage page (warning / exhausted): plain banners with the renewal date', () => {
  const warning = text(renderUsage('warning', 'vi'));
  assert.match(warning, /Đã dùng 86,4% điểm AI của tháng/);
  assert.match(warning, /tạm dừng đến ngày 01\/11/);
  assert.match(warning, /Sắp hết điểm/);
  assert.match(warning, /Điểm mua thêm/);
  assert.match(warning, /\+5\.000/);
  const exhausted = text(renderUsage('exhausted', 'vi'));
  assert.match(exhausted, /Đã hết điểm AI của tháng/);
  assert.match(exhausted, /Đã dùng hết điểm AI của tháng này\. Liên hệ quản trị viên để mua thêm điểm\./);
  assert.match(exhausted, /Điểm sẽ được làm mới vào ngày 01\/11\./);
  const exhaustedEn = text(renderUsage('exhausted', 'en'));
  assert.match(exhaustedEn, /This month's AI points are used up\. Contact your administrator to buy more points\./);
  assert.match(exhaustedEn, /Points renew on Nov 1\./);
  assert.match(renderUsage('exhausted', 'vi'), /role="alert"/);
});

test('usage page (unlimited / unvalued / empty): no limit, setup not finished, and the calm empty state', () => {
  const unlimited = text(renderUsage('unlimited', 'vi'));
  assert.match(unlimited, /Không giới hạn/);
  assert.match(unlimited, /Dùng thử/);
  assert.doesNotMatch(unlimited, /Còn lại|trên .* điểm|Đã hết điểm/);
  const unvalued = text(renderUsage('unvalued', 'vi'));
  assert.match(unvalued, /Chưa quy đổi được điểm/);
  assert.match(unvalued, /Quản trị viên hệ thống chưa hoàn tất cài đặt cho tháng này/);
  assert.match(unvalued, /Lượt dùng AI trong tháng/);
  assert.match(unvalued, /Tỷ lệ tính theo lượt dùng/);
  assert.match(unvalued, /Chưa vẽ được biểu đồ/);
  const unvaluedEn = text(renderUsage('unvalued', 'en'));
  assert.match(unvaluedEn, /The system administrator has not finished the setup for this month/);
  const empty = text(renderUsage('empty', 'vi'));
  assert.match(empty, /Tháng này chưa dùng AI/);
  assert.doesNotMatch(empty, /Theo ngày|Ai dùng nhiều nhất/);
});

test('loading, error and empty pieces: skeletons (no spinner), a retry button, plain copy', () => {
  env.locale = 'vi';
  const loading = renderToStaticMarkup(h(AiUsageSkeleton));
  assert.match(loading, /aria-busy="true"/);
  assert.doesNotMatch(loading, /animate-spin/);
  const error = renderToStaticMarkup(h(AiUsageError, { onRetry: noop }));
  assert.match(error, /Chưa tải được mức dùng AI/);
  assert.match(error, /<button[^>]*>.*Thử lại<\/button>/);
  env.locale = 'en';
  assert.match(renderToStaticMarkup(h(AiUsageEmpty)), /No AI use this month yet/);
  assert.match(renderToStaticMarkup(h(AiUsageError, { onRetry: noop })), /Try again/);
});

test('route guard: AI usage opens for superadmin, superuser and staff; learner_plus and learners get not found', () => {
  for (const [role, allowed] of [['superadmin', true], ['superuser', true], ['staff', true], ['learner_plus', false], ['learner', false]]) {
    env.user = { id: 'u', role };
    const html = renderToStaticMarkup(h(ModuleGuard, { module: 'ai_usage' }, h('main', null, 'AI_USAGE_PAGE')));
    assert.equal(html.includes('AI_USAGE_PAGE'), allowed, role);
    assert.equal(html.includes('NOT_FOUND'), !allowed, role);
    const plans = renderToStaticMarkup(h(ModuleGuard, { module: 'superadmin_only' }, h('main', null, 'AI_PLANS_PAGE')));
    assert.equal(plans.includes('AI_PLANS_PAGE'), role === 'superadmin', `${role} plans`);
  }
  env.user = null;
  assert.match(renderToStaticMarkup(h(ModuleGuard, { module: 'ai_usage' }, h('main', null, 'x'))), /NOT_FOUND/);
});

test('superadmin overview shows money: revenue, cost in VND and USD, margin, invoice check badges', () => {
  env.locale = 'vi';
  const tenant = (overrides) => ({ tenant_id: 't', tenant_name: 'Nesso', has_month: true, plan_id: 'p', current_plan_id: 'p', plan_name: 'Chuyên nghiệp', is_unlimited: false,
    state: 'warning', percent: 86.4, points_total: 25000, points_used: 21600, topup_points: 5000, cost_usd: 92.4, fx_vnd_per_usd: 26150,
    cost_vnd: 2416260, revenue_vnd: 7500000, margin_vnd: 5083740, margin_percent: 67.8, reconciled_cost_vnd: 2310000, reconciled_note: null,
    reconciled_diff_percent: 4.6, ...overrides });
  const kpis = text(renderToStaticMarkup(h(AiCreditsKpis, { totals: { tenantCount: 2, revenueVnd: 7500000, costUsd: 92.4, costVnd: 2416260,
    marginVnd: 5083740, marginPercent: 67.8, nearLimit: 1, exhausted: 1 } })));
  assert.match(kpis, /Doanh thu/);
  assert.match(kpis, /7\.500\.000 ₫/);
  assert.match(kpis, /92,40 US\$/);
  assert.match(kpis, /67,8%/);
  assert.match(kpis, /1 sắp hết · 1 đã hết/);
  const table = text(renderToStaticMarkup(h(AiCreditsTenantTable, { onOpen: noop, tenants: [
    tenant({}),
    tenant({ tenant_id: 't2', tenant_name: 'Ánh Dương', state: 'exhausted', percent: 100, reconciled_diff_percent: 12.5 }),
    tenant({ tenant_id: 't3', tenant_name: 'Hoà Bình', state: 'ok', reconciled_cost_vnd: null, reconciled_diff_percent: null, margin_vnd: -100000 }),
  ] })));
  assert.match(table, /Khớp hoá đơn/);
  assert.match(table, /Cao hơn hoá đơn \+12,5%/);
  assert.match(table, /Chưa đối soát/);
  assert.match(table, /2\.416\.260 ₫/);
  assert.match(table, /86,4%/);
  assert.match(table, /Chuyên nghiệp/);
  env.locale = 'en';
  assert.match(text(renderToStaticMarkup(h(AiCreditsTenantTable, { onOpen: noop, tenants: [tenant({})] }))), /Matches invoice/);
  env.locale = 'vi';
  const noMonth = text(renderToStaticMarkup(h(AiCreditsTenantTable, { onOpen: noop, tenants: [tenant({ has_month: false, plan_name: null,
    state: 'unvalued', percent: null, points_total: null, points_used: null, revenue_vnd: 0, margin_vnd: null, margin_percent: null,
    reconciled_cost_vnd: null, reconciled_diff_percent: null })] })));
  assert.match(noMonth, /Chưa có dữ liệu tháng này/);
  assert.match(noMonth, /Chưa gán gói/);
  assert.match(noMonth, /Doanh thu — Lợi nhuận —/, 'no revenue or margin is shown for a month without data');
});

test('superadmin exchange-rate notices: none for an own rate, an earlier month in plain words, or no rate at all', () => {
  env.locale = 'vi';
  assert.equal(renderToStaticMarkup(h(AiFxNotice, { month: '2026-10', fxVndPerUsd: 26150, fxRateMonth: '2026-10', onSetFx: noop })), '');
  const inherited = text(renderToStaticMarkup(h(AiFxNotice, { month: '2026-10', fxVndPerUsd: 26150, fxRateMonth: '2026-09', onSetFx: noop })));
  assert.match(inherited, /Tháng 10\/2026 chưa có tỷ giá riêng, đang dùng tỷ giá tháng 9\/2026\./);
  assert.match(inherited, /Nhập tỷ giá tháng này/);
  const missing = text(renderToStaticMarkup(h(AiFxNotice, { month: '2026-10', fxVndPerUsd: null, fxRateMonth: null, onSetFx: noop })));
  assert.match(missing, /Tháng này chưa có tỷ giá: chưa quy đổi được điểm và chưa chặn hạn mức\./);
  env.locale = 'en';
  assert.match(text(renderToStaticMarkup(h(AiFxNotice, { month: '2026-10', fxVndPerUsd: 26150, fxRateMonth: '2026-09' }))),
    /October 2026 has no exchange rate of its own yet; the rate of September 2026 is used\./);
});

test('usage page: a past month without data shows its uses and says it had no points; the picker lists real months only', () => {
  env.locale = 'vi';
  const data = { ...summary('unvalued'), has_month: false, plan: { code: null, name: null, is_unlimited: false },
    points: { plan: null, topup: 0, total: null, used: null, reserved: null, remaining: null }, month: '2026-08',
    // Even if a superadmin payload carried a rate, the tenant view never shows it.
    fx_vnd_per_usd: 26150, fx_rate_month: '2026-07' };
  const html = renderToStaticMarkup(h('div', null, h(AiUsageHeader, { summary: data, month: '2026-08', onMonthChange: noop }), h(AiUsageView, { summary: data })));
  const page = text(html);
  assert.match(page, /Tháng này chưa tính điểm/);
  assert.match(page, /Tháng này chưa áp dụng điểm AI nên không có số điểm\./);
  assert.match(page, /Lượt dùng AI trong tháng/);
  assert.doesNotMatch(page, /Quản trị viên hệ thống chưa hoàn tất cài đặt/);
  assert.doesNotMatch(page, FORBIDDEN_FOR_TENANTS);
  assert.doesNotMatch(page, /26\.150|tỷ giá/i);
  const options = [...html.matchAll(/data-value="([0-9]{4}-[0-9]{2})"/g)].map(match => match[1]);
  assert.deepEqual(options, ['2026-10', '2026-09', '2026-08'], 'months come from available_months');
});
