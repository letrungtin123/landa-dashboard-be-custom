import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { ArrowRight, BarChart3, Building2, CalendarDays, Check, ChevronDown, Download, FileText, Filter, Loader2, ShieldCheck, Sparkles, Users, UsersRound } from 'lucide-react';
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
import type { ReportChatFilter, ReportPdfExportJob, ReportPdfExportPhase } from '@/api/custom-chat';
import { useAuthStore } from '@/utils/store';
import { getGroupLabelSet } from '@/utils/group-labels';
import { useLocaleStore } from '@/utils/locale-store';

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
  labelVi: string;
  labelEn: string;
  vi: string;
  en: string;
  color: string;
  textColor: string;
}> = [
  { phase: 'validating', icon: ShieldCheck, labelVi: 'Kiểm tra', labelEn: 'Check', vi: 'Đang kiểm tra số liệu và phạm vi báo cáo', en: 'Checking report data and scope', color: 'bg-sky-500', textColor: 'text-sky-600 dark:text-sky-300' },
  { phase: 'narrative', icon: Sparkles, labelVi: 'Phân tích', labelEn: 'Analyze', vi: 'Đang tổng hợp nhận định từ số liệu', en: 'Creating insights from the data', color: 'bg-violet-500', textColor: 'text-violet-600 dark:text-violet-300' },
  { phase: 'rendering', icon: FileText, labelVi: 'Tạo PDF', labelEn: 'Create PDF', vi: 'Đang hoàn thiện PDF và biểu đồ', en: 'Finalizing the PDF and charts', color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-300' },
];

function getPdfExportPhaseIndex(phase: ReportPdfExportPhase): number {
  if (phase === 'narrative') return 1;
  if (phase === 'rendering') return 2;
  if (phase === 'ready') return PDF_EXPORT_STEPS.length;
  return 0;
}

function ReportPdfExportProgress({
  job,
  starting,
  downloading,
  unavailable,
  onStart,
  onDownload,
}: {
  job?: ReportPdfExportJob | null;
  starting?: boolean;
  downloading?: boolean;
  unavailable?: boolean;
  onStart: () => void;
  onDownload: () => void;
}) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const reduceMotion = useReducedMotion();
  const isReady = job?.phase === 'ready';
  const isFailed = job?.phase === 'failed';
  const activeIndex = job ? getPdfExportPhaseIndex(job.phase) : -1;
  const visibleStepIndex = Math.max(0, Math.min(activeIndex, PDF_EXPORT_STEPS.length - 1));
  const activeStep = job && !isReady && !isFailed
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
        className="h-8 justify-center gap-1.5 text-center text-[11px]"
        disabled={Boolean(starting) || unavailable}
        onClick={onStart}
      >
        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {starting ? (isEnglish ? 'Starting PDF export' : 'Đang khởi tạo PDF') : (isEnglish ? 'Export PDF' : 'Xuất PDF')}
      </Button>
    );
  }

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="relative mt-2 overflow-hidden rounded-lg border border-primary/20 bg-card/95 px-3 py-3 shadow-md shadow-primary/5"
      aria-live="polite"
    >
      <div className="flex min-w-0 gap-3">
        <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current/25 bg-current/10 ${activeTextColor}`}>
          {!reduceMotion && !isReady && !isFailed && <span className="absolute inset-1 rounded-md border border-current/20 animate-pulse" />}
          <ActiveIcon className={`relative h-4 w-4 ${!reduceMotion && !isReady && !isFailed ? 'animate-pulse' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-semibold text-foreground">
              {isReady
                ? (isEnglish ? 'PDF report is ready' : 'Báo cáo PDF đã sẵn sàng')
                : isFailed
                  ? (isEnglish ? 'Could not create the PDF report' : 'Chưa thể tạo báo cáo PDF')
                  : (isEnglish ? `Creating report: ${activeStep?.labelEn}` : `Đang tạo báo cáo: ${activeStep?.labelVi}`)}
            </p>
            {!isFailed && (
              <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${activeTextColor}`}>
                {isReady ? (isEnglish ? 'Complete' : 'Hoàn tất') : `${visibleStepIndex + 1}/${PDF_EXPORT_STEPS.length}`}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {isReady
              ? (isEnglish ? 'The PDF and charts are ready to download.' : 'Tệp PDF và biểu đồ đã sẵn sàng để tải xuống.')
              : isFailed
                ? (isEnglish ? 'No file was created. You can try again.' : 'Chưa có tệp nào được tạo. Bạn có thể thử lại.')
                : (isEnglish ? activeStep?.en : activeStep?.vi)}
          </p>
          <div className="mt-2 flex items-center gap-1.5" aria-label={isEnglish ? 'PDF report creation progress' : 'Tiến trình tạo báo cáo PDF'}>
            {PDF_EXPORT_STEPS.map((step, index) => {
              const complete = isReady || (!isFailed && index < activeIndex);
              const active = !isReady && !isFailed && index === activeIndex;
              return (
                <span
                  key={step.phase}
                  className={`h-1.5 min-w-0 flex-1 rounded-full transition-all duration-500 ${complete || active ? step.color : 'bg-muted'} ${active ? 'animate-pulse shadow-sm' : ''}`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1" aria-hidden="true">
            {PDF_EXPORT_STEPS.map((step, index) => {
              const complete = isReady || (!isFailed && index < activeIndex);
              const active = !isReady && !isFailed && index === activeIndex;
              return (
                <span key={step.phase} className={`min-w-0 truncate text-[9px] font-medium transition-colors ${complete || active ? step.textColor : 'text-muted-foreground/55'}`}>
                  <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${complete || active ? step.color : 'bg-muted-foreground/30'}`} />
                  {isEnglish ? step.labelEn : step.labelVi}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {(isReady || isFailed) && (
        <Button
          type="button"
          size="sm"
          className="mt-2.5 h-8 w-full justify-center gap-1.5 text-center text-[11px]"
          disabled={Boolean(downloading)}
          onClick={isReady ? onDownload : onStart}
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isReady ? <Download className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {downloading
            ? (isEnglish ? 'Preparing download' : 'Đang chuẩn bị tải xuống')
            : isReady
              ? (isEnglish ? 'Download PDF report' : 'Tải báo cáo PDF')
              : (isEnglish ? 'Try again' : 'Thử lại')}
        </Button>
      )}
    </motion.section>
  );
}

