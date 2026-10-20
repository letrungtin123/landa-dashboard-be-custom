import {
  codePointLength, ORG_PROFILE_FIELDS, ORG_PROFILE_LIST_FIELDS, ORG_PROFILE_LIST_LIMITS, ORG_PROFILE_ROW_FIELDS,
  ORG_PROFILE_ROW_LIMITS, ORG_PROFILE_TEXT_FIELDS, ORG_PROFILE_TEXT_LIMITS, ORG_PROFILE_TOTAL_MAX, orgContextErrorMessage,
  type OrgContextNotReadyReason, type OrgContextRead, type OrgContextState, type OrgProfile, type OrgProfileField,
  type OrgProfileListField, type OrgProfileRowField, type OrgProfileTextField, type OrgProfileVersion,
} from '../../api/workspace-org-context.contract';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';

/**
 * Organization context tab (ORG_CONTEXT_SPEC §5): pure rules for the usage
 * bar, sizes and dates, the profile editors (live counters with the caps of
 * spec §2, normalised the way the server stores it), changes against the
 * version being edited, and which buttons may be pressed. Nothing here reads
 * or writes the server.
 */

// ── Space used by the context documents ──
export type OrgContextUsageLevel = 'normal' | 'warning' | 'full';
/** Amber from 80 %, red (and no upload) when full. */
export const ORG_CONTEXT_USAGE_WARNING_PERCENT = 80;
export function orgContextUsage(usedBytes: number, limitBytes: number): { percent: number; level: OrgContextUsageLevel } {
  const ratio = limitBytes > 0 ? usedBytes / limitBytes : 1;
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const level = usedBytes >= limitBytes ? 'full' : ratio * 100 >= ORG_CONTEXT_USAGE_WARNING_PERCENT ? 'warning' : 'normal';
  return { percent: level === 'full' ? 100 : Math.min(percent, 99), level };
}

const intlLocale = (locale: WorkspaceLocale) => locale === 'en' ? 'en-US' : 'vi-VN';
const MB = 1024 * 1024;
const decimal = (value: number, locale: WorkspaceLocale) =>
  new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value);
/** Megabytes with one decimal ("12,4 MB" in Vietnamese). A used amount rounds down so the bar never reads full
 * before it is, and any used space shows at least 0,1 MB. */
