/**
 * Local recovery for in-progress course-component edits.
 *
 * Drafts deliberately remain in the browser: they are not course data until the
 * author presses Save, so typing does not create API, quota, or audit-log load.
 * sessionStorage is the synchronous recovery journal for reloads; IndexedDB is
 * the larger, non-blocking mirror used when the browser keeps the tab alive.
 */

export const COURSE_COMPONENT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DRAFT_SCHEMA_VERSION = 1;
const SESSION_PREFIX = 'landa:course-component-draft:v1:';
const DB_NAME = 'landa-course-component-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const MAX_PRUNE_PER_RUN = 50;

export interface CourseComponentDraftScope {
  actorId: string;
  tenantId: string;
  courseId: string;
  blockId: string;
  componentType: string;
}

export interface CourseComponentDraft<T = unknown> extends CourseComponentDraftScope {
  key: string;
  schemaVersion: number;
  baselineFingerprint: string;
  state: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export type DraftStorageStatus = 'available' | 'memory-only';

const memoryDrafts = new Map<string, CourseComponentDraft>();
let databasePromise: Promise<IDBDatabase | null> | null = null;
let hasPrunedExpiredDrafts = false;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function safePart(value: string): string {
  return encodeURIComponent(value);
}

export function courseComponentDraftKey(scope: CourseComponentDraftScope): string {
  return [
    SESSION_PREFIX.slice(0, -1),
    safePart(scope.actorId),
    safePart(scope.tenantId),
    safePart(scope.courseId),
    safePart(scope.blockId),
    safePart(scope.componentType),
  ].join(':');
}

function safeSessionGet(key: string): CourseComponentDraft | null {
  if (!isBrowser()) return memoryDrafts.get(key) || null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return memoryDrafts.get(key) || null;
    const parsed = JSON.parse(raw) as CourseComponentDraft;
    return parsed?.key === key ? parsed : null;
  } catch {
    return memoryDrafts.get(key) || null;
  }
}

function safeSessionSet(draft: CourseComponentDraft): DraftStorageStatus {
  memoryDrafts.set(draft.key, draft);
  if (!isBrowser()) return 'memory-only';
  try {
    window.sessionStorage.setItem(draft.key, JSON.stringify(draft));
    return 'available';
  } catch {
    return 'memory-only';
  }
}

function safeSessionRemove(key: string): void {
  memoryDrafts.delete(key);
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Private mode or exhausted storage: the in-memory fallback was removed above.
  }
}

function openDraftDatabase(): Promise<IDBDatabase | null> {
  if (!isBrowser() || !('indexedDB' in window)) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? request.transaction!.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        if (!store.indexNames.contains('expiresAt')) store.createIndex('expiresAt', 'expiresAt');
        if (!store.indexNames.contains('actorId')) store.createIndex('actorId', 'actorId');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return databasePromise;
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readIndexedDraft(key: string): Promise<CourseComponentDraft | null> {
  const db = await openDraftDatabase();
  if (!db) return null;
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    return (await idbRequest(transaction.objectStore(STORE_NAME).get(key))) as CourseComponentDraft | null;
  } catch {
    return null;
  }
}

async function writeIndexedDraft(draft: CourseComponentDraft): Promise<void> {
  const db = await openDraftDatabase();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(draft);
  } catch {
    // The synchronous session journal remains the recovery source for this tab.
  }
}

async function deleteIndexedDraft(key: string): Promise<void> {
  const db = await openDraftDatabase();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
  } catch {
    // Nothing else to do; the session journal has already been cleared.
  }
}

function isUsableDraft(draft: CourseComponentDraft | null, key: string): draft is CourseComponentDraft {
  return Boolean(
    draft
    && draft.key === key
    && draft.schemaVersion === DRAFT_SCHEMA_VERSION
    && draft.expiresAt > Date.now(),
  );
}

