import { useEffect, useRef, useState } from 'react';
import { Plus, Loader2, FileText, Video, FileSpreadsheet, FileCode, Presentation, Upload, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { fetchLessonAuthorSourceDocuments, type LessonAuthorSourceDocument } from '@/api/custom-chat';
import { fetchDocuments, uploadDocuments } from '@/api/custom-ai-chatbot';
import { getLocalizedApiError } from '@/utils/localized-error';

const extensions = ['.pdf', '.doc', '.docx', '.pptx', '.txt', '.md', '.csv'];

export function sourceFilePresentation(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (name.toLowerCase().endsWith('.transcript.txt')) return { Icon: Video, label: 'TXT', color: 'text-violet-500', surface: 'border-violet-500/30 bg-violet-500/10' };
  if (ext === 'pdf') return { Icon: FileText, label: 'PDF', color: 'text-red-500', surface: 'border-red-500/30 bg-red-500/10' };
  if (ext === 'doc' || ext === 'docx') return { Icon: FileText, label: ext.toUpperCase(), color: 'text-blue-500', surface: 'border-blue-500/30 bg-blue-500/10' };
  if (ext === 'ppt' || ext === 'pptx') return { Icon: Presentation, label: ext.toUpperCase(), color: 'text-orange-500', surface: 'border-orange-500/30 bg-orange-500/10' };
  if (ext === 'csv' || ext === 'xls' || ext === 'xlsx') return { Icon: FileSpreadsheet, label: ext.toUpperCase(), color: 'text-emerald-500', surface: 'border-emerald-500/30 bg-emerald-500/10' };
  if (ext === 'mp4') return { Icon: Video, label: 'MP4', color: 'text-violet-500', surface: 'border-violet-500/30 bg-violet-500/10' };
  if (ext === 'md') return { Icon: FileCode, label: 'MD', color: 'text-teal-500', surface: 'border-teal-500/30 bg-teal-500/10' };
  return { Icon: FileText, label: ext === 'txt' ? 'TXT' : 'FILE', color: 'text-slate-400', surface: 'border-slate-400/30 bg-slate-400/10' };
}

function SourceFileBadge({ name }: { name: string }) {
  const { Icon, label, color, surface } = sourceFilePresentation(name);
  return <span aria-label={label} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${surface} ${color}`}>
    <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
  </span>;
}

/** Use existing messages, not a second persisted workflow flag. Also recognizes
 * legacy drafts when a paginated history no longer includes the original action. */
export function hasLessonAuthorCreationStarted(messages: ReadonlyArray<{ metadata?: Record<string, unknown> | null }>) {
  return messages.some(({ metadata }) => Boolean(metadata && (
    ['GENERATE_COURSE_BLUEPRINT', 'DRAFT_BLUEPRINT_CHAPTER', 'CONTINUE_CHAPTER'].includes(String(metadata.lesson_author_action))
    || metadata.lesson_author_blueprint_id
  )));
}

type Props = {
  scopeKey: string; kbId?: string; busy: boolean; canUpload: boolean; english: boolean;
  creationStarted?: boolean;
  source?: LessonAuthorSourceDocument;
  onSource: (source?: LessonAuthorSourceDocument) => void;
  onCreate: (source: LessonAuthorSourceDocument) => void;
  onVideo: (file: File) => void;
  onUploading: (busy: boolean) => void;
};

/** Source picker only. A cached ID never grants readiness or permission. No
 * generation runs in effects, polling, upload completion or restoration. */
export function LessonAuthorActionPanel(props: Props) {
  const { scopeKey, kbId, busy, canUpload, english, source, onSource, onCreate, onVideo, onUploading, creationStarted = false } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [documents, setDocuments] = useState<LessonAuthorSourceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [verifiedId, setVerifiedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [canRecheck, setCanRecheck] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const uploadLock = useRef(false);
  const storageKey = `lesson-author-source-v1:${scopeKey}:${kbId ?? ''}`;
  const select = (doc?: LessonAuthorSourceDocument) => {
    setVerifiedId(null);
    onSource(doc);
    setOpen(false);
    try {
      if (doc) localStorage.setItem(storageKey, JSON.stringify({ document_id: doc.document_id, name: doc.name }));
      else localStorage.setItem(storageKey, 'null'); // Remember an explicit clear; do not resurrect old message sources.
    } catch { /* A disabled browser store does not disable authoring. */ }
  };
  useEffect(() => {
    mounted.current = true;
    // Parent keys this panel by tenant/user/course/conversation. Never restore
    // evidence from another conversation or use persisted readiness.
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!source && stored && typeof stored.name === 'string' && stored.name.length <= 500
        && typeof stored.document_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored.document_id) && kbId) {
        onSource({ document_id: stored.document_id, kb_id: kbId, name: stored.name, type: 'file', status: 'learning', source_info: null });
      }
    } catch { /* Ignore invalid local hints. */ }
    return () => { mounted.current = false; onUploading(false); };
    // Restore once for this keyed panel, not whenever the user clears a source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!open || !kbId || creationStarted) return;
    let disposed = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetchLessonAuthorSourceDocuments({ search, limit: 50 }).then(rows => {
        if (!disposed) setDocuments(rows.filter(row => row.kb_id === kbId));
      }).catch(() => {
        if (!disposed) toast.error(english ? 'Could not load sources.' : 'Không thể tải danh sách nguồn.');
      }).finally(() => { if (!disposed) setLoading(false); });
    }, 250);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [open, search, kbId, english, creationStarted]);

  useEffect(() => {
    setVerifiedId(null);
    setCanRecheck(false);
    if (!source || !kbId || creationStarted) { setStatus(''); return; }
    let disposed = false;
    let timer: number | undefined;
    const deadline = Date.now() + 10 * 60_000;
    const inspect = async () => {
      setStatus(english ? 'Checking source readiness…' : 'Đang kiểm tra tài liệu…');
      try {
        const rows = await fetchLessonAuthorSourceDocuments({ search: source.name, limit: 50 });
        if (disposed) return;
        const current = rows.find(row => row.document_id === source.document_id && row.kb_id === kbId);
        if (current?.status === 'learned') { setVerifiedId(current.document_id); setStatus(english ? 'Ready' : 'Sẵn sàng'); return; }
        if (canUpload) {
          const page = await fetchDocuments(kbId, { search: source.name, page_size: 50 });
          if (disposed) return;
          const failed = page.data.find(row => row.id === source.document_id);
          if (!failed || failed.status === 'error' || failed.status === 'deleting') {
            setStatus(english ? 'Source unavailable or indexing failed. Check the Knowledge Base.' : 'Nguồn không khả dụng hoặc lập chỉ mục thất bại. Hãy kiểm tra Kho tri thức.');
            setCanRecheck(true);
            return;
          }
        }
        setStatus(Date.now() >= deadline
          ? (english ? 'Still processing. Check again later.' : 'Tài liệu vẫn đang xử lý. Bấm kiểm tra lại sau.')
          : (english ? 'Learning document in Knowledge Base…' : 'Đang học tài liệu trong Kho tri thức…'));
        if (Date.now() < deadline) timer = window.setTimeout(inspect, 4000);
        else setCanRecheck(true);
      } catch {
        if (!disposed) {
          setStatus(english ? 'Could not check source.' : 'Không thể kiểm tra nguồn.');
          setCanRecheck(true);
        }
      }
    };
    void inspect();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [source?.document_id, source?.name, kbId, canUpload, english, revision, creationStarted]);

  const upload = async (file: File) => {
    if (!mounted.current || busy || creationStarted || uploadLock.current) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    // MP4 retains the existing transcript -> explicit KB commit contract and
    // its own permissions/size limits. It is not a document-upload request.
    if (ext === '.mp4') { setOpen(false); onVideo(file); return; }
    if (!canUpload || !kbId) {
      toast.error(english ? 'An active Knowledge Base and KB view/add permission are required to upload documents.' : 'Cần Kho tri thức đang hoạt động và quyền xem/thêm tài liệu KB để upload.');
      return;
    }
    if (!extensions.includes(ext) || file.size > 50 * 1024 * 1024 || file.size === 0) {
      toast.error(english ? 'Use PDF, DOC/DOCX, PPTX, TXT/MD or CSV, up to 50 MB.' : 'Chọn PDF, DOC/DOCX, PPTX, TXT/MD hoặc CSV, tối đa 50 MB.');
      return;
    }
    uploadLock.current = true;
    onUploading(true);
    setUploading(true); setProgress(null); setOpen(false);
    try {
      const result = await uploadDocuments(kbId, [file], { onProgress: value => { if (mounted.current) setProgress(value); } });
      if (!mounted.current) return;
      const doc = result.results.find(row => row.success)?.data;
      if (!doc) throw new Error(result.results[0]?.error || 'KB_UPLOAD_FAILED');
      select({ document_id: doc.id, kb_id: doc.kb_id, name: doc.name, type: doc.type, status: doc.status, source_info: doc.source_info });
      setRevision(value => value + 1);
      toast.success(english ? 'Uploaded. Waiting for Knowledge Base indexing.' : 'Đã tải lên. Đang chờ Kho tri thức xử lý.');
    } catch (error) {
      if (mounted.current) toast.error(getLocalizedApiError(error, english ? 'Upload was not confirmed. Check the KB before uploading again.' : 'Chưa xác nhận được upload. Kiểm tra KB trước khi tải lại.'));
    } finally {
      uploadLock.current = false;
      if (mounted.current) { setUploading(false); setProgress(null); onUploading(false); }
    }
  };

  // Keep source/message state intact, but leave the composer area empty after
  // creation starts. Hooks above cancel now-unneeded picker/readiness polling.
  if (creationStarted) return null;
  const ready = Boolean(source && verifiedId === source.document_id);

  return <div className="space-y-2" data-testid="lesson-author-action-panel">
    <input ref={input} type="file" accept={[...extensions, '.mp4'].join(',')} hidden disabled={busy || uploading || creationStarted} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
    {source && <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 shadow-sm">
      <SourceFileBadge name={source.name} />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-xs font-medium leading-5 text-foreground" title={source.name}>{source.name}</p>
        <div className="mt-0.5 flex items-start gap-2 text-[11px] leading-4">
          <span className="shrink-0 font-medium tracking-wide text-muted-foreground">{sourceFilePresentation(source.name).label}</span>
          <span className="text-muted-foreground/40" aria-hidden="true">·</span>
          <span role="status" className={`flex min-w-0 items-start gap-1 ${ready ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            {ready && <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}{status || (english ? 'Checking source…' : 'Đang kiểm tra…')}
          </span>
        </div>
        {canRecheck && !ready && <button type="button" disabled={busy || uploading} className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:underline disabled:opacity-50" onClick={() => setRevision(v => v + 1)}>{english ? 'Check again' : 'Kiểm tra lại'}</button>}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" disabled={busy || uploading} aria-label={english ? 'Remove selected source' : 'Bỏ chọn nguồn'} onClick={() => select()}><X className="h-3.5 w-3.5" /></Button>
    </div>}
    {uploading && <p role="status" className="text-xs text-muted-foreground">{progress === 100
      ? (english ? 'File sent. Waiting for KB acceptance…' : 'Đã gửi file. Đang chờ KB tiếp nhận…')
      : `${english ? 'Uploading document' : 'Đang tải tài liệu'}${progress === null ? '…' : ` ${progress}%`}`}</p>}
    {!creationStarted && <div className="flex gap-2 items-center">
      <div className="relative">
        <Button variant="outline" size="icon" disabled={busy || uploading} aria-label={english ? 'Add source' : 'Thêm nguồn'} onClick={() => setOpen(v => !v)}><Plus className="h-4 w-4" /></Button>
        {open && <div className="absolute bottom-full mb-2 left-0 z-30 w-80 max-w-[calc(100vw-4rem)] rounded-xl border bg-popover shadow-xl p-2 space-y-2">
          <Button variant="outline" className="w-full justify-start" disabled={busy || uploading} onClick={() => input.current?.click()}><Upload className="h-4 w-4 mr-2" />{english ? 'Upload to Knowledge Base' : 'Tải tài liệu lên kho tri thức'}</Button>
          <p className="text-xs text-muted-foreground">{english ? 'Documents go to KB. MP4 is transcribed before you add it to KB.' : 'Tài liệu tải vào KB. MP4 được chép lời trước khi bạn thêm vào KB.'}</p>
          {!canUpload && <p className="text-xs text-muted-foreground">{english ? 'KB view/add permission is required to upload documents.' : 'Cần quyền xem/thêm tài liệu KB để upload.'}</p>}
          <input aria-label={english ? 'Search KB sources' : 'Tìm tài liệu KB'} value={search} onChange={e => setSearch(e.target.value)} placeholder={english ? 'Select an existing KB document' : 'Chọn tài liệu đã có trong KB'} className="w-full rounded border bg-background px-2 py-1 text-xs" />
          <div className="max-h-48 space-y-1 overflow-y-auto">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : documents.length ? documents.map(doc => <button type="button" key={doc.document_id} disabled={busy || uploading} className="flex items-center gap-3 w-full rounded-xl p-2 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:bg-muted/60" onClick={() => select(doc)}><SourceFileBadge name={doc.name} /><span className="min-w-0"><span className="block truncate font-medium leading-5" title={doc.name}>{doc.name}</span><span className="text-[11px] text-muted-foreground">{sourceFilePresentation(doc.name).label}<span className="mx-1.5 opacity-40" aria-hidden="true">·</span>{doc.status === 'learned' ? (english ? 'Ready' : 'Sẵn sàng') : (english ? 'Processing' : 'Đang xử lý')}</span></span></button>) : <p className="p-2 text-xs text-muted-foreground">{english ? 'No documents found' : 'Không có tài liệu phù hợp'}</p>}</div>
        </div>}
      </div>
      <Button className="flex-1" disabled={busy || uploading || !source || verifiedId !== source.document_id} onClick={() => { if (source && verifiedId === source.document_id) onCreate({ ...source, status: 'learned' }); }}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{english ? 'Create learning content' : 'Tạo nội dung bài học'}
      </Button>
    </div>}
    {!creationStarted && <p className="text-[11px] text-muted-foreground">{english ? 'Create a blueprint to review before drafting. Nothing is applied automatically.' : 'Tạo bản thiết kế để duyệt trước khi soạn bài. Không tự áp dụng vào khóa học.'}</p>}
  </div>;
}
