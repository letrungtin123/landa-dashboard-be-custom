import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Building2, CalendarDays, Check, ChevronDown, Download, FileText, Filter, Loader2, ShieldCheck, Sparkles, Users, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { getReportGroups, getReportSubGroups, getReportTeams } from '@/api/custom-reports';
import type {
  ReportAnalyticsSignal,
  ReportChatFilter,
  ReportMetricFact,
  ReportNarrative,
  ReportPdfExportJob,
  ReportPdfExportPhase,
  ReportSnapshotV2,
  ReportStreamStatus,
} from '@/api/custom-chat';
import { useAuthStore } from '@/utils/store';
import { getGroupLabelSet } from '@/utils/group-labels';
import { exportReportExcel } from '@/utils/export-report';
import { useLocaleStore } from '@/utils/locale-store';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ReportDetailModal, type ReportDetailView } from './report-detail-modal';
import { ReportMetricTrendModal } from '@/components/reports/report-metric-trend-modal';

type ReportChatAttachment =
  | {
    kind: 'filter';
    question: string;
    suggestedFilter: ReportChatFilter;
  }
  | {
    kind: 'analysis';
    question: string;
    filter: ReportChatFilter;
    generatedAt: string | null;
    hasData: boolean;
    snapshot: ReportSnapshotV2 | null;
    narrative: ReportNarrative | null;
  };

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function readFilter(value: unknown): ReportChatFilter {
  const record = asRecord(value);
  if (!record) return {};
  return {
    ...(typeof record.date_from === 'string' ? { date_from: record.date_from } : {}),
    ...(typeof record.date_to === 'string' ? { date_to: record.date_to } : {}),
    ...(typeof record.group_id === 'string' ? { group_id: record.group_id } : {}),
    ...(typeof record.subgroup_id === 'string' ? { subgroup_id: record.subgroup_id } : {}),
    ...(typeof record.team_id === 'string' ? { team_id: record.team_id } : {}),
  };
}

function readReportHasData(value: unknown): boolean {
  const snapshot = asRecord(value);
  const summary = asRecord(snapshot?.summary);
  const overview = asRecord(summary?.overview);
  if (!overview) return true;

  return ['total_learners', 'active_learners', 'completion_rate', 'total_enrollments']
    .some((key) => Number(overview[key] ?? 0) > 0);
}

function isReportSnapshotV2(value: unknown): value is ReportSnapshotV2 {
  const snapshot = asRecord(value);
  return snapshot?.version === 2
    && Array.isArray(snapshot.factual_metrics)
    && Array.isArray(snapshot.signals)
    && asRecord(snapshot.availability) !== null;
}

