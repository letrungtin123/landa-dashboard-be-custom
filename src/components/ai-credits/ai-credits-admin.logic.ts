// Superadmin side of AI points: plan preview math, form checks (plan, FX,
// top-up, reconciliation), overview totals and the reconciliation badge.
import type { AppLocale } from '@/i18n';
import type { AiCreditOverviewTenant, AiCreditPlan, AiCreditPlanCreateInput } from '@/api/ai-credits';
import { decimalInputValue, parseLocaleInteger, parseLocaleNumber } from './ai-credits-format.logic';

// --- Plan value preview ------------------------------------------------------------------------

export interface AiPlanPreviewInput {
  priceVnd: number | null;
  points: number | null;
  /** 0-1 share of the price that may go to the AI provider. */
  costRatio: number | null;
  /** 0-1 kept back for FX moves and estimate drift. */
  bufferRatio: number | null;
  fxVndPerUsd: number | null;
}

export interface AiPlanPreview {
  /** Monthly provider budget: price x ratio x (1 - buffer). */
  providerBudgetVnd: number | null;
  /** What stays with the platform: price - provider budget. */
  marginVnd: number | null;
  marginPercent: number | null;
  /** Provider cost one point may use. */
  pointValueVnd: number | null;
  /** point_value_usd = price x ratio x (1 - buffer) / fx / points; null without an FX rate. */
  pointValueUsd: number | null;
}

function positive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function aiPlanPreview(input: AiPlanPreviewInput): AiPlanPreview {
  const { priceVnd, points, costRatio, bufferRatio, fxVndPerUsd } = input;
  const ratioOk = typeof costRatio === 'number' && costRatio > 0 && costRatio <= 1;
  const bufferOk = typeof bufferRatio === 'number' && bufferRatio >= 0 && bufferRatio < 1;
  const priceOk = typeof priceVnd === 'number' && Number.isFinite(priceVnd) && priceVnd >= 0;
  const providerBudgetVnd = priceOk && ratioOk && bufferOk ? priceVnd * costRatio * (1 - bufferRatio) : null;
  const marginVnd = providerBudgetVnd === null || !priceOk ? null : priceVnd - providerBudgetVnd;
  const marginPercent = marginVnd === null || !positive(priceVnd) ? null : Math.round((marginVnd / priceVnd) * 1000) / 10;
  const pointValueVnd = providerBudgetVnd !== null && providerBudgetVnd > 0 && positive(points) ? providerBudgetVnd / points : null;
  const pointValueUsd = pointValueVnd !== null && positive(fxVndPerUsd) ? pointValueVnd / fxVndPerUsd : null;
  return { providerBudgetVnd, marginVnd, marginPercent, pointValueVnd, pointValueUsd };
}

// --- Plan form ---------------------------------------------------------------------------------

export interface AiPlanDraft {
  code: string;
  name: string;
  description: string;
  price: string;
  points: string;
  /** Percent text, 50 = half of the price. */
  costRatio: string;
  buffer: string;
  isUnlimited: boolean;
  isActive: boolean;
  sortOrder: string;
}

export type AiPlanField = 'code' | 'name' | 'description' | 'price' | 'points' | 'costRatio' | 'buffer' | 'sortOrder';

/** Owner default for a new plan: half of the price for the provider, 10% kept back. */
export const DEFAULT_AI_PLAN_DRAFT: Readonly<AiPlanDraft> = Object.freeze({
  code: '', name: '', description: '', price: '', points: '', costRatio: '50', buffer: '10',
  isUnlimited: false, isActive: true, sortOrder: '0',
});

export const AI_PLAN_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,39}$/;

export function aiPlanDraftFromPlan(plan: AiCreditPlan, locale: AppLocale): AiPlanDraft {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? '',
    price: decimalInputValue(plan.monthly_price_vnd, locale),
    points: decimalInputValue(plan.monthly_points, locale),
    costRatio: decimalInputValue(Number(plan.provider_cost_ratio) * 100, locale),
    buffer: decimalInputValue(Number(plan.safety_buffer_ratio) * 100, locale),
    isUnlimited: plan.is_unlimited,
    isActive: plan.is_active,
    sortOrder: String(plan.sort_order ?? 0),
  };
}

