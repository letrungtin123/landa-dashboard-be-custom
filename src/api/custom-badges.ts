import { customApiClient } from './custom-client';

export interface BadgeSetting {
  id: string;
  name: string;
  description: string;
  image_key: string;
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
  }
};
