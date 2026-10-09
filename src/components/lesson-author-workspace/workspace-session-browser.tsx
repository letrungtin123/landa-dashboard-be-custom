import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FilePlus2, Loader2, RefreshCw, Users, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import {
  deleteLessonAuthorSession,
  getLessonAuthorSessionDeleteImpact,
  listLessonAuthorSessions,
  renameLessonAuthorSession,
  type LessonAuthorSessionDeleteImpact,
  type LessonAuthorSessionScope,
  type LessonAuthorSessionSummary,
} from '../../api/workspace-sessions';
import type { WorkspaceLaunchContext } from './workspace-host.logic';
import { WorkspaceAiAvatar } from './workspace-ai-avatar';
import { WorkspaceSessionCard, WorkspaceSessionScopeFilter } from './workspace-session-card';
import { workspaceSharingCopy } from './workspace-sharing';

const copy = {
  vi: {
    eyebrow: 'AI Instructional Design', title: 'Bản thiết kế khoá học', description: 'Mở lại một phiên trước đó hoặc bắt đầu một bản thiết kế khoá học mới.',
    newSession: 'Tạo bản thiết kế khoá học mới', empty: 'Chưa có bản thiết kế khoá học nào.', open: 'Mở bản thiết kế khoá học', continue: 'Tiếp tục tạo nội dung',
    rename: 'Đổi tên', save: 'Lưu tên', cancel: 'Hủy', remove: 'Xóa', loading: 'Đang tải danh sách bản thiết kế khoá học…', retry: 'Tải lại',
    error: 'Chưa tải được danh sách bản thiết kế khoá học. Hãy thử lại.', renameError: 'Chưa đổi được tên. Có thể bản thiết kế khoá học đã thay đổi ở nơi khác.',
    deleteTitle: 'Xóa bản thiết kế khoá học này?', deleteLead: 'Bản thiết kế khoá học và nội dung chưa áp dụng sẽ bị xóa vĩnh viễn.',
    kept: 'Nội dung đã áp dụng vào khóa học vẫn được giữ nguyên.', total: 'Tổng node', applied: 'Đã áp dụng', unapplied: 'Chưa áp dụng',
    deleting: 'Đang gửi yêu cầu xóa…', active: 'Phiên đang tạo nội dung nên chưa thể xóa. Hãy chờ hoàn tất rồi thử lại.',
    queued: 'Đã tiếp nhận yêu cầu xóa. Danh sách sẽ được cập nhật tự động.', close: 'Đóng', untitled: 'Bản thiết kế khoá học',
  },
  en: {
    eyebrow: 'AI Instructional Design', title: 'Course drafts', description: 'Reopen an earlier session or start a new controlled draft.',
    newSession: 'Create new draft', empty: 'This course has no drafts yet.', open: 'Open draft', continue: 'Continue creating',
    rename: 'Rename', save: 'Save name', cancel: 'Cancel', remove: 'Delete', loading: 'Loading course drafts…', retry: 'Reload',
    error: 'Drafts could not be loaded. Try again.', renameError: 'The name could not be changed. The draft may have changed elsewhere.',
    deleteTitle: 'Delete this draft?', deleteLead: 'The draft and unapplied content will be permanently deleted.',
    kept: 'Content already applied to the course will remain unchanged.', total: 'Total nodes', applied: 'Applied', unapplied: 'Unapplied',
    deleting: 'Submitting deletion…', active: 'This session is still generating content. Wait for it to finish, then try again.',
    queued: 'Deletion was accepted. The list will update automatically.', close: 'Close', untitled: 'Course draft',
  },
} as const;

