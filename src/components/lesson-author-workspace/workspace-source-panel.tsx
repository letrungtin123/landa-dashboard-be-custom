import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AlertCircle, Check, FileText, Loader2, Plus, RefreshCw, Sparkles, Upload, Video } from 'lucide-react';
import { Button } from '../ui/button';
import type { createWorkspaceSourceState } from './workspace-source-state';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';

const copy = {
  en: { title: 'Build a course from your source', source: 'Choose a ready Knowledge Base document', refresh: 'Reconnect source', upload: 'Upload source', create: 'Create learning content',
    reading: 'Checking source access…', creating: 'Starting the workspace. Closing this modal will not cancel an accepted request.',
    uploading: 'Uploading your source…', accepting: 'Source received. Waiting for acceptance…', watching: 'The source is indexing. This window will update automatically when it is ready.', ready: 'Ready', processing: 'Indexing', timed_out: 'Indexing is taking longer than expected. Check again to refresh its status.', unavailable: 'Sources are unavailable. Check course access and the assigned bot, persona and Knowledge Base.',
    source_not_ready: 'Choose a ready document from the current Knowledge Base.', source_failed: 'This source could not be indexed. Upload a corrected file or choose another ready source.', invalid_file: 'Choose a nonempty MP4, PDF, DOC/DOCX, PPTX, TXT/MD or CSV file up to 50 MB.',
    rejected: 'The operation was rejected. Refresh source access and try again.', unknown: 'The operation result is not confirmed. It will not be sent again; check the existing workspace first.',
    empty: 'No source documents are ready yet. Upload one, then wait for indexing to finish.', sourceHint: 'Upload a supported file or select an indexed document below. AI Instructional Design only creates from the selected source.',
    warning: 'Creating starts the AI Instructional Design draft workflow. Nothing is applied to the published course.', uploadPermission: 'Document upload requires Knowledge Base view and add permission. MP4 follows the existing transcript workflow.',
    transcript: 'Video transcript', checkTranscript: 'Check status', commit: 'Add transcript to Knowledge Base', queued: 'Queued', running: 'Transcribing', succeeded: 'Transcript ready', failed: 'Transcription failed', expired: 'Transcript expired', committed: 'Added to Knowledge Base; waiting for indexing',
    connecting: 'Connecting to live source status…', streamUnavailable: 'Live status is temporarily unavailable. Reconnect without uploading again.', failedStatus: 'Indexing failed', retained: 'An unconfirmed operation remains protected when this modal is closed. Reloading requires a server check before another attempt.' },
  vi: { title: 'Tạo nội dung từ tài liệu nguồn', source: 'Chọn tài liệu đã sẵn sàng trong Kho tri thức', refresh: 'Kết nối lại nguồn', upload: 'Tải tài liệu nguồn', create: 'Tạo nội dung bài học',
    reading: 'Đang kiểm tra quyền và tài liệu nguồn…', creating: 'Đang khởi tạo không gian bản thảo. Đóng modal không hủy yêu cầu đã được tiếp nhận.',
    uploading: 'Đang tải tài liệu nguồn…', accepting: 'Đã nhận tài liệu. Đang chờ máy chủ xác nhận…', watching: 'Tài liệu đang được lập chỉ mục. Cửa sổ này sẽ tự cập nhật khi sẵn sàng.', ready: 'Sẵn sàng', processing: 'Đang lập chỉ mục', timed_out: 'Lập chỉ mục mất lâu hơn dự kiến. Hãy kiểm tra lại để cập nhật trạng thái.', unavailable: 'Chưa truy cập được nguồn. Kiểm tra quyền khóa học và bot, persona, Kho tri thức được gán.',
    source_not_ready: 'Hãy chọn tài liệu đã sẵn sàng trong Kho tri thức hiện tại.', source_failed: 'Không thể lập chỉ mục tài liệu này. Hãy tải file đã chỉnh sửa hoặc chọn nguồn khác đã sẵn sàng.', invalid_file: 'Chọn MP4, PDF, DOC/DOCX, PPTX, TXT/MD hoặc CSV không rỗng, tối đa 50 MB.',
    rejected: 'Thao tác bị từ chối. Hãy tải lại quyền và nguồn trước khi thử lại.', unknown: 'Chưa xác định kết quả thao tác. Sẽ không tự gửi lại; hãy kiểm tra bản thảo hiện có trước.',
    empty: 'Chưa có tài liệu nguồn sẵn sàng. Hãy tải lên và chờ lập chỉ mục hoàn tất.', sourceHint: 'Tải file hỗ trợ hoặc chọn tài liệu đã lập chỉ mục bên dưới. AI Instructional Design chỉ tạo từ tài liệu đang chọn.',
    warning: 'Tạo sẽ bắt đầu luồng bản thảo AI Instructional Design. Chưa có nội dung nào được áp dụng vào khóa học đã xuất bản.', uploadPermission: 'Tải tài liệu cần quyền xem/thêm Kho tri thức. MP4 đi theo luồng chép lời hiện có.',
    transcript: 'Bản chép lời video', checkTranscript: 'Kiểm tra trạng thái', commit: 'Thêm bản chép lời vào Kho tri thức', queued: 'Đang chờ', running: 'Đang chép lời', succeeded: 'Bản chép lời sẵn sàng', failed: 'Chép lời thất bại', expired: 'Bản chép lời hết hạn', committed: 'Đã thêm vào Kho tri thức; chờ lập chỉ mục',
    connecting: 'Đang kết nối trạng thái nguồn trực tiếp…', streamUnavailable: 'Tạm mất kết nối trạng thái trực tiếp. Có thể kết nối lại mà không tải file lần nữa.', failedStatus: 'Lập chỉ mục thất bại', retained: 'Thao tác chưa xác nhận vẫn được bảo vệ khi đóng modal. Sau khi tải lại trang, hệ thống cần kiểm tra máy chủ trước khi thử lại.' },
} as const;

