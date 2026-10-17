// Development preview only (imported by pages/dev-ai-credits-preview.tsx,
// which production builds drop). In-memory AI points API with made-up data
// for every page state; it never calls the backend.
import type {
  AiCreditOverview, AiCreditOverviewTenant, AiCreditPlan, AiCreditState, AiCreditsApi, AiFxRate, AiUsageSummary, AiUsageUser,
} from '@/api/ai-credits';
import { daysOfMonth, platformMonth, shiftMonth } from './ai-credits-format.logic';

export const AI_CREDITS_PREVIEW_SCENARIOS = ['ok', 'warning', 'exhausted', 'unlimited', 'unvalued', 'empty', 'loading', 'error'] as const;
export type AiCreditsPreviewScenario = typeof AI_CREDITS_PREVIEW_SCENARIOS[number];

/** Deterministic pseudo-random numbers so every reload looks the same. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

const PEOPLE: Array<Pick<AiUsageUser, 'name' | 'email' | 'deleted' | 'system'>> = [
  { name: 'Nguyễn Minh Anh', email: 'minhanh@nesso.vn', deleted: false, system: false },
  { name: 'Trần Quốc Bảo', email: 'quocbao@nesso.vn', deleted: false, system: false },
  { name: null, email: null, deleted: false, system: true },
  { name: 'Lê Thu Hà', email: 'thuha@nesso.vn', deleted: false, system: false },
  { name: 'Phạm Đức Huy', email: 'duchuy@nesso.vn', deleted: true, system: false },
  { name: 'Võ Ngọc Lan', email: 'ngoclan@nesso.vn', deleted: false, system: false },
  { name: 'Đặng Hoàng Nam', email: 'hoangnam@nesso.vn', deleted: false, system: false },
  { name: 'Bùi Khánh Linh', email: 'khanhlinh@nesso.vn', deleted: false, system: false },
  { name: 'Hồ Thanh Tùng', email: 'thanhtung@nesso.vn', deleted: false, system: false },
  { name: 'Ngô Mai Phương', email: 'maiphuong@nesso.vn', deleted: false, system: false },
  { name: null, email: null, deleted: true, system: false },
  { name: 'Dương Gia Khang', email: 'giakhang@nesso.vn', deleted: false, system: false },
  { name: 'Lý Bảo Ngọc', email: 'baongoc@nesso.vn', deleted: false, system: false },
  { name: 'Trịnh Văn Sơn', email: 'vanson@nesso.vn', deleted: false, system: false },
];

const FEATURE_WEIGHTS: Array<[string, number]> = [
  ['ai_id', 0.38], ['chat', 0.2], ['report_chat_router', 0.04], ['report_chat_narrative', 0.08],
  ['report_pdf_narrative', 0.07], ['document_indexing', 0.15], ['video_transcription', 0.06], ['image_alt_text', 0.02],
];

/** Splits a total (one decimal) over weights so the parts add up exactly, like the backend (largest remainder in tenths). */
function splitTenths(total: number, weights: number[]): number[] {
  const units = Math.max(0, Math.round(total * 10));
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, index) => (index === 0 ? units / 10 : 0));
  const exact = weights.map(weight => (units * weight) / sum);
  const parts = exact.map(value => Math.floor(value));
  let rest = units - parts.reduce((acc, part) => acc + part, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - parts[index] })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; rest > 0 && index < order.length; index += 1, rest -= 1) parts[order[index].index] += 1;
  return parts.map(part => part / 10);
}

const SCENARIO_PERCENT: Partial<Record<AiCreditsPreviewScenario, number>> = { ok: 46.2, warning: 86.4, exhausted: 100, unlimited: 0, unvalued: 0 };

