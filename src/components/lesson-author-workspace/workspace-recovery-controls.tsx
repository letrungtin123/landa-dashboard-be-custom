import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { createWorkspaceRecoveryClient, workspaceRecoveryMessage, type WorkspaceRecoveryClient } from '../../api/workspace-recovery';
import { secureRandomUuid } from '../../utils/random-uuid';
import {
  workspaceRecoveryBanner, workspaceRecoveryChapterAction, workspaceRecoveryConfirmText,
  workspaceRecoveryCopy, workspaceRecoveryUnitAction,
} from './workspace-recovery.logic';
import { createWorkspaceRecoveryState, type WorkspaceRecoveryController, type WorkspaceRecoveryState } from './workspace-recovery-state';

export interface WorkspaceRecoveryScope { courseId: string; conversationId: string; workspaceId: string }
export interface WorkspaceRecoveryInput {
  /** Owner of an open, authorized draft. Anything else never calls the server. */
  enabled: boolean;
  scope: WorkspaceRecoveryScope | null;
  locale: WorkspaceLocale;
  /** Read-model status and head of the open draft: the options are re-read when they move. */
  status: string | null;
  head: number | null;
  /** Re-read the draft (up to a known committed head when given). */
  onCommitted: (head: number | null) => Promise<void> | void;
  /** The course's running-draft notice may have changed. */
  onRunsChanged?: () => void;
  createClient?: (scope: WorkspaceRecoveryScope) => WorkspaceRecoveryClient;
}
export interface WorkspaceRecoveryUi {
  headerAction: ReactNode;
  banner: ReactNode;
  actions: ReactNode;
  chapterAction: (nodeId: string) => ReactNode;
  unitAction: (nodeId: string, variant: 'card' | 'detail') => ReactNode;
  dialog: ReactNode;
}
const emptySubscribe = () => () => {};
const emptyState = (): WorkspaceRecoveryState | null => null;
function stopPropagation(event: ReactMouseEvent) { event.stopPropagation(); }

/** Continue / Rewrite controls of the owner (Stop is not offered on screen). The
 * server decides what is allowed; this only renders the options of the last GET …/recovery. */
