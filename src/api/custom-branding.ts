// ═══════════════════════════════════════════════════════════════
// Branding API — Upload/Delete/Get branding images
// ═══════════════════════════════════════════════════════════════

import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export interface BrandingData {
  tenant_id: string | null;
  tenant_name: string | null;
  images: Record<string, string | null>;
  carousels: string[];
  size_hints: Record<string, string>;
}

/** Lấy branding cho tenant hiện tại (auto-inject X-Tenant-Id) */
export async function getBranding(): Promise<BrandingData> {
  const { data } = await customApiClient.get<ApiResponse<BrandingData>>("/api/branding");
  return data.data;
}

/** Upload ảnh branding */
export async function uploadBrandingImage(imageKey: string, file: File): Promise<{ storage_path: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('image_key', imageKey);

  const { data } = await customApiClient.post<ApiResponse<{ storage_path: string }>>(
    "/api/branding/upload",
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

/** Xóa ảnh branding */
export async function deleteBrandingImage(imageKey: string): Promise<void> {
  await customApiClient.delete(`/api/branding/${imageKey}`);
}
