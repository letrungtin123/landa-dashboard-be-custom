import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import type { WorkspaceLocale, WorkspaceStatus } from '../../api/lesson-author-workspace.contract';
import { workspaceCopy } from './workspace-node-detail';
import { workspaceTerminalFailureText } from './workspace-terminal.logic';
import { workspaceReviewCopy, workspaceReviewRequired } from './workspace-review.logic';

export function WorkspaceTerminalPanel({ locale, status, onRefresh, compact = false, actions }: { locale: WorkspaceLocale; status: WorkspaceStatus; onRefresh?: () => void; compact?: boolean;
  /** Continue / Rewrite offered for this stopped design; replaces the "start a new draft" hint. */
  actions?: ReactNode }) {
  const c = workspaceCopy[locale];
  const message = status.status === 'needs_action' ? c.terminalNeedsAction : status.status === 'failed' ? c.terminalFailed
    : status.status === 'canceled' ? c.terminalCanceled : c.terminalReady;
  const failure = workspaceTerminalFailureText(status, locale);
  const assessmentReviewRequired = workspaceReviewRequired(status);
  const isFailure = (status.status === 'needs_action' || status.status === 'failed') && !assessmentReviewRequired;
  // An author stop is not an error: everything finished is kept (amber notice, not an alert).
  const contentCommitted = status.failure_code === 'RUN_STOPPED_BY_AUTHOR'
    || status.failure_stage === 'finalize_course' && status.unit_count > 0 && status.ready_unit_count === status.unit_count;
  return <div className={`${compact ? 'mx-4 my-3 sm:mx-5' : 'm-4 max-w-2xl'} flex flex-col gap-3 rounded-2xl border p-4 text-sm ${isFailure && !contentCommitted ? 'border-destructive/35 bg-destructive/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'}`} role={isFailure && !contentCommitted ? 'alert' : 'status'} aria-live="polite">
    <div className="flex items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isFailure && !contentCommitted ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}><AlertTriangle className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0"><p className="font-semibold">{assessmentReviewRequired ? workspaceReviewCopy[locale].pendingTitle : c[status.status]}</p><p className="mt-1 leading-6 text-muted-foreground">{(isFailure || assessmentReviewRequired) && status.failure_code ? failure.message : message}</p>
        {failure.stage && <p className="mt-1 text-xs font-medium text-foreground">{locale === 'vi' ? 'Bước gặp lỗi' : 'Failed step'}: {failure.stage}</p>}
        {failure.note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{failure.note}</p>}
      </div></div>
    {(!assessmentReviewRequired && (onRefresh || isFailure)) && <div className="flex flex-wrap items-center gap-2">
      {onRefresh && <Button type="button" variant="outline" size="sm" className="max-lg:h-10 max-lg:px-4" onClick={onRefresh}>{c.terminalReload}</Button>}
      {isFailure && !actions && <p className="text-xs text-muted-foreground">{locale === 'vi' ? 'Sau khi xử lý nguyên nhân, đóng cửa sổ và chọn Tạo nội dung bài học để tạo một bản thiết kế khoá học mới.' : 'After resolving the cause, close this window and choose Create lesson content to start a new draft.'}</p>}
      {isFailure && actions}
    </div>}
  </div>;
}
