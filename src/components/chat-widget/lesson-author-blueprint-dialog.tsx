import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ListChecks,
  Layers3,
  Loader2,
  ShieldCheck,
  Target,
  UsersRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from 'react-i18next';
import type {
  LessonAuthorBlueprintChapter,
  LessonAuthorBlueprintEvent,
} from '@/api/custom-chat';

interface LessonAuthorBlueprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blueprintEvent: LessonAuthorBlueprintEvent | null;
  disabled?: boolean;
  onDraftChapter?: (chapterIndex: number) => void;
}

function formatDuration(minutes: number, isVietnamese: boolean): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return isVietnamese ? 'Chưa xác định' : 'Not set';
  return isVietnamese ? `${Math.round(minutes)} phút` : `${Math.round(minutes)} min`;
}

function getAppliedChapterIndexes(
  blueprintEvent: LessonAuthorBlueprintEvent | null,
  chapterCount: number,
): Set<number> {
  return new Set((blueprintEvent?.applied_chapter_indexes ?? []).filter(index => (
    Number.isInteger(index) && index >= 0 && index < chapterCount
  )));
}

function BlueprintMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 border-l border-border/70 px-3 first:border-l-0 sm:px-4">
      <p className="truncate text-base font-semibold leading-none text-foreground">{value}</p>
      <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function BlueprintInfoSection({
  icon: Icon,
  label,
  children,
  className = '',
}: {
  icon: typeof Target;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-border/70 bg-card/60 p-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{children}</div>
    </section>
  );
}

function getQualityCheckLabel(key: string, isVietnamese: boolean): string {
  const labels: Record<string, [string, string]> = {
    learning_outcomes: ['Kết quả đầu ra', 'Learning outcomes'],
    constructive_alignment: ['Liên kết mục tiêu và hoạt động', 'Objective and activity alignment'],
    assessment_strategy: ['Chiến lược đánh giá', 'Assessment strategy'],
    duration_balance: ['Phân bổ thời lượng', 'Duration balance'],
    source_grounding: ['Bám sát tài liệu nguồn', 'Source grounding'],
    source_structure: ['Cấu trúc tài liệu nguồn', 'Source structure'],
    source_coverage: ['Độ bao phủ tài liệu', 'Source coverage'],
  };
  return labels[key]?.[isVietnamese ? 0 : 1] || (isVietnamese ? 'Tiêu chí thiết kế khóa học' : 'Course design criterion');
}

