import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, Loader2, RefreshCw, Search, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createCourseOutlineTransfer,
  getCourseOutlineTransferDestinationOptions,
  getCourseOutlineTransferJob,
  getCourseOutlineTransferTargets,
  type CourseOutlineTransferDestinationParent,
  type CourseOutlineTransferJob,
  type CourseOutlineTransferOperation,
} from '@/api/custom-course-authoring';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { getLocalizedApiError } from '@/utils/localized-error';

interface CourseOutlineTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceCourseId: string;
  sourceBlockId: string;
  sourceBlockName: string;
  sourceBlockType: string;
  onCompleted: () => void;
}

type DestinationPathItem = CourseOutlineTransferDestinationParent;
type DestinationLevel = 'chapter' | 'sequential' | 'vertical';
type JobViewState = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4${Math.random().toString(16).slice(2, 5)}-8${Math.random().toString(16).slice(2, 5)}-${Math.random().toString(16).slice(2, 14)}`;
}

function destinationLevelsFor(sourceBlockType: string): DestinationLevel[] {
  if (sourceBlockType === 'chapter') return [];
  if (sourceBlockType === 'sequential') return ['chapter'];
  if (sourceBlockType === 'vertical') return ['chapter', 'sequential'];
  return ['chapter', 'sequential', 'vertical'];
}

function jobViewState(job: CourseOutlineTransferJob): JobViewState {
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'running') return job.status;
  return job.attempts > 0 ? 'retrying' : 'queued';
}

function getJobRefetchInterval(job: CourseOutlineTransferJob | undefined): number | false {
  if (!job || job.status === 'succeeded' || job.status === 'failed') return false;
  // A running job can make observable file-copy progress. Five seconds keeps
  // the dialog responsive without a per-user request storm.
  if (job.status === 'running') return 5_000;
  // The first queue pass is normally picked up quickly. Once a job is in its
  // exponential-backoff cycle, wait for its server-authoritative retry time
  // and cap the background check at one request per minute.
  if (job.attempts === 0) return 10_000;
  const retryAt = Date.parse(job.next_attempt_at);
  if (!Number.isFinite(retryAt)) return 30_000;
  return Math.min(Math.max(retryAt - Date.now() + 1_000, 10_000), 60_000);
}

function OptionSkeletons() {
  return <div className="space-y-2 p-1">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-xl" />)}</div>;
}

export default function CourseOutlineTransferDialog({
  open,
  onOpenChange,
  sourceCourseId,
  sourceBlockId,
  sourceBlockName,
  sourceBlockType,
  onCompleted,
}: CourseOutlineTransferDialogProps) {
  const { t } = useTranslation();
  const operation: CourseOutlineTransferOperation = 'duplicate';
  const [courseSearch, setCourseSearch] = useState('');
  const [coursePageCursors, setCoursePageCursors] = useState<Array<string | null>>([null]);
  const [locationSearch, setLocationSearch] = useState('');
  const [destinationCourse, setDestinationCourse] = useState<{ id: string; display_name: string } | null>(null);
  const [destinationPath, setDestinationPath] = useState<DestinationPathItem[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const completedJobRef = useRef<string | null>(null);
  const debouncedCourseSearch = useDebounce(courseSearch.trim(), 300);
  const deferredLocationSearch = useDeferredValue(locationSearch);
  const courseCursor = coursePageCursors.at(-1) ?? null;
  const coursePage = coursePageCursors.length;
  const destinationLevels = useMemo(() => destinationLevelsFor(sourceBlockType), [sourceBlockType]);
  const activeLevel = destinationLevels[destinationPath.length];
  const operationLabel = t(`courseOutline.transfer.${operation}`);

  const sourceTypeLabel = sourceBlockType === 'chapter'
    ? t('courseOutline.chapter')
    : sourceBlockType === 'sequential'
      ? t('courseOutline.section')
      : sourceBlockType === 'vertical'
        ? t('courseOutline.unit')
        : t('courseOutline.content');

  const levelLabel = (level: DestinationLevel) => (
    level === 'chapter' ? t('courseOutline.chapter') : level === 'sequential' ? t('courseOutline.section') : t('courseOutline.unit')
  );

  useEffect(() => {
    if (open) return;
    setCourseSearch('');
    setCoursePageCursors([null]);
    setLocationSearch('');
    setDestinationCourse(null);
    setDestinationPath([]);
    setJobId(null);
    setConfirmOpen(false);
    completedJobRef.current = null;
  }, [open]);

  useEffect(() => {
    setCoursePageCursors([null]);
  }, [debouncedCourseSearch, sourceCourseId]);

  const coursesQuery = useQuery({
    queryKey: ['course-outline-transfer-targets', sourceCourseId, debouncedCourseSearch, courseCursor],
    queryFn: () => getCourseOutlineTransferTargets(sourceCourseId, debouncedCourseSearch, courseCursor),
    enabled: open && !jobId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const locationsQuery = useInfiniteQuery({
    queryKey: ['course-outline-transfer-destination-options', sourceBlockId, destinationCourse?.id, destinationPath.map((item) => item.id).join(','), deferredLocationSearch],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getCourseOutlineTransferDestinationOptions({
      sourceBlockId,
      destinationCourseId: destinationCourse!.id,
      parentIds: destinationPath.map((item) => item.id),
      search: deferredLocationSearch,
      cursor: pageParam,
    }),
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: open && !jobId && Boolean(destinationCourse) && Boolean(activeLevel),
    staleTime: 15_000,
  });

  const jobQuery = useQuery({
    queryKey: ['course-outline-transfer-job', jobId],
    queryFn: () => getCourseOutlineTransferJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => getJobRefetchInterval(query.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const job = jobQuery.data;
    if (!job || job.status !== 'succeeded' || completedJobRef.current === job.id) return;
    completedJobRef.current = job.id;
    toast.success(t('courseOutline.transfer.completedDescription'));
    onCompleted();
  }, [jobQuery.data, onCompleted, t]);

  const createMutation = useMutation({
    mutationFn: () => createCourseOutlineTransfer({
      sourceBlockId,
      destinationCourseId: destinationCourse!.id,
      destinationParentId: sourceBlockType === 'chapter' ? destinationCourse!.id : destinationPath.at(-1)!.id,
      destinationPathIds: destinationPath.map((item) => item.id),
      operation,
      idempotencyKey: newIdempotencyKey(),
    }),
    onSuccess: (job) => {
      setConfirmOpen(false);
      setJobId(job.id);
      toast.success(t('courseOutline.transfer.requestCreated', { operation: operationLabel.toLowerCase() }));
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast.error(getLocalizedApiError(error, t('courseOutline.transfer.requestFailed')));
    },
  });

  const courses = coursesQuery.data?.courses || [];
  const locations = locationsQuery.data?.pages.flatMap((page) => page.options) || [];
  const job = jobQuery.data;
  const currentJobState = job ? jobViewState(job) : null;
  const isPending = createMutation.isPending || currentJobState === 'queued' || currentJobState === 'running' || currentJobState === 'retrying';
  const destinationReady = Boolean(destinationCourse) && destinationPath.length === destinationLevels.length;
  const canSubmit = destinationReady && !isPending;
  const destinationText = [destinationCourse?.display_name, ...destinationPath.map((item) => item.display_name)].filter(Boolean).join('  ›  ');

  const chooseCourse = (course: { id: string; display_name: string }) => {
    setDestinationCourse(course);
    setDestinationPath([]);
    setLocationSearch('');
  };

  const goToPreviousCoursePage = () => {
    if (coursesQuery.isFetching || coursePage === 1) return;
    setCoursePageCursors((current) => current.slice(0, -1));
  };

  const goToNextCoursePage = () => {
    const nextCursor = coursesQuery.data?.next_cursor;
    if (coursesQuery.isFetching || !coursesQuery.data?.has_more || !nextCursor) return;
    setCoursePageCursors((current) => current.at(-1) === nextCursor ? current : [...current, nextCursor]);
  };

  const chooseLocation = (location: DestinationPathItem) => {
    setDestinationPath((current) => [...current, location]);
    setLocationSearch('');
  };

  const resetPathFrom = (index: number) => {
    setDestinationPath((current) => current.slice(0, index));
    setLocationSearch('');
  };

  const reopenConfirmation = () => {
    setJobId(null);
    completedJobRef.current = null;
    createMutation.reset();
    setConfirmOpen(true);
  };

  const statusTitle = () => {
    if (!job || !currentJobState) return '';
    if (currentJobState === 'running') return t(`courseOutline.transferUI.processing${job.operation === 'duplicate' ? 'Duplicate' : 'Move'}`);
    return t(`courseOutline.transferUI.status.${currentJobState}`);
  };

  const statusDescription = () => {
    if (!job || !currentJobState) return '';
    if (currentJobState === 'retrying') return t('courseOutline.transferUI.retryingDescription', { attempts: job.attempts, maxAttempts: job.max_attempts });
    if (currentJobState === 'failed') return job.last_error || t('courseOutline.transfer.failedDescription');
    if (currentJobState === 'succeeded') return t('courseOutline.transfer.completedDescription');
    return t(`courseOutline.transferUI.statusDescription.${currentJobState}`, { operation: operationLabel.toLowerCase() });
  };

  const confirmationTitle = t('courseOutline.transferUI.confirmDuplicateTitle');
  const confirmationDescription = t('courseOutline.transferUI.confirmDuplicateDescription', { name: sourceBlockName });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-hidden border-border/80 bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 bg-muted/[0.18] px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><Copy className="h-5 w-5" /></div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg tracking-tight">{t('courseOutline.transfer.title')}</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-5">{t('courseOutline.transferUI.headerDescription')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(92dvh-104px)] overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="space-y-5">
            <section className="rounded-2xl border border-border/70 bg-muted/[0.18] px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t('courseOutline.transferUI.sourceLabel')} · {sourceTypeLabel}</p>
              <p className="mt-1.5 truncate text-sm font-semibold text-foreground">{sourceBlockName}</p>
            </section>

            {!jobId && <>
              <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-semibold">{t('courseOutline.transferUI.destinationTitle')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('courseOutline.transferUI.destinationHint')}</p></div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t('courseOutline.transferUI.step', { current: Math.min(destinationPath.length + (destinationCourse ? 2 : 1), destinationLevels.length + 1), total: destinationLevels.length + 1 })}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
                  {[t('courseOutline.transfer.destinationCourse'), ...destinationLevels.map(levelLabel)].map((label, index) => {
                    const done = index === 0 ? Boolean(destinationCourse) : index - 1 < destinationPath.length;
                    const current = index === 0 ? !destinationCourse : index - 1 === destinationPath.length && Boolean(destinationCourse);
                    return <div key={`${label}-${index}`} className="flex items-center gap-1.5">
                      {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/65" />}
                      <span className={`rounded-full px-2.5 py-1 font-medium ${done ? 'bg-primary/10 text-primary' : current ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>{done && <Check className="mr-1 inline h-3 w-3" />}{label}</span>
                    </div>;
                  })}
                </div>

                {!destinationCourse ? <div className="mt-5">
                  <Label className="text-sm font-semibold">{t('courseOutline.transfer.destinationCourse')}</Label>
                  <div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} className="h-11 rounded-xl pl-9" placeholder={t('courseOutline.transfer.searchCourses')} autoComplete="off" /></div>
                  <ScrollArea className="mt-2 max-h-52 pr-2">{coursesQuery.isLoading ? <OptionSkeletons /> : courses.length === 0 ? <p className="rounded-xl border border-dashed border-border px-3 py-7 text-center text-xs text-muted-foreground">{t('courseOutline.transfer.noCourses')}</p> : <div className="space-y-1.5">{courses.map((course) => <button key={course.id} type="button" onClick={() => chooseCourse(course)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-primary/20 hover:bg-primary/[0.06]"><span className="truncate font-medium">{course.display_name}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div>}</ScrollArea>
                  {(coursePage > 1 || coursesQuery.data?.has_more) && <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3"><span className="text-xs font-medium text-muted-foreground">{t('courseOutline.transferUI.coursePage', { page: coursePage })}</span><div className="flex items-center gap-1.5"><Button type="button" variant="outline" size="icon-sm" disabled={coursePage === 1 || coursesQuery.isFetching} onClick={goToPreviousCoursePage} aria-label={t('courseOutline.transferUI.previousCoursePage')}><ChevronLeft /></Button><Button type="button" variant="outline" size="icon-sm" disabled={!coursesQuery.data?.has_more || coursesQuery.isFetching} onClick={goToNextCoursePage} aria-label={t('courseOutline.transferUI.nextCoursePage')}><ChevronRight /></Button></div></div>}
                </div> : <div className="mt-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/[0.055] px-3.5 py-3"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('courseOutline.transfer.destinationCourse')}</p><p className="mt-0.5 truncate text-sm font-semibold">{destinationCourse.display_name}</p></div><Button variant="ghost" size="sm" className="shrink-0" onClick={() => { setDestinationCourse(null); setDestinationPath([]); }}>{t('courseOutline.transferUI.change')}</Button></div>

                  {destinationPath.map((item, index) => <motion.div key={item.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3 rounded-xl bg-muted/55 px-3.5 py-3"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{levelLabel(destinationLevels[index])}</p><p className="mt-0.5 truncate text-sm font-semibold">{item.display_name}</p></div><Button variant="ghost" size="sm" className="shrink-0" onClick={() => resetPathFrom(index)}><X className="mr-1 h-3.5 w-3.5" />{t('courseOutline.transferUI.change')}</Button></motion.div>)}

                  {activeLevel && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.025] p-3.5"><Label className="text-sm font-semibold">{t('courseOutline.transferUI.selectLevel', { level: levelLabel(activeLevel) })}</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('courseOutline.transferUI.selectLevelHint', { level: levelLabel(activeLevel) })}</p><div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} className="h-11 rounded-xl pl-9" placeholder={t('courseOutline.transferUI.searchLevel', { level: levelLabel(activeLevel) })} autoComplete="off" /></div><ScrollArea className="mt-2 max-h-48 pr-2">{locationsQuery.isLoading ? <OptionSkeletons /> : locations.length === 0 ? <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{t('courseOutline.transferUI.noLevel', { level: levelLabel(activeLevel) })}</p> : <div className="space-y-1.5">{locations.map((location) => <button key={location.id} type="button" onClick={() => chooseLocation(location)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors hover:border-primary/20 hover:bg-primary/[0.06]"><span className="truncate font-medium">{location.display_name}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div>}</ScrollArea>{locationsQuery.hasNextPage && <Button variant="ghost" size="sm" className="mt-2 w-full" disabled={locationsQuery.isFetchingNextPage} onClick={() => locationsQuery.fetchNextPage()}>{locationsQuery.isFetchingNextPage && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{t('courseOutline.transferUI.loadMore')}</Button>}</motion.div>}
                </div>}
              </section>

            </>}

            <AnimatePresence mode="wait">
              {jobId && !job && !jobQuery.isError && <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/20 bg-primary/[0.045] p-5"><div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /><div><p className="text-sm font-semibold">{t('courseOutline.transferUI.loadingStatus')}</p><p className="mt-1 text-xs text-muted-foreground">{t('courseOutline.transferUI.loadingStatusHint')}</p></div></div></motion.div>}
              {jobId && jobQuery.isError && <motion.section initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-5"><div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /><div><p className="text-sm font-semibold">{t('courseOutline.transferUI.statusUnavailable')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('courseOutline.transferUI.statusUnavailableHint')}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => jobQuery.refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" />{t('courseOutline.transferUI.reloadStatus')}</Button></div></div></motion.section>}
              {job && currentJobState && <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={`rounded-2xl border p-4 sm:p-5 ${currentJobState === 'failed' ? 'border-destructive/30 bg-destructive/[0.06]' : currentJobState === 'succeeded' ? 'border-emerald-500/30 bg-emerald-500/[0.07]' : 'border-primary/25 bg-primary/[0.045]'}`}><div className="flex items-start gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${currentJobState === 'failed' ? 'bg-destructive/10 text-destructive' : currentJobState === 'succeeded' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-primary/10 text-primary'}`}>{currentJobState === 'queued' || currentJobState === 'running' || currentJobState === 'retrying' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{statusTitle()}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{statusDescription()}</p>{currentJobState !== 'failed' && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{t('courseOutline.transfer.blocks', { count: job.block_count })}</span><span>{t('courseOutline.transfer.files', { count: job.asset_count })}</span>{job.attempts > 0 && <span>{t('courseOutline.transferUI.attempts', { attempts: job.attempts, maxAttempts: job.max_attempts })}</span>}</div>}{currentJobState === 'failed' && <Button size="sm" variant="outline" className="mt-3" onClick={reopenConfirmation}><RefreshCw className="mr-2 h-3.5 w-3.5" />{t('courseOutline.transferUI.createNewRequest')}</Button>}</div></div></motion.section>}
            </AnimatePresence>

            <div className="flex flex-col-reverse gap-2 border-t border-border/65 pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>{t('courseOutline.transfer.close')}</Button>{!jobId && <Button disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>{t('courseOutline.transferUI.reviewDuplicate')}<ArrowRight className="ml-2 h-4 w-4" /></Button>}</div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg rounded-2xl border-border/80 p-0 shadow-2xl">
          <div className="h-1.5 bg-primary" />
          <div className="p-5 sm:p-6"><AlertDialogHeader><AlertDialogTitle className="text-lg">{confirmationTitle}</AlertDialogTitle><AlertDialogDescription className="pt-1 text-sm leading-6">{confirmationDescription}</AlertDialogDescription></AlertDialogHeader><div className="mt-5 rounded-xl border border-border/70 bg-muted/[0.3] p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('courseOutline.transferUI.confirmSource')}</p><p className="mt-1 truncate text-sm font-semibold">{sourceBlockName}</p><div className="my-3 border-t border-border/60" /><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('courseOutline.transferUI.confirmDestination')}</p><p className="mt-1 break-words text-sm font-semibold">{destinationText}</p></div><AlertDialogFooter className="mt-5"><AlertDialogCancel>{t('courseOutline.transferUI.back')}</AlertDialogCancel><AlertDialogAction disabled={createMutation.isPending} onClick={(event) => { event.preventDefault(); createMutation.mutate(); }}>{createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('courseOutline.transferUI.confirmDuplicateAction')}</AlertDialogAction></AlertDialogFooter></div>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
