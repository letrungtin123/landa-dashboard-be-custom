import { customApiClient } from './custom-client';
import { isWorkspaceId, type WorkspaceLocale } from './lesson-author-workspace.contract';
import {
  ORG_CONTEXT_CONTRACT_INVALID, ORG_CONTEXT_INPUT_INVALID, OrgContextError, readOrgContextDistillResult, readOrgContextFailure,
  readOrgContextRead, readOrgContextUpload, readOrgProfile, readOrgProfileRestoreResult, readOrgProfileSaveResult,
  readOrgProfileVersionResult, type OrgProfile,
} from './workspace-org-context.contract';

/**
 * AI ID organization context routes (ORG_CONTEXT_SPEC §3). Same permission as
 * the AI ID source documents (course editing); the tenant is the request
 * tenant (X-Tenant-Id for a superadmin, added by the shared client). Every
 * answer is read strictly; every failure becomes an OrgContextError whose
 * plain message comes from orgContextErrorMessage.
 */
const BASE = '/api/ai-chatbot/chat/lesson-author/org-context';
/** Same as the AI ID source upload: a large file on a slow line. */
const UPLOAD_TIMEOUT_MS = 120_000;

type Transport = Pick<typeof customApiClient, 'get' | 'post' | 'put' | 'delete'>;
type Answer = { status?: number; data?: unknown };

function payload(answer: Answer): unknown {
  const body = answer.data as { success?: unknown; data?: unknown } | null | undefined;
  if (!body || body.success !== true) throw new OrgContextError(ORG_CONTEXT_CONTRACT_INVALID, null, null);
  return body.data;
}
const isRevision = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isVersion = (value: unknown) => isRevision(value) && (value as number) >= 1;
/** Refused here: nothing is sent. */
function assertInput(valid: boolean) {
  if (!valid) throw new OrgContextError(ORG_CONTEXT_INPUT_INVALID, null, null);
}

export function createOrgContextApi(transport: Transport = customApiClient) {
  async function call<T>(send: () => Promise<Answer>, read: (answer: Answer) => T): Promise<T> {
    let answer: Answer;
    try { answer = await send(); } catch (error) { throw readOrgContextFailure(error); }
    return read(answer);
  }
  return {
    /** `{enabled:false}` when the feature is off for this tenant. */
    async state(signal?: AbortSignal) {
      return call(() => transport.get(BASE, { signal, headers: { 'Cache-Control': 'no-cache' } }),
        answer => readOrgContextRead(payload(answer)));
    },
    /** One file (multipart `file`); the server checks type, size and the tenant's context space. */
    async upload(file: File, options?: { onProgress?: (percent: number | null) => void; signal?: AbortSignal }) {
      const form = new FormData();
      form.append('file', file);
      return call(() => transport.post(`${BASE}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS, signal: options?.signal,
        onUploadProgress: (event: { loaded: number; total?: number }) => {
          options?.onProgress?.(event.total ? Math.min(100, Math.round(event.loaded * 100 / event.total)) : null);
        },
      }), answer => readOrgContextUpload(payload(answer)));
    },
    /** 202: removal accepted (a body is not required). */
    async removeDocument(documentId: string) {
      assertInput(isWorkspaceId(documentId));
      return call(() => transport.delete(`${BASE}/documents/${encodeURIComponent(documentId)}`), answer => {
        if (answer.status !== 202) payload(answer);
      });
    },
    /** Ask AI for a new draft from the read documents, written in `locale`. */
    async distill(body: { expected_revision: number; locale: WorkspaceLocale }) {
      assertInput(isRevision(body.expected_revision) && ['vi', 'en'].includes(body.locale));
      return call(() => transport.post(`${BASE}/profile/distill`, { expected_revision: body.expected_revision, locale: body.locale }),
        answer => readOrgContextDistillResult(payload(answer)));
    },
    /** Save a draft, and confirm it when `confirm` is true. The profile must already be normalised and within the caps. */
    async saveProfile(body: { expected_revision: number; profile: Readonly<OrgProfile>; confirm: boolean }) {
      assertInput(isRevision(body.expected_revision) && typeof body.confirm === 'boolean');
      let profile: Readonly<OrgProfile> | null = null;
      try { profile = readOrgProfile(body.profile); } catch { assertInput(false); }
      return call(() => transport.put(`${BASE}/profile`, { expected_revision: body.expected_revision, profile, confirm: body.confirm }),
        answer => readOrgProfileSaveResult(payload(answer)));
    },
    /** Copy an older version into a new draft (not confirmed). */
    async restore(body: { expected_revision: number; version: number }) {
      assertInput(isRevision(body.expected_revision) && isVersion(body.version));
      return call(() => transport.post(`${BASE}/profile/restore`, { expected_revision: body.expected_revision, version: body.version }),
        answer => readOrgProfileRestoreResult(payload(answer)));
    },
    async version(version: number, signal?: AbortSignal) {
      assertInput(isVersion(version));
      return call(() => transport.get(`${BASE}/profile/versions/${version}`, { signal }),
        answer => readOrgProfileVersionResult(payload(answer)));
    },
  };
}
export type OrgContextApi = ReturnType<typeof createOrgContextApi>;
export const orgContextApi = createOrgContextApi();
