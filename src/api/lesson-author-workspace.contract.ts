/** Mirrors the authorized workspace READ v1 contract, not edit/Apply readiness. */
export type WorkspaceLocale = 'vi' | 'en';
export type WorkspaceRunState = 'queued' | 'designing' | 'drafting' | 'ready' | 'needs_action' | 'failed' | 'canceled';
export type WorkspaceNodeKind = 'course' | 'chapter' | 'lesson' | 'unit' | 'component' | 'media_brief';
export type WorkspaceContentState = 'planned' | 'generating' | 'content_ready' | 'needs_action';
export type WorkspaceFailureStage = 'source_snapshot' | 'course_skeleton' | 'chapter_blueprint'
  | 'validate_architecture' | 'publish_inventory' | 'generate_unit' | 'validate_chapter' | 'finalize_course';
export type WorkspaceComponentType = 'html' | 'problem' | 'la_faq' | 'la_sortable' | 'la_crossword' | 'la_diagram';
export type WorkspaceMediaType = 'video' | 'static_infographic';
export type WorkspaceContentOrigin = 'provider_validated' | 'structured_fallback' | 'raw_source_fallback';
export type WorkspaceQualityState = 'validated' | 'review_required';
const WORKSPACE_COMPONENT_TYPES: readonly WorkspaceComponentType[] = ['html', 'problem', 'la_faq', 'la_sortable', 'la_crossword', 'la_diagram'];
const WORKSPACE_MEDIA_TYPES: readonly WorkspaceMediaType[] = ['video', 'static_infographic'];
export type WorkspaceJson = null | boolean | number | string | WorkspaceJson[] | { [key: string]: WorkspaceJson };
export interface WorkspaceContent {
  title: string;
  purpose: string | null;
  data: WorkspaceJson;
  implementation_notes: string | null;
}
export interface WorkspaceView {
  workspace_id: string;
  contract_version: 1;
  correlation_id: string;
  content_locale: WorkspaceLocale;
  status: WorkspaceRunState;
  last_event_sequence: number;
  updated_at: string;
}
export interface WorkspaceStatus extends WorkspaceView {
  node_count: number;
  unit_count: number;
  ready_unit_count: number;
  /** Safe, validated planning projection shown only before structure_ready. */
  architecture_preview?: WorkspaceArchitecturePreview | null;
  /** Safe server-owned identity only; never raw provider or exception text. */
  failure_code?: string | null;
  failure_stage?: WorkspaceFailureStage | null;
  failure_chapter_key?: string | null;
}
export type WorkspaceArchitecturePreviewState = 'planned' | 'generating' | 'ready' | 'needs_action';
export interface WorkspaceArchitecturePreviewChapter {
  chapter_key: string;
  order: number;
  title: string;
  state: WorkspaceArchitecturePreviewState;
}
export interface WorkspaceArchitecturePreviewNode {
  node_id: string;
  parent_id: string | null;
  kind: WorkspaceNodeKind;
  canonical_path: string;
  sort_order: number;
  title: string;
  state: WorkspaceArchitecturePreviewState;
  component_type: WorkspaceComponentType | null;
  media_type: WorkspaceMediaType | null;
}
export interface WorkspaceArchitecturePreview {
  run_id: string;
  course_title: string;
  total_chapters: number;
  completed_chapters: number;
  total_nodes: number;
  truncated: boolean;
  chapters: WorkspaceArchitecturePreviewChapter[];
  nodes: WorkspaceArchitecturePreviewNode[];
}
export interface WorkspaceNode {
  node_id: string;
  parent_id: string | null;
  kind: WorkspaceNodeKind;
  canonical_path: string;
  sort_order: number;
  content_state: WorkspaceContentState;
  current_revision: number | null;
  /** Safe server-owned presentation discriminator; null for non-component nodes. */
  component_type: WorkspaceComponentType | null;
  /** Safe server-owned presentation discriminator; null for non-media nodes. */
  media_type: WorkspaceMediaType | null;
  title: string | null;
  user_modified: boolean;
  /** True only when the exact current revision/hash has a successful Apply mapping. */
  applied: boolean;
  /** Optional during rolling deploys; present for generated unit/component baselines. */
  content_origin?: WorkspaceContentOrigin | null;
  quality_state?: WorkspaceQualityState | null;
}
export interface WorkspaceGraph extends WorkspaceView {
  snapshot_sequence: number;
  overview_ready: boolean;
  structure_ready: boolean;
  total_nodes: number;
  nodes: WorkspaceNode[];
  has_more: boolean;
  next_after_node_id: string | null;
}
const EVENT_KINDS = ['workspace_created', 'architecture_started', 'architecture_progressed', 'overview_ready', 'structure_ready',
  'unit_started', 'unit_ready', 'node_revision_saved', 'node_reset', 'scope_apply_started',
  'scope_applied', 'run_needs_action', 'run_ready', 'run_failed', 'run_canceled'] as const;
