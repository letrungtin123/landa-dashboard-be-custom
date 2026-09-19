import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Layers3,
  ListChecks,
  LockKeyhole,
  Loader2,
  Map,
  PanelsTopLeft,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import type { CourseIndexResponse } from '@/api/custom-course-authoring';
import type {
  LessonAuthorBlueprintChapter,
  LessonAuthorBlueprintEvent,
  LessonAuthorBlueprintMediaPlan,
  LessonAuthorProposalEvent,
} from '@/api/custom-chat';
import { resolveLessonAuthorContentLocale, type LessonAuthorContentLocale } from './lesson-author-locale';
import { LessonAuthorMindmapPanel } from './lesson-author-mindmap-modal';

interface LessonAuthorBlueprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blueprintEvent: LessonAuthorBlueprintEvent | null;
  outline: CourseIndexResponse | null;
  mindmapLoading?: boolean;
  mindmapError?: string | null;
  proposalEvent?: LessonAuthorProposalEvent | null;
  pendingChapterIndexes?: ReadonlySet<number>;
  disabled?: boolean;
  onDraftChapter?: (chapterIndex: number) => void;
}

type BlueprintTab = 'overview' | 'chapters' | 'quality' | 'media' | 'mindmap';

interface BlueprintMediaPlacement {
  chapterIndex: number;
  lessonIndex: number;
  unitIndex: number;
  chapterTitle: string;
  lessonTitle: string;
  unitTitle: string;
  media: LessonAuthorBlueprintMediaPlan;
}

function getAppliedChapterIndexes(
  blueprintEvent: LessonAuthorBlueprintEvent | null,
  chapterCount: number,
): Set<number> {
  return new Set((blueprintEvent?.applied_chapter_indexes ?? []).filter(index => (
    Number.isInteger(index) && index >= 0 && index < chapterCount
  )));
}

function BlueprintMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background px-3 py-3 sm:px-4">
      <p className="truncate text-lg font-semibold leading-none text-foreground">{value}</p>
      <p className="mt-1.5 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function BlueprintInfoSection({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Target;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border/70 bg-card p-4">
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
    constructive_alignment: ['Liên kết mục tiêu, hoạt động và đánh giá', 'Objective, activity, and assessment alignment'],
    assessment_strategy: ['Chiến lược đánh giá', 'Assessment strategy'],
    source_grounding: ['Bám sát tài liệu nguồn', 'Source grounding'],
    source_structure: ['Cấu trúc tài liệu nguồn', 'Source structure'],
    source_coverage: ['Độ bao phủ tài liệu', 'Source coverage'],
  };
  return labels[key]?.[isVietnamese ? 0 : 1] || (isVietnamese ? 'Tiêu chí thiết kế khóa học' : 'Course design criterion');
}

function BlueprintMediaCard({
  placement,
  locale,
}: {
  placement: BlueprintMediaPlacement;
  locale: LessonAuthorContentLocale;
}) {
  const isVideo = placement.media.type === 'video';
  const typeLabel = locale === 'en'
    ? (isVideo ? 'Video' : 'Static infographic')
    : (isVideo ? 'Video' : 'Infographic tĩnh');
  const location = locale === 'en'
    ? `Chapter: ${placement.chapterTitle} / Section: ${placement.lessonTitle} / Lesson: ${placement.unitTitle}`
    : `Chương: ${placement.chapterTitle} / Mục: ${placement.lessonTitle} / Bài học: ${placement.unitTitle}`;
  const Icon = isVideo ? Clapperboard : PanelsTopLeft;

  return (
    <article className="rounded-lg border border-border/70 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${isVideo
            ? 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300'
            : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-[11px] font-medium leading-4 text-muted-foreground">{location}</p>
            <h3 className="mt-1 text-sm font-semibold leading-5 text-foreground">{placement.media.title}</h3>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 rounded-md text-[10px] ${isVideo
            ? 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300'
            : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'}`}
        >
          {typeLabel}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 border-t border-border/70 pt-3.5 text-xs leading-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(180px,1fr)]">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{locale === 'en' ? 'Proposed visual content' : 'Nội dung hình ảnh đề xuất'}</p>
          <p className="mt-1 text-muted-foreground">{placement.media.content_outline}</p>
        </div>
        <div className="min-w-0 border-t border-border/60 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <p className="font-semibold text-foreground">{locale === 'en' ? 'Instructional rationale' : 'Lý do đề xuất'}</p>
          <p className="mt-1 text-muted-foreground">{placement.media.rationale}</p>
        </div>
      </div>
    </article>
  );
}

