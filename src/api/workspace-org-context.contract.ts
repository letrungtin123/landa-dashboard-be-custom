import { isWorkspaceId } from './lesson-author-workspace.contract';
import { AI_CREDIT_ERROR_KEYS, isAiCreditErrorCode } from './ai-credit-errors.logic';

/**
 * AI ID organization context ("Ngữ cảnh doanh nghiệp", ORG_CONTEXT_SPEC §2-§3):
 * the wire shapes of the tenant-wide context documents and the short
 * structured profile, their strict readers, and the plain-message keys of
 * every refusal. Shared by the api client, the hooks and the components; it
 * imports nothing from the UI. Extra response keys are ignored, never
 * forwarded.
 */

/** Spec order: the order of the editors on screen. */
export const ORG_PROFILE_FIELDS = ['organization_summary', 'products_services', 'learner_groups', 'glossary',
  'key_processes', 'culture_tone', 'design_conventions'] as const;
export type OrgProfileField = typeof ORG_PROFILE_FIELDS[number];
/** The fields the screen shows and edits, in the same order. `learner_groups` stays in the stored profile (v1) but is
 * never shown or edited and is saved as `[]`: learners come only from the run's "Đối tượng học" (QC 21/10, C10). */
export const ORG_PROFILE_SHOWN_FIELDS = ['organization_summary', 'products_services', 'glossary',
  'key_processes', 'culture_tone', 'design_conventions'] as const;
export type OrgProfileShownField = typeof ORG_PROFILE_SHOWN_FIELDS[number];
export const ORG_PROFILE_TEXT_FIELDS = ['organization_summary', 'culture_tone'] as const;
export type OrgProfileTextField = typeof ORG_PROFILE_TEXT_FIELDS[number];
export const ORG_PROFILE_LIST_FIELDS = ['products_services', 'key_processes', 'design_conventions'] as const;
export type OrgProfileListField = typeof ORG_PROFILE_LIST_FIELDS[number];
export const ORG_PROFILE_ROW_FIELDS = ['learner_groups', 'glossary'] as const;
export type OrgProfileRowField = typeof ORG_PROFILE_ROW_FIELDS[number];

/** Caps in Unicode code points (spec §2). */
export const ORG_PROFILE_TEXT_LIMITS: Readonly<Record<OrgProfileTextField, { max: number; lines: number }>> = Object.freeze({
  organization_summary: { max: 800, lines: 12 },
  culture_tone: { max: 600, lines: 12 },
});
export const ORG_PROFILE_LIST_LIMITS: Readonly<Record<OrgProfileListField, { items: number; max: number }>> = Object.freeze({
  products_services: { items: 15, max: 200 },
  key_processes: { items: 15, max: 300 },
  design_conventions: { items: 10, max: 200 },
});
/** Each row part: its key, its cap and whether it may be empty. */
export const ORG_PROFILE_ROW_LIMITS = Object.freeze({
  learner_groups: { items: 12, parts: [{ key: 'name', max: 100, required: true }, { key: 'description', max: 300, required: false }] },
  glossary: { items: 40, parts: [{ key: 'term', max: 80, required: true }, { key: 'meaning', max: 300, required: true }] },
} as const);
export type OrgProfileRowPart<F extends OrgProfileRowField = OrgProfileRowField> = typeof ORG_PROFILE_ROW_LIMITS[F]['parts'][number]['key'];
/** Sum of the lengths of every string of the profile. */
export const ORG_PROFILE_TOTAL_MAX = 6000;

export interface OrgLearnerGroup { name: string; description: string }
export interface OrgGlossaryEntry { term: string; meaning: string }
export interface OrgProfile {
  organization_summary: string;
  products_services: readonly string[];
  learner_groups: readonly Readonly<OrgLearnerGroup>[];
  glossary: readonly Readonly<OrgGlossaryEntry>[];
  key_processes: readonly string[];
  culture_tone: string;
  design_conventions: readonly string[];
}