/** Usage summary of one month for a scenario. */
export function previewUsageSummary(scenario: AiCreditsPreviewScenario, month: string | null, now = new Date()): AiUsageSummary {
  const current = platformMonth(now);
  const shown = month ?? current;
  const months = [0, 1, 2, 3, 4].map(offset => shiftMonth(current, -offset));
  const isCurrent = shown === current;
  // Months older than two back predate AI points: no credit row, uses only.
  const hasMonth = months.indexOf(shown) <= 2;
  const lastDay = isCurrent ? Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit' }).format(now)) : daysOfMonth(shown).length;
  const days = daysOfMonth(shown).slice(0, lastDay);
  const empty = scenario === 'empty';
  const valued = scenario !== 'unvalued' && hasMonth;
  const unlimited = scenario === 'unlimited';
  const planPoints = unlimited ? null : 20_000;
  const topup = scenario === 'warning' || scenario === 'exhausted' ? 5_000 : 0;
  const total = planPoints === null ? null : planPoints + topup;
  const percent = SCENARIO_PERCENT[scenario] ?? 0;
  // An unvalued month still has uses; only their point value is unknown.
  const share = scenario === 'unvalued' || !hasMonth ? 52 : percent;
  const usedTarget = empty ? 0 : total !== null ? round1(total * (share / 100) * (isCurrent ? 1 : 0.8)) : 13_642.5;
  const rand = random(shown.split('-').reduce((sum, part) => sum + Number(part), 0) * 97 + scenario.length);

  // Raw random spread, then scaled so the month adds up to the scenario's share of points.
  const raw: Array<{ date: string; feature: string; points: number }> = [];
  if (!empty) {
    days.forEach((date, index) => {
      const dayWeight = 0.4 + rand() + (index % 7 === 5 || index % 7 === 6 ? -0.25 : 0.2);
      for (const [feature, weight] of FEATURE_WEIGHTS) {
        if (rand() < 0.18) continue;
        raw.push({ date, feature, points: dayWeight * weight * (0.6 + rand() * 0.8) });
      }
    });
  }
  const rawSum = raw.reduce((sum, item) => sum + item.points, 0);
  const scale = rawSum > 0 ? usedTarget / rawSum : 0;
  const daily: AiUsageSummary['daily'] = [];
  const featureTotals = new Map<string, { points: number; calls: number }>();
  for (const item of raw) {
    const points = round1(item.points * scale);
    if (points <= 0) continue;
    daily.push({ date: item.date, feature: item.feature, points: valued ? points : null });
    const entry = featureTotals.get(item.feature) ?? { points: 0, calls: 0 };
    entry.points = round1(entry.points + points);
    entry.calls += Math.max(1, Math.round(points / (item.feature === 'ai_id' ? 120 : 9)));
    featureTotals.set(item.feature, entry);
  }
  const features = [...featureTotals.entries()]
    .map(([feature, entry]) => ({ feature, points: valued ? entry.points : null, calls: entry.calls }))
    .sort((a, b) => (b.points ?? b.calls) - (a.points ?? a.calls));
  const used = round1([...featureTotals.values()].reduce((sum, entry) => sum + entry.points, 0));

  const shares = PEOPLE.map((_, index) => Math.pow(0.72, index) * (0.7 + rand() * 0.6));
  const shareSum = shares.reduce((sum, share) => sum + share, 0);
  const people = empty ? [] : PEOPLE.map((person, index) => ({ person, index, points: round1(used * (shares[index] / shareSum)) }))
    .sort((a, b) => b.points - a.points);
  const users: AiUsageUser[] = people.map(({ person, index, points }) => {
    const used = FEATURE_WEIGHTS.filter(([feature]) => (person.system ? feature === 'document_indexing' || feature === 'video_transcription' : rand() >= 0.3));
    const parts = splitTenths(points, used.map(([, weight]) => weight * (0.5 + rand())));
    const features = Object.fromEntries(used.map(([feature], part) => [feature, valued ? parts[part] : null]));
    return { user_key: person.system ? 'system' : `user-${index + 1}`, ...person, points: valued ? points : null,
      calls: Math.max(1, Math.round(points / 14)), features };
  });

  // A person's days add up exactly to the person's points (the backend guarantees the same).
  const userDaily: AiUsageSummary['user_daily'] = [];
  for (const { person, index, points } of people.slice(0, 8)) {
    const key = person.system ? 'system' : `user-${index + 1}`;
    const active = days.filter(() => rand() >= 0.22);
    const parts = splitTenths(points, active.map(() => 0.3 + rand() * 1.4));
    active.forEach((date, part) => userDaily.push({ date, user_key: key, points: valued ? parts[part] : null }));
  }

  const state: AiCreditState = !hasMonth ? 'unvalued' : scenario === 'empty' ? 'ok' : scenario === 'loading' || scenario === 'error' ? 'ok' : scenario;
  const reserved = scenario === 'ok' || scenario === 'warning' ? 184.5 : 0;
  return {
    month: shown,
    months,
    available_months: months,
    has_month: hasMonth,
    resets_on: `${shiftMonth(shown, 1)}-01`,
    plan: !hasMonth ? { code: null, name: null, is_unlimited: false }
      : unlimited ? { code: 'demo_unlimited', name: 'Dùng thử', is_unlimited: true } : { code: 'pro', name: 'Chuyên nghiệp', is_unlimited: false },
    state,
    percent: unlimited || !valued ? null : empty ? 0 : percent,
    points: {
      plan: hasMonth ? planPoints : null,
      topup: hasMonth ? topup : 0,
      total: hasMonth ? total : null,
      used: valued ? (empty ? 0 : used) : null,
      reserved: valued ? reserved : null,
      remaining: unlimited || !valued || total === null ? null : Math.max(0, round1(total - used - reserved)),
    },
    features,
    daily,
    users,
    user_daily: userDaily,
  };
}