export function useWorkspaceRecovery(input: WorkspaceRecoveryInput): WorkspaceRecoveryUi {
  const { enabled, locale, status, head } = input;
  const c = workspaceRecoveryCopy[locale];
  const courseId = input.scope?.courseId ?? null, conversationId = input.scope?.conversationId ?? null;
  const workspaceId = input.scope?.workspaceId ?? null;
  const latest = useRef({ locale, onCommitted: input.onCommitted, onRunsChanged: input.onRunsChanged, createClient: input.createClient });
  useEffect(() => {
    latest.current = { locale, onCommitted: input.onCommitted, onRunsChanged: input.onRunsChanged, createClient: input.createClient };
  });
  // One controller per draft: switching drafts or unmounting disposes every timer and request of the old one.
  const [controller, setController] = useState<WorkspaceRecoveryController | null>(null);
  useEffect(() => {
    if (!courseId || !conversationId || !workspaceId) { setController(null); return; }
    let client: WorkspaceRecoveryClient;
    try { client = (latest.current.createClient ?? createWorkspaceRecoveryClient)({ courseId, conversationId, workspaceId }); }
    catch { setController(null); return; }
    const created = createWorkspaceRecoveryState({ client, locale: () => latest.current.locale, operationId: secureRandomUuid,
      onCommitted: target => latest.current.onCommitted(target), onRunsChanged: () => latest.current.onRunsChanged?.() });
    setController(created);
    return () => { created.dispose(); };
  }, [courseId, conversationId, workspaceId]);
  useEffect(() => { controller?.update({ enabled, status, head }); }, [controller, enabled, status, head]);
  const state = useSyncExternalStore(controller?.subscribe ?? emptySubscribe, controller?.getState ?? emptyState, emptyState);
  const view = enabled && state && !state.hidden ? state.view : null;
  const busy = state?.busy ?? false;
  const begin = controller?.begin;

  const banner = useMemo(() => workspaceRecoveryBanner(view, locale), [view, locale]);
  const actions = banner && (banner.resume || banner.rewriteAll) && begin ? <div className="flex flex-wrap items-center gap-2">
    {banner.resume && <Button type="button" size="sm" disabled={busy} onClick={() => begin(banner.resume!)}>{c.resume}</Button>}
    {banner.rewriteAll && <Button type="button" size="sm" variant="outline" disabled={busy} className="gap-1.5"
      onClick={() => begin(banner.rewriteAll!)}><RefreshCw className="h-3.5 w-3.5" aria-hidden />{banner.rewriteAllLabel ?? c.rewrite}</Button>}
  </div> : null;

  const unitAction = useCallback((nodeId: string, variant: 'card' | 'detail'): ReactNode => {
    const action = workspaceRecoveryUnitAction(view, nodeId, locale);
    if (!action || !begin) return null;
    if (!action.intent) return variant === 'detail' ? <p className="text-xs text-muted-foreground">{action.note}</p> : null;
    const intent = action.intent;
    if (variant === 'card') {
      return <button type="button" data-workspace-recovery="unit" disabled={busy}
        className="nodrag nopan inline-flex h-6 items-center gap-1 rounded-md border border-primary/30 bg-background/90 px-2 text-[10px] font-semibold text-primary shadow-sm transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
        onMouseDown={stopPropagation} onPointerDown={stopPropagation}
        onClick={event => { event.stopPropagation(); begin(intent); }}>
        <RefreshCw className="h-3 w-3" aria-hidden />{c.rewriteLesson}
      </button>;
    }
    return <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl px-5" disabled={busy} onClick={() => begin(intent)}>
      <RefreshCw className="h-4 w-4" aria-hidden />{c.rewriteLesson}
    </Button>;
  }, [begin, busy, c.rewriteLesson, view, locale]);

  const chapterAction = useCallback((nodeId: string): ReactNode => {
    const action = workspaceRecoveryChapterAction(view, nodeId, locale);
    if (!action || !begin) return null;
    if (!action.intent) return <p className="mt-3 text-xs text-muted-foreground">{action.note}</p>;
    const intent = action.intent;
    return <div className="mt-3 flex justify-end">
      <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => begin(intent)}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />{c.rewriteChapter}
      </Button>
    </div>;
  }, [begin, busy, c.rewriteChapter, view, locale]);

  const notice = state?.notice ? (state.notice === 'stopped' ? c.stopped : c.started) : null;
  // No Stop button for anyone while AI is writing (QC 21/10, C11). The server
  // stop remains for engineers; Continue / Rewrite stay for a stopped run.
  const headerAction = notice ? <div className="flex items-center gap-2">
    <span role="status" className="hidden max-w-[16rem] truncate text-xs text-muted-foreground sm:inline">{notice}</span>
  </div> : null;

  const bannerNode = banner ? <div role="status" aria-live="polite" data-workspace-recovery="banner"
    className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="flex items-center gap-2 leading-5">{banner.draining && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}{banner.message}</p>
      {banner.note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{banner.note}</p>}
    </div>
    {actions}
  </div> : null;

  const pending = enabled ? state?.pending ?? null : null;
  const text = pending ? workspaceRecoveryConfirmText(pending.intent, pending.maxRewrites, locale) : null;
  const error = state?.error ?? null;
  const dialog = pending && text && controller ? <Dialog open onOpenChange={open => { if (!open) controller.close(); }}>
    <DialogContent showCloseButton={false} overlayClassName="z-[10080]" className="z-[10090] max-w-md rounded-2xl p-0">
      <div className="border-b px-6 py-5">
        <DialogTitle>{text.title}</DialogTitle>
        <DialogDescription className="mt-2 leading-6">{text.body}</DialogDescription>
        {text.note && <p className="mt-2 text-xs text-muted-foreground">{text.note}</p>}
      </div>
      {error && <p role="alert" className="mx-6 mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        {workspaceRecoveryMessage(error, locale)}</p>}
      <div className="flex justify-end gap-2 px-6 py-4">
        <Button type="button" variant="outline" disabled={busy} onClick={() => controller.close()}>{pending.settled ? c.close : c.cancel}</Button>
        {!pending.settled && <Button type="button" variant={pending.intent.kind === 'stop' ? 'destructive' : 'default'} disabled={busy}
          onClick={() => { void controller.confirm(); }}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{busy ? c.working : error ? c.retry : text.confirm}
        </Button>}
      </div>
    </DialogContent>
  </Dialog> : null;

  return { headerAction, banner: bannerNode, actions, chapterAction, unitAction, dialog };
}
