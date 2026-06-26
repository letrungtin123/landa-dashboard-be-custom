// ═══════════════════════════════════════════════════════════════
// Dashboard Content API — CRUD nội dung Hero Card + Tips
// Dùng cho admin dashboard, module Thương hiệu
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export interface DashboardContentTip {
  title: string;
  desc: string;
}

export interface DashboardContentData {
  tenant_id: string | null;
  hero_badge: string | null;
  hero_title: string | null;
  tips: DashboardContentTip[] | null;
  explore_hero_badge: string | null;
  explore_hero_title: string | null;
}

export interface UpsertDashboardContentPayload {
  hero_badge?: string | null;
  hero_title?: string | null;
  tips?: DashboardContentTip[] | null;
  explore_hero_badge?: string | null;
  explore_hero_title?: string | null;
}

/** Lấy dashboard content cho tenant hiện tại (auto-inject X-Tenant-Id) */
export async function getDashboardContent(): Promise<DashboardContentData> {
  const { data } = await customApiClient.get<ApiResponse<DashboardContentData>>("/api/dashboard-content");
  return data.data;
}

/** Cập nhật dashboard content */
export async function updateDashboardContent(payload: UpsertDashboardContentPayload): Promise<DashboardContentData> {
  const { data } = await customApiClient.put<ApiResponse<DashboardContentData>>(
    "/api/dashboard-content",
    payload,
  );
  return data.data;
}