export interface WorkspaceEvent {
  sequence: number;
  event_kind: typeof EVENT_KINDS[number];
  node_id: string | null;
  node_revision: number | null;
  operation_id: string;
  created_at: string;
}
export interface WorkspaceEvents extends WorkspaceView {
  events: WorkspaceEvent[];
  next_sequence: number;
  has_more: boolean;
}
export interface WorkspaceDetail extends WorkspaceView {
  node_id: string;
  parent_id: string | null;
  kind: WorkspaceNodeKind;
  /** Server binding only. Missing/null means the renderer must not infer a type from data. */
  component_type?: WorkspaceComponentType | null;
  media_type?: WorkspaceMediaType | null;
  content_state: WorkspaceContentState;
  current_revision: number | null;
  content: WorkspaceContent | null;
  user_modified: boolean;
  validation_contract: string | null;
  content_origin?: WorkspaceContentOrigin | null;
  quality_state?: WorkspaceQualityState | null;
  author_review?: {
    purpose: string | null;
    example_scenario: string | null;
    visual_asset: string | null;
    user_behavior_navigation: string | null;
  } | null;
}

// Safe client copy by code: never expose arbitrary transport/server exception text.
const ERROR_COPY = {
  AUTH_REQUIRED: ['Chưa xác thực.', 'Authentication is required.'],
  WORKSPACE_READ_FORBIDDEN: ['Bạn không có quyền xem bản thiết kế khoá học này.', 'You do not have permission to view this draft.'],
  WORKSPACE_READ_DISABLED: ['Tính năng bản thiết kế khoá học chưa được bật.', 'The draft workspace is not enabled.'],
  WORKSPACE_READ_INPUT_INVALID: ['Thông tin yêu cầu không hợp lệ.', 'The request parameters are invalid.'],
  WORKSPACE_NOT_FOUND: ['Không tìm thấy bản thiết kế khoá học.', 'The draft was not found.'],
  WORKSPACE_NODE_NOT_FOUND: ['Không tìm thấy mục nội dung.', 'The content node was not found.'],
  WORKSPACE_REVISION_CONFLICT: ['Nội dung đã thay đổi. Bản sửa chưa lưu vẫn được giữ.', 'The content has changed. Unsaved edits are preserved.'],
  WORKSPACE_EVENT_RESNAPSHOT_REQUIRED: ['Cần tải lại trạng thái bản thiết kế khoá học.', 'Please reload the draft snapshot.'],
  WORKSPACE_READ_UNAVAILABLE: ['Chưa thể đọc bản thiết kế khoá học. Vui lòng thử lại sau.', 'The draft is temporarily unavailable. Please try again later.'],
  WORKSPACE_READ_CONTRACT_INVALID: ['Dữ liệu bản thiết kế khoá học không hợp lệ.', 'The draft response is invalid.'],
  WORKSPACE_READ_LIMIT: ['Bản thiết kế khoá học vượt giới hạn đọc của giao diện.', 'The draft exceeds the client read limit.'],
} as const;
export type WorkspaceReadCode = keyof typeof ERROR_COPY;
export class WorkspaceReadError extends Error {
  readonly code: WorkspaceReadCode;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  constructor(code: WorkspaceReadCode, status?: number, requestId?: string) {
    super(code);
    this.name = 'WorkspaceReadError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}
export function workspaceReadMessage(code: WorkspaceReadCode, locale: WorkspaceLocale): string {
  return ERROR_COPY[code][locale === 'en' ? 1 : 0];
}
export function workspaceReadFailure(error: unknown): WorkspaceReadError {
  if (error instanceof WorkspaceReadError) return error;
  const response = (error as { response?: { status?: number; data?: Record<string, unknown> } } | null)?.response;
  const code = response?.data?.code;
  const fallback = response?.status === 401 ? 'AUTH_REQUIRED'
    : response?.status === 403 ? 'WORKSPACE_READ_FORBIDDEN' : 'WORKSPACE_READ_UNAVAILABLE';
  return new WorkspaceReadError(typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_COPY, code)
    ? code as WorkspaceReadCode : fallback, response?.status,
  isWorkspaceId(response?.data?.request_id) ? response.data.request_id : undefined);
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function isWorkspaceSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new WorkspaceReadError('WORKSPACE_READ_CONTRACT_INVALID');
}
function object(value: unknown): Record<string, unknown> {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function view(value: unknown): WorkspaceView {
  const v = object(value);
  requireValid(v.contract_version === 1 && isWorkspaceId(v.workspace_id) && isWorkspaceId(v.correlation_id)
    && (v.content_locale === 'en' || v.content_locale === 'vi') && timestamp(v.updated_at)
    && isWorkspaceSequence(v.last_event_sequence)
    && ['queued', 'designing', 'drafting', 'ready', 'needs_action', 'failed', 'canceled'].includes(v.status as string));
  return v as unknown as WorkspaceView;
}
function node(value: unknown): void {
  const v = object(value);
  requireValid(isWorkspaceId(v.node_id) && (v.parent_id === null || isWorkspaceId(v.parent_id))
    && ['course', 'chapter', 'lesson', 'unit', 'component', 'media_brief'].includes(v.kind as string)
    && (v.kind === 'course') === (v.parent_id === null) && v.parent_id !== v.node_id
    && ['planned', 'generating', 'content_ready', 'needs_action'].includes(v.content_state as string)
    && (v.current_revision === null || isWorkspaceSequence(v.current_revision))
    && (v.content_state === 'content_ready') === (v.current_revision !== null)
    && typeof v.user_modified === 'boolean' && (v.current_revision !== null || !v.user_modified));
}
function quality(value: Record<string, unknown>): void {
  const origin = value.content_origin;
  const state = value.quality_state;
  const missing = origin === undefined && state === undefined;
  const empty = origin === null && state === null;
  if (missing || empty) return;
  const compatible = origin === 'provider_validated' && state === 'validated'
    || origin === 'structured_fallback' && (state === 'validated' || state === 'review_required')
    || origin === 'raw_source_fallback' && state === 'review_required';
  requireValid(['unit', 'component'].includes(String(value.kind))
    && ['provider_validated', 'structured_fallback', 'raw_source_fallback'].includes(String(origin))
    && ['validated', 'review_required'].includes(String(state))
    && compatible);
}
function architecturePreview(value: unknown): void {
  if (value === undefined || value === null) return;
  const preview = object(value);
  requireValid(isWorkspaceId(preview.run_id) && typeof preview.course_title === 'string'
    && !!preview.course_title.trim() && preview.course_title.length <= 500
    && isWorkspaceSequence(preview.total_chapters)
    && preview.total_chapters <= 512 && isWorkspaceSequence(preview.completed_chapters)
    && preview.completed_chapters <= preview.total_chapters && Array.isArray(preview.chapters)
    && preview.chapters.length === preview.total_chapters
    && isWorkspaceSequence(preview.total_nodes) && preview.total_nodes >= 1 && preview.total_nodes <= 10_000
    && typeof preview.truncated === 'boolean' && Array.isArray(preview.nodes)
    && preview.nodes.length === preview.total_nodes);
  const keys = new Set<string>();
  let completed = 0;
  for (const [index, raw] of (preview.chapters as unknown[]).entries()) {
    const chapter = object(raw);
    requireValid(typeof chapter.chapter_key === 'string' && /^[a-z0-9][a-z0-9_.:-]{0,159}$/.test(chapter.chapter_key)
      && !keys.has(chapter.chapter_key) && chapter.order === index
      && typeof chapter.title === 'string' && !!chapter.title.trim() && chapter.title.length <= 500
      && ['planned', 'generating', 'ready', 'needs_action'].includes(chapter.state as string));
    keys.add(chapter.chapter_key);
    if (chapter.state === 'ready') completed++;
  }
  requireValid(completed === preview.completed_chapters);
  const ids = new Set<string>();
  const paths = new Set<string>();
  const previewNodes = preview.nodes as unknown[];
  const parsedNodes = new Map<string, Record<string, unknown>>();
  for (const raw of previewNodes) {
    const previewNode = object(raw);
    requireValid(isWorkspaceId(previewNode.node_id)
      && (previewNode.parent_id === null || isWorkspaceId(previewNode.parent_id))
      && ['course', 'chapter', 'lesson', 'unit', 'component', 'media_brief'].includes(previewNode.kind as string)
      && typeof previewNode.canonical_path === 'string'
      && /^[A-Za-z][A-Za-z0-9_.-]{0,239}$/.test(previewNode.canonical_path)
      && isWorkspaceSequence(previewNode.sort_order)
      && typeof previewNode.title === 'string' && !!previewNode.title.trim() && previewNode.title.length <= 500
      && ['planned', 'generating', 'ready', 'needs_action'].includes(previewNode.state as string)
      && !ids.has(String(previewNode.node_id).toLowerCase()) && !paths.has(previewNode.canonical_path)
      && (previewNode.kind === 'component'
        ? WORKSPACE_COMPONENT_TYPES.includes(previewNode.component_type as WorkspaceComponentType)
        : previewNode.component_type === null)
      && (previewNode.kind === 'media_brief'
        ? WORKSPACE_MEDIA_TYPES.includes(previewNode.media_type as WorkspaceMediaType)
        : previewNode.media_type === null));
    const id = String(previewNode.node_id).toLowerCase();
    ids.add(id); paths.add(previewNode.canonical_path as string); parsedNodes.set(id, previewNode);
  }
  const roots = [...parsedNodes.values()].filter(previewNode => previewNode.parent_id === null);
  requireValid(roots.length === 1 && roots[0]?.kind === 'course' && roots[0]?.canonical_path === 'course');
  const expectedParentKind: Partial<Record<WorkspaceNodeKind, WorkspaceNodeKind>> = {
    chapter: 'course', lesson: 'chapter', unit: 'lesson', component: 'unit', media_brief: 'unit',
  };
  for (const previewNode of parsedNodes.values()) {
    if (previewNode.kind === 'course') {
      requireValid(previewNode.parent_id === null);
      continue;
    }
    const parent = parsedNodes.get(String(previewNode.parent_id).toLowerCase());
    requireValid(!!parent && parent.kind === expectedParentKind[previewNode.kind as WorkspaceNodeKind]);
  }
}
export function readWorkspaceStatus(value: unknown): WorkspaceStatus {
  const v = object(value); view(v);
  requireValid(isWorkspaceSequence(v.node_count) && isWorkspaceSequence(v.unit_count)
    && isWorkspaceSequence(v.ready_unit_count) && v.ready_unit_count <= v.unit_count && v.unit_count <= v.node_count);
  architecturePreview(v.architecture_preview);
  const failureCode = v.failure_code;
  const failureStage = v.failure_stage;
  const failureChapterKey = v.failure_chapter_key;
  requireValid((failureCode === undefined || failureCode === null
      || typeof failureCode === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(failureCode))
    && (failureStage === undefined || failureStage === null || [
      'source_snapshot', 'course_skeleton', 'chapter_blueprint', 'validate_architecture',
      'publish_inventory', 'generate_unit', 'validate_chapter', 'finalize_course',
    ].includes(failureStage as string))
    && (failureChapterKey === undefined || failureChapterKey === null
      || typeof failureChapterKey === 'string' && /^[a-z0-9][a-z0-9_.:-]{0,159}$/.test(failureChapterKey))
    && (!(failureStage === undefined || failureStage === null) || failureChapterKey === undefined || failureChapterKey === null)
    && (!(failureCode === undefined || failureCode === null)
      || (failureStage === undefined || failureStage === null) && (failureChapterKey === undefined || failureChapterKey === null)));
  return v as unknown as WorkspaceStatus;
}
export function readWorkspaceGraph(value: unknown): WorkspaceGraph {
  const v = object(value); view(v);
  requireValid(isWorkspaceSequence(v.snapshot_sequence) && v.snapshot_sequence === v.last_event_sequence
    && isWorkspaceSequence(v.total_nodes) && typeof v.overview_ready === 'boolean' && typeof v.structure_ready === 'boolean'
    && (!v.structure_ready || v.overview_ready) && typeof v.has_more === 'boolean'
    && Array.isArray(v.nodes) && v.nodes.length <= 100 && v.nodes.length <= v.total_nodes
    && (v.structure_ready ? v.total_nodes > 0 : v.total_nodes === 0 && v.nodes.length === 0));
  let previous = '';
  for (const raw of v.nodes) {
    node(raw); const n = object(raw); quality(n);
    requireValid(isWorkspaceId(n.node_id) && n.node_id.toLowerCase() > previous
      && typeof n.canonical_path === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,239}$/.test(n.canonical_path)
      && isWorkspaceSequence(n.sort_order)
      && typeof n.applied === 'boolean' && (n.current_revision !== null || !n.applied)
      && (n.kind === 'component'
        ? WORKSPACE_COMPONENT_TYPES.includes(n.component_type as WorkspaceComponentType)
        : n.component_type === null)
      && (n.kind === 'media_brief'
        ? WORKSPACE_MEDIA_TYPES.includes(n.media_type as WorkspaceMediaType)
        : n.media_type === null)
      && (n.title === null || typeof n.title === 'string' && !!n.title.trim() && n.title.length <= 500)
      && (n.current_revision === null || n.title !== null));
    previous = n.node_id.toLowerCase();
  }
  requireValid(v.has_more ? v.nodes.length === 100 && v.next_after_node_id === previous : v.next_after_node_id === null);
  return v as unknown as WorkspaceGraph;
}
export function readWorkspaceEvents(value: unknown, after: number): WorkspaceEvents {
  const v = object(value); const base = view(v);
  requireValid(isWorkspaceSequence(after) && Array.isArray(v.events) && v.events.length <= 100
    && isWorkspaceSequence(v.next_sequence) && typeof v.has_more === 'boolean');
  if (after > base.last_event_sequence || v.events.length !== Math.min(100, base.last_event_sequence - after)) {
    throw new WorkspaceReadError('WORKSPACE_EVENT_RESNAPSHOT_REQUIRED');
  }
  for (const [index, raw] of v.events.entries()) {
    const e = object(raw);
    if (e.sequence !== after + index + 1) throw new WorkspaceReadError('WORKSPACE_EVENT_RESNAPSHOT_REQUIRED');
    requireValid(EVENT_KINDS.includes(e.event_kind as WorkspaceEvent['event_kind'])
      && (e.node_id === null || isWorkspaceId(e.node_id)) && (e.node_revision === null || isWorkspaceSequence(e.node_revision))
      && (e.node_revision === null || e.node_id !== null) && isWorkspaceId(e.operation_id) && timestamp(e.created_at)
      && (!['node_revision_saved', 'node_reset'].includes(e.event_kind as string) || e.node_id !== null && e.node_revision !== null));
  }
  requireValid(v.next_sequence === after + v.events.length && v.has_more === (v.next_sequence < base.last_event_sequence));
  return v as unknown as WorkspaceEvents;
}
function json(value: unknown, depth = 0): void {
  requireValid(depth <= 48);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { requireValid(Number.isFinite(value)); return; }
  if (Array.isArray(value)) { value.forEach(item => json(item, depth + 1)); return; }
  for (const [key, child] of Object.entries(object(value))) {
    requireValid(!['__proto__', 'constructor', 'prototype'].includes(key));
    json(child, depth + 1);
  }
}
export function readWorkspaceDetail(value: unknown): WorkspaceDetail {
  const v = object(value); view(v); node(v); quality(v);
  requireValid((v.component_type === undefined || v.component_type === null
    || v.kind === 'component' && WORKSPACE_COMPONENT_TYPES.includes(v.component_type as WorkspaceComponentType))
    && (v.media_type === undefined || v.media_type === null
    || v.kind === 'media_brief' && WORKSPACE_MEDIA_TYPES.includes(v.media_type as WorkspaceMediaType)));
  if (v.current_revision === null) requireValid(v.content === null && v.validation_contract === null);
  else {
    const c = object(v.content);
    requireValid(Object.keys(c).length === 4 && ['title', 'purpose', 'data', 'implementation_notes'].every(k => Object.prototype.hasOwnProperty.call(c, k))
      && typeof c.title === 'string' && !!c.title.trim() && c.title.length <= 500
      && [c.purpose, c.implementation_notes].every(s => s === null || typeof s === 'string' && s.length <= 8000)
      && typeof v.validation_contract === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(v.validation_contract));
    json(c);
    requireValid(new TextEncoder().encode(JSON.stringify(c)).byteLength <= 2 * 1024 * 1024);
  }
  if (v.author_review !== undefined && v.author_review !== null) {
    const review = object(v.author_review);
    requireValid(Object.keys(review).length === 4
      && ['purpose', 'example_scenario', 'visual_asset', 'user_behavior_navigation']
        .every(key => Object.prototype.hasOwnProperty.call(review, key))
      && Object.values(review).every(value => value === null
        || typeof value === 'string' && !!value.trim() && value.length <= 2000));
  }
  return v as unknown as WorkspaceDetail;
}
