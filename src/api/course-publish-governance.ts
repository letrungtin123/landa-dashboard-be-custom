import { customApiClient } from './custom-client';

const BASE = '/api/course-authoring/publish-governance';

export type CoursePublishPolicy = 'standard' | 'high_risk_hse';
export type CoursePublishBlocker =
  | 'POLICY_CHANGED'
  | 'CANDIDATE_EXPIRED'
  | 'CANDIDATE_STALE'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_STALE'
  | 'REVIEWER_ASSIGNMENT_REVOKED'
  | 'QUALITY_RECEIPT_MISSING'
  | 'QUALITY_RECEIPT_STALE'
  | 'CRITICAL_FINDINGS_UNRESOLVED'
  | 'ASSESSMENT_OBLIGATIONS_OPEN';

export interface CoursePublishPolicyState {
  course_id: string;
  policy: CoursePublishPolicy;
  policy_version: number;
}

export interface CoursePublishReviewerAssignment {
  id: string;
  course_id: string;
  scope_block_id: string;
  reviewer_id: string;
  reviewer_username: string;
  specialization: 'hse_sme';
  status: 'active' | 'revoked';
  created_at: string;
  revoked_at: string | null;
}

export interface CoursePublishCandidate {
  id: string;
  course_id: string;
  target_block_id: string;
  target_display_name?: string;
  policy: CoursePublishPolicy;
  policy_version: number;
  status: 'open' | 'published';
  created_by: string;
  created_at: string;
  expires_at: string;
  published_at: string | null;
  has_active_approval?: boolean;
}

export interface CoursePublishApproval {
  id: string;
  candidate_id: string;
  reviewer_id: string;
  reviewer_username: string;
  assignment_id: string;
  reason: string;
  approved_at: string;
}

export interface CoursePublishGovernanceState {
  policy: CoursePublishPolicyState | null;
  assignments: CoursePublishReviewerAssignment[];
  candidates: CoursePublishCandidate[];
  approvals: CoursePublishApproval[];
}

export interface CoursePublishCandidateEligibility {
  candidate_id: string;
  course_id: string;
  target_block_id: string;
  target_display_name: string;
  policy: CoursePublishPolicy;
  status: 'open' | 'published';
  eligible: boolean;
  blockers: CoursePublishBlocker[];
  required_quality_blocks: number;
  current_quality_blocks: number;
  open_assessment_obligations: number;
  unresolved_critical_findings: number;
}

export interface CoursePublishReviewerOption {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: 'staff' | 'superuser';
}

type ApiResponse<T> = { success: true; data: T };

function dataOf<T>(response: { data: ApiResponse<T> }): T {
  if (!response.data || response.data.success !== true || response.data.data === undefined) {
    throw new TypeError('COURSE_PUBLISH_RESPONSE_INVALID');
  }
  return response.data.data;
}

export function isCoursePublishGovernanceUnavailable(error: unknown): boolean {
  return (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code
    === 'COURSE_PUBLISH_GOVERNANCE_UNAVAILABLE';
}

export async function getCoursePublishGovernanceState(courseId: string): Promise<CoursePublishGovernanceState> {
  const response = await customApiClient.get<ApiResponse<CoursePublishGovernanceState>>(
    `${BASE}/courses/${encodeURIComponent(courseId)}`,
  );
  return dataOf(response);
}

export async function setCoursePublishPolicy(
  courseId: string,
  policy: CoursePublishPolicy,
): Promise<CoursePublishPolicyState> {
  const response = await customApiClient.put<ApiResponse<CoursePublishPolicyState>>(
    `${BASE}/courses/${encodeURIComponent(courseId)}/policy`,
    { policy },
  );
  return dataOf(response);
}

export async function listCoursePublishReviewerOptions(
  courseId: string,
  search = '',
): Promise<CoursePublishReviewerOption[]> {
  const response = await customApiClient.get<ApiResponse<CoursePublishReviewerOption[]>>(
    `${BASE}/courses/${encodeURIComponent(courseId)}/reviewer-options`,
    { params: { search } },
  );
  return dataOf(response);
}

export async function assignCoursePublishReviewer(input: {
  courseId: string;
  scopeBlockId: string;
  reviewerId: string;
}): Promise<CoursePublishReviewerAssignment> {
  const response = await customApiClient.post<ApiResponse<CoursePublishReviewerAssignment>>(
    `${BASE}/courses/${encodeURIComponent(input.courseId)}/reviewer-assignments`,
    { scope_block_id: input.scopeBlockId, reviewer_id: input.reviewerId },
  );
  return dataOf(response);
}

export async function revokeCoursePublishReviewer(assignmentId: string): Promise<CoursePublishReviewerAssignment> {
  const response = await customApiClient.delete<ApiResponse<CoursePublishReviewerAssignment>>(
    `${BASE}/reviewer-assignments/${encodeURIComponent(assignmentId)}`,
  );
  return dataOf(response);
}

export async function createCoursePublishCandidate(input: {
  courseId: string;
  targetBlockId: string;
  idempotencyKey: string;
}): Promise<CoursePublishCandidate> {
  const response = await customApiClient.post<ApiResponse<CoursePublishCandidate>>(
    `${BASE}/courses/${encodeURIComponent(input.courseId)}/candidates`,
    { target_block_id: input.targetBlockId, idempotency_key: input.idempotencyKey },
  );
  return dataOf(response);
}

export async function getCoursePublishCandidateEligibility(
  candidateId: string,
): Promise<CoursePublishCandidateEligibility> {
  const response = await customApiClient.get<ApiResponse<CoursePublishCandidateEligibility>>(
    `${BASE}/candidates/${encodeURIComponent(candidateId)}/eligibility`,
  );
  return dataOf(response);
}

export async function approveCoursePublishCandidate(input: {
  candidateId: string;
  assignmentId: string;
  reason: string;
}): Promise<CoursePublishApproval> {
  const response = await customApiClient.post<ApiResponse<CoursePublishApproval>>(
    `${BASE}/candidates/${encodeURIComponent(input.candidateId)}/approve`,
    { assignment_id: input.assignmentId, reason: input.reason },
  );
  return dataOf(response);
}