function ChapterLessonCard({
  chapter,
  chapterIndex,
  lessonIndex,
  isLast,
  locale,
}: {
  chapter: LessonAuthorBlueprintChapter;
  chapterIndex: number;
  lessonIndex: number;
  isLast: boolean;
  locale: LessonAuthorContentLocale;
}) {
  const { i18n } = useTranslation();
  const t = useMemo(() => i18n.getFixedT(locale), [i18n, locale]);
  const lesson = chapter.lessons[lessonIndex];

  return (
    <article className="grid grid-cols-[30px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
      <div className="relative">
        {!isLast && (
          <span
            className="absolute -bottom-5 left-1/2 top-8 w-px -translate-x-1/2 bg-border"
            aria-hidden="true"
          />
        )}
        <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-primary/35 bg-background text-[10px] font-bold text-primary">
          {lessonIndex + 1}
        </span>
      </div>
      <div className="min-w-0 border-b border-border/70 pb-5 last:border-b-0 last:pb-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('chatWidget.blueprintLessonNumber', { chapter: chapterIndex + 1, lesson: lessonIndex + 1 })}
        </p>
        <h3 className="mt-1 text-sm font-semibold leading-5 text-foreground" title={lesson.title}>
          {lesson.title}
        </h3>
        <div className="mt-3 space-y-3 text-xs leading-5">
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
          {(lesson.units?.length ?? 0) > 0 && (
            <div className="flex gap-2">
              <Layers3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">
                  {locale === 'en' ? 'Draftable learning units' : 'Bài học và học liệu dự kiến'}
                </p>
                <ol className="mt-1.5 space-y-2">
                  {(lesson.units ?? []).map((unit, unitIndex) => (
                    <li key={`${unit.title}-${unitIndex}`} className="min-w-0 border-l-2 border-primary/30 pl-2.5 py-0.5">
                      <p className="truncate font-medium text-foreground" title={unit.title}>{unit.title}</p>
                      {(unit.component_plan?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(unit.component_plan ?? []).map((plan, planIndex) => (
                            <Badge
                              key={`${plan.type}-${plan.title}-${planIndex}`}
                              variant="secondary"
                              className="max-w-full truncate px-1.5 py-0 text-[10px] font-medium"
                              title={plan.rationale}
                            >
                              {plan.title}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function LessonAuthorBlueprintDialog({
  open,
  onOpenChange,
  blueprintEvent,
  outline,
  mindmapLoading = false,
  mindmapError = null,
  proposalEvent = null,
  pendingChapterIndexes,
  disabled = false,
  onDraftChapter,
}: LessonAuthorBlueprintDialogProps) {
  const { i18n } = useTranslation();
  const locale = resolveLessonAuthorContentLocale(blueprintEvent?.locale, i18n.language);
  const t = useMemo(() => i18n.getFixedT(locale), [i18n, locale]);
  const isVietnamese = locale === 'vi';
  const copy = isVietnamese
    ? {
      overview: 'Tổng quan',
      chapters: 'Cấu trúc chương',
      quality: 'Kết quả đầu ra & chất lượng',
      media: 'Video & infographic',
      mindmap: 'Mind map toàn khóa',
      sourceReferences: 'Đối chiếu nguồn',
      ready: 'Sẵn sàng soạn',
      review: 'Cần rà soát',
      chapterContent: 'Nội dung chương',
    }
    : {
      overview: 'Overview',
      chapters: 'Chapter structure',
      quality: 'Outcomes & quality',
      media: 'Video & infographics',
      mindmap: 'Course mind map',
      sourceReferences: 'Source references',
      ready: 'Ready to draft',
      review: 'Needs review',
      chapterContent: 'Chapter content',
    };
  const chapters = blueprintEvent?.blueprint.chapters;
  const chapterCount = chapters?.length ?? 0;
  const appliedChapterIndexes = useMemo(
    () => getAppliedChapterIndexes(blueprintEvent, chapterCount),
    [blueprintEvent, chapterCount],
  );
  const [activeTab, setActiveTab] = useState<BlueprintTab>('overview');
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const totalLessons = useMemo(
    () => (chapters ?? []).reduce((total, chapter) => total + chapter.lessons.length, 0),
    [chapters],
  );
  const mediaPlacements = useMemo<BlueprintMediaPlacement[]>(
    () => (chapters ?? []).flatMap((chapter, chapterIndex) => chapter.lessons.flatMap((lesson, lessonIndex) => (
      (lesson.units ?? []).flatMap((unit, unitIndex) => unit.media_plan ? [{
        chapterIndex,
        lessonIndex,
        unitIndex,
        chapterTitle: chapter.title,
        lessonTitle: lesson.title,
        unitTitle: unit.title,
        media: unit.media_plan,
      }] : [])
    ))),
    [chapters],
  );
  useEffect(() => {
    if (!blueprintEvent || !chapters?.length) return;

    if (selectedBlueprintId !== blueprintEvent.blueprint_id) {
      const firstDraftable = chapters.findIndex((_, index) => !appliedChapterIndexes.has(index));
      setSelectedBlueprintId(blueprintEvent.blueprint_id);
      setSelectedChapterIndex(firstDraftable >= 0 ? firstDraftable : 0);
      setActiveTab('overview');
    } else if (selectedChapterIndex >= chapters.length) {
      setSelectedChapterIndex(0);
    }
  }, [appliedChapterIndexes, blueprintEvent, chapters, pendingChapterIndexes, selectedBlueprintId, selectedChapterIndex]);

  if (!blueprintEvent || !chapters?.length) return null;

  const safeSelectedChapterIndex = selectedChapterIndex >= 0 && selectedChapterIndex < chapters.length
    ? selectedChapterIndex
    : 0;
  const selectedChapter = chapters[safeSelectedChapterIndex];
  const blueprintCanDraft = (blueprintEvent.status ?? 'proposed') === 'proposed';
  const hasContentArchitecture = chapters.every(chapter => chapter.lessons.every(lesson => (
    (lesson.units?.length ?? 0) > 0
    && (lesson.units ?? []).every(unit => (
      (unit.component_plan?.length ?? 0) > 0
      && (unit.component_plan ?? []).some(plan => plan.type === 'html')
    ))
  )));
  const selectedChapterApplied = appliedChapterIndexes.has(safeSelectedChapterIndex);
  const selectedChapterDraftPending = !selectedChapterApplied && Boolean(pendingChapterIndexes?.has(safeSelectedChapterIndex));
  const nextDraftableChapterIndex = chapters.findIndex((_, index) => !appliedChapterIndexes.has(index));
  const selectedChapterDraftLocked = !selectedChapterApplied
    && nextDraftableChapterIndex >= 0
    && safeSelectedChapterIndex !== nextDraftableChapterIndex;
  const canDraftSelectedChapter = blueprintCanDraft
    && !disabled
    && !selectedChapterApplied
    && !selectedChapterDraftPending
    && !selectedChapterDraftLocked
    && hasContentArchitecture
    && Boolean(onDraftChapter);
  const qualityChecks = blueprintEvent.quality_report.checks ?? [];
  const passedQualityChecks = qualityChecks.filter(check => check.passed).length;
  const qualityReady = blueprintEvent.quality_report.status === 'ready_for_review';
  const architectureReason = hasContentArchitecture
    ? null
    : (isVietnamese
      ? 'Bản thiết kế cũ chưa có kiến trúc bài học và component. Hãy tạo lại Bản thiết kế khóa học trước khi soạn chương.'
      : 'This older blueprint has no unit/component architecture. Generate a new course blueprint before drafting chapters.');
  const unavailableReason = !blueprintCanDraft
    ? blueprintEvent.error_reason || t('chatWidget.blueprintUnavailable')
    : architectureReason;
  const draftSequenceMessage = nextDraftableChapterIndex >= 0
    ? (isVietnamese
      ? `Áp dụng Chương ${nextDraftableChapterIndex + 1} trước khi soạn chương này.`
      : `Apply Chapter ${nextDraftableChapterIndex + 1} before drafting this chapter.`)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[10040]"
        className="z-[10050] flex h-[calc(100dvh-16px)] max-h-[900px] w-[calc(100vw-16px)] max-w-[1180px] flex-col gap-0 overflow-hidden rounded-lg border-border/80 bg-background p-0 shadow-2xl sm:w-[calc(100vw-32px)]"
      >
        <DialogHeader className="shrink-0 border-b bg-card px-4 py-3 pr-12 sm:px-5 sm:py-3.5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary shadow-sm sm:h-10 sm:w-10">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold sm:text-base">
                    {t('chatWidget.blueprintDialogTitle')}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-[11px] leading-4 sm:text-xs sm:leading-5">
                    {t('chatWidget.blueprintDialogDescription')}
                  </DialogDescription>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 rounded-md text-[10px] ${qualityReady
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}
                >
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  {blueprintEvent.quality_report.score}/100
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        {unavailableReason && (
          <div className="flex shrink-0 gap-2 border-b border-destructive/25 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive sm:px-5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>{unavailableReason}</p>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={value => setActiveTab(value as BlueprintTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 overflow-x-auto border-b bg-muted/10 px-3 py-2 sm:px-5">
            <TabsList className="grid h-auto w-full min-w-[760px] grid-cols-5 gap-1 rounded-lg border border-border/70 bg-muted/35 p-1 dark:bg-muted/20">
              <TabsTrigger value="overview" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm">
                <UsersRound className="h-3.5 w-3.5" />
                {copy.overview}
              </TabsTrigger>
              <TabsTrigger value="chapters" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm">
                <Layers3 className="h-3.5 w-3.5" />
                {copy.chapters}
              </TabsTrigger>
              <TabsTrigger value="quality" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm">
                <ListChecks className="h-3.5 w-3.5" />
                {copy.quality}
              </TabsTrigger>
              <TabsTrigger value="media" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm">
                <Clapperboard className="h-3.5 w-3.5" />
                {copy.media}
              </TabsTrigger>
              <TabsTrigger value="mindmap" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm">
                <Map className="h-3.5 w-3.5" />
                {copy.mindmap}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-5 sm:py-6">
                <section className="rounded-lg border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <h2 className="text-base font-semibold leading-6 text-foreground" title={blueprintEvent.blueprint.title}>
                    {blueprintEvent.blueprint.title}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                    {blueprintEvent.blueprint.summary}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                    <BlueprintMetric label={t('chatWidget.blueprintChapters')} value={chapters.length} />
                    <BlueprintMetric label={t('chatWidget.blueprintLessons')} value={totalLessons} />
                    <BlueprintMetric label={t('chatWidget.blueprintQuality')} value={`${passedQualityChecks}/${qualityChecks.length || 0}`} />
                  </div>
                </section>

                <div className="grid gap-3 md:grid-cols-2">
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
                </div>

                {blueprintEvent.blueprint.assumptions?.length > 0 && (
                  <section className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
                    <p className="text-xs font-semibold text-foreground">{t('chatWidget.blueprintAssumptions')}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                      {blueprintEvent.blueprint.assumptions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                    </ul>
                  </section>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="chapters" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-1">
              <nav
                className="border-b bg-muted/15 px-3 py-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-4 lg:py-4"
                aria-label={t('chatWidget.blueprintChapterNavigator')}
              >
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('chatWidget.blueprintChapterNavigator')}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible">
                  {chapters.map((chapter, index) => {
                    const selected = safeSelectedChapterIndex === index;
                    const applied = appliedChapterIndexes.has(index);
                    const locked = !applied
                      && nextDraftableChapterIndex >= 0
                      && index !== nextDraftableChapterIndex;
                    return (
                      <button
                        key={`${chapter.title}-${index}`}
                        type="button"
                        onClick={() => setSelectedChapterIndex(index)}
                        className={`min-w-[212px] rounded-md border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 lg:min-w-0 ${selected
                          ? 'border-primary/35 bg-primary/5'
                          : 'border-transparent bg-background/55 hover:border-border hover:bg-background'}`}
                        aria-current={selected ? 'step' : undefined}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {t('chatWidget.blueprintChapterNumber', { chapter: index + 1 })}
                              </span>
                              {applied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" /> : pendingChapterIndexes?.has(index) ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-300" /> : locked ? <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                            </span>
                            <span className="mt-1 block line-clamp-2 text-xs font-semibold leading-5 text-foreground">
                              {chapter.title}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </nav>

              <ScrollArea className="h-full min-h-0">
                <div className="mx-auto max-w-4xl px-4 py-5 sm:px-5 sm:py-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-md bg-primary/5 text-[10px] text-primary">
                      {t('chatWidget.blueprintChapterNumber', { chapter: safeSelectedChapterIndex + 1 })}
                    </Badge>
                    {selectedChapterApplied && (
                      <Badge variant="outline" className="rounded-md border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                        {t('chatWidget.blueprintChapterApplied')}
                      </Badge>
                    )}
                    {selectedChapterDraftPending && (
                      <Badge variant="outline" className="rounded-md border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                        {t('chatWidget.blueprintChapterDraftPending')}
                      </Badge>
                    )}
                    {selectedChapterDraftLocked && (
                      <Badge variant="outline" className="rounded-md border-border bg-muted/35 text-[10px] text-muted-foreground">
                        <LockKeyhole className="mr-1 h-3 w-3" />
                        {isVietnamese ? `Mở sau Chương ${nextDraftableChapterIndex + 1}` : `Available after Chapter ${nextDraftableChapterIndex + 1}`}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 flex items-start justify-between gap-3">
                    <h2 className="min-w-0 text-base font-semibold leading-6 text-foreground sm:text-lg sm:leading-7">
                      {selectedChapter.title}
                    </h2>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedChapterIndex(index => Math.max(0, index - 1))} disabled={safeSelectedChapterIndex === 0} aria-label={t('chatWidget.blueprintPreviousChapter')}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedChapterIndex(index => Math.min(chapterCount - 1, index + 1))} disabled={safeSelectedChapterIndex === chapterCount - 1} aria-label={t('chatWidget.blueprintNextChapter')}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('chatWidget.blueprintChapterObjective')}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedChapter.objective}</p>
                  </div>

                  {selectedChapter.source_refs?.length ? (
                    <p className="mt-3 text-[11px] leading-5 text-primary/80">
                      {copy.sourceReferences}: {selectedChapter.source_refs.join(', ')}
                    </p>
                  ) : null}

                  <section className="mt-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{copy.chapterContent}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {selectedChapter.lessons.length} {isVietnamese ? 'bài học' : 'lessons'}
                      </span>
                    </div>
                    {selectedChapter.lessons.map((_, lessonIndex) => (
                      <ChapterLessonCard
                        key={`${selectedChapter.lessons[lessonIndex].title}-${lessonIndex}`}
                        chapter={selectedChapter}
                        chapterIndex={safeSelectedChapterIndex}
                        lessonIndex={lessonIndex}
                        isLast={lessonIndex === selectedChapter.lessons.length - 1}
                        locale={locale}
                      />
                    ))}
                  </section>

                  <div className="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t('chatWidget.blueprintAppliedProgress', { applied: appliedChapterIndexes.size, total: chapters.length })}
                    </p>
                    {architectureReason ? (
                      <span className="inline-flex items-center gap-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {architectureReason}
                      </span>
                    ) : selectedChapterDraftLocked ? (
                      <span className="inline-flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                        <LockKeyhole className="h-4 w-4 shrink-0" />
                        {draftSequenceMessage}
                      </span>
                    ) : selectedChapterApplied || selectedChapterDraftPending ? (
                      <span className={`inline-flex items-center gap-2 text-xs font-medium ${selectedChapterApplied ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {selectedChapterApplied ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                        {selectedChapterApplied ? t('chatWidget.blueprintChapterApplied') : t('chatWidget.blueprintChapterDraftPending')}
                      </span>
                    ) : (
                      <Button type="button" size="sm" className="w-full gap-2 sm:w-auto" onClick={() => onDraftChapter?.(safeSelectedChapterIndex)} disabled={!canDraftSelectedChapter}>
                        {disabled ? <><Loader2 className="h-4 w-4 animate-spin" />{t('chatWidget.blueprintDrafting')}</> : <><ChevronRight className="h-4 w-4" />{t('chatWidget.blueprintStartDraft', { chapter: safeSelectedChapterIndex + 1 })}</>}
                      </Button>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="quality" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-5 sm:py-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <BlueprintInfoSection icon={Target} label={t('chatWidget.blueprintLearningOutcomes')}>
                    {blueprintEvent.blueprint.learning_outcomes?.length ? (
                      <ul className="space-y-2">
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

                <section className="rounded-lg border border-border/70 bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">{t('chatWidget.blueprintQuality')}</p>
                    <Badge variant="outline" className="ml-auto rounded-md text-[10px]">
                      {qualityReady ? copy.ready : copy.review}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {qualityChecks.map((check, index) => (
                      <div key={`${check.key}-${index}`} className="flex items-start gap-2 text-xs leading-5">
                        {check.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />}
                        <span className={check.passed ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'}>
                          {getQualityCheckLabel(check.key, isVietnamese)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {blueprintEvent.quality_report.review_notes?.length ? (
                    <div className="mt-5 border-t border-border/70 pt-4">
                      <p className="text-xs font-semibold text-foreground">{t('chatWidget.blueprintReviewNotes')}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                        {blueprintEvent.quality_report.review_notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </section>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="media" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-5xl space-y-4 px-4 py-5 sm:px-5 sm:py-6">
                <section className="rounded-lg border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-foreground sm:text-base">
                    {isVietnamese ? 'Đề xuất video & infographic' : 'Video & infographic recommendations'}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {isVietnamese
                      ? 'Mỗi đề xuất nằm ở đầu bài học tương ứng và chỉ là kế hoạch học liệu, chưa tạo hoặc chèn media vào khóa học.'
                      : 'Each recommendation is placed before its corresponding lesson and remains a media plan only; no asset is created or inserted into the course.'}
                  </p>
                </section>

                {mediaPlacements.length > 0 ? (
                  mediaPlacements.map((placement) => (
                    <BlueprintMediaCard
                      key={`${placement.chapterIndex}-${placement.lessonIndex}-${placement.unitIndex}-${placement.media.type}-${placement.media.title}`}
                      placement={placement}
                      locale={locale}
                    />
                  ))
                ) : (
                  <section className="border-y border-border/70 px-1 py-8 text-center">
                    <PanelsTopLeft className="mx-auto h-5 w-5 text-muted-foreground" />
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      {isVietnamese ? 'Chưa có đề xuất media cần thiết' : 'No media recommendation is needed'}
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                      {isVietnamese
                        ? 'Bản thiết kế chỉ đề xuất video hoặc infographic khi chúng giúp làm rõ nội dung có trong tài liệu nguồn.'
                        : 'The blueprint recommends video or static infographics only when they clarify source-grounded course content.'}
                    </p>
                  </section>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="mindmap" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <div className="h-full min-h-0 overflow-hidden">
              <LessonAuthorMindmapPanel
                embedded
                outline={outline}
                proposalEvent={proposalEvent}
                blueprintEvent={blueprintEvent}
                loading={mindmapLoading}
                error={mindmapError}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
