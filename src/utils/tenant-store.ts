// ═══════════════════════════════════════════════════════════════
// Tenant Context Store — Superadmin tenant selector state
// Chỉ superadmin sử dụng, các role khác KHÔNG cần
// ═══════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { customApiClient } from '@/api/custom-client';

export interface SimpleTenant {
  id: string;
  name: string;
}

interface TenantContextState {
  /** Tenant đang được chọn — null nếu chưa chọn */
  activeTenantId: string | null;
  activeTenantName: string | null;
  /** Danh sách tenants */
  tenants: SimpleTenant[];
  /** Loading state */
  isLoading: boolean;

  /** Fetch danh sách tenants từ API */
  fetchTenants: () => Promise<void>;
  /** Đổi tenant */
  setActiveTenant: (id: string, name: string) => void;
  /** Reset (khi logout) */
  reset: () => void;
}

export const useTenantStore = create<TenantContextState>()(
  persist(
    (set, get) => ({
      activeTenantId: null,
      activeTenantName: null,
      tenants: [],
      isLoading: false,

      fetchTenants: async () => {
        // Luôn fetch lại — không cache — để tenant mới hiện ngay
        set({ isLoading: true });
        try {
          const { data } = await customApiClient.get<{ success: boolean; data: SimpleTenant[] }>('/api/tenants/simple');
          const tenants = data.data;
          set({ tenants, isLoading: false });

          // Auto-select tenant đầu tiên nếu chưa chọn
          const current = get();
          if (!current.activeTenantId && tenants.length > 0) {
            set({ activeTenantId: tenants[0].id, activeTenantName: tenants[0].name });
          }
          // Nếu tenant đang chọn đã bị xóa → reset về tenant đầu
          if (current.activeTenantId && !tenants.find(t => t.id === current.activeTenantId)) {
            if (tenants.length > 0) {
              set({ activeTenantId: tenants[0].id, activeTenantName: tenants[0].name });
            } else {
              set({ activeTenantId: null, activeTenantName: null });
            }
          }
        } catch {
          set({ isLoading: false });
        }
      },

      setActiveTenant: (id, name) => {
        set({ activeTenantId: id, activeTenantName: name });
      },

      reset: () => {
        set({ activeTenantId: null, activeTenantName: null, tenants: [], isLoading: false });
      },
    }),
    {
      name: 'landa-tenant-context',
      partialize: (state) => ({
        activeTenantId: state.activeTenantId,
        activeTenantName: state.activeTenantName,
      }),
    }
  )
);
