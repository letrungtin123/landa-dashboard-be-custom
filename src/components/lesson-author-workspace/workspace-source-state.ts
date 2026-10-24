import type { ChatConversation, LessonAuthorSettings, LessonAuthorSourceDocument, LessonAuthorTranscriptionJob } from '../../api/custom-chat';
import type { workspaceSourceApi } from '../../api/workspace-sources';
import type { SourceStreamClient, SourceStreamDocument, SourceStreamScope, SourceStreamState } from '../../api/workspace-source-stream';
import { WorkspaceCreateError, workspaceCreateFailure, type createWorkspaceCreateClient, type WorkspaceCreateRequest } from '../../api/workspace-create';
import { isWorkspaceId, type WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { isWorkspaceLaunchBriefErrorCode, type WorkspaceHostScope, type WorkspaceLaunchBriefErrorCode,
  type WorkspaceLaunchContext } from '../../api/workspace-launch.contract';
import { DEFAULT_WORKSPACE_LAUNCH_BRIEF, isWorkspaceDesignMode, workspaceLaunchBriefFields, workspaceOrgContextOffer,
  workspaceOrgContextRequestField, type WorkspaceLaunchBriefDraft, type WorkspaceOrgContextChoice } from './workspace-launch-brief.logic';
import { isTransientReadFailure, SOURCE_DELETE_SETTLE_DELAYS_MS, workspaceSourceDeleteIssue, workspaceSourceDeleteOutcome,
  workspaceSourceDeletePlan, type WorkspaceSourceDeleteOutcome } from './workspace-source.logic';

export interface WorkspaceSourceState {
  busy: boolean;
  phase: 'idle' | 'reading' | 'uploading' | 'creating' | 'deleting';
  ready: boolean;
  /** The author may delete documents from the knowledge base (same permission as the knowledge base page). */
  canDelete: boolean;
  unknown: boolean;
  issue: 'unavailable' | 'connection' | 'source_not_ready' | 'source_failed' | 'invalid_file' | 'rejected' | 'unknown'
    | 'brief_rejected' | null;
  /** Server reason when issue is 'brief_rejected' (the brief can be fixed and Create pressed again). */
  briefError: WorkspaceLaunchBriefErrorCode | null;
  /** Start-screen choice and texts; Create sends a trimmed copy taken when it is pressed. */
  brief: Readonly<WorkspaceLaunchBriefDraft>;
  /** "Use the organization profile": null while the feature is off or unknown (Create then sends no such key). */
  organizationContext: Readonly<WorkspaceOrgContextChoice> | null;
  documents: readonly LessonAuthorSourceDocument[];
  selectedId: string | null;
  conversation: ChatConversation | null;
  transcript: LessonAuthorTranscriptionJob | null;
  progress: number | null;
  contentLocale: WorkspaceLocale;
  sourceObservation: 'idle' | 'connecting' | 'indexing' | 'failed' | 'unavailable';
  operation: Readonly<WorkspaceCreateRequest> | null;
}

/** GET retries only: a backend restart or proxy hiccup lasts a few seconds and
 * must not leave the panel stuck until the page is reloaded. */
const READ_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;
const defaultWait = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

/** No timer, restoration, effect or read can dispatch Create. The upload
 * receipt is rendered optimistically, then an exact-document SSE snapshot is
 * the only readiness authority for that upload. */
export function createWorkspaceSourceState(scope: WorkspaceHostScope, dependencies: {
  api: typeof workspaceSourceApi;
  create: ReturnType<typeof createWorkspaceCreateClient>;
  authorized: () => boolean;
  canUpload: () => boolean;
  /** Live knowledge base delete permission; absent means no delete controls. The server checks it again. */
  canDelete?: () => boolean;
  visible: () => boolean;
  operationId: () => string;
  onCreated: (context: WorkspaceLaunchContext) => void | Promise<void>;
  locale: WorkspaceLocale;
  stream: (scope: SourceStreamScope, dependencies: {
    active: () => boolean;
    onDocument: (document: SourceStreamDocument) => void;
    onState: (state: SourceStreamState) => void;
  }) => SourceStreamClient;
  wait?: (ms: number) => Promise<void>;
}) {
  const wait = dependencies.wait ?? defaultWait;
  let disposed = false, panelVisible = true, locale = dependencies.locale, settings: LessonAuthorSettings | null = null;
  let preferredConversationId: string | null = null, forceNewConversation = false;
  let sourceStream: SourceStreamClient | null = null, sourceStreamDocumentId: string | null = null, sourceStreamSerial = 0;
  const listeners = new Set<() => void>();
  let state: Readonly<WorkspaceSourceState> = Object.freeze({ busy: false, phase: 'idle', ready: false, canDelete: false, unknown: false, issue: null,
    briefError: null, brief: DEFAULT_WORKSPACE_LAUNCH_BRIEF, organizationContext: null, documents: [], selectedId: null, conversation: null, transcript: null, progress: null, contentLocale: locale,
    sourceObservation: 'idle', operation: null });
  const emit = (patch: Partial<WorkspaceSourceState>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) { try { listener(); } catch { /* View cannot dispatch work. */ } }
  };
  const allowed = () => !disposed && dependencies.authorized();
  const canDelete = () => allowed() && (dependencies.canDelete?.() ?? false);
  const streamActive = () => allowed() && panelVisible && dependencies.visible();
  function assertActive() { if (!allowed() || !panelVisible || !dependencies.visible()) throw new WorkspaceCreateError('rejected', 'WORKSPACE_READ_FORBIDDEN'); }
  function stopSourceObservation(next: WorkspaceSourceState['sourceObservation'] = 'idle') {
    sourceStreamSerial++;
    const current = sourceStream; sourceStream = null; sourceStreamDocumentId = null;
    current?.close();
    emit({ sourceObservation: next });
  }
  function owned(c: ChatConversation) {
    return c && isWorkspaceId(c.id) && c.user_id === scope.actorId && c.tenant_id === scope.tenantId && c.course_id === scope.courseId
      && c.target === 'lesson_author' && c.bot_id === settings?.active_bot?.bot_id;
  }
  function validSettings(s: LessonAuthorSettings) {
    return s?.active_bot?.target === 'lesson_author' && s.active_bot.tenant_id === scope.tenantId && s.active_bot.ai_active_engine === 'self_built_rag'
      && isWorkspaceId(s.active_bot.bot_id) && s.active_kb?.tenant_id === scope.tenantId && s.active_kb.target === 'lesson_author'
      && isWorkspaceId(s.active_kb.kb_id) && s.active_persona?.tenant_id === scope.tenantId && s.active_persona.target === 'lesson_author'
      && s.active_persona.bot_id === s.active_bot.bot_id && isWorkspaceId(s.active_persona.persona_id);
  }
  function normalizeDocuments(value: readonly LessonAuthorSourceDocument[]) {
    if (!settings || !Array.isArray(value) || value.length > 50) throw new Error('UNAVAILABLE');
    const documents = value.filter(d => isWorkspaceId(d.document_id) && d.kb_id === settings!.active_kb!.kb_id
      && typeof d.name === 'string' && d.name.length <= 500).map(d => Object.freeze({ ...d }));
    const retained = state.documents.find(d => d.document_id === state.selectedId && !documents.some(next => next.document_id === d.document_id)
      && (d.status === 'learning' || d.status === 'error'));
    return Object.freeze(retained ? [Object.freeze({ ...retained }), ...documents] : documents);
  }
  function mergeDocument(document: LessonAuthorSourceDocument) {
    const next = [Object.freeze({ ...document }), ...state.documents.filter(value => value.document_id !== document.document_id)];
    emit({ documents: Object.freeze(next.slice(0, 50)) });
  }
  function observeUploadedSource(document: LessonAuthorSourceDocument) {
    if (!isWorkspaceId(document.document_id) || !settings || document.kb_id !== settings.active_kb?.kb_id) return;
    stopSourceObservation();
    mergeDocument(document);
    sourceStreamDocumentId = document.document_id;
    const serial = ++sourceStreamSerial;
    sourceStream = dependencies.stream({ documentId: document.document_id, locale }, {
      active: () => serial === sourceStreamSerial && sourceStreamDocumentId === document.document_id && streamActive(),
      onDocument: (next: SourceStreamDocument) => {
        if (serial !== sourceStreamSerial || next.document_id !== sourceStreamDocumentId || next.kb_id !== settings?.active_kb?.kb_id) return;
        mergeDocument(next);
        if (next.status === 'learned') {
          sourceStream = null; sourceStreamDocumentId = null;
          emit({ ready: true, issue: null, sourceObservation: 'idle' });
        } else if (next.status === 'error') {
          sourceStream = null; sourceStreamDocumentId = null;
          emit({ ready: true, issue: 'source_failed', sourceObservation: 'failed' });
        } else emit({ ready: true, sourceObservation: 'indexing' });
      },
      onState: next => {
        // A terminal push already released the stream; late transport noise
        // must not repaint a ready source as connecting.
        if (serial !== sourceStreamSerial || sourceStreamDocumentId !== document.document_id) return;
        if (next === 'connecting' || next === 'reconnecting') emit({ sourceObservation: 'connecting' });
        else if (next === 'live') emit({ sourceObservation: 'indexing' });
        else if (next === 'blocked' || next === 'unavailable') {
          // The client has stopped; a later refresh may open a fresh stream.
          sourceStream = null; sourceStreamDocumentId = null;
          emit({ sourceObservation: 'unavailable' });
        }
      },
    });
    emit({ sourceObservation: 'connecting' });
    sourceStream.start();
  }
  /** After a list read, the server list is authoritative: resume live status
   * for a selected document that is still learning, and clear a stale
   * "connection lost" note for one that has finished. */
  function reconcileSourceObservation() {
    const selected = state.documents.find(d => d.document_id === state.selectedId);
    if (selected?.status === 'learning') {
      if (sourceStreamDocumentId !== selected.document_id) observeUploadedSource(selected);
      return;
    }
    const watched = sourceStreamDocumentId ? state.documents.find(d => d.document_id === sourceStreamDocumentId) : null;
    if (watched?.status === 'learning') return;
    if (sourceStream || state.sourceObservation !== 'idle' && state.sourceObservation !== 'failed') {
      stopSourceObservation(selected?.status === 'error' ? 'failed' : 'idle');
    }
  }
  async function read<T>(load: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await load(); }
      catch (error) {
        if (attempt >= READ_RETRY_DELAYS_MS.length || !isTransientReadFailure(error)) throw error;
        await wait(READ_RETRY_DELAYS_MS[attempt]); assertActive();
      }
    }
  }
  async function readPrerequisites() {
    assertActive(); const next = await read(() => dependencies.api.settings()); assertActive();
    if (!validSettings(next)) throw new Error('UNAVAILABLE');
    const changed = settings && (settings.active_bot?.bot_id !== next.active_bot?.bot_id || settings.active_kb?.kb_id !== next.active_kb?.kb_id
      || settings.active_persona?.persona_id !== next.active_persona?.persona_id);
    settings = next;
    if (changed) { stopSourceObservation(); emit({ conversation: null, selectedId: null, transcript: null }); }
    const docs = await read(() => dependencies.api.documents()); assertActive();
    const documents = normalizeDocuments(docs);
    const convs = await read(() => dependencies.api.conversations(scope.courseId)); assertActive();
    if (!Array.isArray(convs)) throw new Error('UNAVAILABLE');
    const retained = convs.find(c => c.id === state.conversation?.id && owned(c)) ?? null;
    const preferred = preferredConversationId ? convs.find(c => c.id === preferredConversationId && owned(c)) ?? null : null;
    // A selected session is an exact identity boundary. Never silently fall
    // back to another conversation if it was deleted or became unauthorized.
    if (preferredConversationId && !forceNewConversation && !preferred) throw new Error('UNAVAILABLE');
    const conversation = forceNewConversation ? null : preferredConversationId ? preferred : retained ?? convs.find(owned) ?? null;
    emit({ documents, conversation: conversation ? Object.freeze({ ...conversation }) : null, ready: true, canDelete: canDelete() });
  }
  async function conversation() {
    if (state.conversation && owned(state.conversation)) return state.conversation;
    assertActive();
    let c: ChatConversation;
    try { c = await dependencies.api.createConversation(scope.courseId, settings!.active_persona!.persona_id); }
    catch (error) { throw workspaceCreateFailure(error); }
    if (!allowed()) throw new WorkspaceCreateError('unknown', 'CONVERSATION_UNCONFIRMED');
    if (!owned(c)) throw new WorkspaceCreateError('unknown', 'CONVERSATION_UNCONFIRMED');
    emit({ conversation: Object.freeze({ ...c }) }); return c;
  }
  function job(value: LessonAuthorTranscriptionJob, conversationId: string) {
    if (!value || !isWorkspaceId(value.id) || value.conversation_id !== conversationId
      || !['queued', 'running', 'succeeded', 'failed', 'expired', 'committed'].includes(value.status)
      || value.kb_document_id !== null && !isWorkspaceId(value.kb_document_id)) throw new Error('TRANSCRIPT_INVALID');
    return Object.freeze({ ...value });
  }
  async function run(phase: WorkspaceSourceState['phase'], work: () => Promise<void>, mutation = false) {
    if (state.busy || disposed || mutation && state.unknown) return;
    try { assertActive(); } catch { emit({ ready: false, issue: 'unavailable' }); return; }
    emit({ busy: true, phase, issue: state.unknown ? 'unknown' : null, briefError: null, progress: null });
    try { await work(); }
    catch (error) {
      if (disposed) return;
      const failure = error instanceof WorkspaceCreateError ? error : null;
      const unknown = state.unknown || failure?.outcome === 'unknown';
      // A brief validation refusal is definite and leaves the fresh source
      // state usable: the author fixes the text and presses Create again.
      if (!unknown && failure?.outcome === 'rejected' && isWorkspaceLaunchBriefErrorCode(failure.code)) {
        emit({ issue: 'brief_rejected', briefError: failure.code }); return;
      }
      emit({ ready: false, unknown, issue: unknown ? 'unknown' : failure ? 'rejected' : isTransientReadFailure(error) ? 'connection' : 'unavailable' });
    } finally { emit({ busy: false, phase: 'idle', progress: null }); }
  }
  const progress = (value: number | null) => { if (allowed()) emit({ progress: value === null || !Number.isFinite(value) ? null : Math.min(100, Math.max(0, value)) }); };
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setVisible(value: boolean) {
      panelVisible = value;
      if (!value) stopSourceObservation();
      else {
        const selected = state.documents.find(d => d.document_id === state.selectedId);
        if (selected?.status === 'learning') observeUploadedSource(selected);
      }
    },
    setUiLocale(value: WorkspaceLocale) {
      locale = value;
      if (!state.operation) emit({ contentLocale: value });
    },
    beginNewSession() {
      if (state.busy || state.unknown || !allowed()) return;
      stopSourceObservation(); preferredConversationId = null; forceNewConversation = true;
      emit({ conversation: null, transcript: null, selectedId: null, issue: null, operation: null });
    },
    resumeSession(conversationId: string) {
      if (state.busy || state.unknown || !allowed() || !isWorkspaceId(conversationId)) return;
      stopSourceObservation(); preferredConversationId = conversationId; forceNewConversation = false;
      emit({ conversation: null, transcript: null, selectedId: null, issue: null, operation: null });
    },
    /** Editing is closed only while Create is in flight or its outcome is unknown. */
    setBrief(patch: Partial<WorkspaceLaunchBriefDraft>) {
      if (state.phase === 'creating' || state.unknown || !allowed()) return;
      const next = { ...state.brief };
      if (patch.design_mode !== undefined && (patch.design_mode === null || isWorkspaceDesignMode(patch.design_mode))) next.design_mode = patch.design_mode;
      if (typeof patch.learner_audience === 'string') next.learner_audience = patch.learner_audience;
      if (typeof patch.course_purpose === 'string') next.course_purpose = patch.course_purpose;
      emit({ brief: Object.freeze(next), ...(state.issue === 'brief_rejected' ? { issue: null, briefError: null } : {}) });
    },
    /** From the context tab's server state (null: feature off or unknown). A Create already in flight keeps the
     * choice it was built with. */
    setOrganizationContextOffer(offer: { confirmedVersion: number | null } | null) {
      const next = workspaceOrgContextOffer(state.organizationContext, offer);
      if (next !== state.organizationContext) emit({ organizationContext: next });
    },
    /** The author's switch; closed like the brief while Create is in flight or its outcome is unknown. */
    setUseOrganizationContext(value: boolean) {
      const current = state.organizationContext;
      if (state.phase === 'creating' || state.unknown || !allowed() || !current || current.confirmedVersion === null
        || typeof value !== 'boolean' || current.use === value) return;
      emit({ organizationContext: Object.freeze({ ...current, use: value }),
        ...(state.issue === 'brief_rejected' ? { issue: null, briefError: null } : {}) });
    },
    select(documentId: string) {
      if (!state.busy && !state.unknown && allowed() && state.documents.some(d => d.document_id === documentId)) emit({ selectedId: documentId, issue: null });
    },
    refresh: () => run('reading', async () => { await readPrerequisites(); reconcileSourceObservation(); }),
    create: () => run('creating', async () => {
      // The brief as shown when Create was pressed; an incomplete brief never dispatches.
      const brief = workspaceLaunchBriefFields(state.brief);
      if (!brief) return;
      const organization = workspaceOrgContextRequestField(state.organizationContext, brief.design_mode);
      await readPrerequisites(); assertActive();
      const source = state.documents.find(d => d.document_id === state.selectedId && d.status === 'learned');
      if (!source) { emit({ issue: 'source_not_ready' }); return; }
      const c = await conversation(); assertActive();
      const request: Readonly<WorkspaceCreateRequest> = Object.freeze({ operation_id: dependencies.operationId(),
        source_document_ids: [source.document_id], content_locale: state.contentLocale, ...brief, ...organization });
      emit({ operation: request });
      let result: WorkspaceLaunchContext;
      try { result = await dependencies.create(c.id, request, locale); }
      catch (error) { throw workspaceCreateFailure(error); }
      if (allowed()) await dependencies.onCreated(result);
    }, true),
    upload: (file: File) => run('uploading', async () => {
      const video = file.name.toLowerCase().endsWith('.mp4');
      if (!file.size || (!video && (!/\.(pdf|docx?|pptx|txt|md|csv)$/i.test(file.name) || file.size > 50 * 1024 * 1024))) {
        emit({ issue: 'invalid_file' }); return;
      }
      if (!video && !dependencies.canUpload()) throw new Error('UPLOAD_FORBIDDEN');
      await readPrerequisites(); assertActive();
      if (video) {
        const c = await conversation(); assertActive();
        try {
          const result = await dependencies.api.video(c.id, file, locale, dependencies.operationId(), progress);
          if (allowed()) emit({ transcript: job(result.job, c.id) });
        } catch (error) { throw workspaceCreateFailure(error); }
        return;
      }
      try {
        const result = await dependencies.api.upload(file, { onProgress: progress });
        if (!allowed()) return;
        const d = result.results.find(r => r.success)?.data;
        if (!d || !isWorkspaceId(d.id) || d.kb_id !== settings!.active_kb!.kb_id) throw new Error('UPLOAD_UNCONFIRMED');
        const optimistic = Object.freeze({ document_id: d.id, kb_id: d.kb_id, name: d.name || file.name, type: 'file',
          status: d.status === 'learned' ? 'learned' : d.status === 'error' ? 'error' : 'learning', source_info: d.source_info });
        emit({ selectedId: d.id, ready: true, issue: null });
        if (optimistic.status === 'learning') observeUploadedSource(optimistic); else mergeDocument(optimistic);
      } catch (error) { throw workspaceCreateFailure(error); }
    }, true),
    refreshTranscript: () => run('reading', async () => {
      const c = state.conversation, t = state.transcript; if (!c || !t) return;
      const next = job(await dependencies.api.transcript(c.id, t.id), c.id); assertActive();
      if (next.id !== t.id) throw new Error('TRANSCRIPT_INVALID');
      emit({ transcript: next });
      if (next.kb_document_id && settings?.active_kb) {
        emit({ selectedId: next.kb_document_id });
        observeUploadedSource({ document_id: next.kb_document_id, kb_id: settings.active_kb.kb_id,
          name: next.transcript_file_name, type: 'file', status: next.kb_document_status ?? 'learning' });
      }
    }),
    commitTranscript: () => run('uploading', async () => {
      await readPrerequisites(); assertActive();
      const c = state.conversation, t = state.transcript;
      if (!c || !t || t.conversation_id !== c.id) throw new Error('TRANSCRIPT_INVALID');
      const fresh = job(await dependencies.api.transcript(c.id, t.id), c.id); assertActive();
      if (fresh.id !== t.id || fresh.status !== 'succeeded' || fresh.can_add_to_kb !== true || fresh.kb_document_id) throw new Error('TRANSCRIPT_NOT_READY');
      try {
        const result = await dependencies.api.commitTranscript(c.id, t.id, locale);
        if (!allowed()) return;
        const next = job(result.job, c.id);
        if (next.id !== t.id || !next.kb_document_id || !settings?.active_kb) throw new Error('TRANSCRIPT_INVALID');
        emit({ transcript: next, selectedId: next.kb_document_id, ready: true });
        observeUploadedSource({ document_id: next.kb_document_id, kb_id: settings.active_kb.kb_id,
          name: next.transcript_file_name, type: 'file', status: next.kb_document_status ?? 'learning' });
      } catch (error) { throw workspaceCreateFailure(error); }
    }, true),
    /** Delete one document that may go now (allowed, processed, not used by AI ID) through the knowledge base's own
     * single delete route (queued), then re-read the list until it is gone. There is no multi-document delete here
     * (owner 24/10). Every call that sends nothing says why. A deleted source is unselected; any other selection and
     * the brief stay. Never Create. */
    async deleteDocument(documentId: string): Promise<WorkspaceSourceDeleteOutcome> {
      if (state.busy || state.unknown || disposed) return workspaceSourceDeleteOutcome('busy');
      if (!panelVisible || !dependencies.visible() || !allowed() || !settings?.active_kb) return workspaceSourceDeleteOutcome('forbidden');
      const plan = workspaceSourceDeletePlan(state.documents, documentId, canDelete());
      if (!('id' in plan)) return plan;
      const id = plan.id, kbId = settings.active_kb.kb_id;
      emit({ busy: true, phase: 'deleting' });
      let outcome = workspaceSourceDeleteOutcome(null), accepted = true;
      try {
        try { await dependencies.api.deleteDocument(kbId, id); }
        catch (error) {
          // A refusal deletes nothing; after a lost answer the one list read below shows what happened.
          const issue = workspaceSourceDeleteIssue(error);
          if (issue !== 'gone') { outcome = workspaceSourceDeleteOutcome(issue); accepted = false; }
        }
        if (accepted && state.selectedId === id) {
          stopSourceObservation();
          emit({ selectedId: null, ...(state.issue === 'source_failed' || state.issue === 'source_not_ready' ? { issue: null } : {}) });
        }
        // The list is the authority: re-read until the accepted delete is gone, bounded.
        for (let attempt = 0; ; attempt++) {
          assertActive();
          const documents = normalizeDocuments(await read(() => dependencies.api.documents())); assertActive();
          emit({ documents });
          const listed = documents.some(d => d.document_id === id);
          if (!accepted || !listed || attempt >= SOURCE_DELETE_SETTLE_DELAYS_MS.length) {
            if (!outcome.issue) outcome = workspaceSourceDeleteOutcome(null, listed);
            break;
          }
          await wait(SOURCE_DELETE_SETTLE_DELAYS_MS[attempt]);
        }
      } catch (error) {
        // The panel closed or the list could not be re-read: the next refresh shows the truth.
        if (!disposed && !(error instanceof WorkspaceCreateError)) emit({ ready: false, issue: isTransientReadFailure(error) ? 'connection' : 'unavailable' });
      } finally { emit({ busy: false, phase: 'idle' }); }
      return outcome;
    },
    dispose() {
      stopSourceObservation(); disposed = true; settings = null; listeners.clear();
      preferredConversationId = null; forceNewConversation = false;
      state = Object.freeze({ ...state, ready: false, documents: [], conversation: null, transcript: null, operation: null, selectedId: null });
    },
  };
}
