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
  customGetGroupLabelsApi,
  customGetRoleLabelsApi,
  customLogoutApi,
  type CustomLoginResponse,
} from '@/api/custom-auth';
import { config } from '@/config/env';
import { classifyStorageChange, decideRefresh, readStoredSession, withCrossTabLock } from '@/api/cross-tab-session.logic';
import { normalizeGroupLabels, type GroupLabelMap } from '@/utils/group-labels';
import { normalizeRoleLabels, type RoleLabelMap } from '@/utils/role-labels';
import {
  LOGOUT_LOCAL_STORAGE_PREFIXES,
  removeStorageKeysWithPrefixes,
  type FreshSessionTokens,
} from '@/api/auth-session.logic';

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

const rawEncryptedStorage = {
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
};

const encryptedStorage = createJSONStorage(() => rawEncryptedStorage);

// ── Cross-tab refresh (api/cross-tab-session.logic.ts) ──
// Tabs share the stored session; the server rotates the refresh token and
// treats a reused one as theft, so one tab refreshes at a time and the others
// adopt the stored result.
const REFRESH_LOCK_NAME = 'landa-admin-auth-refresh';

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
  groupLabels: GroupLabelMap;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;

  login: (username: string, password: string) => Promise<void>;
  setSession: (data: CustomLoginResponse) => Promise<void>;
  logout: () => Promise<void>;
  /** Uses the fresh session the server issued after a password change (other sessions ended). */
  adoptSessionTokens: (session: FreshSessionTokens) => void;
  startLogout: () => void;
  performTokenRefresh: () => Promise<boolean>;
  scheduleTokenRefresh: () => void;
  updateUser: (data: Partial<User>) => void;
  setRoleLabels: (labels: RoleLabelMap) => void;
  refreshRoleLabels: () => Promise<void>;
  setGroupLabels: (labels: GroupLabelMap) => void;
  refreshGroupLabels: () => Promise<void>;
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
    groupLabels: normalizeGroupLabels(data.group_labels),
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
      groupLabels: {},
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
            await Promise.all([
              get().refreshRoleLabels(),
              get().refreshGroupLabels(),
            ]);
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
          groupLabels: {},
          isLoggingOut: false,
        });

        // Per-user AI course-design source choices must not outlive the session.
        try {
          removeStorageKeysWithPrefixes(localStorage, LOGOUT_LOCAL_STORAGE_PREFIXES);
        } catch { /* storage unavailable */ }

        // Reset tenant store
        try {
          const { useTenantStore } = await import('@/utils/tenant-store');
          useTenantStore.getState().reset();
        } catch { /* ignore */ }
      },

      adoptSessionTokens: (session: FreshSessionTokens) => {
        set({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          tokenExpiresAt: Date.now() + session.expires_in * 1000,
        });
        lastRefreshSuccessAt = Date.now();
        get().scheduleTokenRefresh();
      },

      updateUser: (data) => set((state) => ({
        user: state.user ? { ...state.user, ...data } : null,
      })),

      setPermissions: (permissions) => set({ permissions }),
      setRoleLabels: (labels) => set({ roleLabels: normalizeRoleLabels(labels) }),
      setGroupLabels: (labels) => set({ groupLabels: normalizeGroupLabels(labels) }),

      refreshRoleLabels: async () => {
        try {
          const labels = await customGetRoleLabelsApi();
          set({ roleLabels: normalizeRoleLabels(labels) });
        } catch {
          set({ roleLabels: {} });
        }
      },

      refreshGroupLabels: async () => {
        try {
          const labels = await customGetGroupLabelsApi();
          set({ groupLabels: normalizeGroupLabels(labels) });
        } catch {
          set({ groupLabels: {} });
        }
      },

      // ── Permission check — sử dụng ma trận từ backend ──
      hasPermission: (moduleCode, action) => {
        const state = get();

        // superadmin bypass cross-tenant feature allocation.
        if (state.user?.role === 'superadmin') return true;

        // Mảng rỗng nghĩa là tenant không được cấp module nào, không phải full access.
        if (!state.tenantModules.includes(moduleCode)) return false;

        // superuser toàn quyền nhưng chỉ trong các module tenant đã được cấp.
        if (state.user?.role === 'superuser') return true;

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

        if (!get().refreshToken) return false;

        // One tab refreshes at a time; inside the lock the stored session is
        // re-read so a token another tab already rotated is never replayed.
        refreshMutex = withCrossTabLock(REFRESH_LOCK_NAME, async () => {
          const decision = decideRefresh(get().refreshToken, readStoredSession(rawEncryptedStorage.getItem(STORAGE_KEY)), Date.now());
          if (decision.action === 'adopt') {
            adoptStoredSession();
            return true;
          }
          if (decision.action === 'none') return false;
          try {
            let activeTenantId: string | null = null;
            try {
              const { useTenantStore } = await import('@/utils/tenant-store');
              activeTenantId = useTenantStore.getState().activeTenantId;
            } catch { /* ignore */ }
            const data = await customRefreshApi(decision.refreshToken, activeTenantId);
            set(mapLoginResponseToState(data));
            lastRefreshSuccessAt = Date.now();
            get().scheduleTokenRefresh();
            return true;
          } catch {
            return false;
          }
        }).finally(() => { refreshMutex = null; });

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
        groupLabels: state.groupLabels,
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

/** Takes over the session another tab stored (after its refresh or login). */
function adoptStoredSession(): void {
  let stored: Partial<AuthState> | null = null;
  try {
    const raw = rawEncryptedStorage.getItem(STORAGE_KEY);
    stored = raw ? (JSON.parse(raw) as { state?: Partial<AuthState> }).state ?? null : null;
  } catch { stored = null; }
  if (!stored?.isAuthenticated || !stored.refreshToken) return;
  useAuthStore.setState({
    isAuthenticated: true,
    accessToken: stored.accessToken ?? null,
    refreshToken: stored.refreshToken,
    tokenExpiresAt: stored.tokenExpiresAt ?? null,
    user: stored.user ?? null,
    permissions: stored.permissions ?? {},
    tenantModules: stored.tenantModules ?? [],
    managedTenants: stored.managedTenants ?? [],
    roleLabels: stored.roleLabels ?? {},
    groupLabels: stored.groupLabels ?? {},
  });
  lastRefreshSuccessAt = Date.now();
  useAuthStore.getState().scheduleTokenRefresh();
}

// Follow session changes written by other tabs: new tokens are adopted (so
// this tab never replays a rotated refresh token) and a sign-out elsewhere
// signs this tab out too.
window.addEventListener('storage', (event) => {
  if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
  const state = useAuthStore.getState();
  if (state.isLoggingOut) return;
  const change = classifyStorageChange(state.refreshToken, readStoredSession(rawEncryptedStorage.getItem(STORAGE_KEY)));
  if (change === 'adopt') adoptStoredSession();
  else if (change === 'signed_out') void state.logout();
});

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