const PLANS: AiCreditPlan[] = [
  { id: 'plan-trial', code: 'demo_unlimited', name: 'Dùng thử', description: 'Dùng thử không giới hạn trong giai đoạn triển khai.', monthly_price_vnd: '0', monthly_points: '1000', provider_cost_ratio: '0.5', safety_buffer_ratio: '0.1', is_unlimited: true, is_active: true, sort_order: 0, tenant_count: 2 },
  { id: 'plan-basic', code: 'basic', name: 'Cơ bản', description: 'Cho đơn vị nhỏ, dùng trợ lý AI và báo cáo.', monthly_price_vnd: '2000000.00', monthly_points: '5000', provider_cost_ratio: '0.5', safety_buffer_ratio: '0.1', is_unlimited: false, is_active: true, sort_order: 1, tenant_count: 3 },
  { id: 'plan-pro', code: 'pro', name: 'Chuyên nghiệp', description: 'Tạo khoá học bằng AI ID và xử lý tài liệu thường xuyên.', monthly_price_vnd: '6000000.00', monthly_points: '20000', provider_cost_ratio: '0.45', safety_buffer_ratio: '0.1', is_unlimited: false, is_active: true, sort_order: 2, tenant_count: 4 },
  { id: 'plan-enterprise', code: 'enterprise', name: 'Doanh nghiệp', description: null, monthly_price_vnd: '15000000.00', monthly_points: '60000', provider_cost_ratio: '0.4', safety_buffer_ratio: '0.12', is_unlimited: false, is_active: true, sort_order: 3, tenant_count: 1 },
  { id: 'plan-legacy', code: 'legacy-2025', name: 'Gói cũ 2025', description: 'Không bán nữa.', monthly_price_vnd: '3000000.00', monthly_points: '8000', provider_cost_ratio: '0.5', safety_buffer_ratio: '0.1', is_unlimited: false, is_active: false, sort_order: 9, tenant_count: 0 },
];

function previewFx(now: Date): AiFxRate[] {
  const current = platformMonth(now);
  return [1, 2, 3, 4].map((offset, index) => ({
    month: shiftMonth(current, -offset),
    vnd_per_usd: String(26_150 - index * 85),
    source_note: index === 0 ? 'Theo hoá đơn Google' : null,
    updated_at: new Date(now.getTime() - offset * 28 * 86_400_000).toISOString(),
  }));
}

const TENANTS: Array<{ id: string; name: string; plan: string; state: AiCreditState; percent: number | null; usd: number; reconciled: number | null }> = [
  { id: 't-1', name: 'Công ty Cổ phần Nesso', plan: 'plan-pro', state: 'warning', percent: 86.4, usd: 92.4, reconciled: 2_310_000 },
  { id: 't-2', name: 'Ngân hàng Sao Việt', plan: 'plan-enterprise', state: 'ok', percent: 41.7, usd: 186.2, reconciled: 4_560_000 },
  { id: 't-3', name: 'Học viện Ánh Dương', plan: 'plan-basic', state: 'exhausted', percent: 100, usd: 41.8, reconciled: null },
  { id: 't-4', name: 'Bệnh viện Hoà Bình', plan: 'plan-pro', state: 'ok', percent: 23.1, usd: 24.6, reconciled: 690_000 },
  { id: 't-5', name: 'Demo nội bộ', plan: 'plan-trial', state: 'unlimited', percent: null, usd: 12.3, reconciled: null },
  { id: 't-6', name: 'Trường Quốc tế Minh Tâm', plan: 'plan-basic', state: 'warning', percent: 81.2, usd: 33.9, reconciled: null },
];

