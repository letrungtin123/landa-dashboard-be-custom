import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { Button } from '../ui/button';
import {
  ORG_PROFILE_SHOWN_FIELDS, type OrgProfile, type OrgProfileHistoryEntry, type OrgProfileShownField, type OrgProfileVersion,
} from '../../api/workspace-org-context.contract';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { useOrgProfileRestore, useOrgProfileVersion } from '@/hooks/queries/use-workspace-org-context';
import { formatOrgContextCount, formatOrgContextDateTime, orgContextErrorText } from './workspace-org-context.logic';
import { WorkspaceOrgContextConfirm, WorkspaceOrgContextViewer } from './workspace-org-context-dialogs';

/** Earlier versions (newest first, at most 20): view one, or restore it as a new unconfirmed draft. */
export function WorkspaceOrgProfileHistory({ history, currentVersion, confirmedVersion, revision, tenantId, locale, limitBytes, disabled, dirty, onRestored }: {
  history: readonly Readonly<OrgProfileHistoryEntry>[]; currentVersion: number | null; confirmedVersion: number | null; revision: number;
  tenantId: string | null; locale: WorkspaceLocale; limitBytes: number; disabled: boolean; dirty: boolean;
  onRestored: (result: { revision: number; current: Readonly<OrgProfileVersion> }) => void;
}) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restore = useOrgProfileRestore(tenantId);
  const view = useOrgProfileVersion({ tenantId, version: viewing });
  const canRestore = (version: number) => !disabled && version !== currentVersion;
  const ask = (version: number) => { setError(null); setViewing(null); setRestoring(version); };
  const confirm = () => {
    if (restoring === null) return;
    setError(null);
    restore.mutate({ expectedRevision: revision, version: restoring }, {
      onSuccess: result => { setRestoring(null); onRestored(result); },
      onError: failure => setError(orgContextErrorText(t, failure, locale, limitBytes)),
    });
  };
  return <details className="group rounded-xl border border-border/70 bg-background/60">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium">
      <History className="h-4 w-4 text-muted-foreground" aria-hidden />{t('aiIdOrgContext.profile.history.title', { count: history.length })}
    </summary>
    {history.length === 0 ? <p className="px-3 pb-3 text-sm text-muted-foreground">{t('aiIdOrgContext.profile.history.empty')}</p>
      : <ol className="divide-y border-t">{history.map(entry => {
        const origin = t(`aiIdOrgContext.profile.history.origin.${entry.origin}`), when = formatOrgContextDateTime(entry.created_at, locale);
        const chars = t('aiIdOrgContext.profile.history.chars', { count: formatOrgContextCount(entry.char_count, locale) });
        return <li key={entry.version} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{t('aiIdOrgContext.profile.history.version', { version: entry.version })}
              {entry.version === currentVersion && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t('aiIdOrgContext.profile.history.current')}</span>}
              {entry.version === confirmedVersion && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">{t('aiIdOrgContext.profile.history.confirmed')}</span>}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{entry.created_by_name
              ? t('aiIdOrgContext.profile.history.metaBy', { origin, who: entry.created_by_name, when, chars })
              : t('aiIdOrgContext.profile.history.meta', { origin, when, chars })}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" variant="outline" size="sm" aria-label={t('aiIdOrgContext.profile.history.viewLabel', { version: entry.version })}
              onClick={() => setViewing(entry.version)}>{t('aiIdOrgContext.profile.history.view')}</Button>
            <Button type="button" variant="outline" size="sm" disabled={!canRestore(entry.version)}
              aria-label={t('aiIdOrgContext.profile.history.restoreLabel', { version: entry.version })}
              onClick={() => ask(entry.version)}>{t('aiIdOrgContext.profile.history.restore')}</Button>
          </div>
        </li>;
      })}</ol>}
    {viewing !== null && <WorkspaceOrgContextViewer title={t('aiIdOrgContext.profile.history.viewTitle', { version: viewing })} onClose={() => setViewing(null)}
      footer={canRestore(viewing) ? <Button type="button" onClick={() => ask(viewing)}>{t('aiIdOrgContext.profile.history.restore')}</Button> : null}>
      {view.isPending ? <p role="status" className="text-sm text-muted-foreground">{t('aiIdOrgContext.profile.history.viewLoading')}</p>
        : view.isError ? <p role="alert" className="text-sm text-destructive">{orgContextErrorText(t, view.error, locale, limitBytes)}</p>
          : <WorkspaceOrgProfileView profile={view.data.profile} />}
    </WorkspaceOrgContextViewer>}
    {restoring !== null && <WorkspaceOrgContextConfirm title={t('aiIdOrgContext.profile.history.restoreTitle', { version: restoring })}
      body={t('aiIdOrgContext.profile.history.restoreBody', { version: restoring })} note={dirty ? t('aiIdOrgContext.profile.history.restoreDirty') : null}
      confirmLabel={t('aiIdOrgContext.profile.history.restore')} busy={restore.isPending} error={error}
      onConfirm={confirm} onClose={() => setRestoring(null)} />}
  </details>;
}

/** A stored profile, read only, in the order of the editors. An old version's learner groups are not shown (C10). */
export function WorkspaceOrgProfileView({ profile }: { profile: Readonly<OrgProfile> }) {
  const { t } = useTranslation();
  const values = (field: OrgProfileShownField): string[] => field === 'glossary' ? profile.glossary.map(row => `${row.term}: ${row.meaning}`)
    : field === 'organization_summary' || field === 'culture_tone' ? (profile[field] ? [profile[field]] : []) : [...profile[field]];
  return <dl className="space-y-4">{ORG_PROFILE_SHOWN_FIELDS.map(field => {
    const items = values(field);
    return <div key={field} className="min-w-0">
      <dt className="text-sm font-semibold">{t(`aiIdOrgContext.profile.fields.${field}.label`)}</dt>
      <dd className="mt-1 text-sm text-muted-foreground">{items.length === 0 ? t('aiIdOrgContext.profile.history.emptyField')
        : items.length === 1 && (field === 'organization_summary' || field === 'culture_tone') ? <p className="whitespace-pre-wrap break-words">{items[0]}</p>
          : <ul className="list-disc space-y-0.5 pl-5">{items.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul>}</dd>
    </div>;
  })}</dl>;
}
