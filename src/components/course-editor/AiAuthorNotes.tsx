import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BookMarked, ChevronDown, ClipboardCheck, Image as ImageIcon, Lightbulb, ListChecks, Lock, NotebookPen,
  Sparkles, Target, TriangleAlert, Users, Video, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/utils/store';
import { getLocalizedApiError } from '@/utils/localized-error';
import { renameBlock } from '@/api/custom-course-authoring';
import { updateCourse } from '@/api/custom-courses';
import { courseAuthorNotesQueryKey, getCourseAuthorNotes } from '@/api/course-author-notes';
import {
  authorNotesOutcomeLabel, courseInfoProposal, courseLevelAuthorNotes, storyboardList, storyboardText, unitAuthorNotes,
  type AuthorNotes, type AuthorNotesBlock, type AuthorNotesMediaBrief,
} from '@/api/course-author-notes.logic';

/**
 * AI ID notes for authors (QC 364564, N6). Read-only, editors only: the
 * query is disabled without `courses.can_edit` and the backend endpoint
 * enforces the same permission. Nothing here is part of the learner view.
 */
export function useCourseAuthorNotes(courseId: string | undefined) {
  const canEdit = useAuthStore(s => s.hasPermission('courses', 'can_edit'));
  const query = useQuery({
    queryKey: courseAuthorNotesQueryKey(courseId ?? ''),
    queryFn: () => getCourseAuthorNotes(courseId!),
    enabled: canEdit && !!courseId,
    staleTime: 30_000,
    retry: 1,
  });
  return { ...query, canEdit };
}

function NoteField({ label, icon: Icon = Lightbulb, children }: { label: string; icon?: LucideIcon; children: ReactNode }) {
  return <div className="min-w-0 rounded-lg border border-border/70 bg-background/80 p-3">
    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />{label}
    </p>
    <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{children}</div>
  </div>;
}

