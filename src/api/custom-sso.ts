import axios from "axios";
import { customApiClient } from "./custom-client";
import { config } from "@/config/env";
import type { CustomLoginResponse } from "./custom-auth";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export type SsoProvider = "google" | "keycloak" | "microsoft365";

export interface SsoConfig {
  provider: SsoProvider;
  label: string;
  is_enabled: boolean;
  client_id: string;
  has_secret: boolean;
  issuer_url: string;
  authorization_url: string;
  token_url: string;
  userinfo_url: string;
  scopes: string[];
  extra_config: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface PublicSsoProvider {
  provider: SsoProvider;
  label: string;
  client_id: string;
  authorization_url: string;
  scopes: string[];
  callback_path: string;
}

export interface PublicSsoConfig {
  tenant_id: string | null;
  tenant_name: string | null;
  providers: PublicSsoProvider[];
}

export interface UpdateSsoConfigPayload {
  is_enabled?: boolean;
  client_id?: string | null;
  client_secret?: string | null;
  clear_client_secret?: boolean;
  issuer_url?: string | null;
  authorization_url?: string | null;
  token_url?: string | null;
  userinfo_url?: string | null;
  scopes?: string[];
  extra_config?: Record<string, unknown>;
}

export async function fetchSsoConfigs(): Promise<SsoConfig[]> {
  const { data } = await customApiClient.get<ApiResponse<SsoConfig[]>>("/api/sso/configs");
  return data.data;
}

export async function updateSsoConfig(provider: SsoProvider, payload: UpdateSsoConfigPayload): Promise<SsoConfig> {
  const { data } = await customApiClient.put<ApiResponse<SsoConfig>>(`/api/sso/configs/${provider}`, payload);
  return data.data;
}

export async function deleteSsoConfig(provider: SsoProvider): Promise<void> {
  await customApiClient.delete(`/api/sso/configs/${provider}`);
}

export async function fetchPublicSsoConfigByDomain(domain: string): Promise<PublicSsoConfig> {
  const { data } = await axios.get<ApiResponse<PublicSsoConfig>>(
    `${config.customApiUrl}/api/sso/public/by-domain/${encodeURIComponent(domain)}`,
    { timeout: 10_000 },
  );
  return data.data;
}

export async function exchangeSsoCode(
  provider: SsoProvider,
  payload: { tenant_id: string; code: string; redirect_uri: string; code_verifier: string; client_app?: "admin" | "learner" },
): Promise<CustomLoginResponse> {
  const { data } = await axios.post<ApiResponse<CustomLoginResponse>>(
    `${config.customApiUrl}/api/sso/exchange/${provider}`,
    payload,
    { headers: { "Content-Type": "application/json" }, timeout: 20_000 },
  );
  return data.data;
}
