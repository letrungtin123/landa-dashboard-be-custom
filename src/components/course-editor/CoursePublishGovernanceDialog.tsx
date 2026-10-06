import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock3, Loader2, ShieldCheck, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { publishBlock } from '@/api/custom-course-authoring';
import {
  approveCoursePublishCandidate,
  assignCoursePublishReviewer,
  createCoursePublishCandidate,
  getCoursePublishCandidateEligibility,
  getCoursePublishGovernanceState,
  isCoursePublishGovernanceUnavailable,
  listCoursePublishReviewerOptions,
  revokeCoursePublishReviewer,
  setCoursePublishPolicy,
  type CoursePublishBlocker,
  type CoursePublishPolicy,
} from '@/api/course-publish-governance';
import { getLocalizedApiError } from '@/utils/localized-error';
import { useAuthStore } from '@/utils/store';

const governanceKey = (courseId: string) => ['course-publish-governance', courseId] as const;

export function CoursePublishGovernanceDialog({
  courseId,
  rootBlockId,
  onPublished,
}: {
  courseId: string;
  rootBlockId: string;
  onPublished: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore(state => state.user);
  const hasPermission = useAuthStore(state => state.hasPermission);
  const canEdit = hasPermission('courses', 'can_edit');
  const canManage = currentUser?.role === 'superadmin' || currentUser?.role === 'superuser';
  const [open, setOpen] = useState(false);
  const [policyChoice, setPolicyChoice] = useState<CoursePublishPolicy>('standard');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedReviewerId, setSelectedReviewerId] = useState('');
  const [approvalReason, setApprovalReason] = useState('');

  const stateQuery = useQuery({
    queryKey: governanceKey(courseId),
    queryFn: async () => {
      try {
        return await getCoursePublishGovernanceState(courseId);
      } catch (error) {
        if (isCoursePublishGovernanceUnavailable(error)) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 10_000,
  });
  const state = stateQuery.data;
  const candidates = useMemo(() => state?.candidates ?? [], [state?.candidates]);

  useEffect(() => {
    if (selectedCandidateId && candidates.some(candidate => candidate.id === selectedCandidateId)) return;
    setSelectedCandidateId(candidates.find(candidate => candidate.status === 'open')?.id ?? candidates[0]?.id ?? '');
  }, [candidates, selectedCandidateId]);

  const eligibilityQuery = useQuery({
    queryKey: ['course-publish-candidate-eligibility', selectedCandidateId],
    queryFn: () => getCoursePublishCandidateEligibility(selectedCandidateId),
    enabled: open && Boolean(selectedCandidateId),
    retry: false,
    staleTime: 5_000,
  });
  const eligibility = eligibilityQuery.data;
  const selectedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId) ?? null;

  const reviewerOptionsQuery = useQuery({
    queryKey: ['course-publish-reviewer-options', courseId],
    queryFn: () => listCoursePublishReviewerOptions(courseId),
    enabled: open && canManage && state?.policy?.policy === 'high_risk_hse',
    retry: false,
    staleTime: 30_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: governanceKey(courseId) });
    if (selectedCandidateId) {
      await queryClient.invalidateQueries({ queryKey: ['course-publish-candidate-eligibility', selectedCandidateId] });
    }
  };

  const policyMutation = useMutation({
    mutationFn: () => setCoursePublishPolicy(courseId, policyChoice),
    onSuccess: async () => {
      toast.success(t('coursePublish.policySaved'));
      await refresh();
    },
    onError: error => toast.error(getLocalizedApiError(error, t('coursePublish.actionFailed'))),
  });

  const candidateMutation = useMutation({
    mutationFn: () => createCoursePublishCandidate({
      courseId,
      targetBlockId: rootBlockId,
      idempotencyKey: crypto.randomUUID(),
    }),
    onSuccess: async candidate => {
      setSelectedCandidateId(candidate.id);
      toast.success(t('coursePublish.candidateCreated'));
      await refresh();
    },
    onError: error => toast.error(getLocalizedApiError(error, t('coursePublish.actionFailed'))),
  });

  const assignMutation = useMutation({
    mutationFn: () => assignCoursePublishReviewer({
      courseId,
      scopeBlockId: rootBlockId,
      reviewerId: selectedReviewerId,
    }),
    onSuccess: async () => {
      setSelectedReviewerId('');
      toast.success(t('coursePublish.reviewerAssigned'));
      await refresh();
    },
    onError: error => toast.error(getLocalizedApiError(error, t('coursePublish.actionFailed'))),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeCoursePublishReviewer,
    onSuccess: async () => {
      toast.success(t('coursePublish.reviewerRevoked'));
      await refresh();
    },
    onError: error => toast.error(getLocalizedApiError(error, t('coursePublish.actionFailed'))),
  });

  const activeOwnAssignment = state?.assignments.find(assignment =>
    assignment.status === 'active' && assignment.reviewer_id === currentUser?.id
      && assignment.scope_block_id === rootBlockId,
  ) ?? state?.assignments.find(assignment =>
    assignment.status === 'active' && assignment.reviewer_id === currentUser?.id,
  );

  const approveMutation = useMutation({
    mutationFn: () => approveCoursePublishCandidate({
      candidateId: selectedCandidateId,
      assignmentId: activeOwnAssignment!.id,
      reason: approvalReason.trim(),
    }),
    onSuccess: async () => {
      setApprovalReason('');
      toast.success(t('coursePublish.approved'));
      await refresh();
    },
    onError: error => toast.error(getLocalizedApiError(error, t('coursePublish.actionFailed'))),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishBlock(eligibility!.target_block_id, eligibility!.candidate_id),
    onSuccess: async () => {
      toast.success(t('coursePublish.published'));
      await refresh();
      await onPublished();
    },
    onError: async error => {
      toast.error(getLocalizedApiError(error, t('coursePublish.publishConflict')));
      await refresh();
    },
  });

  if (stateQuery.data === null) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-full justify-start gap-2"
        onClick={() => setOpen(true)}
        disabled={stateQuery.isLoading || stateQuery.isError}
      >
        {stateQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {t('coursePublish.title')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t('coursePublish.title')}
            </DialogTitle>
            <DialogDescription>{t('coursePublish.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 overflow-y-auto px-5 pb-5">
            {!state?.policy ? (
              <section className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-500" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="font-semibold">{t('coursePublish.notEnrolled')}</h3>
                      <p className="text-sm text-muted-foreground">{t('coursePublish.notEnrolledDescription')}</p>
                    </div>
                    {canManage && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select value={policyChoice} onValueChange={value => setPolicyChoice(value as CoursePublishPolicy)}>
                          <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">{t('coursePublish.policyStandard')}</SelectItem>
                            <SelectItem value="high_risk_hse">{t('coursePublish.policyHse')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button onClick={() => policyMutation.mutate()} disabled={policyMutation.isPending}>
                          {policyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {t('coursePublish.enablePolicy')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('coursePublish.policy')}</p>
                    <p className="font-semibold">
                      {state.policy.policy === 'high_risk_hse' ? t('coursePublish.policyHse') : t('coursePublish.policyStandard')}
                    </p>
                  </div>
                  <Badge variant="outline">v{state.policy.policy_version}</Badge>
                </section>

                {state.policy.policy === 'high_risk_hse' && canManage && (
                  <section className="space-y-3 rounded-xl border p-4">
                    <div>
                      <h3 className="font-semibold">{t('coursePublish.reviewers')}</h3>
                      <p className="text-sm text-muted-foreground">{t('coursePublish.reviewersDescription')}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select value={selectedReviewerId} onValueChange={setSelectedReviewerId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder={t('coursePublish.selectReviewer')} /></SelectTrigger>
                        <SelectContent>
                          {(reviewerOptionsQuery.data ?? []).map(reviewer => (
                            <SelectItem key={reviewer.id} value={reviewer.id}>
                              {reviewer.full_name || reviewer.username} · {reviewer.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="secondary"
                        onClick={() => assignMutation.mutate()}
                        disabled={!selectedReviewerId || assignMutation.isPending}
                      >
                        {t('coursePublish.assignReviewer')}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {state.assignments.filter(item => item.status === 'active').map(assignment => (
                        <div key={assignment.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                          <span>{assignment.reviewer_username}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('coursePublish.revokeReviewer')}
                            onClick={() => revokeMutation.mutate(assignment.id)}
                            disabled={revokeMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="space-y-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{t('coursePublish.candidates')}</h3>
                      <p className="text-sm text-muted-foreground">{t('coursePublish.candidatesDescription')}</p>
                    </div>
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => candidateMutation.mutate()} disabled={candidateMutation.isPending}>
                        {candidateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('coursePublish.createCourseCandidate')}
                      </Button>
                    )}
                  </div>

                  {candidates.length === 0 ? (
                    <p className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">{t('coursePublish.noCandidates')}</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {candidates.slice(0, 12).map(candidate => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => setSelectedCandidateId(candidate.id)}
                          className={`rounded-lg border p-3 text-left transition-colors ${selectedCandidateId === candidate.id
                            ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{candidate.target_display_name || t('coursePublish.unnamedScope')}</span>
                            <Badge variant={candidate.status === 'published' ? 'secondary' : 'outline'}>
                              {candidate.status === 'published' ? t('coursePublish.statusPublished') : t('coursePublish.statusOpen')}
                            </Badge>
                          </div>
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            {new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(candidate.created_at))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {selectedCandidate && (
                  <section className="space-y-3 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{selectedCandidate.target_display_name || t('coursePublish.unnamedScope')}</h3>
                        <p className="text-sm text-muted-foreground">{t('coursePublish.backendEligibility')}</p>
                      </div>
                      {eligibility?.eligible ? (
                        <Badge className="gap-1 bg-emerald-600"><CheckCircle2 className="h-3 w-3" />{t('coursePublish.ready')}</Badge>
                      ) : (
                        <Badge variant="outline">{t('coursePublish.needsAction')}</Badge>
                      )}
                    </div>

                    {eligibilityQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</div>
                    ) : eligibility && eligibility.blockers.length > 0 ? (
                      <div className="space-y-2">
                        {eligibility.blockers.map((blocker: CoursePublishBlocker) => (
                          <div key={blocker} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                            {t(`coursePublish.blockers.${blocker}`)}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {state.policy.policy === 'high_risk_hse' && activeOwnAssignment
                      && selectedCandidate.created_by !== currentUser?.id && selectedCandidate.status === 'open'
                      && !selectedCandidate.has_active_approval && (
                        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                          <label className="text-sm font-medium">{t('coursePublish.approvalReason')}</label>
                          <Textarea
                            value={approvalReason}
                            onChange={event => setApprovalReason(event.target.value)}
                            placeholder={t('coursePublish.approvalReasonPlaceholder')}
                            maxLength={1000}
                          />
                          <Button
                            onClick={() => approveMutation.mutate()}
                            disabled={approvalReason.trim().length < 8 || approveMutation.isPending}
                          >
                            {t('coursePublish.approve')}
                          </Button>
                        </div>
                      )}

                    {canEdit && eligibility?.eligible && selectedCandidate.status === 'open' && (
                      <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                        {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('coursePublish.publishExactCandidate')}
                      </Button>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