function NoteList({ values, ordered = false }: { values: string[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return <Tag className={`space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
    {values.map((value, index) => <li key={index}>{value}</li>)}
  </Tag>;
}

function MediaBriefCard({ brief, context }: { brief: AuthorNotesMediaBrief; context?: string }) {
  const { t } = useTranslation();
  const Icon = brief.media_type === 'static_infographic' ? ImageIcon : Video;
  const type = brief.media_type === 'video' ? t('aiAuthorNotes.video')
    : brief.media_type === 'static_infographic' ? t('aiAuthorNotes.infographic') : t('aiAuthorNotes.media');
  return <div className="space-y-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.04] p-3">
    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
      <span className="break-words">{brief.title}</span>
      <Badge variant="outline" size="sm">{type}</Badge>
      {context && <span className="text-xs font-normal text-muted-foreground">· {context}</span>}
    </p>
    {brief.rationale && <NoteField label={t('aiAuthorNotes.rationale')} icon={Target}>{brief.rationale}</NoteField>}
    {brief.content_points.length > 0 && <NoteField label={t('aiAuthorNotes.points')} icon={ListChecks}><NoteList values={brief.content_points} /></NoteField>}
    {brief.context_description && <NoteField label={t('aiAuthorNotes.context')} icon={Lightbulb}>{brief.context_description}</NoteField>}
    {brief.implementation_notes && <NoteField label={t('aiAuthorNotes.notes')} icon={NotebookPen}>{brief.implementation_notes}</NoteField>}
  </div>;
}

/** All author-facing fields of one notes value, in a fixed reading order. */
function NotesBody({ notes, showBriefs = true }: { notes: AuthorNotes; showBriefs?: boolean }) {
  const { t } = useTranslation();
  const story = notes.storyboard;
  const objectives = [...storyboardList(story, 'learning_outcomes'), ...storyboardList(story, 'learning_objectives')];
  const review = notes.author_review;
  return <div className="space-y-2.5" lang={notes.content_locale}>
    {notes.purpose && <NoteField label={notes.node_kind === 'unit' ? t('aiAuthorNotes.learnerAchievement') : t('aiAuthorNotes.purpose')} icon={Target}>{notes.purpose}</NoteField>}
    {storyboardText(story, 'summary') && <NoteField label={t('aiAuthorNotes.summary')} icon={Sparkles}>{storyboardText(story, 'summary')}</NoteField>}
    {storyboardText(story, 'target_audience') && <NoteField label={t('aiAuthorNotes.audience')} icon={Users}>{storyboardText(story, 'target_audience')}</NoteField>}
    {storyboardList(story, 'prerequisites').length > 0 && <NoteField label={t('aiAuthorNotes.prerequisites')} icon={ListChecks}><NoteList values={storyboardList(story, 'prerequisites')} /></NoteField>}
    {storyboardText(story, 'assessment_strategy') && <NoteField label={t('aiAuthorNotes.strategy')} icon={ClipboardCheck}>{storyboardText(story, 'assessment_strategy')}</NoteField>}
    {storyboardText(story, 'objective') && <NoteField label={t('aiAuthorNotes.objective')} icon={Target}>{storyboardText(story, 'objective')}</NoteField>}
    {objectives.length > 0 && <NoteField label={notes.node_kind === 'chapter' ? t('aiAuthorNotes.outcomes') : t('aiAuthorNotes.objectives')} icon={ListChecks}>
      <NoteList values={objectives.map(authorNotesOutcomeLabel)} /></NoteField>}
    {storyboardList(story, 'learning_activities').length > 0 && <NoteField label={t('aiAuthorNotes.activities')} icon={ListChecks}><NoteList values={storyboardList(story, 'learning_activities')} /></NoteField>}
    {storyboardText(story, 'assessment') && <NoteField label={t('aiAuthorNotes.assessment')} icon={ClipboardCheck}>{storyboardText(story, 'assessment')}</NoteField>}
    {review?.purpose && <NoteField label={t('aiAuthorNotes.purpose')} icon={Target}>{review.purpose}</NoteField>}
    {review?.example_scenario && <NoteField label={t('aiAuthorNotes.reviewExample')} icon={Lightbulb}>{review.example_scenario}</NoteField>}
    {review?.visual_asset && <NoteField label={t('aiAuthorNotes.reviewVisual')} icon={ImageIcon}>{review.visual_asset}</NoteField>}
    {review?.user_behavior_navigation && <NoteField label={t('aiAuthorNotes.reviewBehavior')} icon={Users}>{review.user_behavior_navigation}</NoteField>}
    {notes.implementation_notes && <NoteField label={t('aiAuthorNotes.notes')} icon={NotebookPen}>{notes.implementation_notes}</NoteField>}
    {showBriefs && notes.media_briefs.length > 0 && <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">{t('aiAuthorNotes.mediaSection')} — {t('aiAuthorNotes.mediaHint')}</p>
      {notes.media_briefs.map(brief => <MediaBriefCard key={brief.node_id} brief={brief} />)}
    </div>}
  </div>;
}

function AuthorOnlyBadge() {
  const { t } = useTranslation();
  return <Badge variant="outline" size="sm" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
    <Lock className="h-3 w-3" aria-hidden />{t('aiAuthorNotes.authorOnly')}
  </Badge>;
}

function NotesSection({ heading, block, children }: { heading: string; block: AuthorNotesBlock; children?: ReactNode }) {
  const { t } = useTranslation();
  return <section className="space-y-2">
    <h4 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
      <span>{heading}</span><span className="font-normal text-muted-foreground break-words">{block.display_name}</span>
    </h4>
    <p className="text-[11px] text-muted-foreground">{t('aiAuthorNotes.appliedFrom', { revision: block.notes.revision,
      locale: block.notes.content_locale === 'en' ? t('aiAuthorNotes.localeEn') : t('aiAuthorNotes.localeVi') })}</p>
    {children ?? <NotesBody notes={block.notes} />}
  </section>;
}

/** Read-only, collapsible notes of one unit: the unit, its learning content
 * and the enclosing section/chapter. Renders nothing for non-AI units. */
export function AiAuthorNotesUnitPanel({ courseId, unitId }: { courseId: string; unitId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const notes = useCourseAuthorNotes(courseId);
  if (!notes.canEdit) return null;
  if (notes.isError) {
    return <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-sm">
      <span className="text-muted-foreground">{t('aiAuthorNotes.loadFailed')}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => { void notes.refetch(); }}>{t('aiAuthorNotes.retry')}</Button>
    </div>;
  }
  const unit = unitAuthorNotes(notes.data, unitId);
  if (!unit.unit && !unit.lesson && !unit.chapter && !unit.components.length) return null;
  return <section aria-label={t('aiAuthorNotes.title')} data-testid="ai-author-notes-unit"
    className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] shadow-sm">
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-amber-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-background text-amber-600 dark:text-amber-400">
          <NotebookPen className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">{t('aiAuthorNotes.title')}<AuthorOnlyBadge /></span>
          <span className="block text-xs text-muted-foreground">{t('aiAuthorNotes.summaryCounts', { notes: unit.noteCount, briefs: unit.briefCount })}</span>
        </span>
        <span className="sr-only">{open ? t('aiAuthorNotes.collapse') : t('aiAuthorNotes.expand')}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t border-amber-500/20 px-4 py-4">
        <p className="text-xs text-muted-foreground">{t('aiAuthorNotes.authorOnlyHint')}</p>
        {unit.unit && <NotesSection heading={t('aiAuthorNotes.unitSection')} block={unit.unit} />}
        {unit.components.length > 0 && <section className="space-y-3">
          <h4 className="text-sm font-semibold">{t('aiAuthorNotes.componentsSection')}</h4>
          {unit.components.map(component => <div key={component.block_id} className="space-y-2 rounded-lg border border-border/60 bg-card/60 p-3">
            <p className="text-sm font-medium break-words">{component.display_name}</p>
            <NotesBody notes={component.notes} />
          </div>)}
        </section>}
        {unit.lesson && <NotesSection heading={t('aiAuthorNotes.lessonSection')} block={unit.lesson} />}
        {unit.chapter && <NotesSection heading={t('aiAuthorNotes.chapterSection')} block={unit.chapter} />}
      </CollapsibleContent>
    </Collapsible>
  </section>;
}

type PendingCourseChange = { kind: 'name'; value: string } | { kind: 'description'; value: string };

/** Sidebar entry + dialog for course-level notes (summary, audience, Hold,
 * SME questions, nice-to-know, every media brief) and the explicit opt-in to
 * use the AI title/summary as learner-visible course name/description. */
export function AiAuthorNotesCourseButton({ courseId, rootBlockId, currentName, onCourseChanged }: {
  courseId: string; rootBlockId: string; currentName: string; onCourseChanged: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingCourseChange | null>(null);
  const notes = useCourseAuthorNotes(courseId);
  const level = courseLevelAuthorNotes(notes.data);
  const proposal = courseInfoProposal(notes.data, currentName);
  const apply = useMutation({
    mutationFn: async (change: PendingCourseChange) => {
      if (change.kind === 'name') await renameBlock(rootBlockId, change.value);
      else await updateCourse(courseId, { description: change.value });
      return change;
    },
    onSuccess: async change => {
      toast.success(change.kind === 'name' ? t('aiAuthorNotes.nameApplied') : t('aiAuthorNotes.descriptionApplied'));
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: courseAuthorNotesQueryKey(courseId) });
      await onCourseChanged();
    },
    onError: (error: unknown) => toast.error(getLocalizedApiError(error, t('aiAuthorNotes.applyFailed'))),
  });
  if (!notes.canEdit || !level.hasAny) return null;
  const root = level.root;
  const guidance = root?.notes.idm_guidance;
  return <>
    <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setOpen(true)} data-testid="ai-author-notes-course-open">
      <NotebookPen className="h-4 w-4" aria-hidden />{t('aiAuthorNotes.open')}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/70 bg-gradient-to-r from-amber-500/[0.08] via-card to-card px-5 py-4 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8"><NotebookPen className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />{t('aiAuthorNotes.courseTitle')}<AuthorOnlyBadge /></DialogTitle>
          <DialogDescription>{t('aiAuthorNotes.courseHint')} {t('aiAuthorNotes.authorOnlyHint')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {(proposal.proposedTitle || proposal.proposedDescription) && <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
            <h3 className="text-sm font-semibold">{t('aiAuthorNotes.proposalTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('aiAuthorNotes.proposalHint')}</p>
            {proposal.proposedTitle && <div className="grid gap-2 sm:grid-cols-2">
              <NoteField label={t('aiAuthorNotes.currentName')}>{currentName}</NoteField>
              <NoteField label={t('aiAuthorNotes.proposedName')} icon={Sparkles}>{proposal.proposedTitle}</NoteField>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="button" size="sm" variant={proposal.titleInUse ? 'outline' : 'default'} disabled={proposal.titleInUse || apply.isPending}
                  onClick={() => setPending({ kind: 'name', value: proposal.proposedTitle! })}>
                  {proposal.titleInUse ? t('aiAuthorNotes.inUse') : t('aiAuthorNotes.useName')}
                </Button>
              </div>
            </div>}
            {proposal.proposedDescription && <div className="grid gap-2 sm:grid-cols-2">
              <NoteField label={t('aiAuthorNotes.currentDescription')}>{notes.data?.course.description?.trim() || t('aiAuthorNotes.noDescription')}</NoteField>
              <NoteField label={t('aiAuthorNotes.proposedDescription')} icon={Sparkles}>{proposal.proposedDescription}</NoteField>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2">
                {proposal.descriptionTooLong && <span className="text-xs text-destructive">{t('aiAuthorNotes.descriptionTooLong')}</span>}
                <Button type="button" size="sm" variant={proposal.descriptionInUse ? 'outline' : 'default'}
                  disabled={proposal.descriptionInUse || proposal.descriptionTooLong || apply.isPending}
                  onClick={() => setPending({ kind: 'description', value: proposal.proposedDescription! })}>
                  {proposal.descriptionInUse ? t('aiAuthorNotes.inUse') : t('aiAuthorNotes.useDescription')}
                </Button>
              </div>
            </div>}
          </section>}
          {root && <NotesSection heading={t('aiAuthorNotes.courseSection')} block={root}>
            <NotesBody notes={root.notes} showBriefs={false} />
          </NotesSection>}
          {guidance && (guidance.hold_items.length > 0 || guidance.pending_objectives.length > 0) && <section className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />{t('aiAuthorNotes.holdTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('aiAuthorNotes.holdHint')}</p>
            <ol className="space-y-2">{guidance.hold_items.map((item, index) => <li key={index} className="rounded-lg border border-amber-500/20 bg-background/80 p-3 text-sm">
              <p className="font-semibold break-words">{index + 1}. {item.name}</p>
              {item.reason && <p className="mt-1 break-words"><span className="font-medium text-muted-foreground">{t('aiAuthorNotes.holdReason')}: </span>{item.reason}</p>}
              {item.sme_question && <p className="mt-1 break-words"><span className="font-medium text-muted-foreground">{t('aiAuthorNotes.holdQuestion')}: </span>{item.sme_question}</p>}
              {item.blocked_must_dos.length > 0 && <div className="mt-1"><p className="font-medium text-muted-foreground">{t('aiAuthorNotes.holdBlocked')}:</p><NoteList values={item.blocked_must_dos} /></div>}
            </li>)}</ol>
            {guidance.pending_objectives.length > 0 && <NoteField label={t('aiAuthorNotes.pendingObjectives')} icon={Target}><NoteList values={guidance.pending_objectives} /></NoteField>}
          </section>}
          {guidance && guidance.nice_to_know.length > 0 && <section className="space-y-2 rounded-xl border border-border/70 bg-card/60 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><BookMarked className="h-4 w-4 text-muted-foreground" aria-hidden />{t('aiAuthorNotes.niceToKnow')}</h3>
            <p className="text-xs text-muted-foreground">{t('aiAuthorNotes.niceToKnowHint')}</p>
            <ul className="space-y-1.5 text-sm">{guidance.nice_to_know.map((item, index) => <li key={index} className="break-words">
              <span className="font-semibold">{item.name}</span>{item.summary && <span className="text-muted-foreground"> — {item.summary}</span>}
            </li>)}</ul>
          </section>}
          {level.mediaBriefs.length > 0 && <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t('aiAuthorNotes.courseMedia')}</h3>
            <p className="text-xs text-muted-foreground">{t('aiAuthorNotes.mediaHint')}</p>
            {level.mediaBriefs.map(({ unit, brief }) => <MediaBriefCard key={brief.node_id} brief={brief} context={unit.display_name} />)}
          </section>}
        </div>
        <div className="flex shrink-0 justify-end border-t border-border/70 px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>{t('aiAuthorNotes.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!pending} onOpenChange={value => { if (!value && !apply.isPending) setPending(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.kind === 'name' ? t('aiAuthorNotes.confirmNameTitle') : t('aiAuthorNotes.confirmDescriptionTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">{pending?.kind === 'name'
            ? t('aiAuthorNotes.confirmNameBody', { current: currentName, proposed: pending.value })
            : t('aiAuthorNotes.confirmDescriptionBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={apply.isPending}>{t('aiAuthorNotes.cancel')}</AlertDialogCancel>
          <AlertDialogAction disabled={apply.isPending} onClick={event => { event.preventDefault(); if (pending) apply.mutate(pending); }}>
            {t('aiAuthorNotes.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