function readReportNarrative(value: unknown): ReportNarrative | null {
  const narrative = asRecord(value);
  if (!narrative || !Array.isArray(narrative.recommended_actions)) return null;
  const actions = narrative.recommended_actions.flatMap((item) => {
    const action = asRecord(item);
    if (!action || typeof action.action !== 'string') return [];
    const priority: 'high' | 'medium' | 'low' = action.priority === 'high' || action.priority === 'medium' || action.priority === 'low'
      ? action.priority
      : 'medium';
    return [{
      signal_id: typeof action.signal_id === 'string' ? action.signal_id : null,
      priority,
      action: action.action,
    }];
  });
  return {
    selected_signal_ids: Array.isArray(narrative.selected_signal_ids)
      ? narrative.selected_signal_ids.filter((id): id is string => typeof id === 'string')
      : [],
    interpretation: Array.isArray(narrative.interpretation)
      ? narrative.interpretation.filter((item): item is string => typeof item === 'string')
      : [],
    recommended_actions: actions,
    limitations: Array.isArray(narrative.limitations)
      ? narrative.limitations.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function getReportChatAttachment(metadata: Record<string, unknown>): ReportChatAttachment | null {
  if (metadata.kind === 'report_filter_request') {
    const question = typeof metadata.report_question === 'string' ? metadata.report_question : '';
    return question ? { kind: 'filter', question, suggestedFilter: readFilter(metadata.report_suggested_filter) } : null;
  }
  if (metadata.kind === 'report_analysis') {
    const question = typeof metadata.report_question === 'string' ? metadata.report_question : '';
    return question
      ? {
        kind: 'analysis',
        question,
        filter: readFilter(metadata.report_filter),
        generatedAt: typeof metadata.report_generated_at === 'string' ? metadata.report_generated_at : null,
        hasData: readReportHasData(metadata.report_snapshot),
        snapshot: isReportSnapshotV2(metadata.report_snapshot) ? metadata.report_snapshot : null,
        narrative: readReportNarrative(metadata.report_narrative),
      }
      : null;
  }
  return null;
}

export function getReportChatAppliedFilter(metadata: Record<string, unknown>): ReportChatFilter | null {
  const filter = readFilter(metadata.report_filters);
  return filter.date_from && filter.date_to ? filter : null;
}

function getCurrentMonthRange(): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const year = read('year');
  const month = read('month');
  const day = read('day');
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${day}` };
}

function formatDateLabel(value: string, isEnglish: boolean): string {
  try {
    return format(parseISO(value), isEnglish ? 'dd MMM yyyy' : 'dd/MM/yyyy', {
      locale: isEnglish ? enUS : vi,
    });
  } catch {
    return value;
  }
}

const PDF_EXPORT_STEPS: Array<{
  phase: Exclude<ReportPdfExportPhase, 'ready' | 'failed'>;
  icon: typeof ShieldCheck;
  labelKey: string;
  descriptionKey: string;
  color: string;
  textColor: string;
}> = [
  { phase: 'validating', icon: ShieldCheck, labelKey: 'pdfStepCheck', descriptionKey: 'pdfStepCheckDescription', color: 'bg-sky-500', textColor: 'text-sky-600 dark:text-sky-300' },
  { phase: 'narrative', icon: Sparkles, labelKey: 'pdfStepAnalyze', descriptionKey: 'pdfStepAnalyzeDescription', color: 'bg-violet-500', textColor: 'text-violet-600 dark:text-violet-300' },
  { phase: 'rendering', icon: FileText, labelKey: 'pdfStepRender', descriptionKey: 'pdfStepRenderDescription', color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-300' },
];

const PDF_EXPORT_PRESENTATION_STEP_MS = [700, 900, 1_100] as const;
const PDF_EXPORT_PRESENTATION_TOTAL_MS = PDF_EXPORT_PRESENTATION_STEP_MS.reduce((total, duration) => total + duration, 0);

type ReportPdfExportDisplayJob = ReportPdfExportJob & {
  presentationStartedAt?: number;
};

function getPdfExportPhaseIndex(phase: ReportPdfExportPhase): number {
  if (phase === 'narrative') return 1;
  if (phase === 'rendering') return 2;
  if (phase === 'ready') return PDF_EXPORT_STEPS.length;
  return 0;
}

function getDisplayedPdfExportPhase(job: ReportPdfExportDisplayJob | null | undefined, now: number): ReportPdfExportPhase | null {
  if (!job || job.phase !== 'ready' || !job.presentationStartedAt) return job?.phase ?? null;

  const elapsed = Math.max(0, now - job.presentationStartedAt);
  if (elapsed < PDF_EXPORT_PRESENTATION_STEP_MS[0]) return 'validating';
  if (elapsed < PDF_EXPORT_PRESENTATION_STEP_MS[0] + PDF_EXPORT_PRESENTATION_STEP_MS[1]) return 'narrative';
  if (elapsed < PDF_EXPORT_PRESENTATION_TOTAL_MS) return 'rendering';
  return 'ready';
}

function ReportPdfExportProgress({
  job,
  starting,
  downloading,
  unavailable,
  onStart,
  onDownload,
}: {
  job?: ReportPdfExportDisplayJob | null;
  starting?: boolean;
  downloading?: boolean;
  unavailable?: boolean;
  onStart: () => void;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [presentationNow, setPresentationNow] = useState(() => Date.now());
  const displayedPhase = getDisplayedPdfExportPhase(job, presentationNow);
  const isReady = displayedPhase === 'ready';
  const isFailed = displayedPhase === 'failed';
  const activeIndex = displayedPhase ? getPdfExportPhaseIndex(displayedPhase) : -1;

  useEffect(() => {
    if (job?.phase !== 'ready' || !job.presentationStartedAt) return;

    const elapsed = Math.max(0, Date.now() - job.presentationStartedAt);
    const nextBoundary = elapsed < PDF_EXPORT_PRESENTATION_STEP_MS[0]
      ? PDF_EXPORT_PRESENTATION_STEP_MS[0]
      : elapsed < PDF_EXPORT_PRESENTATION_STEP_MS[0] + PDF_EXPORT_PRESENTATION_STEP_MS[1]
        ? PDF_EXPORT_PRESENTATION_STEP_MS[0] + PDF_EXPORT_PRESENTATION_STEP_MS[1]
        : PDF_EXPORT_PRESENTATION_TOTAL_MS;
    const remaining = nextBoundary - elapsed;
    if (remaining <= 0) return;

    const timer = window.setTimeout(() => setPresentationNow(Date.now()), remaining);
    return () => window.clearTimeout(timer);
  }, [job?.id, job?.phase, job?.presentationStartedAt, presentationNow]);

  const visibleStepIndex = Math.max(0, Math.min(activeIndex, PDF_EXPORT_STEPS.length - 1));
  const activeStep = displayedPhase && !isReady && !isFailed
    ? PDF_EXPORT_STEPS[Math.min(activeIndex, PDF_EXPORT_STEPS.length - 1)]
    : null;
  const visibleStep = activeStep ?? PDF_EXPORT_STEPS[visibleStepIndex];
  const ActiveIcon = isReady ? Check : isFailed ? Download : visibleStep.icon;
  const activeTextColor = isReady
    ? 'text-emerald-600 dark:text-emerald-300'
    : isFailed
      ? 'text-destructive'
      : visibleStep.textColor;

  if (!job) {
    return (
      <Button
        type="button"
        size="sm"
        className="h-9 w-full justify-center gap-1.5 text-center text-[10px]"
        disabled={Boolean(starting) || unavailable}
        onClick={onStart}
      >
        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {starting ? t('chatWidget.report.startingPdf') : t('chatWidget.report.exportPdf')}
      </Button>
    );
  }

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-lg border border-primary/20 bg-card/95 px-2.5 py-2 shadow-sm shadow-primary/5"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current/25 bg-current/10 ${activeTextColor}`}>
          {!reduceMotion && !isReady && !isFailed && <span className="absolute inset-1 rounded border border-current/20 animate-pulse" />}
          <ActiveIcon className={`relative h-3.5 w-3.5 ${!reduceMotion && !isReady && !isFailed ? 'animate-pulse' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-semibold text-foreground">
              {isReady
                ? t('chatWidget.report.pdfReady')
                : isFailed
                  ? t('chatWidget.report.pdfFailed')
                  : t('chatWidget.report.creatingPdf', { step: activeStep ? t(`chatWidget.report.${activeStep.labelKey}`) : '' })}
            </p>
            {!isFailed && (
              <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${activeTextColor}`}>
                {isReady ? t('chatWidget.report.complete') : `${visibleStepIndex + 1}/${PDF_EXPORT_STEPS.length}`}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {isReady
              ? t('chatWidget.report.pdfReadyDescription')
              : isFailed
                ? t('chatWidget.report.pdfFailedDescription')
                : activeStep ? t(`chatWidget.report.${activeStep.descriptionKey}`) : ''}
          </p>
          {!isReady && !isFailed && <div className="mt-1.5 flex items-center gap-1" aria-label={t('chatWidget.report.pdfProgressAria')}>
            {PDF_EXPORT_STEPS.map((step, index) => {
              const complete = isReady || (!isFailed && index < activeIndex);
              const active = !isReady && !isFailed && index === activeIndex;
              return (
                <span
                  key={step.phase}
                  className={`h-1 min-w-0 flex-1 rounded-full transition-all duration-500 ${complete || active ? step.color : 'bg-muted'} ${active ? 'animate-pulse shadow-sm' : ''}`}
                />
              );
            })}
          </div>}
        </div>
      </div>

      {(isReady || isFailed) && (
        <Button
          type="button"
          size="sm"
          className="mt-2.5 h-9 w-full justify-center gap-1.5 text-center text-[10px]"
          disabled={Boolean(downloading)}
          onClick={isReady ? onDownload : onStart}
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isReady ? <Download className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {downloading
            ? t('chatWidget.report.preparingDownload')
            : isReady
              ? t('chatWidget.report.downloadPdf')
              : t('chatWidget.report.tryAgain')}
        </Button>
      )}
    </motion.section>
  );
}

