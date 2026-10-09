import { Check, Clock3, Eye, Loader2, Pencil, Trash2, UserRound, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import type { LessonAuthorSessionScope, LessonAuthorSessionSummary } from '../../api/workspace-sessions';
import { workspaceSessionCardModel, workspaceSharingCopy } from './workspace-sharing';

export interface WorkspaceSessionCardLabels {
  open: string; continue: string; rename: string; save: string; cancel: string; remove: string; untitled: string;
}

/** One shared session: creator, view-only badge for other people's sessions,
 * rename/delete only when allowed (the server re-checks every action). */
export function WorkspaceSessionCard({ item, locale, labels, editing, title, renaming, updatedLabel,
  onOpen, onStartRename, onTitleChange, onCommitRename, onCancelRename, onDelete }: {
  item: LessonAuthorSessionSummary;
  locale: WorkspaceLocale;
  labels: WorkspaceSessionCardLabels;
  editing: boolean;
  title: string;
  renaming: boolean;
  updatedLabel: string;
  onOpen: () => void;
  onStartRename: () => void;
  onTitleChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  const s = workspaceSharingCopy[locale];
  const model = workspaceSessionCardModel(item, locale);
  const name = item.title || labels.untitled;
  const action = model.readOnly ? s.openViewOnly : item.workspace ? labels.open : labels.continue;
  const interactive = model.canOpen && !editing;
  return <article role={model.canOpen ? 'button' : undefined} tabIndex={interactive ? 0 : -1} aria-disabled={model.canOpen ? undefined : true}
    aria-label={`${action}: ${name}`} data-readonly={model.readOnly ? 'true' : 'false'}
    onClick={() => { if (interactive) onOpen(); }}
    onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}
    className={`rounded-2xl border bg-card p-4 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/50 ${model.canOpen
      ? 'cursor-pointer hover:border-primary/35 hover:bg-primary/[0.025] hover:shadow-md' : 'cursor-default opacity-80'}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">{editing ? <div className="flex max-w-xl gap-2" onClick={event => event.stopPropagation()}>
        <Input autoFocus maxLength={200} value={title} onChange={event => onTitleChange(event.target.value)}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') onCommitRename(); if (event.key === 'Escape') onCancelRename(); }} />
        <Button size="icon" aria-label={labels.save} disabled={renaming || !title.trim()} onClick={event => { event.stopPropagation(); onCommitRename(); }}>
          {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button><Button variant="outline" size="icon" aria-label={labels.cancel} onClick={event => { event.stopPropagation(); onCancelRename(); }}><X className="h-4 w-4" /></Button>
      </div> : <><div className="flex min-w-0 items-center gap-1.5"><h3 className="truncate font-semibold">{name}</h3>
        {model.readOnly && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Eye className="h-3 w-3" aria-hidden />{s.viewOnly}</span>}
        {model.canRename && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-primary"
          aria-label={labels.rename} onClick={event => { event.stopPropagation(); onStartRename(); }}><Pencil className="h-3.5 w-3.5" /></Button>}</div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" aria-hidden />{model.ownerLabel}</span>
          <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden />{updatedLabel}</span>
        </p>
        {!model.canOpen && <p className="mt-1 text-xs text-muted-foreground">{s.nothingToView}</p>}</>}</div>
      {!editing && model.canDelete && <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive"
        onClick={event => { event.stopPropagation(); onDelete(); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{labels.remove}</Button>}
    </div>
  </article>;
}

/** "All / Mine" filter; the list is filtered on the server. */
export function WorkspaceSessionScopeFilter({ scope, locale, disabled, onChange }: {
  scope: LessonAuthorSessionScope; locale: WorkspaceLocale; disabled?: boolean; onChange: (scope: LessonAuthorSessionScope) => void;
}) {
  const s = workspaceSharingCopy[locale];
  return <div role="group" aria-label={s.filterLabel} className="inline-flex rounded-xl border bg-card p-1 text-sm">
    {(['all', 'mine'] as const).map(value => <button key={value} type="button" aria-pressed={scope === value} disabled={disabled}
      onClick={() => { if (scope !== value) onChange(value); }}
      className={`rounded-lg px-3 py-1.5 font-medium transition ${scope === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      {value === 'all' ? s.filterAll : s.filterMine}
    </button>)}
  </div>;
}