export function ReportFilterAppliedBubble({ filter }: { filter: ReportChatFilter }) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
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
            {isEnglish ? 'Report filters applied' : 'Đã áp dụng bộ lọc báo cáo'}
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
}: {
  value: string;
  disabled?: (date: Date) => boolean;
  onChange: (value: string) => void;
}) {
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const calendarLocale = isEnglish ? enUS : vi;
  const selected = value ? parseISO(value) : undefined;
  const [open, setOpen] = useState(false);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
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
            setOpen(false);
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
  const locale = useLocaleStore((state) => state.locale);
  const isEnglish = locale === 'en';
  const groupLabels = useAuthStore((state) => state.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const initialRange = useMemo(getCurrentMonthRange, []);
  const [dateFrom, setDateFrom] = useState(suggestedFilter.date_from || initialRange.from);
  const [dateTo, setDateTo] = useState(suggestedFilter.date_to || initialRange.to);
  const [groupId, setGroupId] = useState(suggestedFilter.group_id || 'all');
  const [subgroupId, setSubgroupId] = useState(suggestedFilter.subgroup_id || 'all');
  const [teamId, setTeamId] = useState(suggestedFilter.team_id || 'all');
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
      setValidationError(isEnglish ? 'Select a valid date range.' : 'Vui lòng chọn khoảng thời gian hợp lệ.');
      return;
    }
    const rangeDays = Math.floor((Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000) + 1;
    if (rangeDays > 366) {
      setValidationError(isEnglish ? 'The reporting period can be up to 366 days.' : 'Khoảng thời gian báo cáo tối đa là 366 ngày.');
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

  const allAccessible = isEnglish ? 'All' : 'Tất cả';
  const pickerContentClass = 'z-[10020] max-h-[min(18rem,var(--radix-select-content-available-height))] border-border/80 bg-popover/98 shadow-2xl shadow-black/25 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1423]/98';
  const scopeTriggerClass = 'h-9 w-full rounded-lg px-2.5 shadow-none [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left';

  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 dark:bg-white/[0.02]">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1 text-[10px] font-medium text-muted-foreground">
            <span className="pl-0.5">{isEnglish ? 'From' : 'Từ ngày'}</span>
            <ReportDatePicker
              value={dateFrom}
              disabled={(date) => Boolean(dateTo && format(date, 'yyyy-MM-dd') > dateTo)}
              onChange={(nextDateFrom) => {
                setDateFrom(nextDateFrom);
                if (nextDateFrom > dateTo) setDateTo(nextDateFrom);
              }}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-[10px] font-medium text-muted-foreground">
            <span className="pl-0.5">{isEnglish ? 'To' : 'Đến ngày'}</span>
            <ReportDatePicker
              value={dateTo}
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
        {isEnglish ? 'Analyze report' : 'Phân tích báo cáo'}
        {!applying && !groupsLoading && <ArrowRight className="h-3.5 w-3.5" />}
      </Button>
    </div>
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
  const [editingFilter, setEditingFilter] = useState(attachment.kind === 'filter');
  const hasReportData = attachment.kind !== 'analysis' || attachment.hasData;
  const dateLabel = attachment.kind === 'analysis' && attachment.filter.date_from && attachment.filter.date_to
    ? `${formatDateLabel(attachment.filter.date_from, isEnglish)} — ${formatDateLabel(attachment.filter.date_to, isEnglish)}`
    : null;

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
                  ? (isEnglish ? 'Report analysis' : 'Phân tích báo cáo')
                  : (isEnglish ? 'Report filters' : 'Bộ lọc báo cáo')}
              </p>
            </div>
            {dateLabel && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{dateLabel}</p>}
          </div>
        </div>
      </div>
      <div className="px-3 py-2.5 text-sm leading-6 text-foreground">{children}</div>
      {attachment.kind === 'filter' ? (
        <div className="px-3 pb-3">
          <ReportFilterEditor question={attachment.question} suggestedFilter={attachment.suggestedFilter} applying={applying} onApply={onApply} />
        </div>
      ) : (
        <div className="border-t border-border/70 px-3 py-2.5">
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 justify-center gap-1.5 text-center text-[11px]" onClick={() => setEditingFilter((value) => !value)}>
              <Filter className="h-3.5 w-3.5" />
              {hasReportData
                ? (isEnglish ? 'Change filters' : 'Đổi bộ lọc')
                : (isEnglish ? 'Filters' : 'Bộ lọc')}
            </Button>
            {!pdfExportJob && (
              <div className="shrink-0">
                <ReportPdfExportProgress
                  starting={starting}
                  downloading={downloading}
                  unavailable={!hasReportData}
                  onStart={() => onStartPdfExport(messageId)}
                  onDownload={() => onDownloadPdfExport(messageId)}
                />
              </div>
            )}
          </div>
          {pdfExportJob && (
            <div className="mt-2">
              <ReportPdfExportProgress
                job={pdfExportJob}
                downloading={downloading}
                onStart={() => onStartPdfExport(messageId)}
                onDownload={() => onDownloadPdfExport(messageId)}
              />
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
    </section>
  );
}