export function formatOrgContextMegabytes(bytes: number, locale: WorkspaceLocale, rounding: 'down' | 'nearest' = 'nearest'): string {
  const tenths = rounding === 'down' ? Math.floor(bytes / MB * 10) : Math.round(bytes / MB * 10);
  return `${decimal((bytes > 0 ? Math.max(1, tenths) : 0) / 10, locale)} MB`;
}
/** "12,4 MB / 50 MB". */
export function formatOrgContextUsage(usedBytes: number, limitBytes: number, locale: WorkspaceLocale): string {
  return `${formatOrgContextMegabytes(usedBytes, locale, 'down')} / ${formatOrgContextMegabytes(limitBytes, locale)}`;
}
/** One document: bytes, KB under 1 MB, else MB with one decimal. */
export function formatOrgContextFileSize(bytes: number, locale: WorkspaceLocale): string {
  if (bytes < 1024) return `${decimal(bytes, locale)} B`;
  if (bytes < MB) return `${decimal(Math.max(1, Math.round(bytes / 1024)), locale)} KB`;
  return formatOrgContextMegabytes(bytes, locale);
}
/** Counters: "6.000" in Vietnamese, "6,000" in English. */
export function formatOrgContextCount(value: number, locale: WorkspaceLocale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}
export function formatOrgContextDate(value: string, locale: WorkspaceLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}
export function formatOrgContextDateTime(value: string, locale: WorkspaceLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// ── Upload ──
export const ORG_CONTEXT_FILE_MAX_BYTES = 50 * MB;
export const ORG_CONTEXT_FILE_ACCEPT = '.pdf,.doc,.docx,.pptx,.txt,.md,.csv';
/** Checked before anything is sent: 'file' (type, empty, over 50 MB) or 'limit' (no space left). */
export function orgContextUploadProblem(file: { name: string; size: number }, usage: { usedBytes: number; limitBytes: number }): 'file' | 'limit' | null {
  if (!file.size || file.size > ORG_CONTEXT_FILE_MAX_BYTES || !/\.(pdf|docx?|pptx|txt|md|csv)$/i.test(file.name)) return 'file';
  return usage.usedBytes + file.size > usage.limitBytes ? 'limit' : null;
}

// ── Profile editing ──
export interface OrgProfileDraft {
  organization_summary: string;
  products_services: string[];
  learner_groups: { name: string; description: string }[];
  glossary: { term: string; meaning: string }[];
  key_processes: string[];
  culture_tone: string;
  design_conventions: string[];
}
export const EMPTY_ORG_PROFILE: Readonly<OrgProfile> = Object.freeze({ organization_summary: '', products_services: [],
  learner_groups: [], glossary: [], key_processes: [], culture_tone: '', design_conventions: [] });

export function orgProfileDraftFrom(profile: Readonly<OrgProfile> | null): OrgProfileDraft {
  const p = profile ?? EMPTY_ORG_PROFILE;
  return { organization_summary: p.organization_summary, products_services: [...p.products_services],
    learner_groups: p.learner_groups.map(row => ({ ...row })), glossary: p.glossary.map(row => ({ ...row })),
    key_processes: [...p.key_processes], culture_tone: p.culture_tone, design_conventions: [...p.design_conventions] };
}

/** Control characters removed: a tab becomes a space, a line break stays a line break (CR LF and CR become LF). */
function withoutControls(value: string): string {
  let result = '';
  for (const char of value.replace(/\r\n?/g, '\n')) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9) result += ' ';
    else if (code === 10 || code >= 32 && code < 127 || code > 159) result += char;
  }
  return result;
}
const collapse = (line: string) => line.replace(/ +/g, ' ').trim();
/** Spec §2: NFC, controls removed, runs of spaces collapsed, trimmed; line breaks kept only in the two long texts. */
export function normalizeOrgText(value: string, multiline: boolean): string {
  const text = withoutControls(value.normalize('NFC'));
  if (!multiline) return collapse(text.replace(/\n/g, ' '));
  return text.split('\n').map(collapse).join('\n').trim();
}
const isText = (field: OrgProfileField): field is OrgProfileTextField => (ORG_PROFILE_TEXT_FIELDS as readonly string[]).includes(field);
const isList = (field: OrgProfileField): field is OrgProfileListField => (ORG_PROFILE_LIST_FIELDS as readonly string[]).includes(field);

/** What Save sends: every text normalised, empty items and rows dropped. */
export function normalizeOrgProfile(draft: Readonly<OrgProfileDraft>): Readonly<OrgProfile> {
  const items = (values: readonly string[]) => values.map(value => normalizeOrgText(value, false)).filter(Boolean);
  return Object.freeze({
    organization_summary: normalizeOrgText(draft.organization_summary, true),
    products_services: items(draft.products_services),
    learner_groups: draft.learner_groups.map(row => ({ name: normalizeOrgText(row.name, false), description: normalizeOrgText(row.description, false) }))
      .filter(row => row.name || row.description),
    glossary: draft.glossary.map(row => ({ term: normalizeOrgText(row.term, false), meaning: normalizeOrgText(row.meaning, false) }))
      .filter(row => row.term || row.meaning),
    key_processes: items(draft.key_processes),
    culture_tone: normalizeOrgText(draft.culture_tone, true),
    design_conventions: items(draft.design_conventions),
  });
}

/** Every string empty and every list empty: such a profile cannot be confirmed. */
export function isOrgProfileEmpty(profile: Readonly<OrgProfile>): boolean {
  return !profile.organization_summary && !profile.culture_tone
    && [...ORG_PROFILE_LIST_FIELDS, ...ORG_PROFILE_ROW_FIELDS].every(field => profile[field].length === 0);
}

const fieldJson = (profile: Readonly<OrgProfile>, field: OrgProfileField) => JSON.stringify(field === 'learner_groups'
  ? profile.learner_groups.map(row => [row.name, row.description]) : field === 'glossary'
    ? profile.glossary.map(row => [row.term, row.meaning]) : profile[field]);
