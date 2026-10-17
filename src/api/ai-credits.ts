// AI points ("Điểm AI"): the tenant usage page and the superadmin plans,
// FX rates, overview, top-ups and reconciliation (backend /api/ai-credits).
// Tenant data is in points and percent only; money is superadmin-only.
import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import type { ApiResponse } from './api-response';

export type AiCreditState = 'unlimited' | 'unvalued' | 'ok' | 'warning' | 'exhausted';

export interface AiUsageFeature {
  feature: string;
  points: number | null;
  calls: number;
}

export interface AiUsageDaily {
  date: string;
  feature: string;
  points: number | null;
}

export interface AiUsageUser {
  user_key: string;
  name: string | null;
  email: string | null;
  deleted: boolean;
  /** Work done without a person (for example document processing). */
  system: boolean;
  points: number | null;
  calls: number;
  features: Record<string, number | null>;
}

export interface AiUsageUserDaily {
  date: string;
  user_key: string;
  points: number | null;
}

export interface AiUsageSummary {
  month: string;
  /** Newest first; includes the current month. */
  months: string[];
  /** Months that have usage or a credit row, newest first, always with the current month (the month picker). */
  available_months: string[];
  /** False for a past month without a credit row: its uses show, its points cannot be counted. */
  has_month: boolean;
  resets_on: string;
  plan: { code: string | null; name: string | null; is_unlimited: boolean };
  state: AiCreditState;
  /** 0-100 with one decimal; null when unlimited or unvalued. */
  percent: number | null;
  points: {
    plan: number | null;
    topup: number;
    total: number | null;
    used: number | null;
    reserved: number | null;
    remaining: number | null;
  };
  features: AiUsageFeature[];
  daily: AiUsageDaily[];
  /** Sorted by points, at most 100. */
  users: AiUsageUser[];
  /** Top 8 users only; a person's days add up to the person's points. */
  user_daily: AiUsageUserDaily[];
  /** Superadmin view only (/admin/tenants/:id/usage): the month's rate and the month it was set for. */
  fx_vnd_per_usd?: number | null;
  fx_rate_month?: string | null;
}

/** The plan a tenant has now (its account, else the default plan). */
export interface AiTenantPlan {
  id: string;
  code: string;
  name: string;
  is_unlimited: boolean;
  monthly_points: string;
  monthly_price_vnd: string;
  /** False when the tenant has no plan of its own and uses the default one. */
  assigned: boolean;
}

export interface AiCreditPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** Decimal strings (PostgreSQL numeric / bigint). */
  monthly_price_vnd: string;
  monthly_points: string;
  provider_cost_ratio: string;
  safety_buffer_ratio: string;
  is_unlimited: boolean;
  is_active: boolean;
  sort_order: number;
  tenant_count: number;
}

