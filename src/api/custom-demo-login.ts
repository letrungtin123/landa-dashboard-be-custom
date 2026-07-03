import { customApiClient } from "./custom-client";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface DemoLoginSettings {
  tenant_id: string;
  is_enabled: boolean;
  max_demo_accounts: number;
  reservation_ttl_seconds: number;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DemoLoginTenant {
  id: string;
  name: string;
  domain_learner: string | null;
  is_active: boolean;
}

export interface DemoLoginAccount {
  id: string;
  user_id: string;
  label: string;
  custom_label: string | null;
  sort_order: number;
  reserved_until: string | null;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  role: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface DemoLoginConfig {
  tenant: DemoLoginTenant;
  settings: DemoLoginSettings;
  accounts: DemoLoginAccount[];
}

export interface EligibleDemoLearner {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
}

export interface PaginatedDemoLearners {
  data: EligibleDemoLearner[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function fetchDemoLoginConfig(tenantId: string): Promise<DemoLoginConfig> {
  const { data } = await customApiClient.get<ApiResponse<DemoLoginConfig>>(
    `/api/demo-login/admin/${tenantId}/config`,
  );
  return data.data;
}

export async function updateDemoLoginConfig(
  tenantId: string,
  payload: Partial<Pick<DemoLoginSettings, "is_enabled" | "max_demo_accounts" | "reservation_ttl_seconds">>,
): Promise<DemoLoginConfig> {
  const { data } = await customApiClient.put<ApiResponse<DemoLoginConfig>>(
    `/api/demo-login/admin/${tenantId}/config`,
    payload,
  );
  return data.data;
}

export async function fetchEligibleDemoLearners(
  tenantId: string,
  params?: { search?: string; page?: number; page_size?: number },
): Promise<PaginatedDemoLearners> {
  const { data } = await customApiClient.get<ApiResponse<PaginatedDemoLearners>>(
    `/api/demo-login/admin/${tenantId}/eligible-learners`,
    { params },
  );
  return data.data;
}

export async function replaceDemoLoginAccounts(
  tenantId: string,
  accounts: Array<{ user_id: string; label?: string | null }>,
): Promise<DemoLoginConfig> {
  const { data } = await customApiClient.put<ApiResponse<DemoLoginConfig>>(
    `/api/demo-login/admin/${tenantId}/accounts`,
    { accounts },
  );
  return data.data;
}

export async function deleteDemoLoginAccount(tenantId: string, accountId: string): Promise<void> {
  await customApiClient.delete(`/api/demo-login/admin/${tenantId}/accounts/${accountId}`);
}