/** Numbers of a draft as typed so far (null where not a number), for the live preview. */
export function aiPlanDraftNumbers(draft: AiPlanDraft, locale: AppLocale): Pick<AiPlanPreviewInput, 'priceVnd' | 'points' | 'costRatio' | 'bufferRatio'> {
  const ratio = parseLocaleNumber(draft.costRatio, locale);
  const buffer = parseLocaleNumber(draft.buffer, locale);
  return {
    priceVnd: parseLocaleInteger(draft.price, locale),
    points: parseLocaleInteger(draft.points, locale),
    costRatio: ratio === null ? null : ratio / 100,
    bufferRatio: buffer === null ? null : buffer / 100,
  };
}

export interface AiPlanValidation {
  /** i18n key per invalid field. */
  errors: Partial<Record<AiPlanField, string>>;
  input: AiCreditPlanCreateInput | null;
}

const PLAN_ERRORS = 'aiCredits.admin.planDialog.errors';

/** Same limits as the backend validator, with plain messages. */
export function validateAiPlanDraft(draft: AiPlanDraft, locale: AppLocale, isNew: boolean): AiPlanValidation {
  const errors: Partial<Record<AiPlanField, string>> = {};
  const code = draft.code.trim();
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (isNew && !AI_PLAN_CODE_PATTERN.test(code)) errors.code = `${PLAN_ERRORS}.code`;
  if (!name) errors.name = `${PLAN_ERRORS}.nameRequired`;
  else if (name.length > 120) errors.name = `${PLAN_ERRORS}.nameTooLong`;
  if (description.length > 1000) errors.description = `${PLAN_ERRORS}.descriptionTooLong`;
  const price = parseLocaleInteger(draft.price, locale);
  if (price === null || price < 0 || price > 1_000_000_000_000) errors.price = `${PLAN_ERRORS}.price`;
  const points = parseLocaleInteger(draft.points, locale);
  if (points === null || points < 1 || points > 1_000_000_000) errors.points = `${PLAN_ERRORS}.points`;
  const ratio = parseLocaleNumber(draft.costRatio, locale);
  if (ratio === null || ratio <= 0 || ratio > 100) errors.costRatio = `${PLAN_ERRORS}.costRatio`;
  const buffer = parseLocaleNumber(draft.buffer, locale);
  if (buffer === null || buffer < 0 || buffer >= 100) errors.buffer = `${PLAN_ERRORS}.buffer`;
  const sortOrder = draft.sortOrder.trim() === '' ? 0 : parseLocaleInteger(draft.sortOrder, locale);
  if (sortOrder === null || sortOrder < 0 || sortOrder > 10_000) errors.sortOrder = `${PLAN_ERRORS}.sortOrder`;
  if (Object.keys(errors).length > 0) return { errors, input: null };
  return {
    errors,
    input: {
      code,
      name,
      description: description || null,
      monthly_price_vnd: price!,
      monthly_points: points!,
      // Ratios travel as 0-1 with at most 4 decimals of a percent.
      provider_cost_ratio: Math.round(ratio! * 10_000) / 1_000_000,
      safety_buffer_ratio: Math.round(buffer! * 10_000) / 1_000_000,
      is_unlimited: draft.isUnlimited,
      is_active: draft.isActive,
      sort_order: sortOrder!,
    },
  };
}

// --- FX, top-up and reconciliation forms -------------------------------------------------------

const FORM_ERRORS = 'aiCredits.admin.formErrors';
const NOTE_MAX = 500;

export function validateAiFxDraft(draft: { month: string; rate: string; note: string }, locale: AppLocale):
  { errors: Partial<Record<'month' | 'rate' | 'note', string>>; input: { month: string; vnd_per_usd: number; source_note: string | null } | null } {
  const errors: Partial<Record<'month' | 'rate' | 'note', string>> = {};
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month)) errors.month = `${FORM_ERRORS}.month`;
  const rate = parseLocaleNumber(draft.rate, locale);
  if (rate === null || rate <= 0 || rate > 1_000_000) errors.rate = `${FORM_ERRORS}.fxRate`;
  if (draft.note.trim().length > NOTE_MAX) errors.note = `${FORM_ERRORS}.noteTooLong`;
  if (Object.keys(errors).length > 0) return { errors, input: null };
  return { errors, input: { month: draft.month, vnd_per_usd: rate!, source_note: draft.note.trim() || null } };
}