export function WorkspaceSessionBrowser({ courseId, locale, assistantAvatarSrc, banner, onOpen, onSource, onClose }: {
  courseId: string;
  locale: WorkspaceLocale;
  assistantAvatarSrc?: string | null;
  /** Running sessions of other people on this course (presentational). */
  banner?: ReactNode;
  onOpen: (launch: WorkspaceLaunchContext, item: LessonAuthorSessionSummary) => void | Promise<void>;
  onSource: (conversationId: string | null, title: string | null) => void;
  onClose: () => void;
}) {
  const c = copy[locale], s = workspaceSharingCopy[locale];
  const [scope, setScope] = useState<LessonAuthorSessionScope>('all');
  const [items, setItems] = useState<readonly LessonAuthorSessionSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [title, setTitle] = useState(''), [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState<LessonAuthorSessionSummary | null>(null);
  const [impact, setImpact] = useState<LessonAuthorSessionDeleteImpact | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false), [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try { const result = await listLessonAuthorSessions(courseId, locale, signal, scope); setItems(result.items); }
    catch { if (!signal?.aborted) setError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [courseId, locale, scope]);
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort(); }, [load]);

  const startRename = (item: LessonAuthorSessionSummary) => { setEditing(item.conversation_id); setTitle(item.title); setNotice(null); };
  const commitRename = async (item: LessonAuthorSessionSummary) => {
    const normalized = title.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length > 200 || renaming) return;
    setRenaming(true); setNotice(null);
    try {
      const updated = await renameLessonAuthorSession(courseId, item.conversation_id, normalized, item.updated_at, locale);
      setItems(current => current.map(value => value.conversation_id === item.conversation_id
        ? { ...value, title: updated.title, updated_at: updated.updated_at } : value));
      setEditing(null);
    } catch { setNotice(c.renameError); }
    finally { setRenaming(false); }
  };
  const requestDelete = async (item: LessonAuthorSessionSummary) => {
    setDeleting(item); setImpact(null); setNotice(null);
    try { setImpact(await getLessonAuthorSessionDeleteImpact(courseId, item.conversation_id, locale)); }
    catch { setNotice(c.error); setDeleting(null); }
  };
  const confirmDelete = async () => {
    if (!deleting || !impact || deleteBusy) return;
    if (impact.active) { setNotice(c.active); setDeleting(null); return; }
    setDeleteBusy(true); setNotice(null);
    try {
      await deleteLessonAuthorSession(courseId, deleting.conversation_id, locale);
      setItems(current => current.filter(item => item.conversation_id !== deleting.conversation_id));
      setDeleting(null); setImpact(null); setNotice(c.queued);
    } catch { setNotice(c.error); }
    finally { setDeleteBusy(false); }
  };
  const format = (value: string) => new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  // Own sessions open or continue; other people's sessions open read-only, and only when there is a workspace to view.
  const openItem = (item: LessonAuthorSessionSummary) => {
    if (item.workspace) void onOpen(item.workspace, item);
    else if (item.permissions.can_continue) onSource(item.conversation_id, item.title);
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 items-start justify-between gap-4 border-b bg-card px-5 py-4 sm:px-7 sm:py-5">
      <div className="flex min-w-0 items-start gap-3.5"><WorkspaceAiAvatar src={assistantAvatarSrc} />
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.eyebrow}</p><h2 className="mt-1 text-lg font-bold">{c.title}</h2><p className="mt-1 text-sm text-muted-foreground">{c.description}</p></div></div>
      <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" aria-label={c.close} onClick={onClose}><X className="h-4 w-4" /></Button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-muted/20 to-background px-5 py-5 sm:px-7">
      <div className="mx-auto max-w-5xl space-y-4">
        {banner}
        <button type="button" onClick={() => onSource(null, null)} className="group flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-primary/[0.055] p-4 text-left shadow-sm transition hover:border-primary/55 hover:bg-primary/[0.09] hover:shadow-lg hover:shadow-primary/10">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform group-hover:scale-105"><FilePlus2 className="h-5 w-5" /></span>
          <span><span className="block font-semibold">{c.newSession}</span><span className="mt-1 block text-sm text-muted-foreground">{c.description}</span></span>
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs text-muted-foreground sm:max-w-2xl"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{s.sharedNote}</p>
          <WorkspaceSessionScopeFilter scope={scope} locale={locale} disabled={loading} onChange={value => { setEditing(null); setScope(value); }} />
        </div>
        {notice && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">{notice}</p>}
        {loading && <div className="space-y-3" role="status"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{c.loading}</p>{[0,1,2].map(value => <div key={value} className="h-24 animate-pulse rounded-2xl border bg-card" />)}</div>}
        {!loading && error && <div className="rounded-2xl border bg-card p-6 text-center"><p className="text-sm text-muted-foreground">{c.error}</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />{c.retry}</Button></div>}
        {!loading && !error && items.length === 0 && <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">{scope === 'mine' ? s.emptyMine : c.empty}</div>}
        {!loading && !error && items.map(item => <WorkspaceSessionCard key={item.conversation_id} item={item} locale={locale} labels={c}
          editing={editing === item.conversation_id} title={title} renaming={renaming} updatedLabel={format(item.updated_at)}
          onOpen={() => openItem(item)} onStartRename={() => startRename(item)} onTitleChange={setTitle}
          onCommitRename={() => void commitRename(item)} onCancelRename={() => setEditing(null)} onDelete={() => void requestDelete(item)} />)}
      </div>
    </div>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !deleteBusy) { setDeleting(null); setImpact(null); } }}>
      <DialogContent showCloseButton={false} overlayClassName="z-[10080]" className="z-[10090] max-w-lg rounded-2xl p-0">
        <div className="border-b px-6 py-5"><DialogTitle>{c.deleteTitle}</DialogTitle><DialogDescription className="mt-2">{deleting?.title}</DialogDescription></div>
        <div className="space-y-4 px-6 py-5"><p className="text-sm">{c.deleteLead}</p><p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{c.kept}</p>
          {!impact ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{c.loading}</p> : <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted p-3"><strong className="block text-lg">{impact.total_nodes}</strong><span className="text-xs text-muted-foreground">{c.total}</span></div><div className="rounded-xl bg-muted p-3"><strong className="block text-lg">{impact.applied_nodes}</strong><span className="text-xs text-muted-foreground">{c.applied}</span></div><div className="rounded-xl bg-muted p-3"><strong className="block text-lg">{impact.unapplied_nodes}</strong><span className="text-xs text-muted-foreground">{c.unapplied}</span></div></div>}
          {impact?.active && <p className="text-sm text-amber-600 dark:text-amber-400">{c.active}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4"><Button variant="outline" disabled={deleteBusy} onClick={() => { setDeleting(null); setImpact(null); }}>{c.cancel}</Button><Button variant="destructive" disabled={!impact || impact.active || deleteBusy} onClick={() => void confirmDelete()}>{deleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{deleteBusy ? c.deleting : c.remove}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