/** Fields whose normalised value differs from the version being edited (or the empty profile). Both sides go
 * through the same normalising, so a stored text never shows as changed just because it was opened. */
export function orgProfileChangedFields(draft: Readonly<OrgProfileDraft>, base: Readonly<OrgProfile> | null): OrgProfileField[] {
  const next = normalizeOrgProfile(draft), from = base ? normalizeOrgProfile(orgProfileDraftFrom(base)) : EMPTY_ORG_PROFILE;
  return ORG_PROFILE_FIELDS.filter(field => fieldJson(next, field) !== fieldJson(from, field));
}

export type OrgProfileIssue =
  | { kind: 'too_long'; field: OrgProfileField; index: number | null; part: string | null; max: number }
  | { kind: 'too_many_lines'; field: OrgProfileTextField; max: number }
  | { kind: 'too_many'; field: OrgProfileListField | OrgProfileRowField; max: number }
  | { kind: 'required'; field: OrgProfileRowField; index: number; part: string }
  | { kind: 'total_too_long'; max: number };
export interface OrgProfileFieldStats { length: number; count: number | null }

/** Live counters and problems of a draft, with the indexes of the draft (not of the saved profile). */
export function orgProfileReview(draft: Readonly<OrgProfileDraft>): {
  fields: Record<OrgProfileField, OrgProfileFieldStats>; total: number; issues: OrgProfileIssue[];
} {
  const issues: OrgProfileIssue[] = [];
  const fields = {} as Record<OrgProfileField, OrgProfileFieldStats>;
  for (const field of ORG_PROFILE_FIELDS) {
    if (isText(field)) {
      const value = normalizeOrgText(draft[field], true), limit = ORG_PROFILE_TEXT_LIMITS[field], length = codePointLength(value);
      if (length > limit.max) issues.push({ kind: 'too_long', field, index: null, part: null, max: limit.max });
      if (value && value.split('\n').length > limit.lines) issues.push({ kind: 'too_many_lines', field, max: limit.lines });
      fields[field] = { length, count: null };
    } else if (isList(field)) {
      const limit = ORG_PROFILE_LIST_LIMITS[field];
      let length = 0, count = 0;
      draft[field].forEach((raw, index) => {
        const value = normalizeOrgText(raw, false), size = codePointLength(value);
        if (!value) return;
        count++; length += size;
        if (size > limit.max) issues.push({ kind: 'too_long', field, index, part: null, max: limit.max });
      });
      if (count > limit.items) issues.push({ kind: 'too_many', field, max: limit.items });
      fields[field] = { length, count };
    } else {
      const limit = ORG_PROFILE_ROW_LIMITS[field];
      const parts: readonly { key: string; max: number; required: boolean }[] = limit.parts;
      const rows: readonly Readonly<Record<string, string>>[] = draft[field];
      let length = 0, count = 0;
      rows.forEach((row, index) => {
        const values = parts.map(part => normalizeOrgText(row[part.key] ?? '', false));
        if (values.every(value => !value)) return;
        count++;
        parts.forEach((part, at) => {
          const size = codePointLength(values[at]);
          length += size;
          if (part.required && !values[at]) issues.push({ kind: 'required', field, index, part: part.key });
          if (size > part.max) issues.push({ kind: 'too_long', field, index, part: part.key, max: part.max });
        });
      });
      if (count > limit.items) issues.push({ kind: 'too_many', field, max: limit.items });
      fields[field] = { length, count };
    }
  }
  const total = ORG_PROFILE_FIELDS.reduce((sum, field) => sum + fields[field].length, 0);
  if (total > ORG_PROFILE_TOTAL_MAX) issues.push({ kind: 'total_too_long', max: ORG_PROFILE_TOTAL_MAX });
  return { fields, total, issues };
}

/** The draft being edited and the server version it started from (optimistic concurrency). */
export interface OrgProfileEditor {
  draft: OrgProfileDraft;
  baseRevision: number;
  baseProfile: Readonly<OrgProfile> | null;
}
export function orgProfileEditorFrom(server: { revision: number; current: Readonly<OrgProfileVersion> | null }): OrgProfileEditor {
  return { draft: orgProfileDraftFrom(server.current?.profile ?? null), baseRevision: server.revision, baseProfile: server.current?.profile ?? null };
}
export function orgProfileEditorDirty(editor: OrgProfileEditor): boolean {
  return orgProfileChangedFields(editor.draft, editor.baseProfile).length > 0;
}
/** A newer server state replaces a draft without changes; a draft with changes is kept (its Save then meets the
 * conflict message, and the author may reload). Revisions only grow: an older snapshot (the cache before the
 * refetch that follows the author's own save) never rolls the editor back. */
