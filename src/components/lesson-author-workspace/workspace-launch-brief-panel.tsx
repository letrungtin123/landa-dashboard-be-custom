import { useId, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { useCourseAuthorNotes } from '@/components/course-editor/AiAuthorNotes';
import {
  WORKSPACE_COURSE_PURPOSE_MAX, WORKSPACE_LEARNER_AUDIENCE_MAX, type WorkspaceLaunchBrief,
} from '../../api/lesson-author-workspace.contract';
import { workspaceContextNeedsClamp } from './workspace-launch-brief.logic';
import type { createWorkspaceSourceState } from './workspace-source-state';

const MODES = [
  { value: 'instructional_design', icon: Sparkles, title: 'aiIdLaunchBrief.modeDesignTitle', body: 'aiIdLaunchBrief.modeDesignBody' },
  { value: 'preserve_source', icon: FileText, title: 'aiIdLaunchBrief.modePreserveTitle', body: 'aiIdLaunchBrief.modePreserveBody' },
] as const;

/** Start screen, right column: how AI should treat the material and, for the
 * design mode, who the course is for and what it is for. The source controller
 * owns the values; "Create learning content" stays in the left column. */
export function WorkspaceLaunchBriefPanel({ controller, courseId }: {
  controller: ReturnType<typeof createWorkspaceSourceState>; courseId: string;
}) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const id = useId();
  const brief = state.brief, locked = state.phase === 'creating' || state.unknown;
  return <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border/70 bg-muted/20 p-4 sm:p-5">
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('aiIdLaunchBrief.eyebrow')}</p>
      <h3 id={`${id}-title`} className="mt-2 text-base font-semibold">{t('aiIdLaunchBrief.title')}</h3>
    </div>
    <fieldset disabled={locked} className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-medium">{t('aiIdLaunchBrief.modeLegend')}</legend>
      {MODES.map(mode => {
        const checked = brief.design_mode === mode.value, Icon = mode.icon;
        return <label key={mode.value} className={`flex gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${checked
          ? 'border-primary/60 bg-primary/[0.07] shadow-sm' : 'border-border/80 bg-background/60 hover:border-primary/35'} ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
          <input type="radio" className="sr-only" name={`${id}-mode`} value={mode.value} checked={checked}
            onChange={() => controller.setBrief({ design_mode: mode.value })} />
          <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${checked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t(mode.title)}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(mode.body)}</span></span>
          <span aria-hidden className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-primary' : 'border-muted-foreground/40'}`}>
            {checked && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
        </label>;
      })}
    </fieldset>
    {brief.design_mode === 'instructional_design' && <>
      <BriefText id={`${id}-learners`} label={t('aiIdLaunchBrief.learnersLabel')} placeholder={t('aiIdLaunchBrief.learnersPlaceholder')}
        value={brief.learner_audience} max={WORKSPACE_LEARNER_AUDIENCE_MAX} disabled={locked}
        onChange={value => controller.setBrief({ learner_audience: value })} />
      <BriefText id={`${id}-purpose`} label={t('aiIdLaunchBrief.purposeLabel')} placeholder={t('aiIdLaunchBrief.purposePlaceholder')}
        value={brief.course_purpose} max={WORKSPACE_COURSE_PURPOSE_MAX} disabled={locked}
        onChange={value => controller.setBrief({ course_purpose: value })} />
      <CourseContext courseId={courseId} />
    </>}
  </section>;
}

function BriefText({ id, label, placeholder, value, max, disabled, onChange }: {
  id: string; label: string; placeholder: string; value: string; max: number; disabled: boolean; onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium">{label} <span className="text-destructive" aria-hidden>*</span>
      <span className="sr-only"> ({t('aiIdLaunchBrief.required')})</span></label>
    <Textarea id={id} rows={3} value={value} maxLength={max} disabled={disabled} placeholder={placeholder} aria-required="true"
      aria-describedby={`${id}-count`} className="resize-y bg-background" onChange={event => onChange(event.target.value)} />
    <p id={`${id}-count`} className="text-right text-[11px] tabular-nums text-muted-foreground">{t('aiIdLaunchBrief.counter', { length: value.length, max })}</p>
  </div>;
}

/** Read-only: the course description is edited on the Courses page. */
function CourseContext({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const notes = useCourseAuthorNotes(courseId);
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  if (!notes.canEdit) return null;
  const description = notes.data?.course.description?.trim() ?? '';
  const clamp = workspaceContextNeedsClamp(description);
  return <div className="min-w-0 space-y-1.5">
    <p className="text-sm font-medium">{t('aiIdLaunchBrief.contextLabel')}</p>
    <div className="min-w-0 rounded-lg border border-border/70 bg-background/70 p-3 text-sm">
      {notes.isLoading ? <p role="status" className="text-muted-foreground">{t('aiIdLaunchBrief.contextLoading')}</p>
        : notes.isError ? <div className="flex flex-wrap items-center gap-2"><p className="text-muted-foreground">{t('aiIdLaunchBrief.contextFailed')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => { void notes.refetch(); }}>{t('aiIdLaunchBrief.contextRetry')}</Button></div>
          : !description ? <p className="text-amber-700 dark:text-amber-300">{t('aiIdLaunchBrief.contextEmpty')}</p>
            : <><p id={textId} className={`whitespace-pre-wrap break-words leading-6 ${clamp && !expanded ? 'line-clamp-4' : ''}`}>{description}</p>
              {clamp && <button type="button" aria-expanded={expanded} aria-controls={textId} className="mt-1 text-xs font-medium text-primary hover:underline"
                onClick={() => setExpanded(value => !value)}>{expanded ? t('aiIdLaunchBrief.showLess') : t('aiIdLaunchBrief.showMore')}</button>}</>}
    </div>
    {!!description && <p className="text-xs text-muted-foreground">{t('aiIdLaunchBrief.contextHint')}</p>}
  </div>;
}

/** Inside a session (Overview tab): the choice made at Create. Old sessions have none. */
export function WorkspaceLaunchBriefSummary({ brief }: { brief: WorkspaceLaunchBrief | null }) {
  const { t } = useTranslation();
  if (!brief) return null;
  const design = brief.design_mode === 'instructional_design';
  const rows: Array<[string, string]> = [[t('aiIdLaunchBrief.summaryMode'), t(design ? 'aiIdLaunchBrief.modeDesignTitle' : 'aiIdLaunchBrief.modePreserveTitle')]];
  if (design) rows.push([t('aiIdLaunchBrief.summaryLearners'), brief.learner_audience ?? ''], [t('aiIdLaunchBrief.summaryPurpose'), brief.course_purpose ?? '']);
  return <section aria-label={t('aiIdLaunchBrief.summaryTitle')} className="mx-auto max-w-5xl px-4 pt-5 sm:px-5 sm:pt-6">
    <dl className="space-y-1.5 rounded-2xl border border-border/70 bg-card p-4 text-sm shadow-sm">
      {rows.map(([label, value]) => <div key={label} className="min-w-0 break-words">
        <dt className="inline font-semibold">{label}: </dt><dd className="inline whitespace-pre-wrap text-muted-foreground">{value}</dd>
      </div>)}
    </dl>
  </section>;
}