/** Lightweight deterministic fingerprint for conflict detection, not security. */
export function courseComponentServerFingerprint(blockInfo: any): string {
  const canonical = stableSerialize({
    id: blockInfo?.id || '',
    category: blockInfo?.category || blockInfo?.block_type || '',
    display_name: blockInfo?.display_name || '',
    metadata: blockInfo?.metadata || {},
    data: blockInfo?.data ?? null,
    edited_on: blockInfo?.edited_on || '',
    has_changes: Boolean(blockInfo?.has_changes ?? blockInfo?.has_draft_changes),
  });
  return `${canonical.length}:${fnv1a(canonical)}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function loadCourseComponentDraft<T>(scope: CourseComponentDraftScope): Promise<CourseComponentDraft<T> | null> {
  const key = courseComponentDraftKey(scope);
  const sessionDraft = safeSessionGet(key);
  if (isUsableDraft(sessionDraft, key)) return sessionDraft as CourseComponentDraft<T>;
  if (sessionDraft) safeSessionRemove(key);

  const indexedDraft = await readIndexedDraft(key);
  if (!isUsableDraft(indexedDraft, key)) {
    if (indexedDraft) void deleteIndexedDraft(key);
    return null;
  }

  safeSessionSet(indexedDraft);
  return indexedDraft as CourseComponentDraft<T>;
}

export function saveCourseComponentDraft<T>(
  scope: CourseComponentDraftScope,
  baselineFingerprint: string,
  state: T,
  createdAt?: number,
): DraftStorageStatus {
  const now = Date.now();
  const draft: CourseComponentDraft<T> = {
    ...scope,
    key: courseComponentDraftKey(scope),
    schemaVersion: DRAFT_SCHEMA_VERSION,
    baselineFingerprint,
    state,
    createdAt: createdAt || now,
    updatedAt: now,
    expiresAt: now + COURSE_COMPONENT_DRAFT_TTL_MS,
  };
  const status = safeSessionSet(draft);
  void writeIndexedDraft(draft);
  return status;
}

export function clearCourseComponentDraft(scope: CourseComponentDraftScope): void {
  const key = courseComponentDraftKey(scope);
  safeSessionRemove(key);
  void deleteIndexedDraft(key);
}

export function clearCourseComponentDraftsForActor(actorId: string | null | undefined): void {
  if (!actorId) return;
  const encodedActorId = safePart(actorId);
  const actorKeyPrefix = `${SESSION_PREFIX}${encodedActorId}:`;
  for (const key of Array.from(memoryDrafts.keys())) {
    if (key.startsWith(actorKeyPrefix)) safeSessionRemove(key);
  }
  if (isBrowser()) {
    try {
      for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(actorKeyPrefix)) window.sessionStorage.removeItem(key);
      }
    } catch {
      // The per-user key still prevents a different account from loading this draft.
    }
  }
  void (async () => {
    const db = await openDraftDatabase();
    if (!db) return;
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const index = transaction.objectStore(STORE_NAME).index('actorId');
      const cursorRequest = index.openCursor(IDBKeyRange.only(actorId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    } catch {
      // Best-effort privacy cleanup; no user data is exposed by a failed cleanup.
    }
  })();
}

/** Bounded cleanup so a browser with many old drafts is never scanned unboundedly. */
export function pruneExpiredCourseComponentDrafts(): void {
  if (hasPrunedExpiredDrafts || !isBrowser()) return;
  hasPrunedExpiredDrafts = true;
  const now = Date.now();
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(SESSION_PREFIX)) continue;
      const draft = safeSessionGet(key);
      if (draft && draft.expiresAt <= now) safeSessionRemove(key);
    }
  } catch {
    // Browser storage can be disabled; IndexedDB cleanup below is independent.
  }

  void (async () => {
    const db = await openDraftDatabase();
    if (!db) return;
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const index = transaction.objectStore(STORE_NAME).index('expiresAt');
      const request = index.openCursor(IDBKeyRange.upperBound(now));
      let removed = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || removed >= MAX_PRUNE_PER_RUN) return;
        cursor.delete();
        removed += 1;
        cursor.continue();
      };
    } catch {
      // Best effort only.
    }
  })();
}