export type OrgProfileOrigin = 'ai_draft' | 'author_edit' | 'restore';
export interface OrgProfileVersion {
  version: number;
  origin: OrgProfileOrigin;
  profile: Readonly<OrgProfile>;
  char_count: number;
  profile_hash: string;
  created_at: string;
  created_by_name: string | null;
}
export interface OrgProfileHistoryEntry {
  version: number;
  origin: OrgProfileOrigin;
  char_count: number;
  created_at: string;
  created_by_name: string | null;
}
export type OrgContextDocumentStatus = 'learning' | 'learned' | 'error';
export interface OrgContextDocument {
  id: string;
  name: string;
  size_bytes: number;
  status: OrgContextDocumentStatus;
  error_reason: string | null;
  created_at: string;
  created_by_name: string | null;
}
export const ORG_CONTEXT_NOT_READY_REASONS = ['engine', 'not_deployed', 'provider_key', 'schema'] as const;
export type OrgContextNotReadyReason = typeof ORG_CONTEXT_NOT_READY_REASONS[number];
export type OrgContextDistillStatus = 'idle' | 'queued' | 'running' | 'failed';
export interface OrgContextDistill {
  status: OrgContextDistillStatus;
  requested_at: string | null;
  finished_at: string | null;
  error_code: string | null;
}
export interface OrgContextProfileState {
  revision: number;
  current: Readonly<OrgProfileVersion> | null;
  confirmed_version: number | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  unread_document_count: number;
}
export interface OrgContextState {
  enabled: true;
  ready: boolean;
  not_ready_reason: OrgContextNotReadyReason | null;
  limit_bytes: number;
  used_bytes: number;
  documents: readonly Readonly<OrgContextDocument>[];
  profile: Readonly<OrgContextProfileState>;
  distill: Readonly<OrgContextDistill>;
  history: readonly Readonly<OrgProfileHistoryEntry>[];
}
/** GET answer: the feature is off for this tenant, or the full state. */
export type OrgContextRead = Readonly<{ enabled: false }> | Readonly<OrgContextState>;

/** A refused or failed org-context call, or an answer this module could not read. */
export class OrgContextError extends Error {
  constructor(readonly code: string, readonly status: number | null, readonly details: Readonly<Record<string, unknown>> | null) {
    super(code);
    this.name = 'OrgContextError';
  }
}
/** The answer did not match this contract (nothing on screen is built from it). */
export const ORG_CONTEXT_CONTRACT_INVALID = 'ORG_CONTEXT_CONTRACT_INVALID';
/** The request was refused here, before anything was sent. */
export const ORG_CONTEXT_INPUT_INVALID = 'ORG_CONTEXT_INPUT_INVALID';
/** No answer: network loss, timeout or a closed connection. */
export const ORG_CONTEXT_CONNECTION = 'ORG_CONTEXT_CONNECTION';

const invalid = (): never => { throw new OrgContextError(ORG_CONTEXT_CONTRACT_INVALID, null, null); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
};

/** Lengths are Unicode code points, as the server and the AI service count them. */
export function codePointLength(value: string): number {
  let length = 0;
  for (const _ of value) length++;
  return length;
}
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isVersionNumber = (value: unknown): value is number => isCount(value) && value >= 1;
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) invalid();
  return value as string;
};
const nullableDate = (value: unknown): string | null => value === null ? null : date(value);
const name = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string' || codePointLength(value) > 200) invalid();
  return (value as string).trim() || null;
};
const text = (value: unknown, max: number, min: number): string => {
  if (typeof value !== 'string') invalid();
  const length = codePointLength(value as string);
  if (length < min || length > max) invalid();
  return value as string;
};
const list = (value: unknown, items: number): readonly unknown[] => {
  if (!Array.isArray(value) || value.length > items) invalid();
  return value as unknown[];
};

/** Exactly the 7 keys within the caps of spec §2 (the server normalises before it stores). */
export function readOrgProfile(value: unknown): Readonly<OrgProfile> {
  const p = record(value);
  if (Object.keys(p).sort().join(',') !== [...ORG_PROFILE_FIELDS].sort().join(',')) invalid();
  const multiline = (field: OrgProfileTextField) => {
    const result = text(p[field], ORG_PROFILE_TEXT_LIMITS[field].max, 0);
    if (result.split('\n').length > ORG_PROFILE_TEXT_LIMITS[field].lines) invalid();
    return result;
  };
  const strings = (field: OrgProfileListField) => Object.freeze(list(p[field], ORG_PROFILE_LIST_LIMITS[field].items)
    .map(item => text(item, ORG_PROFILE_LIST_LIMITS[field].max, 1)));
  const groups = Object.freeze(list(p.learner_groups, ORG_PROFILE_ROW_LIMITS.learner_groups.items).map(item => {
    const row = record(item);
    if (Object.keys(row).sort().join(',') !== 'description,name') invalid();
    return Object.freeze({ name: text(row.name, 100, 1), description: text(row.description, 300, 0) });
  }));
  const glossary = Object.freeze(list(p.glossary, ORG_PROFILE_ROW_LIMITS.glossary.items).map(item => {
    const row = record(item);
    if (Object.keys(row).sort().join(',') !== 'meaning,term') invalid();
    return Object.freeze({ term: text(row.term, 80, 1), meaning: text(row.meaning, 300, 1) });
  }));
  const profile: OrgProfile = Object.freeze({
    organization_summary: multiline('organization_summary'), products_services: strings('products_services'),
    learner_groups: groups, glossary, key_processes: strings('key_processes'), culture_tone: multiline('culture_tone'),
    design_conventions: strings('design_conventions'),
  });
  if (orgProfileCharCount(profile) > ORG_PROFILE_TOTAL_MAX) invalid();
  return profile;
}

