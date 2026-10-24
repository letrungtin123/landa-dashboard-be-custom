import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import {
  orgContextDistillFailureKey, readOrgContextFailure, type OrgContextRead, type OrgContextState,
} from '../../api/workspace-org-context.contract';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { useOrgProfileDistill, useOrgProfileSave } from '@/hooks/queries/use-workspace-org-context';
import {
  formatOrgContextDate, isOrgProfileEmpty, normalizeOrgProfile, orgContextDistillActive, orgContextErrorText, orgProfileActions,
  orgProfileChangedFields, orgProfileEditorFrom, orgProfileEditorStale, orgProfileReview, orgProfileStatus, syncOrgProfileEditor,
} from './workspace-org-context.logic';
import { WorkspaceOrgProfileFields } from './workspace-org-profile-fields';
import { WorkspaceOrgProfileHistory } from './workspace-org-profile-history';
import { WorkspaceOrgContextConfirm } from './workspace-org-context-dialogs';

/** "Hồ sơ doanh nghiệp": status, AI draft from the documents, the 6 editors, Save draft / Confirm, history.
 * Until a first version exists the editors stay closed: the card shows the two steps that let the AI write the
 * profile, and "fill it in yourself" opens empty editors for an organization without documents.
 * The draft keeps the server revision it started from; a newer server version replaces it only while it has no
 * changes, so another author's work is never overwritten silently (the server answers a stale save with a conflict). */
