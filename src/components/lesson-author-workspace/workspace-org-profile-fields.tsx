import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  ORG_PROFILE_FIELDS, ORG_PROFILE_LIST_LIMITS, ORG_PROFILE_ROW_LIMITS, ORG_PROFILE_TEXT_LIMITS, ORG_PROFILE_TOTAL_MAX,
  type OrgProfileField, type OrgProfileListField, type OrgProfileRowField, type OrgProfileTextField,
} from '../../api/workspace-org-context.contract';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { formatOrgContextCount, type orgProfileReview, type OrgProfileDraft, type OrgProfileIssue } from './workspace-org-context.logic';

type Review = ReturnType<typeof orgProfileReview>;
type Translate = ReturnType<typeof useTranslation>['t'];
const label = (t: Translate, field: OrgProfileField) => t(`aiIdOrgContext.profile.fields.${field}.label`);

/** One plain sentence per problem; the counters show the rest. */
function issueText(t: Translate, issue: OrgProfileIssue, locale: WorkspaceLocale): string {
  const max = 'max' in issue ? formatOrgContextCount(issue.max, locale) : '';
  if (issue.kind === 'total_too_long') return t('aiIdOrgContext.profile.issues.totalTooLong', { max });
  if (issue.kind === 'too_many_lines') return t('aiIdOrgContext.profile.issues.tooManyLines', { max });
  if (issue.kind === 'too_many') return t('aiIdOrgContext.profile.issues.tooMany', { max });
  const part = issue.part ? t(`aiIdOrgContext.profile.fields.${issue.field}.${issue.part}`) : '';
  if (issue.kind === 'required') return t('aiIdOrgContext.profile.issues.required', { index: issue.index + 1, part });
  if (issue.index === null) return t('aiIdOrgContext.profile.issues.tooLong', { max });
  return t(issue.part ? 'aiIdOrgContext.profile.issues.partTooLong' : 'aiIdOrgContext.profile.issues.itemTooLong', { index: issue.index + 1, part, max });
}

function FieldFooter({ id, counter, issues, locale }: { id: string; counter: string; issues: OrgProfileIssue[]; locale: WorkspaceLocale }) {
  const { t } = useTranslation();
  return <div id={id} className="space-y-0.5">
    <p className={`text-right text-[11px] tabular-nums ${issues.length ? 'text-destructive' : 'text-muted-foreground'}`}>{counter}</p>
    {issues.map((issue, index) => <p key={index} className="text-xs text-destructive">{issueText(t, issue, locale)}</p>)}
  </div>;
}

function Changed({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return show ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t('aiIdOrgContext.profile.changed')}</span> : null;
}

/** The 7 profile editors in spec order, with live counters and the 6000 total. Values are the author's raw text;
 * the counters and problems use the normalised text that Save sends. */
