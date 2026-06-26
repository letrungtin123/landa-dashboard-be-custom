// ============================================================
// Auth Store — Custom Express Backend authentication
// JWT access token + refresh token rotation
// Multi-tenant RBAC permissions
// KHÔNG LOG DỮ LIỆU NHẠY CẢM
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageUrl } from '@/utils/storage-url';
import {
  customLoginApi,
  customRefreshApi,
  customGetRoleLabelsApi,
  customLogoutApi,
  type CustomLoginResponse,
} from '@/api/custom-auth';
import { config } from '@/config/env';
import { normalizeRoleLabels, type RoleLabelMap } from '@/utils/role-labels';

// ── Encrypted storage (giữ nguyên logic cũ) ──
const STORAGE_KEY = 'admin-auth-v2';
const OBF_KEY = 42;

function obfuscate(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const xored = bytes.map((b) => b ^ OBF_KEY);
  let binary = '';
  for (const b of xored) binary += String.fromCharCode(b);
  return btoa(binary);
}

function deobfuscate(encoded: string): string {
  try {
    const binary = atob(encoded);
    const xored = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      xored[i] = binary.charCodeAt(i) ^ OBF_KEY;
    }
    return new TextDecoder().decode(xored);
  } catch { return ''; }
}

const encryptedStorage = createJSONStorage(() => ({
  getItem(key: string): string | null {
    const raw = localStorage.getItem(key);
    return raw ? (deobfuscate(raw) || null) : null;
  },
  setItem(key: string, value: string): void {
    localStorage.setItem(key, obfuscate(value));
  },
  removeItem(key: string): void {
    localStorage.removeItem(key);
  },
}));

// ── Types ──
export type UserRole = 'superadmin' | 'superuser' | 'staff' | 'learner_plus' | 'learner';
export type UserStatus = 'active' | 'inactive';

const ADMIN_ROLES: UserRole[] = ['staff', 'superuser', 'superadmin', 'learner_plus'];

function assertDashboardUser(data: CustomLoginResponse): void {
  if (!ADMIN_ROLES.includes(data.user.role)) {
    throw new Error('Tài khoản learner chỉ được truy cập trang học viên');
  }
}

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  role: UserRole;
  avatar: string | null;
  avatar_url?: string | null;
  status: UserStatus;
  isStaff: boolean;
  isSuperuser: boolean;
  tenant_id?: string | null;
  tenant_name?: string | null;
  created_at?: string;
  memberGroupIds?: string[];
  memberGroupNames?: string[];
}

export type PermissionsMap = Record<string, { can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean }>;

interface AuthState {
  user: User | null;
  permissions: PermissionsMap;
  tenantModules: string[];
  managedTenants: { id: string; name: string }[];
  roleLabels: RoleLabelMap;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;

  login: (username: string, password: string) => Promise<void>;
  setSession: (data: CustomLoginResponse) => Promise<void>;
  logout: () => Promise<void>;
  startLogout: () => void;
  performTokenRefresh: () => Promise<boolean>;
  scheduleTokenRefresh: () => void;
  updateUser: (data: Partial<User>) => void;
  setRoleLabels: (labels: RoleLabelMap) => void;
  refreshRoleLabels: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setPermissions: (permissions: PermissionsMap) => void;
  hasPermission: (moduleCode: string, action: 'can_view' | 'can_add' | 'can_edit' | 'can_delete') => boolean;
}

let refreshTimerId: ReturnType<typeof setTimeout> | null = null;
function clearRefreshTimer(): void {
  if (refreshTimerId !== null) { clearTimeout(refreshTimerId); refreshTimerId = null; }
}

// ── Mutex — đảm bảo chỉ có 1 refresh request tại 1 thời điểm ──
// Chống race condition khi visibilitychange, scheduleTokenRefresh, 401 interceptor
// cùng trigger refresh đồng thời → token rotation revoke ALL tokens → forced logout.
let refreshMutex: Promise<boolean> | null = null;

// ── Cooldown — chống serial refresh sau khi mutex đã resolve ──
// Khi refresh thành công, các caller (visibilitychange, timer, 401 interceptor)
// fire tuần tự trong vài giây → mỗi caller tạo 1 request mới vì mutex đã clear.
// Cooldown đảm bảo chỉ refresh 1 lần, caller tiếp theo dùng token đã refresh.
let lastRefreshSuccessAt = 0;
const REFRESH_COOLDOWN_MS = 5_000; // 5 giây