export function validateAiTopupDraft(draft: { points: string; price: string; reason: string }, locale: AppLocale):
  { errors: Partial<Record<'points' | 'price' | 'reason', string>>; input: { points: number; price_vnd: number | null; reason: string | null } | null } {
  const errors: Partial<Record<'points' | 'price' | 'reason', string>> = {};
  const points = parseLocaleInteger(draft.points, locale);
  if (points === null || points < 1 || points > 100_000_000) errors.points = `${FORM_ERRORS}.topupPoints`;
  const price = draft.price.trim() === '' ? null : parseLocaleInteger(draft.price, locale);
  if (draft.price.trim() !== '' && (price === null || price < 0 || price > 1_000_000_000_000)) errors.price = `${FORM_ERRORS}.amountVnd`;
  if (draft.reason.trim().length > NOTE_MAX) errors.reason = `${FORM_ERRORS}.noteTooLong`;
  if (Object.keys(errors).length > 0) return { errors, input: null };
  return { errors, input: { points: points!, price_vnd: price, reason: draft.reason.trim() || null } };
}

export function validateAiReconcileDraft(draft: { cost: string; note: string }, locale: AppLocale):
  { errors: Partial<Record<'cost' | 'note', string>>; input: { cost_vnd: number; note: string | null } | null } {
  const errors: Partial<Record<'cost' | 'note', string>> = {};
  const cost = parseLocaleInteger(draft.cost, locale);
  if (cost === null || cost < 0 || cost > 1_000_000_000_000) errors.cost = `${FORM_ERRORS}.amountVnd`;
  if (draft.note.trim().length > NOTE_MAX) errors.note = `${FORM_ERRORS}.noteTooLong`;
  if (Object.keys(errors).length > 0) return { errors, input: null };
  return { errors, input: { cost_vnd: cost!, note: draft.note.trim() || null } };
}

// --- Overview ---------------------------------------------------------------------------------

export interface AiOverviewTotals {
  tenantCount: number;
  revenueVnd: number;
  costUsd: number;
  /** Null when some cost cannot be converted (no FX rate). */
  costVnd: number | null;
  marginVnd: number | null;
  marginPercent: number | null;
  /** From 80% of the month's points. */
  nearLimit: number;
  exhausted: number;
}

export function aiOverviewTotals(tenants: readonly AiCreditOverviewTenant[]): AiOverviewTotals {
  let revenueVnd = 0, costUsd = 0, costVnd: number | null = 0, nearLimit = 0, exhausted = 0;
  for (const tenant of tenants) {
    revenueVnd += tenant.revenue_vnd || 0;
    costUsd += tenant.cost_usd || 0;
    if (tenant.cost_vnd === null) {
      if ((tenant.cost_usd || 0) > 0) costVnd = null;
    } else if (costVnd !== null) costVnd += tenant.cost_vnd;
    if (tenant.state === 'warning') nearLimit += 1;
    if (tenant.state === 'exhausted') exhausted += 1;
  }
  const marginVnd = costVnd === null ? null : revenueVnd - costVnd;
  const marginPercent = marginVnd === null || revenueVnd <= 0 ? null : Math.round((marginVnd / revenueVnd) * 1000) / 10;
  return {
    tenantCount: tenants.length, revenueVnd, costUsd: Math.round(costUsd * 1e6) / 1e6, costVnd, marginVnd, marginPercent,
    nearLimit, exhausted,
  };
}

export type AiFxNoticeKind = 'own' | 'inherited' | 'missing';

/** missing = no rate at all; inherited = the rate of an earlier month is used; own = the month has its own rate. */
export function aiFxNoticeKind(input: { month: string; fxVndPerUsd: number | null | undefined; fxRateMonth: string | null | undefined }): AiFxNoticeKind {
  if (input.fxVndPerUsd === null || input.fxVndPerUsd === undefined || !(input.fxVndPerUsd > 0)) return 'missing';
  return input.fxRateMonth && input.fxRateMonth < input.month ? 'inherited' : 'own';
}

/** Our estimate within 5% of the provider's invoice counts as matching. */
export const AI_RECONCILIATION_TOLERANCE_PERCENT = 5;

export type AiReconciliationStatus = 'none' | 'match' | 'over' | 'under';

/** none = not entered yet; over = our estimate is above the invoice; under = below it. */
export function aiReconciliationStatus(tenant: Pick<AiCreditOverviewTenant, 'reconciled_cost_vnd' | 'reconciled_diff_percent'>): AiReconciliationStatus {
  if (tenant.reconciled_cost_vnd === null) return 'none';
  const diff = tenant.reconciled_diff_percent;
  if (diff === null || Math.abs(diff) <= AI_RECONCILIATION_TOLERANCE_PERCENT) return 'match';
  return diff > 0 ? 'over' : 'under';
}
