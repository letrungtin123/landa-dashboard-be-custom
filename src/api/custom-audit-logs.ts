// ═══════════════════════════════════════════════════════════════
// Custom Audit Logs API — List + filters
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export interface AuditLog {
  id: string;
  actor_username: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
  entity_type: string;
  entity_name: string | null;
  entity_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
  event_code?: string | null;
  event_metadata?: Record<string, unknown> | null;
  changes?: AuditChange[] | null;
}

/** Sensitive fields returned only by GET /api/audit-logs/:id after a row is opened. */
export interface AuditLogDetail extends AuditLog {
  actor_display_name: string | null;
  actor_email: string | null;
  /** Subject PII is returned only after the user explicitly opens one authorized row. */
  subject_display_name: string | null;
  subject_username: string | null;
  subject_email: string | null;
  subject_role: string | null;
}

export interface AuditChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface AuditLogsParams {
  page_size?: number;
  search?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
  cursor?: string;
  scope?: 'platform';
}

export interface AuditLogsResponse {
  page_size: number;
  results: AuditLog[];
  has_more?: boolean;
  next_cursor?: string | null;
  retention_days: number;
}

export async function getAuditLogs(params: AuditLogsParams = {}): Promise<AuditLogsResponse> {
  const cleanParams: Record<string, string | number> = { pagination: 'cursor' };
  if (params.page_size) cleanParams.page_size = params.page_size;
  if (params.search) cleanParams.search = params.search;
  if (params.action && params.action !== 'all') cleanParams.action = params.action;
  if (params.date_from) cleanParams.date_from = params.date_from;
  if (params.date_to) cleanParams.date_to = params.date_to;
  if (params.cursor) cleanParams.cursor = params.cursor;
  if (params.scope === 'platform') cleanParams.scope = 'platform';

  const { data } = await customApiClient.get<ApiResponse<AuditLogsResponse>>("/api/audit-logs", { params: cleanParams });
  return data.data;
}

export async function getAuditLogDetail(id: string, scope?: 'platform'): Promise<AuditLogDetail> {
  const { data } = await customApiClient.get<ApiResponse<AuditLogDetail>>(`/api/audit-logs/${encodeURIComponent(id)}`, {
    params: scope === 'platform' ? { scope } : undefined,
  });
  return data.data;
}