/** Sum of the code point lengths of every string of a profile. */
export function orgProfileCharCount(profile: Readonly<OrgProfile>): number {
  const sum = (values: readonly string[]) => values.reduce((total, value) => total + codePointLength(value), 0);
  return sum([profile.organization_summary, profile.culture_tone, ...profile.products_services, ...profile.key_processes,
    ...profile.design_conventions, ...profile.learner_groups.flatMap(row => [row.name, row.description]),
    ...profile.glossary.flatMap(row => [row.term, row.meaning])]);
}

const ORIGINS: readonly OrgProfileOrigin[] = ['ai_draft', 'author_edit', 'restore'];
const origin = (value: unknown): OrgProfileOrigin => {
  if (!ORIGINS.includes(value as OrgProfileOrigin)) invalid();
  return value as OrgProfileOrigin;
};
const charCount = (value: unknown): number => {
  if (!isCount(value) || value > ORG_PROFILE_TOTAL_MAX) invalid();
  return value as number;
};

export function readOrgProfileVersion(value: unknown): Readonly<OrgProfileVersion> {
  const v = record(value);
  if (!isVersionNumber(v.version) || typeof v.profile_hash !== 'string' || !/^[0-9a-f]{64}$/.test(v.profile_hash)) invalid();
  return Object.freeze({ version: v.version as number, origin: origin(v.origin), profile: readOrgProfile(v.profile),
    char_count: charCount(v.char_count), profile_hash: v.profile_hash as string, created_at: date(v.created_at),
    created_by_name: name(v.created_by_name) });
}

function readHistoryEntry(value: unknown): Readonly<OrgProfileHistoryEntry> {
  const v = record(value);
  if (!isVersionNumber(v.version)) invalid();
  return Object.freeze({ version: v.version as number, origin: origin(v.origin), char_count: charCount(v.char_count),
    created_at: date(v.created_at), created_by_name: name(v.created_by_name) });
}

const DOCUMENT_STATUSES: readonly OrgContextDocumentStatus[] = ['learning', 'learned', 'error'];
export function readOrgContextDocument(value: unknown): Readonly<OrgContextDocument> {
  const d = record(value);
  if (!isWorkspaceId(d.id) || typeof d.name !== 'string' || !d.name.trim() || codePointLength(d.name) > 500
    || !isCount(d.size_bytes) || !DOCUMENT_STATUSES.includes(d.status as OrgContextDocumentStatus)
    || d.error_reason !== null && typeof d.error_reason !== 'string') invalid();
  return Object.freeze({ id: d.id as string, name: (d.name as string).trim(), size_bytes: d.size_bytes as number,
    status: d.status as OrgContextDocumentStatus, error_reason: d.error_reason as string | null,
    created_at: date(d.created_at), created_by_name: name(d.created_by_name) });
}

const DISTILL_STATUSES: readonly OrgContextDistillStatus[] = ['idle', 'queued', 'running', 'failed'];
function readDistill(value: unknown): Readonly<OrgContextDistill> {
  const d = record(value);
  if (!DISTILL_STATUSES.includes(d.status as OrgContextDistillStatus)
    || d.error_code !== null && (typeof d.error_code !== 'string' || d.error_code.length > 100)) invalid();
  return Object.freeze({ status: d.status as OrgContextDistillStatus, requested_at: nullableDate(d.requested_at),
    finished_at: nullableDate(d.finished_at), error_code: d.error_code as string | null });
}

const revision = (value: unknown): number => {
  if (!isCount(value)) invalid();
  return value as number;
};
const confirmedVersion = (value: unknown): number | null => {
  if (value !== null && !isVersionNumber(value)) invalid();
  return value as number | null;
};

