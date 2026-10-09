// Auth session helpers (pure, no imports) — password change and logout.

export interface FreshSessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * A password change ends every session on the server and answers with a fresh
 * session for this device. Older servers answer `null`: nothing is adopted.
 */
export function readFreshSessionTokens(value: unknown): FreshSessionTokens | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.access_token !== 'string' || !data.access_token) return null;
  if (typeof data.refresh_token !== 'string' || !data.refresh_token) return null;
  const expiresIn = Number(data.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: expiresIn };
}

/** localStorage keys holding this user's AI course-design source choices. */
export const LOGOUT_LOCAL_STORAGE_PREFIXES = ['lesson-author-source-v1:'] as const;

interface KeyStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Removes every key starting with one of the prefixes; returns how many. */
export function removeStorageKeysWithPrefixes(storage: KeyStorage, prefixes: readonly string[]): number {
  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
  return doomed.length;
}
