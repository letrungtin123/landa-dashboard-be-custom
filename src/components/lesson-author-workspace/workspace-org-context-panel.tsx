import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, FileText, Loader2, Trash2, Upload, Users } from 'lucide-react';
import { Button } from '../ui/button';
import {
  orgContextNotReadyKey, type OrgContextDocument, type OrgContextRead, type OrgContextState,
} from '../../api/workspace-org-context.contract';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { useOrgContextDeleteDocument, useOrgContextUpload } from '@/hooks/queries/use-workspace-org-context';
import {
  formatOrgContextDateTime, formatOrgContextFileSize, formatOrgContextMegabytes, formatOrgContextUsage, ORG_CONTEXT_FILE_ACCEPT,
  orgContextErrorText, orgContextUploadProblem, orgContextUsage,
} from './workspace-org-context.logic';
import { WorkspaceOrgProfileCard } from './workspace-org-profile-card';
import { WorkspaceOrgContextConfirm } from './workspace-org-context-dialogs';

const STATUS_STYLE = {
  learning: { icon: Loader2, className: 'text-amber-700 dark:text-amber-400', spin: true },
  learned: { icon: Check, className: 'text-emerald-700 dark:text-emerald-400', spin: false },
  error: { icon: AlertCircle, className: 'text-destructive', spin: false },
} as const;

/** "Ngữ cảnh doanh nghiệp" tab: the tenant's context documents (space used, upload one at a time, list with
 * status and delete) next to the organization profile. Everything here is shared by every course of the tenant. */
export function WorkspaceOrgContextPanel({ state, tenantId, locale, onReload }: {
  state: Readonly<OrgContextState>; tenantId: string | null; locale: WorkspaceLocale; onReload: () => Promise<OrgContextRead | undefined>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useOrgContextUpload(tenantId);
  const remove = useOrgContextDeleteDocument(tenantId);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Readonly<OrgContextDocument> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const usage = orgContextUsage(state.used_bytes, state.limit_bytes);
  const usageText = formatOrgContextUsage(state.used_bytes, state.limit_bytes, locale);
  const canUpload = state.ready && usage.level !== 'full' && !upload.isPending;
  const errorText = (failure: unknown) => orgContextErrorText(t, failure, locale, state.limit_bytes);

  const choose = (file: File) => {
    setUploadError(null);
    const problem = orgContextUploadProblem(file, { usedBytes: state.used_bytes, limitBytes: state.limit_bytes });
    if (problem) {
      setUploadError(problem === 'file' ? t('aiIdOrgContext.errors.fileInvalid')
        : t('aiIdOrgContext.errors.limitReached', { limit: formatOrgContextMegabytes(state.limit_bytes, locale) }));
      return;
    }
    setProgress(null);
    // A finished upload shows only as the new document's own status in the list.
    upload.mutate({ file, onProgress: setProgress }, {
      onError: failure => setUploadError(errorText(failure)),
    });
  };
  const confirmDelete = () => {
    if (!deleting) return;
    setDeleteError(null);
    remove.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: failure => setDeleteError(errorText(failure)) });
  };

  return <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border/70 bg-muted/20 p-4 sm:p-5">
      <div className="min-w-0">
        <h3 id={`${id}-title`} className="text-base font-semibold">{t('aiIdOrgContext.documentsTitle')}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('aiIdOrgContext.documentsHint')}</p>
      </div>
      <p className="flex gap-2 rounded-xl border border-primary/20 bg-primary/[0.045] px-3 py-2 text-xs leading-5">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />{t('aiIdOrgContext.sharedNote')}</p>
      {state.not_ready_reason && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-6">
        {t(orgContextNotReadyKey(state.not_ready_reason))}</p>}

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span id={`${id}-usage`} className="font-medium">{t('aiIdOrgContext.usageLabel')}</span>
          <span className="tabular-nums text-muted-foreground">{usageText}</span>
        </div>
        <div role="progressbar" aria-labelledby={`${id}-usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={usage.percent} aria-valuetext={usageText}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-[width] ${usage.level === 'full' ? 'bg-destructive' : usage.level === 'warning' ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${usage.percent}%` }} />
        </div>
        {usage.level === 'warning' && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('aiIdOrgContext.usageWarning')}</p>}
        {usage.level === 'full' && <p className="mt-1 text-xs text-destructive">{t('aiIdOrgContext.usageFull')}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <input ref={inputRef} className="sr-only" type="file" accept={ORG_CONTEXT_FILE_ACCEPT} disabled={!canUpload} tabIndex={-1} aria-hidden
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) choose(file); }} />
        <Button type="button" className="self-start max-lg:h-10 max-lg:px-4" disabled={!canUpload} onClick={() => inputRef.current?.click()}>
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}{t('aiIdOrgContext.upload')}</Button>
        <p className="text-xs leading-5 text-muted-foreground">{t('aiIdOrgContext.uploadTypes')}</p>
        {upload.isPending && <p role="status" className="text-xs text-muted-foreground">{progress === null ? t('aiIdOrgContext.uploadingWait')
          : t('aiIdOrgContext.uploading', { percent: progress })}</p>}
        {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('aiIdOrgContext.documentsLabel')}</p>
        {state.documents.length === 0 ? <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground">
          <FileText className="h-6 w-6 opacity-40" aria-hidden /><p>{t('aiIdOrgContext.empty')}</p></div>
          : <ul className="space-y-2">{state.documents.map(document => {
            const style = STATUS_STYLE[document.status], Icon = style.icon;
            const size = formatOrgContextFileSize(document.size_bytes, locale), when = formatOrgContextDateTime(document.created_at, locale);
            return <li key={document.id} className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/60 px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FileText className="h-4 w-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                {/* Long names wrap on phones and tablets; one line on desktop, the full name on hover. */}
                <p className="text-sm font-medium wrap-anywhere lg:truncate" title={document.name}>{document.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{document.created_by_name
                  ? t('aiIdOrgContext.documentMetaBy', { size, who: document.created_by_name, when }) : t('aiIdOrgContext.documentMeta', { size, when })}</p>
                <p className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${style.className}`}>
                  <Icon className={`h-3 w-3 ${style.spin ? 'animate-spin' : ''}`} aria-hidden />{t(`aiIdOrgContext.status.${document.status}`)}</p>
                {document.status === 'error' && <p className="mt-0.5 text-[11px] text-destructive">{t('aiIdOrgContext.documentFailed')}</p>}
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="max-lg:size-10" disabled={document.status === 'learning' || remove.isPending}
                aria-label={t('aiIdOrgContext.deleteLabel', { name: document.name })}
                onClick={() => { setDeleteError(null); setDeleting(document); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </li>;
          })}</ul>}
      </div>
    </section>

    <WorkspaceOrgProfileCard state={state} tenantId={tenantId} locale={locale} onReload={onReload} />

    {deleting && <WorkspaceOrgContextConfirm destructive title={t('aiIdOrgContext.deleteTitle')} body={t('aiIdOrgContext.deleteBody', { name: deleting.name })}
      confirmLabel={t('aiIdOrgContext.deleteConfirm')} busy={remove.isPending} error={deleteError} onConfirm={confirmDelete} onClose={() => setDeleting(null)} />}
  </div>;
}