function readProfileState(value: unknown): Readonly<OrgContextProfileState> {
  const p = record(value);
  if (!isCount(p.unread_document_count)) invalid();
  return Object.freeze({ revision: revision(p.revision), current: p.current === null ? null : readOrgProfileVersion(p.current),
    confirmed_version: confirmedVersion(p.confirmed_version), confirmed_at: nullableDate(p.confirmed_at),
    confirmed_by_name: name(p.confirmed_by_name), unread_document_count: p.unread_document_count as number });
}

const DISABLED: OrgContextRead = Object.freeze({ enabled: false });

/** GET state: `{enabled:false}` when the gate is off, else the whole state (newest history first, at most 20). */
export function readOrgContextRead(value: unknown): OrgContextRead {
  const s = record(value);
  if (s.enabled === false) return DISABLED;
  if (s.enabled !== true || typeof s.ready !== 'boolean') invalid();
  const reason = s.not_ready_reason;
  if (reason !== null && !ORG_CONTEXT_NOT_READY_REASONS.includes(reason as OrgContextNotReadyReason)) invalid();
  // Not ready always says why, so the screen can say what to do.
  if (s.ready === (reason !== null)) invalid();
  if (!isVersionNumber(s.limit_bytes) || !isCount(s.used_bytes) || !Array.isArray(s.documents)
    || !Array.isArray(s.history) || s.history.length > 20) invalid();
  const documents = Object.freeze((s.documents as unknown[]).map(readOrgContextDocument));
  if (new Set(documents.map(d => d.id.toLowerCase())).size !== documents.length) invalid();
  return Object.freeze({ enabled: true, ready: s.ready as boolean, not_ready_reason: reason as OrgContextNotReadyReason | null,
    limit_bytes: s.limit_bytes as number, used_bytes: s.used_bytes as number, documents, profile: readProfileState(s.profile),
    distill: readDistill(s.distill), history: Object.freeze((s.history as unknown[]).map(readHistoryEntry)) });
}

export function readOrgContextUpload(value: unknown): Readonly<OrgContextDocument> {
  return readOrgContextDocument(record(value).document);
}
export function readOrgContextDistillResult(value: unknown): Readonly<{ revision: number; distill: Readonly<OrgContextDistill> }> {
  const v = record(value);
  return Object.freeze({ revision: revision(v.revision), distill: readDistill(v.distill) });
}
export interface OrgProfileSaveResult { revision: number; current: Readonly<OrgProfileVersion>; confirmed_version: number | null }
export function readOrgProfileSaveResult(value: unknown): Readonly<OrgProfileSaveResult> {
  const v = record(value);
  return Object.freeze({ revision: revision(v.revision), current: readOrgProfileVersion(v.current),
    confirmed_version: confirmedVersion(v.confirmed_version) });
}
export function readOrgProfileRestoreResult(value: unknown): Readonly<{ revision: number; current: Readonly<OrgProfileVersion> }> {
  const v = record(value);
  return Object.freeze({ revision: revision(v.revision), current: readOrgProfileVersion(v.current) });
}
export function readOrgProfileVersionResult(value: unknown): Readonly<OrgProfileVersion> {
  return readOrgProfileVersion(record(value).version);
}

/** The refusal or failure of a call: the server code (UPPER_SNAKE only), its status and details. */
export function readOrgContextFailure(error: unknown): OrgContextError {
  if (error instanceof OrgContextError) return error;
  const response = (error as { response?: { status?: unknown; data?: { code?: unknown; details?: unknown } } } | null)?.response;
  if (!response) return new OrgContextError(ORG_CONTEXT_CONNECTION, null, null);
  const status = typeof response.status === 'number' ? response.status : null;
  const raw = response.data?.code;
  const code = typeof raw === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(raw) ? raw : 'ORG_CONTEXT_FAILED';
  const details = response.data?.details;
  return new OrgContextError(code, status,
    details && typeof details === 'object' && !Array.isArray(details) ? Object.freeze({ ...details as Record<string, unknown> }) : null);
}

/** i18n key of a plain message; `field` is a profile field whose label fills {{field}}, `limitBytes` fills {{limit}}. */
export interface OrgContextMessage { key: string; field?: OrgProfileShownField; limitBytes?: number }

