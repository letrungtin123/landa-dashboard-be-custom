import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import type { WorkspaceReadScope } from '../../api/lesson-author-workspace';
import { workspaceReviewErrorMessage, type WorkspaceReviewDecision, type WorkspaceReviewItem } from '../../api/workspace-review';
import { secureRandomUuidOrNull } from '../../utils/random-uuid';
import { useLessonAuthorReviewItems, useResolveLessonAuthorReviewItem } from '@/hooks/queries/use-lesson-author-review';
import { workspaceReviewCopy, workspaceReviewHeadline, workspaceReviewItemView, workspaceReviewProgress } from './workspace-review.logic';

/** "Chờ duyệt" panel of a run that finished with held assessment questions.
 * The server re-checks permission and state on every decision; `canResolve`
 * only hides the buttons from people who cannot apply content. */
export function WorkspaceReviewPanel({ scope, tenantId, locale, canResolve }: {
  scope: WorkspaceReadScope; tenantId: string | null; locale: WorkspaceLocale; canResolve: boolean;
}) {
  const c = workspaceReviewCopy[locale];
  const query = useLessonAuthorReviewItems({ tenantId, scope, locale, enabled: true });
  const resolve = useResolveLessonAuthorReviewItem({ tenantId, scope, locale });
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ obligationId: string; message: string } | null>(null);
  const progress = workspaceReviewProgress(query.data);
  const headline = workspaceReviewHeadline(progress, locale);
  const decide = (obligationId: string, decision: WorkspaceReviewDecision, componentNodeId?: string) => {
    // One operation id per click: a retry of this click is idempotent on the server.
    const operationId = secureRandomUuidOrNull();
    if (!operationId) { setFailure({ obligationId, message: workspaceReviewErrorMessage(null, locale, 'resolve') }); return; }
    setFailure(null); setBusyItem(obligationId);
    resolve.mutate({ obligationId, decision, componentNodeId, operationId }, {
      onError: error => setFailure({ obligationId, message: workspaceReviewErrorMessage(error, locale, 'resolve') }),
      onSettled: () => setBusyItem(null),
    });
  };
  const done = headline.tone === 'done';
  return <section aria-label={headline.title} data-testid="workspace-review-panel" className="mx-auto max-w-5xl px-4 pt-5 sm:px-5 sm:pt-6">
    <div className={`rounded-2xl border p-4 shadow-sm ${done ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-sky-500/30 bg-sky-500/[0.06]'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
          : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'}`}>
          {done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <ClipboardCheck className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{headline.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{headline.lead}</p>
          {headline.note && <p className="mt-1 text-xs text-muted-foreground">{headline.note}</p>}
          {progress.total > 0 && <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
            <p className="text-xs font-medium tabular-nums">{c.progress(progress.resolved, progress.total)}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={`h-full rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${progress.percent}%` }} />
            </div>
          </div>}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 max-lg:h-10 max-lg:w-10" aria-label={c.reload}
          disabled={query.isFetching} onClick={() => { void query.refetch(); }}>
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} aria-hidden />
        </Button>
      </div>
      {query.isLoading && <p className="mt-3 text-sm text-muted-foreground" role="status">{c.loading}</p>}
      {query.isError && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="alert">
        <p>{workspaceReviewErrorMessage(query.error, locale, 'list')}</p>
        <Button type="button" variant="outline" size="sm" className="max-lg:h-10 max-lg:px-4" onClick={() => { void query.refetch(); }}>{c.reload}</Button>
      </div>}
      {query.data && query.data.items.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{c.empty}</p>}
      {query.data && query.data.items.length > 0 && <ol className="mt-4 space-y-3">
        {query.data.items.map(item => <ReviewItem key={item.obligation_id} item={item} locale={locale}
          canResolve={canResolve} busy={busyItem === item.obligation_id} locked={busyItem !== null}
          error={failure?.obligationId === item.obligation_id ? failure.message : null} onDecide={decide} />)}
      </ol>}
      {query.data?.has_more && <p className="mt-3 text-xs text-muted-foreground">{c.more}</p>}
      {!canResolve && progress.open > 0 && <p className="mt-3 text-xs text-muted-foreground">{c.readOnly}</p>}
    </div>
  </section>;
}

function ReviewItem({ item, locale, canResolve, busy, locked, error, onDecide }: {
  item: WorkspaceReviewItem; locale: WorkspaceLocale; canResolve: boolean; busy: boolean; locked: boolean; error: string | null;
  onDecide: (obligationId: string, decision: WorkspaceReviewDecision, componentNodeId?: string) => void;
}) {
  const c = workspaceReviewCopy[locale];
  const view = workspaceReviewItemView(item, locale);
  const open = item.status === 'open';
  return <li className={`rounded-xl border bg-card p-3.5 text-sm ${open ? 'border-border/70' : 'border-emerald-500/25 bg-emerald-500/[0.03]'}`}>
    <div className="flex items-start gap-2">
      {!open && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{view.where}</p>
        {open ? <p className="mt-1 leading-6 text-muted-foreground">{view.what}</p>
          : <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">{view.status}</p>}
        {open && view.objectives.length > 0 && <div className="mt-2">
          <p className="text-xs font-semibold">{c.objectives}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {view.objectives.map((objective, index) => <li key={index} className="break-words">{objective}</li>)}
          </ul>
        </div>}
        {/* Below the desktop width: 40px buttons; a long question title wraps inside its button. */}
        {open && canResolve && <div className="mt-3 flex flex-wrap items-center gap-2 max-lg:[&_button]:h-auto max-lg:[&_button]:min-h-10 max-lg:[&_button]:max-w-full max-lg:[&_button]:whitespace-normal max-lg:[&_button]:px-4 max-lg:[&_button]:py-2">
          <Button type="button" size="sm" disabled={locked} onClick={() => onDecide(item.obligation_id, 'approved_replan')}>
            {busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />{c.saving}</> : c.markChecked}
          </Button>
          {view.candidates.map(candidate => <Button key={candidate.node_id} type="button" size="sm" variant="outline" disabled={locked}
            onClick={() => onDecide(item.obligation_id, 'valid_assessment', candidate.node_id)}>{candidate.label}</Button>)}
          <p className="basis-full text-xs text-muted-foreground">{c.markCheckedHint}</p>
        </div>}
        {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
      </div>
    </div>
  </li>;
}