export function ReportFilterAppliedBubble({ filter }: { filter: ReportChatFilter }) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const { t } = useTranslation();
  const period = filter.date_from && filter.date_to
    ? `${formatDateLabel(filter.date_from, isEnglish)} - ${formatDateLabel(filter.date_to, isEnglish)}`
    : null;

  return (
    <section className="w-full rounded-xl border border-primary-foreground/20 bg-primary px-3 py-2.5 text-primary-foreground shadow-sm shadow-primary/20">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
          <BarChart3 className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            {t('chatWidget.report.filtersApplied')}
          </p>
          {period && <p className="mt-0.5 text-[11px] leading-4 text-primary-foreground/75">{period}</p>}
        </div>
      </div>
    </section>
  );
}

function ReportDatePicker({
  value,
  disabled,
  onChange,
  open,
  onOpenChange,
}: {
  value: string;
  disabled?: (date: Date) => boolean;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const calendarLocale = isEnglish ? enUS : vi;
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full justify-between gap-2 rounded-lg border-border/70 bg-background/75 px-2.5 text-xs font-medium shadow-none hover:bg-muted/65 dark:bg-white/[0.035]"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{formatDateLabel(value, isEnglish)}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        className="z-[10020] w-auto border-border/80 bg-popover/98 p-0 shadow-2xl shadow-black/25 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1423]/98"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, 'yyyy-MM-dd'));
            onOpenChange(false);
          }}
          disabled={disabled}
          locale={calendarLocale}
          initialFocus
          className="p-3 [--cell-size:--spacing(8)]"
        />
      </PopoverContent>
    </Popover>
  );
}