const PROFILE_REASONS = ['too_long', 'too_many', 'total_too_long', 'empty', 'shape'] as const;
const NOT_DEPLOYED_CODES = ['NOT_DEPLOYED', 'ORG_CONTEXT_NOT_DEPLOYED', 'LESSON_AUTHOR_SOURCE_UPLOAD_NOT_DEPLOYED'];
const NOT_READY_CODES = ['NOT_READY', 'ORG_CONTEXT_NOT_READY', 'LESSON_AUTHOR_SOURCE_UPLOAD_NOT_READY'];
const CODE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  ORG_CONTEXT_LIMIT_REACHED: 'aiIdOrgContext.errors.limitReached',
  ORG_CONTEXT_REVISION_CONFLICT: 'aiIdOrgContext.errors.conflict',
  ORG_CONTEXT_DISTILL_RUNNING: 'aiIdOrgContext.errors.distillRunning',
  ORG_CONTEXT_NO_LEARNED_DOCUMENTS: 'aiIdOrgContext.errors.noLearnedDocuments',
  ORG_CONTEXT_NO_LEARNED_SOURCE: 'aiIdOrgContext.errors.noLearnedDocuments',
  ORG_CONTEXT_FILE_INVALID: 'aiIdOrgContext.errors.fileInvalid',
  PAYLOAD_TOO_LARGE: 'aiIdOrgContext.errors.fileInvalid',
  ORG_CONTEXT_DISABLED: 'aiIdOrgContext.errors.disabled',
  KB_DOCUMENT_LEARNING: 'aiIdOrgContext.errors.documentLearning',
  TENANT_DATA_LIMIT_REACHED: 'tenantManagement.quotaLimitReached',
  ORG_CONTEXT_NOT_CONFIRMED: 'aiIdLaunchBrief.errorOrgContextNotConfirmed',
  ORG_CONTEXT_NOT_APPLICABLE: 'aiIdLaunchBrief.errorOrgContextNotApplicable',
  [ORG_CONTEXT_CONNECTION]: 'aiIdOrgContext.errors.connection',
  [ORG_CONTEXT_CONTRACT_INVALID]: 'aiIdOrgContext.errors.unexpected',
  [ORG_CONTEXT_INPUT_INVALID]: 'aiIdOrgContext.errors.unexpected',
});

/** The plain VI/EN message of any org-context failure; never a code or a status number. */
export function orgContextErrorMessage(error: unknown): OrgContextMessage {
  const failure = readOrgContextFailure(error);
  const { code, status, details } = failure;
  if (code === 'ORG_CONTEXT_PROFILE_INVALID') {
    const reason = PROFILE_REASONS.find(item => item === details?.reason);
    const head = typeof details?.path === 'string' ? details.path.split(/[.[\]/]/)[0] : '';
    const field = ORG_PROFILE_SHOWN_FIELDS.find(item => item === head);
    if (reason === 'total_too_long' || reason === 'empty') return { key: `aiIdOrgContext.errors.profile.${reason}` };
    return reason && field ? { key: `aiIdOrgContext.errors.profile.${reason}`, field } : { key: 'aiIdOrgContext.errors.profile.generic' };
  }
  if (code === 'ORG_CONTEXT_LIMIT_REACHED') {
    const limit = details?.limit_bytes;
    return isVersionNumber(limit) ? { key: CODE_KEYS[code], limitBytes: limit } : { key: CODE_KEYS[code] };
  }
  if (Object.prototype.hasOwnProperty.call(CODE_KEYS, code)) return { key: CODE_KEYS[code] };
  if (isAiCreditErrorCode(code)) return { key: AI_CREDIT_ERROR_KEYS[code] };
  if (NOT_DEPLOYED_CODES.includes(code)) return { key: 'aiIdOrgContext.notReady.not_deployed' };
  if (NOT_READY_CODES.includes(code)) return { key: 'aiIdOrgContext.errors.notReady' };
  if (status === 401 || status === 403) return { key: 'aiIdOrgContext.errors.forbidden' };
  if (status === 404) return { key: 'aiIdOrgContext.errors.notFound' };
  if (status === 413) return { key: 'aiIdOrgContext.errors.fileInvalid' };
  return { key: 'aiIdOrgContext.errors.generic' };
}

/** What to do when the server is not ready to read context documents (GET not_ready_reason). */
export function orgContextNotReadyKey(reason: OrgContextNotReadyReason): string {
  return `aiIdOrgContext.notReady.${reason}`;
}

/** The plain message of a failed profile draft (distill error_code): AI points, no read document, or try again. */
export function orgContextDistillFailureKey(code: string | null): string {
  if (isAiCreditErrorCode(code)) return AI_CREDIT_ERROR_KEYS[code];
  if (code === 'ORG_CONTEXT_NO_LEARNED_DOCUMENTS' || code === 'ORG_CONTEXT_NO_LEARNED_SOURCE') return 'aiIdOrgContext.errors.noLearnedDocuments';
  return 'aiIdOrgContext.profile.distillFailed';
}
