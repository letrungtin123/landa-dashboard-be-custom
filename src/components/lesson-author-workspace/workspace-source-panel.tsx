import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, FileText, Loader2, Plus, RefreshCw, Sparkles, Upload, Video } from 'lucide-react';
import { Button } from '../ui/button';
import type { createWorkspaceSourceState } from './workspace-source-state';
import { workspaceSourceCanDelete, workspaceSourceDeletable } from './workspace-source.logic';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { workspaceCreateBlock, workspaceCreateBlockCopy, workspaceLaunchBriefErrorKey } from './workspace-launch-brief.logic';
import { WorkspaceSourceDeleteConfirm, WorkspaceSourceInUseNote, WorkspaceSourceRowDelete, workspaceSourceDeleteText } from './workspace-source-delete';

const copy = {
  en: { title: 'Build a course from your document', source: 'Choose a ready document', refresh: 'Try again', upload: 'Upload document', create: 'Create learning content',
    reading: 'Checking access and the document list…', creating: 'Starting the course draft. Closing this window does not cancel a request that was already accepted.',
    uploading: 'Uploading your document…', accepting: 'File received. Waiting for the server to confirm…', watching: 'The document is being processed. This page updates automatically when it is done.', ready: 'Ready', processing: 'Processing', timed_out: 'Processing is taking longer than expected. Select Try again to check its status.',
    unavailable: 'The document list could not be opened. Check that you can edit this course, or ask an administrator to check the AI assistant settings.',
    connection: 'The server could not be reached for a moment. The page already retried a few times. Wait a few seconds, then select Try again.',
    source_not_ready: 'Choose a document that is ready.', source_failed: 'This document could not be processed. Upload a corrected file or choose another ready document.', invalid_file: 'Choose a non-empty MP4, PDF, Word, PowerPoint, text or CSV file of up to 50 MB.',
    rejected: 'The action was not accepted. Select Try again to reload the document list, then repeat the action.', unknown: 'It is not clear yet whether the last action succeeded, so it will not be sent again automatically. Reload the page and check the course draft list before trying again.',
    empty: 'No documents are ready yet. Upload one and wait until processing finishes.', sourceHint: 'Upload a supported file or choose a ready document below. AI Instructional Design only creates content from the selected document.',
    transcript: 'Video transcript', checkTranscript: 'Check status', commit: 'Add transcript to the Knowledge Base', queued: 'Waiting', running: 'Transcribing', succeeded: 'Transcript ready', failed: 'Transcription failed', expired: 'Transcript expired', committed: 'Added to the Knowledge Base; waiting for processing',
    connecting: 'Connecting to follow the document status…', streamUnavailable: 'The processing status cannot be updated right now. Select Try again to check it. You do not need to upload the file again.', failedStatus: 'Processing failed' },
  vi: { title: 'Tạo nội dung từ tài liệu nguồn', source: 'Chọn tài liệu đã sẵn sàng', refresh: 'Thử lại', upload: 'Tải tài liệu nguồn', create: 'Tạo nội dung bài học',
    reading: 'Đang kiểm tra quyền và danh sách tài liệu…', creating: 'Đang khởi tạo bản thiết kế khoá học. Đóng cửa sổ này không huỷ yêu cầu đã được tiếp nhận.',
    uploading: 'Đang tải tài liệu lên…', accepting: 'Đã nhận tài liệu. Đang chờ máy chủ xác nhận…', watching: 'Tài liệu đang được xử lý. Trang này sẽ tự cập nhật khi xong.', ready: 'Sẵn sàng', processing: 'Đang xử lý', timed_out: 'Việc xử lý tài liệu lâu hơn dự kiến. Hãy bấm Thử lại để xem trạng thái mới.',
    unavailable: 'Chưa mở được danh sách tài liệu. Hãy kiểm tra bạn có quyền chỉnh sửa khoá học này, hoặc nhờ quản trị viên kiểm tra phần cài đặt trợ lý AI.',
    connection: 'Tạm thời chưa kết nối được máy chủ. Trang đã tự thử lại vài lần. Hãy đợi vài giây rồi bấm Thử lại.',
    source_not_ready: 'Hãy chọn một tài liệu đã sẵn sàng.', source_failed: 'Không xử lý được tài liệu này. Hãy tải lên file đã chỉnh sửa hoặc chọn tài liệu khác đã sẵn sàng.', invalid_file: 'Hãy chọn file MP4, PDF, Word, PowerPoint, văn bản hoặc CSV không rỗng, tối đa 50 MB.',
    rejected: 'Thao tác chưa được chấp nhận. Hãy bấm Thử lại để tải lại danh sách tài liệu rồi làm lại.', unknown: 'Chưa rõ thao tác vừa rồi đã thành công hay chưa, nên hệ thống sẽ không tự gửi lại. Hãy tải lại trang và xem danh sách bản thiết kế khoá học trước khi làm lại.',
    empty: 'Chưa có tài liệu nào sẵn sàng. Hãy tải lên một tài liệu và chờ xử lý xong.', sourceHint: 'Tải lên file được hỗ trợ hoặc chọn một tài liệu đã sẵn sàng bên dưới. AI Instructional Design chỉ tạo nội dung từ tài liệu đang chọn.',
    transcript: 'Bản chép lời video', checkTranscript: 'Kiểm tra trạng thái', commit: 'Thêm bản chép lời vào Kho tri thức', queued: 'Đang chờ', running: 'Đang chép lời', succeeded: 'Bản chép lời sẵn sàng', failed: 'Chép lời thất bại', expired: 'Bản chép lời hết hạn', committed: 'Đã thêm vào Kho tri thức; đang chờ xử lý',
    connecting: 'Đang kết nối để theo dõi trạng thái tài liệu…', streamUnavailable: 'Tạm thời chưa cập nhật được trạng thái xử lý. Hãy bấm Thử lại để xem trạng thái mới, không cần tải file lên lần nữa.', failedStatus: 'Xử lý thất bại' },
} as const;