function ReportFilterEditor({
  question,
  suggestedFilter,
  applying,
  onApply,
}: {
  question: string;
  suggestedFilter: ReportChatFilter;
  applying?: boolean;
  onApply: (question: string, filter: ReportChatFilter) => void;
}) {
  const { t } = useTranslation();
  const groupLabels = useAuthStore((state) => state.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const initialRange = useMemo(getCurrentMonthRange, []);
  const [dateFrom, setDateFrom] = useState(suggestedFilter.date_from || initialRange.from);
  const [dateTo, setDateTo] = useState(suggestedFilter.date_to || initialRange.to);
  const [groupId, setGroupId] = useState(suggestedFilter.group_id || 'all');
  const [subgroupId, setSubgroupId] = useState(suggestedFilter.subgroup_id || 'all');
  const [teamId, setTeamId] = useState(suggestedFilter.team_id || 'all');
  const [openDatePicker, setOpenDatePicker] = useState<'from' | 'to' | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['report-chat-groups'],
    queryFn: getReportGroups,
  });
  const { data: subgroupsData, isLoading: subgroupsLoading } = useQuery({
    queryKey: ['report-chat-subgroups', groupId],
    queryFn: () => getReportSubGroups(groupId),
    enabled: groupId !== 'all',
  });
  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['report-chat-teams', groupId, subgroupId],
    queryFn: () => getReportTeams(groupId, subgroupId),
    enabled: groupId !== 'all' && subgroupId !== 'all',
  });

  const submit = () => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setValidationError(t('chatWidget.report.invalidDateRange'));
      return;
    }
    const rangeDays = Math.floor((Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000) + 1;
    if (rangeDays > 366) {
      setValidationError(t('chatWidget.report.maxDateRange'));
      return;
    }
    setValidationError(null);
    onApply(question, {
      date_from: dateFrom,
      date_to: dateTo,
      ...(groupId !== 'all' ? { group_id: groupId } : {}),
      ...(subgroupId !== 'all' ? { subgroup_id: subgroupId } : {}),
      ...(teamId !== 'all' ? { team_id: teamId } : {}),
    });
  };

  const allAccessible = t('chatWidget.report.allAccessible');
  const pickerContentClass = 'z-[10020] max-h-[min(18rem,var(--radix-select-content-available-height))] border-border/80 bg-popover/98 shadow-2xl shadow-black/25 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1423]/98';
  const scopeTriggerClass = 'h-9 w-full rounded-lg px-2.5 shadow-none [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left';

  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 dark:bg-white/[0.02]">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1 text-[10px] font-medium text-muted-foreground">
            <span className="pl-0.5">{t('chatWidget.report.fromDate')}</span>
            <ReportDatePicker
              value={dateFrom}
              open={openDatePicker === 'from'}
              onOpenChange={(open) => setOpenDatePicker(open ? 'from' : null)}
              disabled={(date) => Boolean(dateTo && format(date, 'yyyy-MM-dd') > dateTo)}
              onChange={(nextDateFrom) => {
                setDateFrom(nextDateFrom);
                if (nextDateFrom > dateTo) setDateTo(nextDateFrom);
              }}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-[10px] font-medium text-muted-foreground">
            <span className="pl-0.5">{t('chatWidget.report.toDate')}</span>
            <ReportDatePicker
              value={dateTo}
              open={openDatePicker === 'to'}
              onOpenChange={(open) => setOpenDatePicker(open ? 'to' : null)}
              disabled={(date) => Boolean(dateFrom && format(date, 'yyyy-MM-dd') < dateFrom)}
              onChange={(nextDateTo) => {
                setDateTo(nextDateTo);
                if (nextDateTo < dateFrom) setDateFrom(nextDateTo);
              }}
            />
          </label>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="col-span-2 grid min-w-0 gap-1 text-[10px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1 pl-0.5"><Building2 className="h-3 w-3" />{labels.group}</span>
          <Select value={groupId} onValueChange={(nextGroupId) => {
            setGroupId(nextGroupId);
            setSubgroupId('all');
            setTeamId('all');
          }}>
            <SelectTrigger size="sm" className={scopeTriggerClass}><SelectValue /></SelectTrigger>
            <SelectContent side="top" align="start" sideOffset={8} collisionPadding={12} className={pickerContentClass}>
              <SelectItem value="all">{allAccessible}</SelectItem>
              {groupsData?.groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="grid min-w-0 gap-1 text-[10px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1 pl-0.5"><UsersRound className="h-3 w-3" />{labels.subgroup}</span>
          <Select value={subgroupId} onValueChange={(nextSubgroupId) => {
            setSubgroupId(nextSubgroupId);
            setTeamId('all');
          }} disabled={groupId === 'all' || subgroupsLoading}>
            <SelectTrigger size="sm" className={scopeTriggerClass}><SelectValue placeholder={groupId === 'all' ? '—' : allAccessible} /></SelectTrigger>
            <SelectContent side="top" align="start" sideOffset={8} collisionPadding={12} className={pickerContentClass}>
              <SelectItem value="all">{allAccessible}</SelectItem>
              {subgroupsData?.subgroups.map((subgroup) => <SelectItem key={subgroup.id} value={subgroup.id}>{subgroup.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="grid min-w-0 gap-1 text-[10px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1 pl-0.5"><Users className="h-3 w-3" />{labels.team}</span>
          <Select value={teamId} onValueChange={setTeamId} disabled={subgroupId === 'all' || teamsLoading}>
            <SelectTrigger size="sm" className={scopeTriggerClass}><SelectValue placeholder={subgroupId === 'all' ? '—' : allAccessible} /></SelectTrigger>
            <SelectContent side="top" align="start" sideOffset={8} collisionPadding={12} className={pickerContentClass}>
              <SelectItem value="all">{allAccessible}</SelectItem>
              {teamsData?.teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>

      {validationError && <p className="mt-2 text-[11px] leading-4 text-destructive">{validationError}</p>}
      <Button type="button" size="sm" className="mt-3 h-9 w-full justify-center gap-1.5 text-center text-[11px] shadow-sm shadow-primary/20" disabled={Boolean(applying) || groupsLoading} onClick={submit}>
        {applying || groupsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
        {t('chatWidget.report.analyze')}
        {!applying && !groupsLoading && <ArrowRight className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const KPI_ORDER = ['total_learners', 'active_learners', 'completion_rate', 'total_enrollments'] as const;
type ReportChatKpiId = typeof KPI_ORDER[number];

const KPI_TONES: Record<typeof KPI_ORDER[number], { card: string; accent: string; value: string; delta: string }> = {
  total_learners: { card: 'border-blue-500/25 bg-blue-500/[0.07] dark:bg-blue-400/[0.08]', accent: 'bg-blue-500', value: 'text-blue-700 dark:text-blue-300', delta: 'bg-blue-500/[0.11] text-blue-700 dark:text-blue-300' },
  active_learners: { card: 'border-emerald-500/25 bg-emerald-500/[0.07] dark:bg-emerald-400/[0.08]', accent: 'bg-emerald-500', value: 'text-emerald-700 dark:text-emerald-300', delta: 'bg-emerald-500/[0.11] text-emerald-700 dark:text-emerald-300' },
  completion_rate: { card: 'border-violet-500/25 bg-violet-500/[0.07] dark:bg-violet-400/[0.08]', accent: 'bg-violet-500', value: 'text-violet-700 dark:text-violet-300', delta: 'bg-violet-500/[0.11] text-violet-700 dark:text-violet-300' },
  total_enrollments: { card: 'border-amber-500/25 bg-amber-500/[0.07] dark:bg-amber-400/[0.08]', accent: 'bg-amber-500', value: 'text-amber-700 dark:text-amber-300', delta: 'bg-amber-500/[0.11] text-amber-700 dark:text-amber-300' },
};

function getMetric(snapshot: ReportSnapshotV2, id: typeof KPI_ORDER[number]): ReportMetricFact | null {
  return snapshot.factual_metrics.find((metric): metric is ReportMetricFact => metric.id === id) ?? null;
}

function formatMetricValue(metric: ReportMetricFact, isEnglish: boolean): string {
  const value = new Intl.NumberFormat(isEnglish ? 'en-US' : 'vi-VN', {
    maximumFractionDigits: metric.unit === 'percentage' ? 1 : 0,
  }).format(metric.current);
  return metric.unit === 'percentage' ? `${value}%` : value;
}

function metricTitle(id: typeof KPI_ORDER[number], t: TFunction): string {
  const titleKey: Record<typeof KPI_ORDER[number], string> = {
    total_learners: 'totalLearners',
    active_learners: 'activeLearners',
    completion_rate: 'completionRate',
    total_enrollments: 'totalEnrollments',
  };
  return t(`chatWidget.report.${titleKey[id]}`);
}

function comparisonDisplay(snapshot: ReportSnapshotV2, isEnglish: boolean): { title: string; dateLabel: string; deltaSuffix: string } {
  const locale = isEnglish ? 'en' : 'vi';
  const stored = snapshot.comparison_display?.[locale];
  if (stored) return { title: stored.title, dateLabel: stored.date_label, deltaSuffix: stored.delta_suffix };
  const fallback = isEnglish
    ? {
      calendar_month: ['Compared with previous month', 'vs previous month'], month_to_date: ['Compared with same elapsed period last month', 'vs same elapsed period last month'], calendar_week: ['Compared with previous week', 'vs previous week'], year_to_date: ['Compared with same period last year', 'vs same period last year'], calendar_year: ['Compared with previous year', 'vs previous year'], equal_length: ['Compared with immediately preceding period', 'vs immediately preceding period'],
    }
    : {
      calendar_month: ['So sánh với tháng trước', 'so với tháng trước'], month_to_date: ['So sánh với cùng giai đoạn tháng trước', 'so với cùng giai đoạn tháng trước'], calendar_week: ['So sánh với tuần trước', 'so với tuần trước'], year_to_date: ['So sánh cùng kỳ năm trước', 'so với cùng kỳ năm trước'], calendar_year: ['So sánh với năm trước', 'so với năm trước'], equal_length: ['So sánh với giai đoạn liền trước', 'so với giai đoạn liền trước'],
    } as const;
  const [title, deltaSuffix] = fallback[snapshot.comparison.basis as keyof typeof fallback] ?? fallback.equal_length;
  return {
    title,
    dateLabel: `${formatDateLabel(snapshot.comparison.date_from, isEnglish)} - ${formatDateLabel(snapshot.comparison.date_to, isEnglish)}`,
    deltaSuffix,
  };
}

function metricDifference(metric: ReportMetricFact): number | null {
  return metric.unit === 'percentage' ? metric.delta_percentage_points : metric.delta_absolute;
}

function metricDelta(metric: ReportMetricFact, isEnglish: boolean, t: TFunction, deltaSuffix: string): string {
  if (metric.previous === null || metric.delta_absolute === null) {
    return t('chatWidget.report.noComparison');
  }
  const difference = metricDifference(metric);
  if (difference === null || difference === 0) {
    return t('chatWidget.report.noChange', { suffix: deltaSuffix });
  }
  const formatted = new Intl.NumberFormat(isEnglish ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 }).format(Math.abs(difference));
  const suffix = metric.unit === 'percentage'
    ? t('chatWidget.report.percentagePoints')
    : '';
  const direction = difference > 0
    ? t('chatWidget.report.increase')
    : t('chatWidget.report.decrease');
  return t('chatWidget.report.deltaFromPrevious', { direction, value: formatted, unit: suffix, suffix: deltaSuffix });
}

function signalLabel(signal: ReportAnalyticsSignal, t: TFunction): string {
  const evidence = signal.evidence;
  switch (signal.id) {
    case 'enrollment_period_change':
      return t('chatWidget.report.signalEnrollmentChange');
    case 'completion_decline':
      return t('chatWidget.report.signalCompletionDecline');
    case 'high_enrollment_low_completion':
      return evidence.course_name
        ? t('chatWidget.report.signalCourseCompletionReview', { course: courseReference(evidence.course_name, t) })
        : t('chatWidget.report.signalGenericCourseCompletionReview');
    case 'end_period_activity_drop':
      return t('chatWidget.report.signalActivityDrop');
    default:
      return t('chatWidget.report.signalGeneric');
  }
}

function courseReference(course: string, t: TFunction): string {
  return t('chatWidget.report.courseReference', { course });
}

function scopeSummary(snapshot: ReportSnapshotV2, t: TFunction): string {
  const labels = [
    snapshot.scope_display?.group_name,
    snapshot.scope_display?.subgroup_name,
    snapshot.scope_display?.team_name,
  ].filter((value): value is string => Boolean(value));
  return labels.length > 0
    ? labels.join(' / ')
    : t('chatWidget.report.allAccessibleScope');
}

function SnapshotKpiGrid({ snapshot, onSelectMetric }: { snapshot: ReportSnapshotV2; onSelectMetric: (metricId: ReportChatKpiId) => void }) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const { t } = useTranslation();
  const comparison = comparisonDisplay(snapshot, isEnglish);
  return (
    <div className="grid grid-cols-2 gap-2">
      {KPI_ORDER.map((id) => {
        const metric = getMetric(snapshot, id);
        if (!metric) return null;
        const tone = KPI_TONES[id];
        const difference = metricDifference(metric);
        const DeltaIcon = difference && difference > 0 ? ArrowUpRight : difference && difference < 0 ? ArrowDownRight : null;
        return (
          <button
            key={id}
            type="button"
            className={`relative min-w-0 overflow-hidden rounded-lg border p-2.5 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${tone.card}`}
            onClick={() => onSelectMetric(id)}
            aria-label={metricTitle(id, t)}
          >
            <span className={`absolute inset-x-0 top-0 h-0.5 ${tone.accent}`} aria-hidden="true" />
            <p className="min-h-8 text-[10px] font-medium leading-4 text-muted-foreground">{metricTitle(id, t)}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums tracking-normal ${tone.value}`}>{formatMetricValue(metric, isEnglish)}</p>
            <p className={`mt-1 inline-flex max-w-full items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-medium leading-3 ${tone.delta}`}>
              {DeltaIcon && <DeltaIcon className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span className="truncate">{metricDelta(metric, isEnglish, t, comparison.deltaSuffix)}</span>
            </p>
          </button>
        );
      })}
    </div>
  );
}

function executiveFindings(snapshot: ReportSnapshotV2, isEnglish: boolean, t: TFunction): string[] {
  const comparison = comparisonDisplay(snapshot, isEnglish);
  const findingKeys: Array<[typeof KPI_ORDER[number], string]> = [
    ['completion_rate', 'findingCompletion'],
    ['total_enrollments', 'findingEnrollment'],
    ['active_learners', 'findingActiveLearners'],
  ];
  return findingKeys.flatMap(([metricId, key]) => {
    const metric = getMetric(snapshot, metricId);
    return metric && metricDifference(metric) !== null && metricDifference(metric) !== 0
      ? [t(`chatWidget.report.${key}`, { delta: metricDelta(metric, isEnglish, t, comparison.deltaSuffix) })]
      : [];
  }).slice(0, 3);
}

function SnapshotInsights({ snapshot }: { snapshot: ReportSnapshotV2 }) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const { t } = useTranslation();
  const findings = executiveFindings(snapshot, isEnglish, t);
  const attention = snapshot.signals.find((signal) => signal.severity === 'attention' || signal.severity === 'warning');
  if (findings.length === 0 && !attention) return null;
  return (
    <div className="mt-3 space-y-2.5">
      {findings.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">{t('chatWidget.report.keyInsights')}</p>
          <ul className="space-y-1 text-[11px] leading-4 text-foreground">
            {findings.map((finding) => <li key={finding} className="flex gap-2"><span className="text-primary">•</span><span>{finding}</span></li>)}
          </ul>
        </div>
      )}
      {attention && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 dark:bg-amber-400/[0.06]">
          <p className="text-[10px] font-semibold uppercase tracking-normal text-amber-700 dark:text-amber-300">{t('chatWidget.report.attentionItems')}</p>
          <p className="mt-1 text-[11px] leading-4 text-foreground">{signalLabel(attention, t)}</p>
        </div>
      )}
    </div>
  );
}

type CourseListTone = 'enrollment' | 'attention' | 'completion';

const COURSE_LIST_TONES: Record<CourseListTone, { section: string; accent: string; card: string; label: string }> = {
  enrollment: { section: 'border-blue-500/25 bg-blue-500/[0.055]', accent: 'bg-blue-500', card: 'border-blue-500/20 bg-blue-500/[0.07]', label: 'text-blue-700 dark:text-blue-300' },
  attention: { section: 'border-amber-500/25 bg-amber-500/[0.055]', accent: 'bg-amber-500', card: 'border-amber-500/20 bg-amber-500/[0.07]', label: 'text-amber-700 dark:text-amber-300' },
  completion: { section: 'border-emerald-500/25 bg-emerald-500/[0.055]', accent: 'bg-emerald-500', card: 'border-emerald-500/20 bg-emerald-500/[0.07]', label: 'text-emerald-700 dark:text-emerald-300' },
};

function CourseRows({ courses, title, tone }: { courses: NonNullable<ReportSnapshotV2['course_portfolio']>; title: string; tone: CourseListTone }) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const { t } = useTranslation();
  if (courses.length === 0) return null;
  const style = COURSE_LIST_TONES[tone];
  const formatCount = (value: number) => new Intl.NumberFormat(isEnglish ? 'en-US' : 'vi-VN').format(value);
  const formatRate = (value: number) => new Intl.NumberFormat(isEnglish ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 }).format(value);
  return (
    <section className={`overflow-hidden rounded-lg border ${style.section}`}>
      <p className={`flex items-center gap-2 border-b border-current/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-normal ${style.label}`}><span className={`h-1.5 w-1.5 rounded-full ${style.accent}`} aria-hidden="true" />{title}</p>
      <div className="space-y-1.5 pt-2.5">
        {courses.map((course) => (
          <div key={course.course_id} className={`relative mx-2.5 mb-2.5 overflow-hidden rounded-md border px-3 py-2.5 ${style.card}`}>
            <span className={`absolute inset-y-0 left-0 w-0.5 ${style.accent}`} aria-hidden="true" />
            <p className="line-clamp-2 pl-1 text-sm font-semibold leading-5 text-foreground">{course.name}</p>
            <p className="mt-1 pl-1 text-[11px] font-medium leading-4 text-muted-foreground">{t('chatWidget.report.enrollmentCompletion', { enrollments: formatCount(course.total_enrollments), completion: formatRate(course.completion_rate) })}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SnapshotDetails({ snapshot }: { snapshot: ReportSnapshotV2 }) {
  const { t } = useTranslation();
  const attentionSignals = snapshot.signals.filter((signal) => signal.severity === 'attention' || signal.severity === 'warning');
  const portfolio = snapshot.course_portfolio ?? [];
  const topCourses = [...portfolio].sort((left, right) => right.total_enrollments - left.total_enrollments).slice(0, 3);
  const highCompletion = [...portfolio].filter((course) => course.total_enrollments >= 3 && course.completion_rate >= 80).sort((left, right) => right.completion_rate - left.completion_rate).slice(0, 3);
  const attentionCourseIds = new Set(attentionSignals.map((signal) => signal.evidence.course_id).filter((id): id is string => Boolean(id)));
  const attentionCourses = portfolio.filter((course) => attentionCourseIds.has(course.course_id)).slice(0, 3);
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-2.5 dark:bg-white/[0.02]">
      <CourseRows courses={topCourses} title={t('chatWidget.report.topEnrollmentCourses')} tone="enrollment" />
      <CourseRows courses={attentionCourses} title={t('chatWidget.report.attentionCourses')} tone="attention" />
      <CourseRows courses={highCompletion} title={t('chatWidget.report.highCompletionCourses')} tone="completion" />
    </div>
  );
}

export function ReportChatLoadingCard({ status }: { status: ReportStreamStatus }) {
  const { t } = useTranslation();
  const isCollecting = status === 'collecting';
  const steps = [
    t('chatWidget.report.checkingAccess'),
    t('chatWidget.report.preparingAnalysis'),
  ];
  const activeIndex = isCollecting ? 0 : 1;
  return (
    <motion.section
      initial={{ opacity: 0, y: 4, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="w-full max-w-[760px] overflow-hidden rounded-xl border border-primary/20 bg-card px-3 py-3 shadow-md shadow-primary/5"
      aria-live="polite"
    >
      <div className="flex min-w-0 gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <span className="absolute inset-1 rounded-md border border-primary/20 animate-pulse" />
          <BarChart3 className="relative h-4 w-4 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-semibold text-foreground">{t('chatWidget.report.preparingReport')}</p>
            <span className="text-[10px] font-semibold text-primary">{activeIndex + 1}/2</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{steps[activeIndex]}</p>
          <div className="mt-2 flex gap-1.5">
            {steps.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= activeIndex ? 'bg-primary animate-pulse' : 'bg-muted'}`} />)}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export function ReportChatCard({
  attachment,
  messageId,
  applying,
  starting,
  downloading,
  pdfExportJob,
  onApply,
  onStartPdfExport,
  onDownloadPdfExport,
  children,
}: {
  attachment: ReportChatAttachment;
  messageId: string;
  applying?: boolean;
  starting?: boolean;
  downloading?: boolean;
  pdfExportJob?: ReportPdfExportJob | null;
  onApply: (question: string, filter: ReportChatFilter) => void;
  onStartPdfExport: (messageId: string) => void;
  onDownloadPdfExport: (messageId: string) => void;
  children: ReactNode;
}) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const groupLabels = useAuthStore((state) => state.groupLabels);
  const [editingFilter, setEditingFilter] = useState(attachment.kind === 'filter');
  const [expanded, setExpanded] = useState(false);
  const [detailView, setDetailView] = useState<ReportDetailView | null>(null);
  const [selectedKpiMetric, setSelectedKpiMetric] = useState<ReportChatKpiId | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  useEffect(() => {
    setDetailView(null);
    setSelectedKpiMetric(null);
  }, [messageId]);
  const snapshot = attachment.kind === 'analysis' ? attachment.snapshot : null;
  const hasReportData = attachment.kind !== 'analysis'
    || (snapshot ? snapshot.availability.state === 'available' : attachment.hasData);
  const dateLabel = attachment.kind === 'analysis' && attachment.filter.date_from && attachment.filter.date_to
    ? `${formatDateLabel(attachment.filter.date_from, isEnglish)} — ${formatDateLabel(attachment.filter.date_to, isEnglish)}`
    : null;
  const scopeLabel = snapshot ? scopeSummary(snapshot, t) : null;
  const isLearnerPlus = user?.role === 'learner_plus';
  const exportGroupLabels = getGroupLabelSet(groupLabels);
  const canExportExcel = attachment.kind === 'analysis'
    && hasReportData
    && Boolean(attachment.filter.date_from && attachment.filter.date_to);

  const handleExportExcel = async () => {
    if (attachment.kind !== 'analysis' || !canExportExcel || exportingExcel) return;

    setExportingExcel(true);
    try {
      await exportReportExcel({
        dateFrom: attachment.filter.date_from!,
        dateTo: attachment.filter.date_to!,
        selectedGroupId: attachment.filter.group_id || 'all',
        selectedSubGroupId: attachment.filter.subgroup_id || 'all',
        selectedTeamId: attachment.filter.team_id || 'all',
        groupLabel: exportGroupLabels.group,
        subgroupLabel: exportGroupLabels.subgroup,
        teamLabel: exportGroupLabels.team,
      });
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <section className="w-full overflow-hidden rounded-xl border border-primary/20 bg-card shadow-md shadow-primary/5">
      <div className="border-b border-primary/10 bg-primary/[0.045] px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            {attachment.kind === 'analysis' ? <BarChart3 className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-foreground">
                {attachment.kind === 'analysis'
                  ? t('chatWidget.report.learningAnalysis')
                  : t('chatWidget.report.filterTitle')}
              </p>
            </div>
            {dateLabel && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{dateLabel}</p>}
            {scopeLabel && <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">{scopeLabel}</p>}
          </div>
        </div>
      </div>
      {snapshot ? (
        <div className="px-3 py-3">
          {snapshot.availability.state === 'available' ? (
            <>
              <SnapshotKpiGrid snapshot={snapshot} onSelectMetric={setSelectedKpiMetric} />
              <SnapshotInsights snapshot={snapshot} />
              {expanded && <SnapshotDetails snapshot={snapshot} />}
            </>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-3 text-[11px] leading-5 text-muted-foreground dark:bg-white/[0.02]">
              {snapshot.availability.state === 'no_accessible_scope'
                ? t('chatWidget.report.noAccessibleScope')
                : t('chatWidget.report.noData')}
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2.5 text-sm leading-6 text-foreground">{children}</div>
      )}
      {attachment.kind === 'filter' ? (
        <div className="px-3 pb-3">
          <ReportFilterEditor question={attachment.question} suggestedFilter={attachment.suggestedFilter} applying={applying} onApply={onApply} />
        </div>
      ) : (
        <div className="border-t border-border/70 px-3 py-2.5">
          <div className={`grid gap-2 ${hasReportData ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Button type="button" variant="outline" size="sm" className="h-9 min-w-0 w-full justify-center gap-1.5 px-2 text-center text-[10px]" onClick={() => setEditingFilter((value) => !value)}>
              <Filter className="h-3.5 w-3.5" />
              {hasReportData
                ? t('chatWidget.report.changeFilters')
                : t('chatWidget.report.filters')}
            </Button>
            {hasReportData && <Button type="button" variant="outline" size="sm" className="h-9 min-w-0 w-full justify-center gap-1.5 px-2 text-center text-[10px]" onClick={() => setExpanded((value) => !value)}><BarChart3 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{expanded ? t('chatWidget.report.collapseAnalysis') : t('chatWidget.report.viewDetails')}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} /></Button>}
            {hasReportData && <Button type="button" variant="outline" size="sm" className="h-9 min-w-0 w-full justify-center gap-1.5 px-2 text-center text-[10px]" onClick={() => setDetailView('course-ranking')}>
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('chatWidget.report.viewCourseRanking')}</span>
              </Button>}
            {hasReportData && <Button type="button" variant="outline" size="sm" className="h-9 min-w-0 w-full justify-center gap-1.5 px-2 text-center text-[10px]" onClick={() => setDetailView('learners')}>
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('chatWidget.report.viewLearners')}</span>
              </Button>}
          </div>
          {!isLearnerPlus && (
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                className="h-9 w-full justify-center gap-1.5 text-center text-[10px]"
                disabled={!canExportExcel || exportingExcel}
                onClick={handleExportExcel}
              >
                {exportingExcel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exportingExcel ? t('chatWidget.report.exportingExcel') : t('chatWidget.report.exportExcel')}
              </Button>
            </div>
          )}
          <AnimatePresence initial={false}>
            {editingFilter && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <ReportFilterEditor question={attachment.question} suggestedFilter={attachment.filter} applying={applying} onApply={onApply} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {attachment.kind === 'analysis' && (
        <ReportDetailModal
          filter={attachment.filter}
          open={detailView !== null}
          view={detailView}
          onOpenChange={(open) => { if (!open) setDetailView(null); }}
        />
      )}
      {attachment.kind === 'analysis' && snapshot && attachment.filter.date_from && attachment.filter.date_to && (
        <ReportMetricTrendModal
          metricKey={selectedKpiMetric}
          title={selectedKpiMetric ? metricTitle(selectedKpiMetric, t) : ''}
          isOpen={selectedKpiMetric !== null}
          onClose={() => setSelectedKpiMetric(null)}
          groupId={attachment.filter.group_id || 'all'}
          subgroupId={attachment.filter.subgroup_id || 'all'}
          teamId={attachment.filter.team_id || 'all'}
          dateFrom={attachment.filter.date_from}
          dateTo={attachment.filter.date_to}
          dateLabel={dateLabel || ''}
          layerAboveChat
        />
      )}
    </section>
  );
}