function previewOverview(scenario: AiCreditsPreviewScenario, month: string | null, now: Date, topups: Map<string, number>,
  tenantPlans: Map<string, string>, rates: readonly AiFxRate[]): AiCreditOverview {
  const current = platformMonth(now);
  const shown = month ?? current;
  // Credit rows exist for the last three months; the newest tenant joined this month.
  const available = [0, 1, 2].map(offset => shiftMonth(current, -offset));
  const rate = [...rates].sort((a, b) => b.month.localeCompare(a.month)).find(item => item.month <= shown) ?? null;
  const fx = scenario === 'unvalued' || !rate ? null : Number(rate.vnd_per_usd);
  const tenants: AiCreditOverviewTenant[] = (scenario === 'empty' ? [] : TENANTS).map(tenant => {
    if ((shown !== current && tenant.id === 't-6') || !available.includes(shown)) {
      const costVnd = fx === null ? null : Math.round(tenant.usd * 0.4 * fx);
      return { tenant_id: tenant.id, tenant_name: tenant.name, has_month: false, plan_id: null, current_plan_id: tenant.plan, plan_name: null,
        is_unlimited: false, state: 'unvalued' as const, percent: null, points_total: null, points_used: null, topup_points: 0,
        cost_usd: round1(tenant.usd * 0.4), fx_vnd_per_usd: fx, cost_vnd: costVnd, revenue_vnd: 0, margin_vnd: null, margin_percent: null,
        reconciled_cost_vnd: null, reconciled_note: null, reconciled_diff_percent: null };
    }
    const plan = PLANS.find(item => item.id === (tenantPlans.get(tenant.id) ?? tenant.plan)) ?? PLANS[0];
    const planPoints = plan.is_unlimited ? null : Number(plan.monthly_points);
    const topup = topups.get(tenant.id) ?? 0;
    const total = planPoints === null ? null : planPoints + topup;
    const state: AiCreditState = scenario === 'unvalued' && tenant.state !== 'unlimited' ? 'unvalued' : tenant.state;
    const costVnd = fx === null ? null : Math.round(tenant.usd * fx);
    const revenue = Number(plan.monthly_price_vnd) + (topup > 0 ? topup * 300 : 0);
    const pointsUsed = fx === null || total === null ? (plan.is_unlimited && fx !== null ? round1(tenant.usd * 110) : null) : round1(total * (tenant.percent ?? 0) / 100);
    return {
      tenant_id: tenant.id, tenant_name: tenant.name, has_month: true, plan_id: plan.id, current_plan_id: plan.id, plan_name: plan.name,
      is_unlimited: plan.is_unlimited, state, percent: state === 'unvalued' || state === 'unlimited' ? null : tenant.percent,
      points_total: total, points_used: pointsUsed, topup_points: topup, cost_usd: tenant.usd, fx_vnd_per_usd: fx, cost_vnd: costVnd,
      revenue_vnd: revenue, margin_vnd: costVnd === null ? null : revenue - costVnd,
      margin_percent: costVnd === null || revenue <= 0 ? null : round1(((revenue - costVnd) / revenue) * 100),
      reconciled_cost_vnd: tenant.reconciled, reconciled_note: tenant.reconciled ? 'Hoá đơn Google tháng trước' : null,
      reconciled_diff_percent: tenant.reconciled === null || costVnd === null ? null : round1(((costVnd - tenant.reconciled) / tenant.reconciled) * 100),
    };
  });
  return { month: shown, available_months: available, fx_vnd_per_usd: fx, fx_rate_month: fx === null ? null : rate?.month ?? null, tenants };
}

const NEVER = () => new Promise<never>(() => undefined);
const wait = <T,>(value: T, ms = 380) => new Promise<T>(resolve => { setTimeout(() => resolve(structuredClone(value)), ms); });

