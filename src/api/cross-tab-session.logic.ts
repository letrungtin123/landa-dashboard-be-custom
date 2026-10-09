// ============================================================
// Cross-tab session refresh — one refresh at a time for every tab
//
// The server rotates the refresh token on every refresh and treats a reused
// (already rotated) token as theft. Tabs of one browser share the stored
// session, so:
//   1. only one tab refreshes at a time (Web Locks, else a storage lease);
//   2. inside the lock the tab re-reads the stored session: if another tab
//      already refreshed, it adopts that session instead of replaying its own
//      (now used) refresh token;
//   3. every tab follows storage changes made by other tabs (new tokens,
//      sign-out), so a background tab never keeps a used refresh token.
// ============================================================

export interface StoredSessionTokens {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
}

/** An adopted session must still be valid for at least this long. */
export const ADOPT_MIN_VALIDITY_MS = 30_000;

export type RefreshDecision =
  | { action: "adopt" }
  | { action: "refresh"; refreshToken: string }
  | { action: "none" };

/**
 * What to do inside the lock. `stored` is the session currently in storage
 * (another tab may have rotated it); `memoryRefreshToken` is this tab's copy.
 */
export function decideRefresh(memoryRefreshToken: string | null, stored: StoredSessionTokens | null, now: number): RefreshDecision {
  const storedToken = stored?.isAuthenticated ? stored.refreshToken : null;
  if (storedToken && storedToken !== memoryRefreshToken) {
    const stillValid = typeof stored?.tokenExpiresAt === "number" && stored.tokenExpiresAt - now > ADOPT_MIN_VALIDITY_MS;
    // Another tab already refreshed: use its session, or refresh with ITS token.
    return stillValid ? { action: "adopt" } : { action: "refresh", refreshToken: storedToken };
  }
  const token = storedToken || memoryRefreshToken;
  return token ? { action: "refresh", refreshToken: token } : { action: "none" };
}

export type StorageChange = "adopt" | "signed_out" | "unchanged";

/** How this tab follows a session change written by another tab. */
export function classifyStorageChange(memoryRefreshToken: string | null, stored: StoredSessionTokens | null): StorageChange {
  const storedToken = stored?.isAuthenticated ? stored.refreshToken : null;
  if (!storedToken) return memoryRefreshToken ? "signed_out" : "unchanged";
  return storedToken === memoryRefreshToken ? "unchanged" : "adopt";
}

/** Reads the token fields from a zustand-persist JSON value (`{ state, version }`). */
export function readStoredSession(raw: string | null): StoredSessionTokens | null {
  if (!raw) return null;
  try {
    const state = (JSON.parse(raw) as { state?: Record<string, unknown> })?.state;
    if (!state || typeof state !== "object") return null;
    return {
      isAuthenticated: state.isAuthenticated === true,
      accessToken: typeof state.accessToken === "string" ? state.accessToken : null,
      refreshToken: typeof state.refreshToken === "string" ? state.refreshToken : null,
      tokenExpiresAt: typeof state.tokenExpiresAt === "number" ? state.tokenExpiresAt : null,
    };
  } catch {
    return null;
  }
}

interface LockManagerLike {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
}

interface LeaseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CrossTabLockEnvironment {
  locks?: LockManagerLike | null;
  storage?: LeaseStorage | null;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  ownerId?: string;
}

const LEASE_MS = 20_000;
const WAIT_STEP_MS = 100;
const MAX_WAIT_MS = 25_000;

function defaultEnvironment(): CrossTabLockEnvironment {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManagerLike }) : undefined;
  let storage: LeaseStorage | null = null;
  try { storage = typeof localStorage !== "undefined" ? localStorage : null; } catch { storage = null; }
  return { locks: nav?.locks ?? null, storage };
}

/**
 * Runs `task` while holding a lock shared by every tab of this site.
 * Web Locks when available; otherwise a short storage lease (released at
 * the end, expires on its own if a tab dies). Without either it just runs.
 */
export async function withCrossTabLock<T>(name: string, task: () => Promise<T>, environment: CrossTabLockEnvironment = defaultEnvironment()): Promise<T> {
  if (environment.locks && typeof environment.locks.request === "function") {
    return environment.locks.request(name, { mode: "exclusive" }, task);
  }
  const storage = environment.storage;
  if (!storage) return task();

  const now = environment.now ?? (() => Date.now());
  const sleep = environment.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const owner = environment.ownerId ?? `${now()}-${Math.random().toString(36).slice(2)}`;
  const key = `${name}:lease`;
  const readLease = (): { owner: string; until: number } | null => {
    try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; }
  };

  const deadline = now() + MAX_WAIT_MS;
  let acquired = false;
  while (!acquired && now() < deadline) {
    const lease = readLease();
    if (!lease || lease.until <= now()) {
      try { storage.setItem(key, JSON.stringify({ owner, until: now() + LEASE_MS })); } catch { break; }
      await sleep(WAIT_STEP_MS / 2);
      acquired = readLease()?.owner === owner;
      if (acquired) break;
    }
    await sleep(WAIT_STEP_MS);
  }
  try {
    return await task();
  } finally {
    if (readLease()?.owner === owner) {
      try { storage.removeItem(key); } catch { /* storage unavailable */ }
    }
  }
}
