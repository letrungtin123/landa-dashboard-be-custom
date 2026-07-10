import { customApiClient } from './custom-client';

export interface BadgeSetting {
  id: string;
  name: string;
  description: string;
  image_key: string;
  card_image_url: string | null;
  icon_image_url: string | null;
  mobile_card_image_url: string | null;
  is_active: boolean;
}

export const badgesApi = {
  getTenantBadges: async (tenantId: string) => {
    const res = await customApiClient.get<{ success: boolean; data: BadgeSetting[] }>(`/api/badges/tenants/${tenantId}`);
    return res.data;
  },
  
  updateTenantBadges: async (tenantId: string, badges: { badge_id: string; is_active: boolean }[]) => {
    const res = await customApiClient.patch<{ success: boolean; data: any }>(`/api/badges/tenants/${tenantId}`, { badges });
    return res.data;
  },

  uploadCardImage: async (tenantId: string, badgeId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await customApiClient.post<{ success: boolean; data: { card_image_url: string } }>(
      `/api/badges/tenants/${tenantId}/${badgeId}/card-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return res.data;
  },

  uploadIconImage: async (tenantId: string, badgeId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await customApiClient.post<{ success: boolean; data: { icon_image_url: string } }>(
      `/api/badges/tenants/${tenantId}/${badgeId}/icon-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return res.data;
  },

  uploadMobileCardImage: async (tenantId: string, badgeId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await customApiClient.post<{ success: boolean; data: { mobile_card_image_url: string } }>(
      `/api/badges/tenants/${tenantId}/${badgeId}/mobile-card-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return res.data;
  },
};
