// ═══════════════════════════════════════════════════════════════
// Custom Audit Logs API — List + filters
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export interface AuditLog {
  id: string;
  actor_username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
  entity_type: string;
  entity_name: string;
  entity_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface AuditLogsParams {
  page?: number;
  page_size?: number;
  search?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
}

export interface AuditLogsResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: AuditLog[];
}

export async function getAuditLogs(params: AuditLogsParams = {}): Promise<AuditLogsResponse> {
  const cleanParams: Record<string, string | number> = {};
  if (params.page) cleanParams.page = params.page;
  if (params.page_size) cleanParams.page_size = params.page_size;
  if (params.search) cleanParams.search = params.search;
  if (params.action && params.action !== 'all') cleanParams.action = params.action;
  if (params.date_from) cleanParams.date_from = params.date_from;
  if (params.date_to) cleanParams.date_to = params.date_to;

  const { data } = await customApiClient.get<ApiResponse<AuditLogsResponse>>("/api/audit-logs", { params: cleanParams });
  return data.data;
}
