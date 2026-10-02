import type { ChatConversation, LessonAuthorSettings, LessonAuthorSourceDocument, LessonAuthorTranscriptionJob } from '../../api/custom-chat';
import type { workspaceSourceApi } from '../../api/workspace-sources';
import type { SourceStreamClient, SourceStreamDocument, SourceStreamScope, SourceStreamState } from '../../api/workspace-source-stream';
import { WorkspaceCreateError, workspaceCreateFailure, type createWorkspaceCreateClient, type WorkspaceCreateRequest } from '../../api/workspace-create';
import { isWorkspaceId, type WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import type { WorkspaceHostScope, WorkspaceLaunchContext } from './workspace-host.logic';

export interface WorkspaceSourceState {
  busy: boolean;
  phase: 'idle' | 'reading' | 'uploading' | 'creating';
  ready: boolean;
  unknown: boolean;
  issue: 'unavailable' | 'source_not_ready' | 'source_failed' | 'invalid_file' | 'rejected' | 'unknown' | null;
  documents: readonly LessonAuthorSourceDocument[];
  selectedId: string | null;
  conversation: ChatConversation | null;
  transcript: LessonAuthorTranscriptionJob | null;
  progress: number | null;
  contentLocale: WorkspaceLocale;
  sourceObservation: 'idle' | 'connecting' | 'indexing' | 'failed' | 'unavailable';
  operation: Readonly<WorkspaceCreateRequest> | null;
}

/** No timer, restoration, effect or read can dispatch Create. The upload
 * receipt is rendered optimistically, then an exact-document SSE snapshot is
 * the only readiness authority for that upload. */
export function createWorkspaceSourceState(scope: WorkspaceHostScope, dependencies: {
  api: typeof workspaceSourceApi;
  create: ReturnType<typeof createWorkspaceCreateClient>;
  authorized: () => boolean;
  canUpload: () => boolean;
  visible: () => boolean;
  operationId: () => string;
  onCreated: (context: WorkspaceLaunchContext) => void | Promise<void>;
  locale: WorkspaceLocale;
  stream: (scope: SourceStreamScope, dependencies: {
    active: () => boolean;
    onDocument: (document: SourceStreamDocument) => void;
    onState: (state: SourceStreamState) => void;
  }) => SourceStreamClient;
}) {
  let disposed = false, panelVisible = true, locale = dependencies.locale, settings: LessonAuthorSettings | null = null;
  let sourceStream: SourceStreamClient | null = null, sourceStreamDocumentId: string | null = null, sourceStreamSerial = 0;
  const listeners = new Set<() => void>();
  let state: Readonly<WorkspaceSourceState> = Object.freeze({ busy: false, phase: 'idle', ready: false, unknown: false, issue: null,
    documents: [], selectedId: null, conversation: null, transcript: null, progress: null, contentLocale: locale,
    sourceObservation: 'idle', operation: null });
  const emit = (patch: Partial<WorkspaceSourceState>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) { try { listener(); } catch { /* View cannot dispatch work. */ } }
  };
  const allowed = () => !disposed && dependencies.authorized();
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
        if (serial !== sourceStreamSerial) return;
        if (next === 'connecting' || next === 'reconnecting') emit({ sourceObservation: 'connecting' });
        else if (next === 'live') emit({ sourceObservation: 'indexing' });
        else if (next === 'blocked' || next === 'unavailable') emit({ sourceObservation: 'unavailable' });
      },
    });
    emit({ sourceObservation: 'connecting' });
    sourceStream.start();
  }
  async function readPrerequisites() {
    assertActive(); const next = await dependencies.api.settings(); assertActive();
    if (!validSettings(next)) throw new Error('UNAVAILABLE');
    const changed = settings && (settings.active_bot?.bot_id !== next.active_bot?.bot_id || settings.active_kb?.kb_id !== next.active_kb?.kb_id
      || settings.active_persona?.persona_id !== next.active_persona?.persona_id);
    settings = next;
    if (changed) { stopSourceObservation(); emit({ conversation: null, selectedId: null, transcript: null }); }
    const docs = await dependencies.api.documents(); assertActive();
    const documents = normalizeDocuments(docs);
    const convs = await dependencies.api.conversations(scope.courseId); assertActive();
    if (!Array.isArray(convs)) throw new Error('UNAVAILABLE');
    const conversation = convs.find(c => c.id === state.conversation?.id && owned(c)) ?? convs.find(owned) ?? null;
    emit({ documents, conversation: conversation ? Object.freeze({ ...conversation }) : null, ready: true });
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
    emit({ busy: true, phase, issue: state.unknown ? 'unknown' : null, progress: null });
    try { await work(); }
    catch (error) {
      if (disposed) return;
      const failure = error instanceof WorkspaceCreateError ? error : null;
      const unknown = state.unknown || failure?.outcome === 'unknown';
      emit({ ready: false, unknown, issue: unknown ? 'unknown' : failure ? 'rejected' : 'unavailable' });
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
    select(documentId: string) {
      if (!state.busy && !state.unknown && allowed() && state.documents.some(d => d.document_id === documentId)) emit({ selectedId: documentId, issue: null });
    },
    refresh: () => run('reading', readPrerequisites),
    create: () => run('creating', async () => {
      await readPrerequisites(); assertActive();
      const source = state.documents.find(d => d.document_id === state.selectedId && d.status === 'learned');
      if (!source) { emit({ issue: 'source_not_ready' }); return; }
      const c = await conversation(); assertActive();
      const request = Object.freeze({ operation_id: dependencies.operationId(), source_document_ids: [source.document_id], content_locale: state.contentLocale });
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
        const result = await dependencies.api.upload(settings!.active_kb!.kb_id, [file], { onProgress: progress });
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
    dispose() {
      stopSourceObservation(); disposed = true; settings = null; listeners.clear();
      state = Object.freeze({ ...state, ready: false, documents: [], conversation: null, transcript: null, operation: null, selectedId: null });
    },
  };
}