function sourceIcon(name: string) {
  return /\.mp4$/i.test(name) ? Video : FileText;
}

type SourceController = ReturnType<typeof createWorkspaceSourceState>;

/** Presentation-only source chooser. The controller remains the only authority
 * for source readiness, upload, transcript and explicit workspace Create. */
export function WorkspaceSourcePanel({ controller, locale }: { controller: SourceController; locale: WorkspaceLocale }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const c = copy[locale];
  useEffect(() => {
    controller.setVisible(true);
    void controller.refresh();
    return () => controller.setVisible(false);
  }, [controller]); // GET-only; never Create/ingest.
  const locked = state.busy || state.unknown;
  const loading = state.phase === 'reading' && state.busy;
  // Delete (knowledge base delete permission only): one document per delete, its confirmation and its outcome.
  // The name is kept from when the confirmation opened: the list drops the document while it is deleted.
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);
  const askDelete = (id: string, name: string) => { setDeleteError(null); setDeleteNote(null); setDeleting({ id, name }); };
  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    const outcome = await controller.deleteDocument(deleting.id);
    // Anything that sent nothing or was refused keeps the confirmation open with its reason.
    if (outcome.issue) { setDeleteError(workspaceSourceDeleteText(t, outcome)); return; }
    setDeleting(null);
    setDeleteNote(outcome.kept ? t('aiIdSourceDelete.kept', { name: deleting.name }) : null);
  };

  // One column below the desktop width: the section keeps its full height (the start screen scrolls as a whole)
  // instead of shrinking under the brief panel. Desktop: the list scrolls inside the left column as before.
  return <section className="flex flex-1 flex-col gap-4 lg:min-h-0" aria-label={c.title}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-base font-semibold tracking-tight">{c.title}</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{c.sourceHint}</p></div>
      {(state.issue === 'unavailable' || state.issue === 'connection' || state.issue === 'rejected' || state.sourceObservation === 'unavailable') && <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-full max-lg:h-10 max-lg:px-4" disabled={state.busy} onClick={() => { void controller.refresh(); }}>
        {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}{c.refresh}
      </Button>}
    </div>

    <input ref={inputRef} className="sr-only" type="file" accept=".pdf,.doc,.docx,.pptx,.txt,.md,.csv,.mp4" disabled={locked || !state.ready}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void controller.upload(file); }} />
    <button type="button" disabled={locked || !state.ready} onClick={() => inputRef.current?.click()}
      className="group flex min-h-24 w-full items-center gap-4 rounded-2xl border border-dashed border-primary/35 bg-primary/[0.035] px-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.07] hover:shadow-lg hover:shadow-primary/5 disabled:pointer-events-none disabled:opacity-55">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform group-hover:scale-105"><Plus className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4" />{c.upload}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">PDF · DOCX · PPTX · MD · TXT · CSV · MP4</span></span>
    </button>

    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card/60 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 px-1"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{c.source}</p><span className="text-xs text-muted-foreground">{state.documents.length}/50</span></div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {loading && Array.from({ length: 4 }).map((_, index) => <div key={index} className="flex animate-pulse items-center gap-3 rounded-xl border p-3"><span className="h-9 w-9 rounded-xl bg-muted" /><span className="flex-1 space-y-2"><span className="block h-3 w-3/4 rounded bg-muted" /><span className="block h-2.5 w-1/3 rounded bg-muted" /></span></div>)}
        {!loading && state.documents.length === 0 && <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-5 text-center text-sm text-muted-foreground"><FileText className="h-7 w-7 opacity-40" /><p>{c.empty}</p></div>}
        {!loading && state.documents.map(document => {
          const Icon = sourceIcon(document.name), selected = document.document_id === state.selectedId, ready = document.status === 'learned', failed = document.status === 'error';
          const controls = workspaceSourceCanDelete(document, state.canDelete), deletable = workspaceSourceDeletable(document, state.canDelete);
          // The row button chooses the document for AI ID; the delete button (after it) deletes only this document.
          return <div key={document.document_id} className={`flex w-full items-center gap-2 rounded-xl border transition-all ${controls ? 'pr-1' : ''} ${selected ? 'border-primary/60 bg-primary/[0.08] shadow-sm shadow-primary/10' : 'border-border/80 bg-background/50 hover:border-primary/35 hover:bg-muted/40'}`}>
            <button type="button" aria-pressed={selected} disabled={locked} onClick={() => controller.select(document.document_id)}
              className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left ${!ready ? 'opacity-65' : ''}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
              {/* Long names wrap on phones and tablets; one line on desktop, the full name on hover. */}
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium wrap-anywhere lg:truncate" title={document.name}>{document.name}</span><span className={`mt-0.5 flex items-center gap-1 text-[11px] ${ready ? 'text-emerald-600 dark:text-emerald-400' : failed ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>{ready ? <Check className="h-3 w-3" /> : failed ? <AlertCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}{ready ? c.ready : failed ? c.failedStatus : c.processing}</span>
                {controls && document.in_use_by_ai_id === true && <WorkspaceSourceInUseNote />}</span>
              {selected && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
            </button>
            {controls && <WorkspaceSourceRowDelete name={document.name} disabled={locked || !deletable} onDelete={() => askDelete(document.document_id, document.name)} />}
          </div>;
        })}
      </div>
      {deleteNote && <p role="status" className="mt-2 px-1 text-xs text-amber-700 dark:text-amber-400 wrap-anywhere">{deleteNote}</p>}
    </div>
    {deleting && <WorkspaceSourceDeleteConfirm busy={state.phase === 'deleting'} error={deleteError} name={deleting.name}
      onConfirm={() => { void confirmDelete(); }} onClose={() => setDeleting(null)} />}

    {/* From the desktop width Create sits here, under the list. Below it the start screen shows the same bar fixed to
     * the bottom of the window (placement "footer", rendered by the host), so it stays in reach while the page scrolls. */}
    <div className="contents max-lg:hidden"><WorkspaceSourceCreateBar controller={controller} locale={locale} /></div>
    {state.transcript && <div className="rounded-xl border bg-card p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{c.transcript}</span><span className="text-xs text-muted-foreground">{c[state.transcript.status]}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{state.transcript.original_file_name}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" className="max-lg:h-10" disabled={state.busy} onClick={() => { void controller.refreshTranscript(); }}>{c.checkTranscript}</Button><Button type="button" size="sm" className="max-lg:h-10" disabled={locked || !state.transcript.can_add_to_kb || state.transcript.status !== 'succeeded'} onClick={() => { void controller.commitTranscript(); }}>{c.commit}</Button></div></div>}
  </section>;
}

/** "Create learning content" with its one-line reason, then what the panel is doing and any refusal. `panel`: inside
 * the source panel (desktop). `footer`: an action bar fixed under the start screen's scrolling area on phones and
 * tablets, with the messages above the button so the button stays at the bottom edge. */
export function WorkspaceSourceCreateBar({ controller, locale, placement = 'panel' }: {
  controller: SourceController; locale: WorkspaceLocale; placement?: 'panel' | 'footer';
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const reasonId = useId();
  const { t } = useTranslation();
  const c = copy[locale];
  const source = state.documents.find(d => d.document_id === state.selectedId);
  const locked = state.busy || state.unknown;
  // Document plus the launch brief (right column); the reason is shown only
  // when nothing else (loading, upload, unknown outcome) explains the lock.
  const block = workspaceCreateBlock({ draft: state.brief,
    document: source?.status === 'learned' ? 'ready' : source?.status === 'learning' ? 'processing' : 'none' });
  const blockCopy = block && !locked && state.ready ? workspaceCreateBlockCopy(block) : null;
  const reason = blockCopy ? t(blockCopy.key, { max: blockCopy.max, items: blockCopy.itemKeys?.map(key => t(key)).join(', ') }) : null;
  const status = state.phase === 'uploading'
    ? state.progress === 100 ? c.accepting : `${c.uploading}${state.progress === null ? '' : ` ${state.progress}%`}`
    : state.phase === 'creating' ? c.creating : state.phase === 'deleting' ? t('aiIdSourceDelete.deleting') : c.reading;
  const footer = placement === 'footer';

  const action = <div className={footer ? 'flex flex-col gap-1.5' : 'flex flex-col gap-2 rounded-2xl border bg-muted/25 p-3 sm:items-end'}>
    <Button type="button" size="lg" className={footer ? 'h-11 w-full rounded-xl shadow-lg shadow-primary/20' : 'min-w-52 rounded-xl shadow-lg shadow-primary/20'} disabled={locked || !state.ready || !!block}
      aria-describedby={reason ? reasonId : undefined} onClick={() => { void controller.create(); }}>
      {state.phase === 'creating' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{c.create}
    </Button>
    {reason && <p id={reasonId} className={`text-xs leading-5 text-muted-foreground ${footer ? 'text-center' : 'sm:text-right'}`}>{reason}</p>}
  </div>;
  const messages = <>
    {state.busy && <div className="rounded-xl border border-primary/20 bg-primary/[0.045] px-3 py-2 text-xs text-muted-foreground" role="status">{status}</div>}
    {!state.busy && state.sourceObservation !== 'idle' && state.sourceObservation !== 'failed' && <div className="rounded-xl border border-primary/20 bg-primary/[0.045] px-3 py-2 text-xs text-muted-foreground" role="status">
      {state.sourceObservation === 'unavailable' ? c.streamUnavailable : <><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />{state.sourceObservation === 'connecting' ? c.connecting : c.watching}</>}
    </div>}
    {state.issue && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
      {state.issue === 'brief_rejected' ? state.briefError ? t(workspaceLaunchBriefErrorKey(state.briefError)) : c.rejected : c[state.issue]}</p>}
  </>;
  if (!footer) return <>{action}{messages}</>;
  return <div data-testid="workspace-create-footer" className="max-h-[45dvh] shrink-0 space-y-2 overflow-y-auto border-t bg-card px-4 py-3 shadow-[0_-12px_24px_-18px_rgba(0,0,0,0.55)] sm:px-5 lg:hidden">
    {messages}{action}
  </div>;
}