export interface AiCreditPlanInput {
  name: string;
  description?: string | null;
  monthly_price_vnd: number;
  monthly_points: number;
  provider_cost_ratio: number;
  safety_buffer_ratio: number;
  is_unlimited: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface AiCreditPlanCreateInput extends AiCreditPlanInput {
  code: string;
}

export interface AiFxRate {
  month: string;
  vnd_per_usd: string;
  source_note: string | null;
  updated_at: string;
}

export interface AiCreditOverviewTenant {
  tenant_id: string;
  tenant_name: string;
  /** False when the tenant has no credit row that month (no plan, points or revenue; cost from the ledger). */
  has_month: boolean;
  /** Plan of that month (snapshot). */
  plan_id: string | null;
  /** Plan the tenant has now. */
  current_plan_id: string | null;
  plan_name: string | null;
  is_unlimited: boolean;
  state: AiCreditState;
  percent: number | null;
  points_total: number | null;
  points_used: number | null;
  topup_points: number;
  cost_usd: number;
  fx_vnd_per_usd: number | null;
  cost_vnd: number | null;
  revenue_vnd: number;
  margin_vnd: number | null;
  margin_percent: number | null;
  reconciled_cost_vnd: number | null;
  reconciled_note: string | null;
  reconciled_diff_percent: number | null;
}

export interface AiCreditOverview {
  month: string;
  /** Months with credit rows, newest first, always with the current month. */
  available_months: string[];
  fx_vnd_per_usd: number | null;
  /** Month the rate was set for: earlier than `month` when this month has no rate of its own. */
  fx_rate_month: string | null;
  tenants: AiCreditOverviewTenant[];
}

export interface AiCreditTopupInput {
  points: number;
  price_vnd?: number | null;
  reason?: string | null;
}

export interface AiCreditReconciliationInput {
  cost_vnd: number;
  note?: string | null;
}

function monthParams(month?: string | null): AxiosRequestConfig['params'] {
  return month ? { month } : undefined;
}

function tenantHeader(tenantId?: string | null): AxiosRequestConfig['headers'] {
  return tenantId ? { 'X-Tenant-Id': tenantId } : undefined;
}

const ADMIN = '/api/ai-credits/admin';
const segment = encodeURIComponent;

export const aiCreditsApi = {
  /** Usage page of the caller's tenant; a superadmin passes the switcher tenant explicitly. */
  async usage(month?: string | null, tenantId?: string | null): Promise<AiUsageSummary> {
    const response = await customApiClient.get<ApiResponse<AiUsageSummary>>('/api/ai-credits/usage', {
      params: monthParams(month),
      headers: tenantHeader(tenantId),
    });
    return response.data.data;
  },

  async listPlans(): Promise<AiCreditPlan[]> {
    const response = await customApiClient.get<ApiResponse<AiCreditPlan[]>>(`${ADMIN}/plans`);
    return response.data.data;
  },

  async createPlan(input: AiCreditPlanCreateInput): Promise<{ id: string }> {
    const response = await customApiClient.post<ApiResponse<{ id: string }>>(`${ADMIN}/plans`, input);
    return response.data.data;
  },

  async updatePlan(planId: string, input: AiCreditPlanInput): Promise<{ id: string }> {
    const response = await customApiClient.put<ApiResponse<{ id: string }>>(`${ADMIN}/plans/${segment(planId)}`, input);
    return response.data.data;
  },

  async listFx(): Promise<AiFxRate[]> {
    const response = await customApiClient.get<ApiResponse<AiFxRate[]>>(`${ADMIN}/fx`);
    return response.data.data;
  },

  async setFx(month: string, input: { vnd_per_usd: number; source_note?: string | null }): Promise<{ month: string; recomputed: number }> {
    const response = await customApiClient.put<ApiResponse<{ month: string; recomputed: number }>>(`${ADMIN}/fx/${segment(month)}`, input);
    return response.data.data;
  },

  async overview(month?: string | null): Promise<AiCreditOverview> {
    const response = await customApiClient.get<ApiResponse<AiCreditOverview>>(`${ADMIN}/overview`, { params: monthParams(month) });
    return response.data.data;
  },

  async tenantUsage(tenantId: string, month?: string | null): Promise<AiUsageSummary> {
    const response = await customApiClient.get<ApiResponse<AiUsageSummary>>(`${ADMIN}/tenants/${segment(tenantId)}/usage`, {
      params: monthParams(month),
    });
    return response.data.data;
  },

  /** Light read for the tenant edit form; null when no plan exists at all. */
  async tenantPlan(tenantId: string): Promise<AiTenantPlan | null> {
    const response = await customApiClient.get<ApiResponse<AiTenantPlan | null>>(`${ADMIN}/tenants/${segment(tenantId)}/plan`);
    return response.data.data;
  },

  async setTenantPlan(tenantId: string, planId: string): Promise<{ tenantName: string; planName: string }> {
    const response = await customApiClient.put<ApiResponse<{ tenantName: string; planName: string }>>(
      `${ADMIN}/tenants/${segment(tenantId)}/plan`, { plan_id: planId });
    return response.data.data;
  },

  async addTopup(tenantId: string, input: AiCreditTopupInput): Promise<{ id: string; tenantName: string; month: string }> {
    const response = await customApiClient.post<ApiResponse<{ id: string; tenantName: string; month: string }>>(
      `${ADMIN}/tenants/${segment(tenantId)}/topups`, input);
    return response.data.data;
  },

  async reconcile(tenantId: string, month: string, input: AiCreditReconciliationInput): Promise<{ tenantName: string; month: string }> {
    const response = await customApiClient.put<ApiResponse<{ tenantName: string; month: string }>>(
      `${ADMIN}/tenants/${segment(tenantId)}/months/${segment(month)}/reconciliation`, input);
    return response.data.data;
  },
};

export type AiCreditsApi = typeof aiCreditsApi;
