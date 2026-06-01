// ═══════════════════════════════════════════════════════════════
// Modules API — Danh sách modules hệ thống
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface SystemModule {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/** Danh sách tất cả modules */
export async function fetchModules() {
  const { data } = await customApiClient.get<ApiResponse<SystemModule[]>>("/api/modules");
  return data.data;
}