/**
 * Map response từ custom backend thành User state.
 */
function mapLoginResponseToState(data: CustomLoginResponse) {
  const user: User = {
    id: data.user.id,
    email: data.user.email,
    name: data.user.full_name || data.user.username,
    username: data.user.username,
    role: data.user.role,
    avatar: storageUrl(data.user.avatar_url) || null,
    avatar_url: storageUrl(data.user.avatar_url) || null,
    status: 'active',
    isStaff: data.user.role === 'staff' || data.user.role === 'learner_plus' || data.user.role === 'superuser' || data.user.role === 'superadmin',
    isSuperuser: data.user.role === 'superuser' || data.user.role === 'superadmin',
    tenant_id: data.user.tenant_id,
    tenant_name: data.user.tenant_name,
    memberGroupIds: data.member_groups?.map(g => g.id) || [],
    memberGroupNames: data.member_groups?.map(g => g.name) || [],
  };

  return {
    user,
    permissions: data.permissions,
    tenantModules: data.tenant_modules,
    managedTenants: data.managed_tenants || [],
    roleLabels: normalizeRoleLabels(data.role_labels),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: Date.now() + data.expires_in * 1000,
    isAuthenticated: true,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      permissions: {},
      tenantModules: [],
      managedTenants: [],
      roleLabels: {},
      isAuthenticated: false,
      isLoading: false,
      isLoggingOut: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,

      setLoading: (loading) => set({ isLoading: loading }),
      startLogout: () => set({ isLoggingOut: true }),

      setSession: async (data: CustomLoginResponse) => {
        assertDashboardUser(data);
        set(mapLoginResponseToState(data));
        get().scheduleTokenRefresh();

        // CHI superadmin moi can fetch tenant list cho bo loc multi-tenant.
        if (data.user.role === 'superadmin') {
          try {
            const { useTenantStore } = await import('@/utils/tenant-store');
            await useTenantStore.getState().fetchTenants();
            await get().refreshRoleLabels();
          } catch { /* ignore - tenant fetch is non-critical */ }
        }
      },

      // ── Login qua custom backend ──
      login: async (username: string, password: string) => {
        const data = await customLoginApi(username, password);
        await get().setSession(data);
      },

      // ── Logout — revoke refresh token ──
      logout: async () => {
        clearRefreshTimer();
        set({ isLoggingOut: true });

        const { refreshToken } = get();
        if (refreshToken) {
          try { await customLogoutApi(refreshToken); } catch { /* ignore */ }
        }

        set({
          isAuthenticated: false,
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          user: null,
          permissions: {},
          tenantModules: [],
          managedTenants: [],
          roleLabels: {},
          isLoggingOut: false,
        });

        // Reset tenant store
        try {
          const { useTenantStore } = await import('@/utils/tenant-store');
          useTenantStore.getState().reset();
        } catch { /* ignore */ }
      },

      updateUser: (data) => set((state) => ({
        user: state.user ? { ...state.user, ...data } : null,
      })),

      setPermissions: (permissions) => set({ permissions }),
      setRoleLabels: (labels) => set({ roleLabels: normalizeRoleLabels(labels) }),

      refreshRoleLabels: async () => {
        try {
          const labels = await customGetRoleLabelsApi();
          set({ roleLabels: normalizeRoleLabels(labels) });
        } catch {
          set({ roleLabels: {} });
        }
      },

      // ── Permission check — sử dụng ma trận từ backend ──
      hasPermission: (moduleCode, action) => {
        const state = get();

        // superadmin & superuser bypass
        if (state.user?.role === 'superadmin' || state.user?.role === 'superuser') return true;

        // Kiểm tra module có được bật cho tenant không
        if (state.tenantModules.length > 0 && !state.tenantModules.includes(moduleCode)) return false;

        const perm = state.permissions?.[moduleCode];
        if (!perm) return false;
        return perm[action] === true;
      },

      // ── Refresh token — rotation (token pair mới) ──
      // Mutex: nếu đang có refresh in-flight → trả về promise hiện tại.
      // Tránh race condition khi nhiều caller (visibilitychange, 401 interceptor,
      // scheduleTokenRefresh) cùng trigger → token rotation revoke ALL.
      performTokenRefresh: async (): Promise<boolean> => {
        // Mutex: nếu đang có refresh in-flight → trả về promise hiện tại
        if (refreshMutex) return refreshMutex;

        // Cooldown: nếu vừa refresh thành công trong 5s qua → skip
        // Chống serial refresh khi nhiều caller fire tuần tự sau khi mutex clear.
        if (Date.now() - lastRefreshSuccessAt < REFRESH_COOLDOWN_MS) {
          return true;
        }

        const { refreshToken: currentRefreshToken } = get();
        if (!currentRefreshToken) return false;

        refreshMutex = (async () => {
          try {
            let activeTenantId: string | null = null;
            try {
              const { useTenantStore } = await import('@/utils/tenant-store');
              activeTenantId = useTenantStore.getState().activeTenantId;
            } catch { /* ignore */ }
            const data = await customRefreshApi(currentRefreshToken, activeTenantId);
            set(mapLoginResponseToState(data));
            lastRefreshSuccessAt = Date.now();
            get().scheduleTokenRefresh();
            return true;
          } catch {
            return false;
          }
        })().finally(() => { refreshMutex = null; });

        return refreshMutex;
      },

      // ── Schedule auto-refresh trước khi token hết hạn ──
      scheduleTokenRefresh: () => {
        clearRefreshTimer();
        const { tokenExpiresAt } = get();
        if (!tokenExpiresAt) return;

        // Refresh 5 phút trước khi hết hạn
        const delay = tokenExpiresAt - Date.now() - config.tokenRefreshBufferMs;

        if (delay <= 0) {
          // Token sắp hết hoặc đã hết → refresh ngay
          get().performTokenRefresh().then((ok) => { if (!ok) get().logout(); });
          return;
        }

        refreshTimerId = setTimeout(() => {
          get().performTokenRefresh().then((ok) => { if (!ok) get().logout(); });
        }, delay);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: encryptedStorage,
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
        user: state.user,
        permissions: state.permissions,
        tenantModules: state.tenantModules,
        managedTenants: state.managedTenants,
        roleLabels: state.roleLabels,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated && state?.tokenExpiresAt) {
          if (Date.now() >= state.tokenExpiresAt) {
            // Token hết hạn → refresh ngay
            state.performTokenRefresh().then((ok) => { if (!ok) state.logout(); });
          } else {
            // Token còn hạn → schedule refresh
            state.scheduleTokenRefresh();
          }
        }
      },
    }
  )
);