export function WorkspaceOrgProfileCard({ state, tenantId, locale, onReload }: {
  state: Readonly<OrgContextState>; tenantId: string | null; locale: WorkspaceLocale; onReload: () => Promise<OrgContextRead | undefined>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const server = state.profile;
  const [editor, setEditor] = useState(() => orgProfileEditorFrom(server));
  const synced = syncOrgProfileEditor(editor, server);
  if (synced !== editor) setEditor(synced);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [pending, setPending] = useState<'distill' | 'reload' | null>(null);
  const [reloading, setReloading] = useState(false);
  const [manual, setManual] = useState(false);
  const save = useOrgProfileSave(tenantId);
  const distill = useOrgProfileDistill(tenantId);

  const review = useMemo(() => orgProfileReview(synced.draft), [synced.draft]);
  const normalized = useMemo(() => normalizeOrgProfile(synced.draft), [synced.draft]);
  const changed = useMemo(() => orgProfileChangedFields(synced.draft, synced.baseProfile), [synced.draft, synced.baseProfile]);
  const dirty = changed.length > 0, empty = isOrgProfileEmpty(normalized);
  const distillActive = orgContextDistillActive(state);
  const learnedCount = state.documents.filter(document => document.status === 'learned').length;
  const busy = save.isPending || distill.isPending || reloading;
  const actions = orgProfileActions({ ready: state.ready, notReadyReason: state.not_ready_reason, distillActive, learnedCount, busy, dirty,
    valid: review.issues.length === 0, empty, currentVersion: server.current?.version ?? null, confirmedVersion: server.confirmed_version });
  const stale = dirty && orgProfileEditorStale(synced, server);
  const status = orgProfileStatus(server);
  const editing = server.current !== null || manual;

  const begin = () => { setNotice(null); setError(null); };
  const fail = (failure: unknown) => setError({ text: orgContextErrorText(t, failure, locale, state.limit_bytes),
    conflict: readOrgContextFailure(failure).code === 'ORG_CONTEXT_REVISION_CONFLICT' });
  const submit = (confirm: boolean) => {
    begin();
    save.mutate({ expectedRevision: synced.baseRevision, profile: normalized, confirm }, {
      onSuccess: result => {
        setEditor(orgProfileEditorFrom({ revision: result.revision, current: result.current }));
        setNotice(t(confirm ? 'aiIdOrgContext.profile.confirmedNotice' : 'aiIdOrgContext.profile.saved'));
      },
      onError: fail,
    });
  };
  const requestDistill = () => {
    setPending(null); begin();
    const current = server.current;
    distill.mutate({ expectedRevision: server.revision, locale }, {
      onSuccess: result => setEditor(orgProfileEditorFrom({ revision: result.revision, current })),
      onError: fail,
    });
  };
  const reload = () => {
    setPending(null); begin(); setReloading(true);
    void onReload().then(fresh => setEditor(orgProfileEditorFrom(fresh?.enabled ? fresh.profile : server))).finally(() => setReloading(false));
  };
  const statusText = status.kind === 'none' ? t('aiIdOrgContext.profile.statusNone') : status.kind === 'draft' ? t('aiIdOrgContext.profile.statusDraft')
    : status.by ? t('aiIdOrgContext.profile.statusConfirmed', { date: formatOrgContextDate(status.at, locale), name: status.by })
      : t('aiIdOrgContext.profile.statusConfirmedNoName', { date: formatOrgContextDate(status.at, locale) });
  const reloadButton = <Button type="button" variant="outline" size="sm" className="max-lg:h-10 max-lg:px-4" disabled={busy} onClick={() => dirty ? setPending('reload') : reload()}>
    {reloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}{t('aiIdOrgContext.reload')}</Button>;

  return <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border/70 bg-card p-4 sm:p-5">
    <div className="min-w-0">
      <h3 id={`${id}-title`} className="text-base font-semibold">{t('aiIdOrgContext.profile.title')}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('aiIdOrgContext.profile.hint')}</p>
    </div>
    <div className="space-y-1">
      <p className="text-sm"><span className="text-muted-foreground">{t('aiIdOrgContext.profile.statusLabel')}: </span>
        <span className={`font-medium ${status.kind === 'confirmed' ? 'text-emerald-700 dark:text-emerald-400' : status.kind === 'draft' ? 'text-amber-700 dark:text-amber-400' : ''}`}>{statusText}</span></p>
      {status.kind === 'draft' && status.confirmedAt && <p className="text-xs leading-5 text-muted-foreground">
        {t('aiIdOrgContext.profile.draftKeepsConfirmed', { date: formatOrgContextDate(status.confirmedAt, locale) })}</p>}
    </div>

    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/25 p-3">
      <Button type="button" variant="outline" className="self-start max-lg:h-10 max-lg:px-4" disabled={!actions.distill} onClick={() => dirty ? setPending('distill') : requestDistill()}>
        {distill.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}{t('aiIdOrgContext.profile.distill')}</Button>
      {distillActive ? <div role="status" className="flex items-start gap-2 text-sm"><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
        <div><p className="font-medium">{t('aiIdOrgContext.profile.distilling')}</p><p className="text-xs leading-5 text-muted-foreground">{t('aiIdOrgContext.profile.distillHint')}</p></div></div>
        : state.distill.status === 'failed' ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{t(orgContextDistillFailureKey(state.distill.error_code))}</span>
          <Button type="button" variant="outline" size="sm" className="max-lg:h-10 max-lg:px-4" disabled={!actions.distill} onClick={() => dirty ? setPending('distill') : requestDistill()}>{t('aiIdOrgContext.retry')}</Button></div>
          : learnedCount === 0 ? <p className="text-xs leading-5 text-muted-foreground">{t('aiIdOrgContext.profile.distillNeedsDocument')}</p>
            : server.unread_document_count > 0 ? <p className="text-xs leading-5 text-muted-foreground">{t('aiIdOrgContext.profile.unread', { count: server.unread_document_count })}</p> : null}
    </div>

    {!editing && <div className="space-y-2 rounded-xl border border-dashed border-border/80 p-3 text-sm">
      <p className="font-medium">{t('aiIdOrgContext.profile.startTitle')}</p>
      <ol className="list-decimal space-y-1 pl-5 leading-6 text-muted-foreground">
        <li>{t('aiIdOrgContext.profile.startStep1')}</li><li>{t('aiIdOrgContext.profile.startStep2')}</li></ol>
      <Button type="button" variant="link" size="sm" className="h-auto px-0 max-lg:min-h-10" disabled={!actions.editable} onClick={() => setManual(true)}>
        {t('aiIdOrgContext.profile.manualEntry')}</Button>
    </div>}

    {!editing && error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <span className="min-w-0 flex-1">{error.text}</span>{error.conflict && reloadButton}</div>}

    {stale && !error && <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{t('aiIdOrgContext.errors.conflict')}</span>{reloadButton}</div>}

    {editing && <>
    <WorkspaceOrgProfileFields draft={synced.draft} review={review} changed={changed} disabled={!actions.editable} locale={locale}
      onChange={draft => { setNotice(null); setEditor(current => ({ ...current, draft })); }} />

    <div className="sticky -bottom-5 z-10 -mx-4 space-y-2 border-t border-border/70 bg-card px-4 pt-3 pb-4 shadow-[0_-12px_24px_-18px_rgba(0,0,0,0.55)] sm:-mx-5 sm:px-5">
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <span className="min-w-0 flex-1">{error.text}</span>{error.conflict && reloadButton}</div>}
      {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {empty && (dirty || !!server.current) && <p className="text-xs text-muted-foreground">{t('aiIdOrgContext.profile.emptyCannotConfirm')}</p>}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end max-lg:[&_button]:h-10">
        <Button type="button" variant="outline" disabled={!actions.save} onClick={() => submit(false)}>
          {save.isPending && !save.variables?.confirm && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{t('aiIdOrgContext.profile.save')}</Button>
        <Button type="button" disabled={!actions.confirm} onClick={() => submit(true)}>
          {save.isPending && save.variables?.confirm ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{t('aiIdOrgContext.profile.confirm')}</Button>
      </div>
    </div>
    </>}

    {state.history.length > 0 && <WorkspaceOrgProfileHistory history={state.history} currentVersion={server.current?.version ?? null} confirmedVersion={server.confirmed_version}
      revision={server.revision} tenantId={tenantId} locale={locale} limitBytes={state.limit_bytes} disabled={!actions.editable} dirty={dirty}
      onRestored={result => { begin(); setEditor(orgProfileEditorFrom(result)); setNotice(t('aiIdOrgContext.profile.restored', { version: result.current.version })); }} />}

    {pending && <WorkspaceOrgContextConfirm busy={false} error={null} onClose={() => setPending(null)}
      title={t(pending === 'distill' ? 'aiIdOrgContext.profile.distillDirtyTitle' : 'aiIdOrgContext.profile.reloadTitle')}
      body={t(pending === 'distill' ? 'aiIdOrgContext.profile.distillDirtyBody' : 'aiIdOrgContext.profile.reloadBody')}
      confirmLabel={t(pending === 'distill' ? 'aiIdOrgContext.profile.distill' : 'aiIdOrgContext.reload')}
      onConfirm={pending === 'distill' ? requestDistill : reload} />}
  </section>;
}