/** In-memory API for one scenario: loading never answers, error refuses, the rest answer with mock data. */
export function createAiCreditsPreviewApi(scenario: AiCreditsPreviewScenario, now = new Date()): AiCreditsApi {
  const plans = scenario === 'empty' ? [] : PLANS.map(plan => ({ ...plan }));
  const fx = scenario === 'empty' || scenario === 'unvalued' ? [] : previewFx(now);
  const topups = new Map<string, number>();
  const tenantPlans = new Map(TENANTS.map(tenant => [tenant.id, tenant.plan]));
  const answer = <T,>(value: () => T): Promise<T> => {
    if (scenario === 'loading') return NEVER();
    if (scenario === 'error') return Promise.reject({ response: { status: 400, data: { success: false, message: 'Preview error' } } });
    return wait(value());
  };
  const done = <T,>(value: T): Promise<T> => wait(value, 500);
  return {
    usage: month => answer(() => previewUsageSummary(scenario, month ?? null, now)),
    tenantUsage: (_tenantId, month) => answer(() => {
      const summary = previewUsageSummary(scenario === 'empty' ? 'empty' : 'ok', month ?? null, now);
      const rate = [...fx].sort((a, b) => b.month.localeCompare(a.month)).find(item => item.month <= summary.month) ?? null;
      // The superadmin view carries the month's rate and the month it was set for.
      return { ...summary, fx_vnd_per_usd: rate ? Number(rate.vnd_per_usd) : null, fx_rate_month: rate?.month ?? null };
    }),
    listPlans: () => answer(() => plans),
    listFx: () => answer(() => fx),
    overview: month => answer(() => previewOverview(scenario, month ?? null, now, topups, tenantPlans, fx)),
    tenantPlan: tenantId => answer(() => {
      const plan = PLANS.find(item => item.id === (tenantPlans.get(tenantId) ?? 'plan-pro')) ?? PLANS[0];
      return { id: plan.id, code: plan.code, name: plan.name, is_unlimited: plan.is_unlimited, monthly_points: plan.monthly_points,
        monthly_price_vnd: plan.monthly_price_vnd, assigned: true };
    }),
    createPlan: input => {
      const id = `plan-${input.code}`;
      plans.push({ id, code: input.code, name: input.name, description: input.description ?? null, monthly_price_vnd: String(input.monthly_price_vnd),
        monthly_points: String(input.monthly_points), provider_cost_ratio: String(input.provider_cost_ratio), safety_buffer_ratio: String(input.safety_buffer_ratio),
        is_unlimited: input.is_unlimited, is_active: input.is_active, sort_order: input.sort_order, tenant_count: 0 });
      return done({ id });
    },
    updatePlan: (planId, input) => {
      const plan = plans.find(item => item.id === planId);
      if (plan) Object.assign(plan, { ...input, monthly_price_vnd: String(input.monthly_price_vnd), monthly_points: String(input.monthly_points),
        provider_cost_ratio: String(input.provider_cost_ratio), safety_buffer_ratio: String(input.safety_buffer_ratio), description: input.description ?? null });
      return done({ id: planId });
    },
    setFx: (month, input) => {
      const existing = fx.find(item => item.month === month);
      if (existing) Object.assign(existing, { vnd_per_usd: String(input.vnd_per_usd), source_note: input.source_note ?? null, updated_at: new Date().toISOString() });
      else fx.unshift({ month, vnd_per_usd: String(input.vnd_per_usd), source_note: input.source_note ?? null, updated_at: new Date().toISOString() });
      fx.sort((a, b) => b.month.localeCompare(a.month));
      return done({ month, recomputed: 6 });
    },
    setTenantPlan: (tenantId, planId) => {
      tenantPlans.set(tenantId, planId);
      return done({ tenantName: TENANTS.find(item => item.id === tenantId)?.name ?? '', planName: PLANS.find(item => item.id === planId)?.name ?? '' });
    },
    addTopup: (tenantId, input) => {
      topups.set(tenantId, (topups.get(tenantId) ?? 0) + input.points);
      return done({ id: `topup-${Date.now()}`, tenantName: TENANTS.find(item => item.id === tenantId)?.name ?? '', month: platformMonth(now) });
    },
    reconcile: (tenantId, month) => done({ tenantName: TENANTS.find(item => item.id === tenantId)?.name ?? '', month }),
  };
}