function sourceIcon(name: string) {
  return /\.mp4$/i.test(name) ? Video : FileText;
}

/** Presentation-only source chooser. The controller remains the only authority
 * for source readiness, upload, transcript and explicit workspace Create. */
export function WorkspaceSourcePanel({ controller, locale }: { controller: ReturnType<typeof createWorkspaceSourceState>; locale: WorkspaceLocale }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const inputRef = useRef<HTMLInputElement>(null);
  const c = copy[locale];
  useEffect(() => {
    controller.setVisible(true);
    void controller.refresh();
    return () => controller.setVisible(false);
  }, [controller]); // GET-only; never Create/ingest.
  const source = state.documents.find(d => d.document_id === state.selectedId);
  const locked = state.busy || state.unknown;
  const loading = state.phase === 'reading' && state.busy;
  const status = state.phase === 'uploading'
    ? state.progress === 100 ? c.accepting : `${c.uploading}${state.progress === null ? '' : ` ${state.progress}%`}`
    : state.phase === 'creating' ? c.creating : c.reading;

  return <section className="flex min-h-0 flex-1 flex-col gap-4" aria-label={c.title}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-base font-semibold tracking-tight">{c.title}</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{c.sourceHint}</p></div>
      {(state.issue === 'unavailable' || state.sourceObservation === 'unavailable') && <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-full" disabled={state.busy} onClick={() => { void controller.refresh(); }}>
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
          return <button key={document.document_id} type="button" disabled={locked} onClick={() => controller.select(document.document_id)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${selected ? 'border-primary/60 bg-primary/[0.08] shadow-sm shadow-primary/10' : 'border-border/80 bg-background/50 hover:border-primary/35 hover:bg-muted/40'} ${!ready ? 'opacity-65' : ''}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{document.name}</span><span className={`mt-0.5 flex items-center gap-1 text-[11px] ${ready ? 'text-emerald-600 dark:text-emerald-400' : failed ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>{ready ? <Check className="h-3 w-3" /> : failed ? <AlertCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}{ready ? c.ready : failed ? c.failedStatus : c.processing}</span></span>
            {selected && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
          </button>;
        })}
      </div>
    </div>

    <div className="flex flex-col gap-3 rounded-2xl border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-end">
      <Button type="button" size="lg" className="min-w-52 rounded-xl shadow-lg shadow-primary/20" disabled={locked || !state.ready || source?.status !== 'learned'} onClick={() => { void controller.create(); }}>
        {state.phase === 'creating' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{c.create}
      </Button>
    </div>

    {state.busy && <div className="rounded-xl border border-primary/20 bg-primary/[0.045] px-3 py-2 text-xs text-muted-foreground" role="status">{status}</div>}
    {!state.busy && state.sourceObservation !== 'idle' && state.sourceObservation !== 'failed' && <div className="rounded-xl border border-primary/20 bg-primary/[0.045] px-3 py-2 text-xs text-muted-foreground" role="status">
      {state.sourceObservation === 'unavailable' ? c.streamUnavailable : <><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />{state.sourceObservation === 'connecting' ? c.connecting : c.watching}</>}
    </div>}
    {state.issue && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{c[state.issue]}</p>}
    {state.transcript && <div className="rounded-xl border bg-card p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{c.transcript}</span><span className="text-xs text-muted-foreground">{c[state.transcript.status]}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{state.transcript.original_file_name}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={state.busy} onClick={() => { void controller.refreshTranscript(); }}>{c.checkTranscript}</Button><Button type="button" size="sm" disabled={locked || !state.transcript.can_add_to_kb || state.transcript.status !== 'succeeded'} onClick={() => { void controller.commitTranscript(); }}>{c.commit}</Button></div></div>}
    <p className="text-xs leading-5 text-muted-foreground">{c.warning} {c.uploadPermission}</p><p className="text-xs leading-5 text-muted-foreground/75">{c.retained}</p>
  </section>;
}