export function WorkspaceOrgProfileFields({ draft, review, changed, disabled, locale, onChange }: {
  draft: OrgProfileDraft; review: Review; changed: readonly OrgProfileField[]; disabled: boolean; locale: WorkspaceLocale;
  onChange: (next: OrgProfileDraft) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const issuesOf = (field: OrgProfileField) => review.issues.filter(issue => issue.kind !== 'total_too_long' && issue.field === field);
  const total = review.issues.find(issue => issue.kind === 'total_too_long');
  return <div className="space-y-5">
    {ORG_PROFILE_FIELDS.map(field => {
      const common = { id: `${id}-${field}`, issues: issuesOf(field), changed: changed.includes(field), disabled, locale };
      const count = review.fields[field].count ?? 0;
      if (field === 'organization_summary' || field === 'culture_tone') return <TextEditor key={field} {...common} field={field} value={draft[field]}
        length={review.fields[field].length} onChange={value => onChange({ ...draft, [field]: value })} />;
      if (field === 'learner_groups') return <RowEditor key={field} {...common} field={field} rows={draft.learner_groups} count={count}
        onChange={rows => onChange({ ...draft, learner_groups: rows.map(row => ({ name: row.name ?? '', description: row.description ?? '' })) })} />;
      if (field === 'glossary') return <RowEditor key={field} {...common} field={field} rows={draft.glossary} count={count}
        onChange={rows => onChange({ ...draft, glossary: rows.map(row => ({ term: row.term ?? '', meaning: row.meaning ?? '' })) })} />;
      return <ListEditor key={field} {...common} field={field} values={draft[field]} count={count}
        onChange={values => onChange({ ...draft, [field]: values })} />;
    })}
    <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
      <p className={`text-sm font-medium tabular-nums ${total ? 'text-destructive' : ''}`}>{t('aiIdOrgContext.profile.total', {
        length: formatOrgContextCount(review.total, locale), max: formatOrgContextCount(ORG_PROFILE_TOTAL_MAX, locale) })}</p>
      {total && <p className="mt-0.5 text-xs text-destructive">{issueText(t, total, locale)}</p>}
    </div>
  </div>;
}

interface EditorProps { id: string; issues: OrgProfileIssue[]; changed: boolean; disabled: boolean; locale: WorkspaceLocale }

function TextEditor({ id, field, value, length, issues, changed, disabled, locale, onChange }: EditorProps & {
  field: OrgProfileTextField; value: string; length: number; onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const max = ORG_PROFILE_TEXT_LIMITS[field].max;
  return <div className="min-w-0 space-y-1.5">
    <div className="flex items-center justify-between gap-2"><label htmlFor={id} className="text-sm font-medium">{label(t, field)}</label><Changed show={changed} /></div>
    <Textarea id={id} rows={4} value={value} disabled={disabled} placeholder={t(`aiIdOrgContext.profile.fields.${field}.placeholder`)}
      aria-invalid={issues.length ? true : undefined} aria-describedby={`${id}-footer`} className="resize-y bg-background"
      onChange={event => onChange(event.target.value)} />
    <FieldFooter id={`${id}-footer`} issues={issues} locale={locale}
      counter={t('aiIdOrgContext.profile.counter', { length: formatOrgContextCount(length, locale), max: formatOrgContextCount(max, locale) })} />
  </div>;
}

function ListEditor({ id, field, values, count, issues, changed, disabled, locale, onChange }: EditorProps & {
  field: OrgProfileListField; values: readonly string[]; count: number; onChange: (values: string[]) => void;
}) {
  const { t } = useTranslation();
  const limit = ORG_PROFILE_LIST_LIMITS[field], name = label(t, field);
  const invalid = new Set(issues.map(issue => 'index' in issue ? issue.index : null));
  return <fieldset disabled={disabled} className="min-w-0 space-y-2" aria-describedby={`${id}-footer`}>
    <legend className="flex w-full items-center justify-between gap-2 text-sm font-medium"><span>{name}</span><Changed show={changed} /></legend>
    {values.map((value, index) => <div key={index} className="flex items-center gap-2">
      <Input value={value} aria-label={`${name} ${index + 1}`} placeholder={t(`aiIdOrgContext.profile.fields.${field}.placeholder`)}
        aria-invalid={invalid.has(index) ? true : undefined} className="bg-background" onChange={event => onChange(values.map((item, at) => at === index ? event.target.value : item))} />
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t('aiIdOrgContext.profile.remove', { index: index + 1 })}
        onClick={() => onChange(values.filter((_, at) => at !== index))}><X className="h-4 w-4" aria-hidden /></Button>
    </div>)}
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" disabled={values.length >= limit.items} onClick={() => onChange([...values, ''])}>
        <Plus className="h-3.5 w-3.5" aria-hidden />{t('aiIdOrgContext.profile.add')}</Button>
    </div>
    <FieldFooter id={`${id}-footer`} issues={issues} locale={locale}
      counter={t('aiIdOrgContext.profile.items', { count: formatOrgContextCount(count, locale), max: formatOrgContextCount(limit.items, locale) })} />
  </fieldset>;
}

function RowEditor({ id, field, rows, count, issues, changed, disabled, locale, onChange }: EditorProps & {
  field: OrgProfileRowField; rows: readonly Readonly<Record<string, string>>[]; count: number;
  onChange: (rows: Record<string, string>[]) => void;
}) {
  const { t } = useTranslation();
  const limit = ORG_PROFILE_ROW_LIMITS[field], name = label(t, field);
  const parts: readonly { key: string }[] = limit.parts;
  const invalid = new Set(issues.map(issue => 'part' in issue && 'index' in issue ? `${issue.index}:${issue.part}` : ''));
  const empty = Object.fromEntries(parts.map(part => [part.key, '']));
  const emit = onChange;
  return <fieldset disabled={disabled} className="min-w-0 space-y-2" aria-describedby={`${id}-footer`}>
    <legend className="flex w-full items-center justify-between gap-2 text-sm font-medium"><span>{name}</span><Changed show={changed} /></legend>
    {rows.map((row, index) => <div key={index} className="flex items-start gap-2 rounded-lg border border-border/60 p-2 sm:border-0 sm:p-0">
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {parts.map(part => <Input key={part.key} value={row[part.key] ?? ''} className="bg-background"
          aria-label={`${t(`aiIdOrgContext.profile.fields.${field}.${part.key}`)} ${index + 1}`}
          placeholder={t(`aiIdOrgContext.profile.fields.${field}.${part.key}Placeholder`)}
          aria-invalid={invalid.has(`${index}:${part.key}`) ? true : undefined}
          onChange={event => emit(rows.map((item, at) => at === index ? { ...item, [part.key]: event.target.value } : { ...item }))} />)}
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t('aiIdOrgContext.profile.remove', { index: index + 1 })}
        onClick={() => emit(rows.filter((_, at) => at !== index).map(item => ({ ...item })))}><X className="h-4 w-4" aria-hidden /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={rows.length >= limit.items}
      onClick={() => emit([...rows.map(item => ({ ...item })), { ...empty }])}><Plus className="h-3.5 w-3.5" aria-hidden />{t('aiIdOrgContext.profile.add')}</Button>
    <FieldFooter id={`${id}-footer`} issues={issues} locale={locale}
      counter={t('aiIdOrgContext.profile.items', { count: formatOrgContextCount(count, locale), max: formatOrgContextCount(limit.items, locale) })} />
  </fieldset>;
}