function ChapterLessonCard({
  chapter,
  chapterIndex,
  lessonIndex,
  isLast,
}: {
  chapter: LessonAuthorBlueprintChapter;
  chapterIndex: number;
  lessonIndex: number;
  isLast: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isVietnamese = i18n.language !== 'en';
  const lesson = chapter.lessons[lessonIndex];

  return (
    <article className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
      <div className="relative">
        {!isLast && (
          <span
            className="absolute -bottom-4 left-1/2 top-8 w-px -translate-x-1/2 bg-border"
            aria-hidden="true"
          />
        )}
        <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-primary/35 bg-background text-xs font-bold text-primary shadow-sm">
          {lessonIndex + 1}
        </span>
      </div>
      <div className="min-w-0 rounded-lg border border-border/80 bg-card px-3.5 py-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('chatWidget.blueprintLessonNumber', { chapter: chapterIndex + 1, lesson: lessonIndex + 1 })}
            </p>
            <h3 className="mt-1 text-sm font-semibold leading-5 text-foreground" title={lesson.title}>
              {lesson.title}
            </h3>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            {formatDuration(lesson.duration_minutes, isVietnamese)}
          </span>
        </div>

        <div className="mt-3 space-y-3 border-t border-border/60 pt-3 text-xs leading-5">
          <div className="flex gap-2">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{t('chatWidget.blueprintLessonObjective')}</p>
              <p className="mt-0.5 text-muted-foreground">{lesson.objective}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{t('chatWidget.blueprintLearningActivities')}</p>
              <ol className="mt-1.5 space-y-1.5">
                {lesson.learning_activities.map((activity, activityIndex) => (
                  <li key={`${activity}-${activityIndex}`} className="flex gap-2 text-muted-foreground">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                      {activityIndex + 1}
                    </span>
                    <span>{activity}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="flex gap-2">
            <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{t('chatWidget.blueprintAssessment')}</p>
              <p className="mt-0.5 text-muted-foreground">{lesson.assessment}</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function LessonAuthorBlueprintDialog({
  open,
  onOpenChange,
  blueprintEvent,
  disabled = false,
  onDraftChapter,
}: LessonAuthorBlueprintDialogProps) {
  const { t, i18n } = useTranslation();
  const isVietnamese = i18n.language !== 'en';
  const chapters = blueprintEvent?.blueprint.chapters;
  const chapterCount = chapters?.length ?? 0;
  const appliedChapterIndexes = useMemo(
    () => getAppliedChapterIndexes(blueprintEvent, chapterCount),
    [blueprintEvent, chapterCount],
  );
  const appliedSignature = Array.from(appliedChapterIndexes).join(',');
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const totalLessons = useMemo(
    () => (chapters ?? []).reduce((total, chapter) => total + chapter.lessons.length, 0),
    [chapters],
  );
  const totalDuration = useMemo(
    () => (chapters ?? []).reduce((total, chapter) => total + Math.max(0, chapter.duration_minutes || 0), 0),
    [chapters],
  );

  useEffect(() => {
    if (!chapters || chapterCount === 0 || !blueprintEvent) return;
    if (selectedBlueprintId !== blueprintEvent.blueprint_id) {
      const firstPending = chapters.findIndex((_, index) => !appliedChapterIndexes.has(index));
      setSelectedBlueprintId(blueprintEvent.blueprint_id);
      setSelectedChapterIndex(firstPending >= 0 ? firstPending : 0);
      return;
    }
    if (selectedChapterIndex >= chapterCount) setSelectedChapterIndex(0);
  }, [appliedChapterIndexes, appliedSignature, blueprintEvent, chapterCount, chapters, selectedBlueprintId, selectedChapterIndex]);

  if (!blueprintEvent || !chapters || chapters.length === 0) return null;

  const safeSelectedChapterIndex = selectedChapterIndex >= 0 && selectedChapterIndex < chapters.length
    ? selectedChapterIndex
    : 0;
  const selectedChapter = chapters[safeSelectedChapterIndex];
  const blueprintCanDraft = (blueprintEvent.status ?? 'proposed') === 'proposed';
  const selectedChapterApplied = appliedChapterIndexes.has(safeSelectedChapterIndex);
  const canDraftSelectedChapter = blueprintCanDraft && !disabled && !selectedChapterApplied && Boolean(onDraftChapter);
  const hasPendingChapter = chapters.some((_, index) => !appliedChapterIndexes.has(index));
  const qualityChecks = blueprintEvent.quality_report.checks ?? [];
  const passedQualityChecks = qualityChecks.filter(check => check.passed).length;
  const qualityReady = blueprintEvent.quality_report.status === 'ready_for_review';
  const unavailableReason = !blueprintCanDraft
    ? blueprintEvent.error_reason || t('chatWidget.blueprintUnavailable')
    : null;

  const handleDraft = () => {
    if (!canDraftSelectedChapter) return;
    onDraftChapter?.(safeSelectedChapterIndex);
  };

  const selectPreviousChapter = () => {
    setSelectedChapterIndex(index => Math.max(0, index - 1));
  };

  const selectNextChapter = () => {
    setSelectedChapterIndex(index => Math.min(chapterCount - 1, index + 1));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[10040]"
        className="z-[10050] flex h-[calc(100dvh-16px)] max-h-[900px] w-[calc(100vw-16px)] max-w-[1180px] flex-col gap-0 overflow-hidden rounded-xl border-border/80 bg-background p-0 shadow-2xl"
      >
        <DialogHeader className="border-b bg-card px-4 py-3.5 pr-12 sm:px-6 sm:py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary shadow-sm">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold">{t('chatWidget.blueprintDialogTitle')}</DialogTitle>
                  <DialogDescription className="mt-1 text-xs leading-5">
                    {t('chatWidget.blueprintDialogDescription')}
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge
                    variant="outline"
                    className={`rounded-md text-[11px] ${qualityReady
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}
                  >
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    {blueprintEvent.quality_report.score}/100
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {passedQualityChecks}/{qualityChecks.length || 0} {isVietnamese ? 'tiêu chí đạt' : 'checks passed'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b bg-muted/15 px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold leading-6 text-foreground" title={blueprintEvent.blueprint.title}>
            {blueprintEvent.blueprint.title}
          </h2>
          <p className="mt-1.5 max-w-4xl text-xs leading-5 text-muted-foreground">{blueprintEvent.blueprint.summary}</p>
          <div className="mt-4 grid grid-cols-2 gap-y-3 sm:grid-cols-4 sm:divide-x sm:divide-border/70">
            <BlueprintMetric label={t('chatWidget.blueprintChapters')} value={chapters.length} />
            <BlueprintMetric label={t('chatWidget.blueprintLessons')} value={totalLessons} />
            <BlueprintMetric label={t('chatWidget.blueprintDuration')} value={formatDuration(totalDuration, isVietnamese)} />
            <BlueprintMetric label={t('chatWidget.blueprintQuality')} value={`${passedQualityChecks}/${qualityChecks.length || 0}`} />
          </div>
        </div>

        {unavailableReason && (
          <div className="flex gap-2 border-b border-destructive/25 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive sm:px-6">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>{unavailableReason}</p>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid min-h-full grid-cols-1 lg:grid-cols-[268px_minmax(0,1fr)]">
            <aside className="border-b bg-card px-4 py-3 lg:sticky lg:top-0 lg:flex lg:h-[calc(100dvh-330px)] lg:min-h-[280px] lg:max-h-[560px] lg:flex-col lg:self-start lg:overflow-hidden lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
              <div className="mb-2 flex items-center gap-2">
                <Layers3 className="h-3.5 w-3.5 text-primary" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('chatWidget.blueprintChapterNavigator')}
                </p>
              </div>
              <nav className="flex min-h-0 gap-2 overflow-x-auto pb-1 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pr-2 custom-scrollbar" aria-label={t('chatWidget.blueprintChapterNavigator')}>
                {chapters.map((chapter, index) => {
                  const selected = safeSelectedChapterIndex === index;
                  const applied = appliedChapterIndexes.has(index);
                  return (
                    <button
                      key={`${chapter.title}-${index}`}
                      type="button"
                      onClick={() => setSelectedChapterIndex(index)}
                      className={`min-w-[196px] rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 lg:min-w-0 lg:w-full ${
                        selected
                          ? 'border-primary/45 bg-primary/5 shadow-sm'
                          : 'border-border/75 bg-background hover:bg-muted/50'
                      }`}
                      aria-current={selected ? 'step' : undefined}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t('chatWidget.blueprintChapterNumber', { chapter: index + 1 })}
                            </span>
                            {applied && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />}
                          </span>
                          <span className="mt-1 block text-xs font-semibold leading-5 text-foreground" title={chapter.title}>
                            {chapter.title}
                          </span>
                          {chapter.source_refs && chapter.source_refs.length > 0 && (
                            <span className="mt-1 block truncate text-[10px] text-primary/80" title={chapter.source_refs.join(', ')}>
                              {isVietnamese ? 'Nguồn: ' : 'Sources: '}{chapter.source_refs.slice(0, 3).join(', ')}
                              {chapter.source_refs.length > 3 ? '…' : ''}
                            </span>
                          )}
                          <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            {formatDuration(chapter.duration_minutes, isVietnamese)}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <main className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
              <div className="mb-5 grid gap-3 md:grid-cols-2">
                <BlueprintInfoSection icon={UsersRound} label={t('chatWidget.blueprintTargetAudience')}>
                  {blueprintEvent.blueprint.target_audience?.trim() || t('chatWidget.blueprintNotSpecified')}
                </BlueprintInfoSection>
                <BlueprintInfoSection icon={BookOpen} label={t('chatWidget.blueprintPrerequisites')}>
                  {blueprintEvent.blueprint.prerequisites?.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4">
                      {blueprintEvent.blueprint.prerequisites.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                    </ul>
                  ) : t('chatWidget.blueprintNotSpecified')}
                </BlueprintInfoSection>
                <BlueprintInfoSection icon={Target} label={t('chatWidget.blueprintLearningOutcomes')}>
                  {blueprintEvent.blueprint.learning_outcomes?.length > 0 ? (
                    <ul className="space-y-1.5">
                      {blueprintEvent.blueprint.learning_outcomes.map((item, index) => (
                        <li key={`${item}-${index}`} className="flex gap-2">
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : t('chatWidget.blueprintNotSpecified')}
                </BlueprintInfoSection>
                <BlueprintInfoSection icon={ListChecks} label={t('chatWidget.blueprintAssessmentStrategy')}>
                  {blueprintEvent.blueprint.assessment_strategy?.trim() || t('chatWidget.blueprintNotSpecified')}
                </BlueprintInfoSection>
              </div>

              <section className="mb-5 rounded-lg border border-border/70 bg-muted/20 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>{t('chatWidget.blueprintQuality')}</span>
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {passedQualityChecks}/{qualityChecks.length || 0}
                  </span>
                </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {qualityChecks.map((check, index) => (
                    <div key={`${check.key}-${index}`} className="flex items-start gap-2 text-xs leading-5">
                      {check.passed
                        ? <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                        : <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />}
                      <span className={check.passed ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'}>
                        {getQualityCheckLabel(check.key, isVietnamese)}
                      </span>
                    </div>
                  ))}
                </div>
                {blueprintEvent.quality_report.review_notes?.length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
                    <p className="font-semibold text-foreground">{t('chatWidget.blueprintReviewNotes')}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {blueprintEvent.quality_report.review_notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
                    </ul>
                  </div>
                )}
              </section>

              <AnimatePresence mode="wait" initial={false}>
                <motion.section
                  key={safeSelectedChapterIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  <div className="border-b border-border/70 pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-md bg-primary/5 text-[10px] text-primary">
                        {t('chatWidget.blueprintChapterNumber', { chapter: safeSelectedChapterIndex + 1 })}
                      </Badge>
                      {selectedChapterApplied && (
                        <Badge variant="outline" className="gap-1 rounded-md border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          {t('chatWidget.blueprintChapterApplied')}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold leading-7 text-foreground">{selectedChapter.title}</h2>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={selectPreviousChapter}
                          disabled={safeSelectedChapterIndex === 0}
                          aria-label={t('chatWidget.blueprintPreviousChapter')}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={selectNextChapter}
                          disabled={safeSelectedChapterIndex === chapterCount - 1}
                          aria-label={t('chatWidget.blueprintNextChapter')}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {selectedChapter.source_refs && selectedChapter.source_refs.length > 0 && (
                      <p className="mt-2 text-[11px] text-primary/80">
                        {isVietnamese ? 'Đối chiếu nguồn: ' : 'Source references: '}
                        {selectedChapter.source_refs.join(', ')}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2 border-l-2 border-primary/35 pl-3">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('chatWidget.blueprintChapterObjective')}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedChapter.objective}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{t('chatWidget.blueprintLessons')}</p>
                      <span className="text-xs text-muted-foreground">
                        {selectedChapter.lessons.length} {isVietnamese ? 'bài học' : 'lessons'}
                      </span>
                    </div>
                    <div>
                      {selectedChapter.lessons.map((_, lessonIndex) => (
                        <ChapterLessonCard
                          key={`${selectedChapter.lessons[lessonIndex].title}-${lessonIndex}`}
                          chapter={selectedChapter}
                          chapterIndex={safeSelectedChapterIndex}
                          lessonIndex={lessonIndex}
                          isLast={lessonIndex === selectedChapter.lessons.length - 1}
                        />
                      ))}
                    </div>
                  </div>

                </motion.section>
              </AnimatePresence>
            </main>
          </div>
        </ScrollArea>

        <div className="flex flex-col gap-3 border-t bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted-foreground">
            {t('chatWidget.blueprintAppliedProgress', { applied: appliedChapterIndexes.size, total: chapters.length })}
          </p>
          <Button
            type="button"
            size="sm"
            className="w-full gap-2 sm:w-auto"
            onClick={handleDraft}
            disabled={!canDraftSelectedChapter}
          >
            {disabled
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('chatWidget.blueprintDrafting')}</>
              : selectedChapterApplied
                ? <><CheckCircle2 className="h-4 w-4" /> {t('chatWidget.blueprintChapterApplied')}</>
                : !hasPendingChapter
                  ? <><CheckCircle2 className="h-4 w-4" /> {t('chatWidget.blueprintAllChaptersApplied')}</>
                  : <><ChevronRight className="h-4 w-4" /> {t('chatWidget.blueprintStartDraft', { chapter: safeSelectedChapterIndex + 1 })}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