export function syncOrgProfileEditor(editor: OrgProfileEditor | null, server: { revision: number; current: Readonly<OrgProfileVersion> | null }): OrgProfileEditor {
  if (!editor) return orgProfileEditorFrom(server);
  if (server.revision <= editor.baseRevision || orgProfileEditorDirty(editor)) return editor;
  return orgProfileEditorFrom(server);
}
/** Someone saved, confirmed, restored or drafted since this draft was opened. */
export function orgProfileEditorStale(editor: OrgProfileEditor, server: { revision: number }): boolean {
  return server.revision > editor.baseRevision;
}

export type OrgProfileStatus =
  | { kind: 'none' }
  | { kind: 'draft'; confirmedAt: string | null }
  | { kind: 'confirmed'; at: string; by: string | null };
/** Chưa có / Bản nháp chưa xác nhận / Đã xác nhận ngày … bởi … */
export function orgProfileStatus(profile: Readonly<OrgContextState['profile']>): OrgProfileStatus {
  if (!profile.current) return { kind: 'none' };
  if (profile.confirmed_version !== null && profile.current.version === profile.confirmed_version && profile.confirmed_at) {
    return { kind: 'confirmed', at: profile.confirmed_at, by: profile.confirmed_by_name };
  }
  return { kind: 'draft', confirmedAt: profile.confirmed_version !== null ? profile.confirmed_at : null };
}

export function orgContextDistillActive(state: Pick<OrgContextState, 'distill'>): boolean {
  return state.distill.status === 'queued' || state.distill.status === 'running';
}

/** Which profile buttons may be pressed now. */
export function orgProfileActions(input: {
  ready: boolean; notReadyReason: OrgContextNotReadyReason | null; distillActive: boolean; learnedCount: number; busy: boolean;
  dirty: boolean; valid: boolean; empty: boolean; currentVersion: number | null; confirmedVersion: number | null;
}): { editable: boolean; distill: boolean; save: boolean; confirm: boolean } {
  const editable = !input.distillActive && !input.busy && input.notReadyReason !== 'schema';
  return {
    editable,
    distill: editable && input.ready && input.learnedCount > 0,
    save: editable && input.dirty && input.valid,
    confirm: editable && input.valid && !input.empty
      && (input.dirty || input.currentVersion !== null && input.currentVersion !== input.confirmedVersion),
  };
}

// ── Tabs and the Create tab ──
export type WorkspaceLaunchTab = 'context' | 'create';
/** Context first until a profile is confirmed. */
export function orgContextDefaultTab(state: Pick<OrgContextState, 'profile'>): WorkspaceLaunchTab {
  return state.profile.confirmed_version === null ? 'context' : 'create';
}
/** What the Create tab may offer: null when the feature is off or its state is unknown. A confirmed version is offered
 * only with its date, so the switch line can always say which version it uses. */
export function orgContextLaunchOffer(read: OrgContextRead | undefined): { confirmedVersion: number | null; confirmedAt: string | null } | null {
  if (!read?.enabled) return null;
  const { confirmed_version: version, confirmed_at: at } = read.profile;
  return version !== null && at ? { confirmedVersion: version, confirmedAt: at } : { confirmedVersion: null, confirmedAt: null };
}

type Translate = (key: string, options?: Record<string, string | number>) => string;
/** The plain message of any org-context failure, with the field label and the space limit filled in. */
export function orgContextErrorText(t: Translate, error: unknown, locale: WorkspaceLocale, limitBytes: number): string {
  const copy = orgContextErrorMessage(error);
  return t(copy.key, { field: copy.field ? t(`aiIdOrgContext.profile.fields.${copy.field}.label`) : '',
    limit: formatOrgContextMegabytes(copy.limitBytes ?? limitBytes, locale) });
}