// ── Wake-up refresh: khi user quay lại tab sau sleep/hibernate ──
// setTimeout bị đóng băng khi máy sleep → token hết hạn mà không được refresh.
// Listener này check và refresh proactively khi tab trở lại visible.
//
// CHỈ dùng visibilitychange (không dùng focus) vì cả 2 events fire gần như
// đồng thời khi user quay lại tab → race condition → token rotation revoke ALL.
// Debounce 300ms để chống duplicate nếu visibilitychange fire nhiều lần.
let wakeUpTimer: ReturnType<typeof setTimeout> | null = null;

function handleWakeUp() {
  if (wakeUpTimer) clearTimeout(wakeUpTimer);
  wakeUpTimer = setTimeout(() => {
    wakeUpTimer = null;
    const state = useAuthStore.getState();
    if (!state.isAuthenticated || !state.tokenExpiresAt) return;

    const now = Date.now();
    const buffer = config.tokenRefreshBufferMs || 300_000;

    // Token đã hết hạn hoặc sắp hết hạn → refresh ngay (qua mutex)
    if (now >= state.tokenExpiresAt - buffer) {
      state.performTokenRefresh()
        .then((ok) => {
          if (!ok) state.logout();
        });
    } else {
      // Token còn hạn → re-schedule timer (timer cũ có thể đã bị kill)
      state.scheduleTokenRefresh();
    }
  }, 300);
}

// visibilitychange: khi user switch tab hoặc mở lại từ taskbar
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    handleWakeUp();
  }
});
