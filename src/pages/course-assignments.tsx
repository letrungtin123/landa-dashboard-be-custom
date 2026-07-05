import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ElementType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  GraduationCap,
  Loader2,
  MessageSquareText,
  Paperclip,
  Search,
  Send,
  Sparkles,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { customApiClient } from '@/api/custom-client';
import { useAuthStore } from '@/utils/store';
import { getRoleLabel } from '@/utils/role-labels';
import { cn } from '@/utils/utils';
import {
  getCourseAssignments,
  getCourseAssignmentSubmissions,
  sendAssignmentFeedback,
  type AssignmentFileMeta,
  type AssignmentSubmission,
} from '@/api/custom-assignments';

const MAX_FEEDBACK_FILES = 5;

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value?: number): string {
  if (!value) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function displayLearner(submission: AssignmentSubmission): string {
  return submission.learner_name || submission.learner_username || submission.learner_email || 'Học viên';
}

function displayFeedbackBy(submission: AssignmentSubmission): string {
  return submission.feedback_by_name || submission.feedback_by_username || submission.feedback_by_email || '-';
}

function statusBadge(status: AssignmentSubmission['status']) {
  if (status === 'feedback_given') {
    return (
      <Badge className="gap-1.5 border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Đã feedback
      </Badge>
    );
  }
  if (status === 'not_submitted') {
    return (
      <Badge variant="outline" className="gap-1.5 border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        <Clock3 className="h-3.5 w-3.5" />
        Chưa nộp
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
      <Clock3 className="h-3.5 w-3.5" />
      Đã nộp
    </Badge>
  );
}

async function downloadPrivateFile(file: AssignmentFileMeta) {
  const response = await customApiClient.get(file.download_url, { responseType: 'blob' });
  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.original_name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function FileList({ files, compact = false }: { files: AssignmentFileMeta[]; compact?: boolean }) {
  if (!files.length) return <span className="text-xs text-muted-foreground">Không có file</span>;
  return (
    <div className={cn('flex flex-wrap gap-1.5', !compact && 'max-w-[260px]')}>
      {files.map((file) => (
        <Button
          key={file.id}
          variant="outline"
          size="sm"
          className="h-8 max-w-[240px] justify-start gap-1.5 rounded-lg border-border bg-background px-2.5 text-xs shadow-sm hover:border-primary/40 hover:bg-primary/5"
          onClick={() => downloadPrivateFile(file).catch(() => toast.error('Không thể tải file'))}
        >
          <Download className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{file.original_name}</span>
        </Button>
      ))}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: ElementType; label: string; value: number | string; tone: 'primary' | 'success' | 'muted' }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            tone === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none text-foreground">{value}</div>
          <div className="mt-1 truncate text-xs font-medium text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default function CourseAssignmentsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const queryClient = useQueryClient();
  const roleLabels = useAuthStore((s) => s.roleLabels);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [feedbackTarget, setFeedbackTarget] = useState<AssignmentSubmission | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const assignmentsQuery = useQuery({
    queryKey: ['course-assignments', courseId],
    queryFn: () => getCourseAssignments(courseId!),
    enabled: !!courseId,
    staleTime: 30_000,
  });

  const submissionsQuery = useQuery({
    queryKey: ['course-assignment-submissions', courseId, page, limit, debouncedSearch, assignmentFilter, statusFilter],
    queryFn: () => getCourseAssignmentSubmissions(courseId!, {
      page,
      page_size: limit,
      search: debouncedSearch || undefined,
      assignment_id: assignmentFilter === 'all' ? undefined : assignmentFilter,
      status: statusFilter === 'all' ? undefined : statusFilter as 'not_submitted' | 'submitted' | 'feedback_given',
    }),
    enabled: !!courseId,
    placeholderData: (previous) => previous,
  });

  const submissions = submissionsQuery.data?.data || [];
  const assignments = assignmentsQuery.data || [];
  const courseName = submissions[0]?.course_name || assignments[0]?.course_id || courseId || '';
  const selectedAssignment = useMemo(
    () => assignments.find(item => item.id === assignmentFilter),
    [assignments, assignmentFilter],
  );
  const submittedCount = assignments.reduce((sum, item) => sum + (item.submitted_count || 0), 0);
  const feedbackCount = assignments.reduce((sum, item) => sum + (item.feedback_count || 0), 0);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        icon={ClipboardList}
        title="Bài tập"
        description={selectedAssignment?.title || courseName}
        actions={
          <Button variant="outline" asChild className="gap-2">
            <Link to="/courses">
              <ArrowLeft className="h-4 w-4" />
              Khóa học
            </Link>
          </Button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <StatTile icon={ClipboardList} label="Số bài tập" value={assignments.length} tone="primary" />
        <StatTile icon={FileCheck2} label="Lượt đã nộp" value={submittedCount} tone="muted" />
        <StatTile icon={MessageSquareText} label="Đã feedback" value={feedbackCount} tone="success" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.04 }}
        className="rounded-xl border bg-card p-3 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Bộ lọc
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Tìm học viên..."
              className="pl-9"
            />
          </div>
          <Select value={assignmentFilter} onValueChange={(value) => { setAssignmentFilter(value); setPage(1); }}>
            <SelectTrigger className="w-full md:w-[260px]">
              <SelectValue placeholder="Bài tập" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả bài tập</SelectItem>
              {assignments.map((assignment) => (
                <SelectItem key={assignment.id} value={assignment.id}>{assignment.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
            <SelectTrigger className="w-full md:w-[190px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="not_submitted">Chưa nộp</SelectItem>
              <SelectItem value="submitted">Đã nộp</SelectItem>
              <SelectItem value="feedback_given">Đã feedback</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.08 }}
        className="overflow-hidden rounded-xl border bg-card shadow-sm"
      >
        <div className="hidden overflow-x-auto lg:block">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="min-w-[220px]">Học viên</TableHead>
                <TableHead className="min-w-[120px]">Vai trò</TableHead>
                <TableHead className="min-w-[260px]">Bài tập</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="min-w-[130px]">Đã nộp</TableHead>
                <TableHead className="min-w-[140px]">Đã feedback</TableHead>
                <TableHead className="min-w-[160px]">Feedback bởi</TableHead>
                <TableHead className="min-w-[220px]">File nộp</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissionsQuery.isLoading ? (
                Array.from({ length: limit }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-8 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : submissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-36 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ClipboardList className="h-8 w-8 opacity-30" />
                      <p className="text-sm">Chưa có học viên nộp bài</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{displayLearner(submission)}</div>
                        <div className="truncate text-xs text-muted-foreground">{submission.learner_email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                      {getRoleLabel(submission.learner_role, roleLabels, 'Học viên')}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="truncate font-medium">{submission.assignment_title}</div>
                    <div className="truncate text-xs text-muted-foreground">{submission.course_name}</div>
                  </TableCell>
                  <TableCell>{statusBadge(submission.status)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(submission.submitted_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(submission.feedback_at)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{displayFeedbackBy(submission)}</TableCell>
                  <TableCell><FileList files={submission.files} /></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={submission.status === 'submitted' ? 'default' : 'outline'}
                      className="h-8 gap-1.5"
                      disabled={submission.status === 'not_submitted'}
                      onClick={() => submission.status !== 'not_submitted' && setFeedbackTarget(submission)}
                    >
                      {submission.status === 'feedback_given' ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : submission.status === 'not_submitted' ? (
                        <Clock3 className="h-3.5 w-3.5" />
                      ) : (
                        <MessageSquareText className="h-3.5 w-3.5" />
                      )}
                      {submission.status === 'feedback_given' ? 'Xem feedback' : submission.status === 'not_submitted' ? 'Chưa nộp' : 'Feedback'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 p-3 lg:hidden">
          {submissionsQuery.isLoading ? (
            Array.from({ length: Math.min(limit, 4) }).map((_, index) => (
              <div key={index} className="rounded-xl border bg-background p-4">
                <Skeleton className="mb-2 h-5 w-2/3" />
                <Skeleton className="mb-3 h-4 w-1/2" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center text-muted-foreground">
              <ClipboardList className="mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm">Chưa có học viên nộp bài</p>
            </div>
          ) : (
            <AnimatePresence>
              {submissions.map((submission, index) => (
                <motion.div
                  key={submission.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.025 }}
                  className="rounded-xl border bg-background p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{displayLearner(submission)}</div>
                      <div className="text-xs text-muted-foreground">{submission.learner_email}</div>
                    </div>
                    {statusBadge(submission.status)}
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                      {getRoleLabel(submission.learner_role, roleLabels, 'Học viên')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(submission.submitted_at)}</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <div className="text-sm font-medium text-foreground">{submission.assignment_title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{submission.course_name}</div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>Đã feedback</span>
                      <span className="text-right font-medium text-foreground">{formatDate(submission.feedback_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Feedback bởi</span>
                      <span className="text-right font-medium text-foreground">{displayFeedbackBy(submission)}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <FileList files={submission.files} compact />
                  </div>
                  <Button
                    variant={submission.status === 'submitted' ? 'default' : 'outline'}
                    className="mt-4 w-full gap-1.5"
                    disabled={submission.status === 'not_submitted'}
                    onClick={() => submission.status !== 'not_submitted' && setFeedbackTarget(submission)}
                  >
                    {submission.status === 'feedback_given' ? (
                      <Eye className="h-4 w-4" />
                    ) : submission.status === 'not_submitted' ? (
                      <Clock3 className="h-4 w-4" />
                    ) : (
                      <MessageSquareText className="h-4 w-4" />
                    )}
                    {submission.status === 'feedback_given' ? 'Xem feedback' : submission.status === 'not_submitted' ? 'Chưa nộp' : 'Feedback'}
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        <Pagination
          page={page}
          limit={limit}
          total={submissionsQuery.data?.total || 0}
          totalPages={submissionsQuery.data?.totalPages || 1}
          onPageChange={setPage}
          onLimitChange={setLimit}
          label="bản ghi"
        />
      </motion.div>

      <FeedbackDialog
        submission={feedbackTarget}
        roleLabel={feedbackTarget ? getRoleLabel(feedbackTarget.learner_role, roleLabels, 'Học viên') : ''}
        open={!!feedbackTarget}
        onClose={() => setFeedbackTarget(null)}
        onSaved={() => {
          setFeedbackTarget(null);
          queryClient.invalidateQueries({ queryKey: ['course-assignment-submissions', courseId] });
          queryClient.invalidateQueries({ queryKey: ['course-assignments', courseId] });
        }}
      />
    </div>
  );
}

function FeedbackDialog({
  submission,
  roleLabel,
  open,
  onClose,
  onSaved,
}: {
  submission: AssignmentSubmission | null;
  roleLabel: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const alreadyFeedback = submission?.status === 'feedback_given' || Boolean(submission?.feedback_at);

  useEffect(() => {
    setFeedbackText('');
    setFiles([]);
  }, [submission?.id]);

  const feedbackMut = useMutation({
    mutationFn: () => sendAssignmentFeedback(submission!.id, {
      feedback_text: feedbackText,
      feedback_files: files,
    }),
    onSuccess: () => {
      toast.success('Đã gửi feedback');
      setFeedbackText('');
      setFiles([]);
      onSaved();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gửi feedback thất bại'),
  });

  if (!submission) return null;
  const canSend = !alreadyFeedback && feedbackText.trim().length > 0 && !feedbackMut.isPending;

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    if (alreadyFeedback) return;
    const next = Array.from(event.target.files || []).slice(0, MAX_FEEDBACK_FILES);
    setFiles(next);
    event.target.value = '';
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[92vh] sm:w-[calc(100vw-1.5rem)]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col sm:max-h-[92vh]"
        >
          <DialogHeader className="shrink-0 border-b bg-muted/20 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-col gap-3 pr-9 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MessageSquareText className="h-5 w-5" />
                  </span>
                  Feedback bài tập
                </DialogTitle>
                <DialogDescription className="mt-2">
                  {submission.course_name}
                </DialogDescription>
              </div>
              {alreadyFeedback ? (
                <Badge className="w-fit gap-1.5 border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Đã feedback
                </Badge>
              ) : (
                <Badge className="w-fit gap-1.5 border border-primary/20 bg-primary/10 px-3 py-1 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Admin review
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1fr_1.05fr]">
              <section className="space-y-4">
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Học viên</div>
                      <div className="mt-1 font-semibold text-foreground">{displayLearner(submission)}</div>
                      <div className="text-xs text-muted-foreground">{submission.learner_email}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">{roleLabel}</Badge>
                </div>

                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bài tập</div>
                  <h3 className="text-base font-semibold text-foreground">{submission.assignment_title}</h3>
                  <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Câu hỏi</div>
                    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {submission.assignment_question || 'Không có câu hỏi'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bài làm của học viên</div>
                  <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/20 p-3 text-sm leading-6 text-foreground">
                    {submission.answer_text || 'Không có nội dung text'}
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                      File học viên
                    </div>
                    <FileList files={submission.files} compact />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                {submission.feedback_text && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="font-semibold text-emerald-700 dark:text-emerald-300">Feedback hiện tại</div>
                      <span className="text-xs text-muted-foreground">{formatDate(submission.feedback_at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap rounded-lg bg-background/70 p-3 text-foreground">{submission.feedback_text}</div>
                    <div className="mt-2 text-xs text-muted-foreground">Bởi {displayFeedbackBy(submission)}</div>
                    {submission.feedback_files.length > 0 && (
                      <div className="mt-3">
                        <FileList files={submission.feedback_files} compact />
                      </div>
                    )}
                  </div>
                )}

                {!alreadyFeedback && (
                  <>
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <label className="mb-2 block text-sm font-semibold">Lời nhận xét</label>
                  <Textarea
                    value={feedbackText}
                    onChange={(event) => setFeedbackText(event.target.value)}
                    disabled={alreadyFeedback}
                    placeholder="Nhập feedback cho học viên..."
                    className="min-h-[180px] resize-y rounded-xl"
                  />
                  {alreadyFeedback && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                      Mỗi bài nộp chỉ được feedback một lần. Nội dung phía trên là bản feedback đã gửi cho học viên.
                    </div>
                  )}
                </div>

                <div className={cn(
                  'rounded-xl border border-dashed p-4 shadow-sm',
                  alreadyFeedback ? 'border-border bg-muted/30' : 'border-primary/30 bg-primary/5',
                )}>
                  <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={onPickFiles} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                        <UploadCloud className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">File đã nhận xét</div>
                        <div className="text-xs text-muted-foreground">{files.length}/{MAX_FEEDBACK_FILES} file</div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      disabled={alreadyFeedback}
                      className="w-full gap-2 sm:w-auto"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud className="h-4 w-4" />
                      Upload file
                    </Button>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {files.map(file => (
                        <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">{file.name}</div>
                            <div className="text-muted-foreground">{formatBytes(file.size)}</div>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyFeedback}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setFiles((current) => current.filter(item => item !== file))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                  </>
                )}
              </section>
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 border-t bg-muted/30 px-3 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5 [&>button]:w-full sm:[&>button]:w-auto">
            <Button variant="outline" onClick={onClose}>Hủy</Button>
            {!alreadyFeedback && (
            <Button disabled={!canSend} onClick={() => feedbackMut.mutate()} className="gap-2">
              {feedbackMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Gửi feedback
            </Button>
            )}
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
