import { customApiClient } from './custom-client';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type AssignmentStatus = 'not_submitted' | 'submitted' | 'feedback_given';
export type AssignmentDeadlineMode = 'none' | 'absolute' | 'relative_to_enrollment';
export type AssignmentSubmissionUnlockMode = 'after_content_complete' | 'anytime';

export interface AssignmentFileMeta {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  download_url: string;
  created_at?: string;
}

export interface CourseAssignment {
  id: string;
  tenant_id: string;
  course_id: string;
  title: string;
  question: string;
  sort_order: number;
  allow_resubmission: boolean;
  deadline_enabled: boolean;
  deadline_mode: AssignmentDeadlineMode;
  deadline_at: string | null;
  deadline_after_days: number | null;
  attachment_file: AssignmentFileMeta | null;
  submission_unlock_mode: AssignmentSubmissionUnlockMode;
  grading_enabled: boolean;
  submitted_count?: number;
  feedback_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  learner_id: string;
  answer_text: string;
  files: AssignmentFileMeta[];
  status: AssignmentStatus;
  submitted_at: string | null;
  submission_version: number;
  score: number | null;
  feedback_text: string | null;
  feedback_files: AssignmentFileMeta[];
  feedback_by: string | null;
  feedback_at: string | null;
  feedback_by_username: string | null;
  feedback_by_name: string | null;
  feedback_by_email: string | null;
  assignment_title: string;
  assignment_question: string;
  deadline_enabled: boolean;
  deadline_mode: AssignmentDeadlineMode;
  deadline_at: string | null;
  deadline_after_days: number | null;
  submission_unlock_mode: AssignmentSubmissionUnlockMode;
  grading_enabled: boolean;
  learner_username: string;
  learner_name: string;
  learner_email: string;
  learner_role: 'superadmin' | 'superuser' | 'staff' | 'learner_plus' | 'learner';
  course_name: string;
}

export interface AssignmentFeedbackHistory {
  id: string;
  submission_id: string;
  assignment_id: string;
  learner_id: string;
  feedback_text: string;
  feedback_files: AssignmentFileMeta[];
  score: number | null;
  feedback_by: string | null;
  feedback_at: string;
  created_at: string;
  feedback_by_username: string | null;
  feedback_by_name: string | null;
  feedback_by_email: string | null;
}

export interface PaginatedAssignments<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type AssignmentWriteInput = {
  title?: string;
  question?: string;
  allow_resubmission?: boolean;
  deadline_enabled?: boolean;
  deadline_mode?: AssignmentDeadlineMode;
  deadline_at?: string | null;
  deadline_after_days?: number | null;
  submission_unlock_mode?: AssignmentSubmissionUnlockMode;
  grading_enabled?: boolean;
  attachment_file?: File | null;
  remove_attachment?: boolean;
};

function buildAssignmentFormData(input: AssignmentWriteInput): FormData {
  const form = new FormData();
  const append = (key: keyof AssignmentWriteInput, value: unknown) => {
    if (value === undefined || value === null) return;
    form.append(key, String(value));
  };

  append('title', input.title);
  append('question', input.question);
  append('allow_resubmission', input.allow_resubmission);
  append('deadline_enabled', input.deadline_enabled);
  append('deadline_mode', input.deadline_mode);
  append('deadline_at', input.deadline_at);
  append('deadline_after_days', input.deadline_after_days);
  append('submission_unlock_mode', input.submission_unlock_mode);
  append('grading_enabled', input.grading_enabled);
  append('remove_attachment', input.remove_attachment);
  if (input.attachment_file) form.append('attachment_file', input.attachment_file);
  return form;
}

export async function getCourseAssignments(courseId: string): Promise<CourseAssignment[]> {
  const { data } = await customApiClient.get<ApiResponse<CourseAssignment[]>>(
    `/api/assignments/courses/${encodeURIComponent(courseId)}`,
  );
  return data.data;
}

export async function createCourseAssignment(courseId: string, input: AssignmentWriteInput & {
  title: string;
  question: string;
}): Promise<CourseAssignment> {
  const form = buildAssignmentFormData(input);
  const { data } = await customApiClient.post<ApiResponse<CourseAssignment>>(
    `/api/assignments/courses/${encodeURIComponent(courseId)}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function updateCourseAssignment(assignmentId: string, input: AssignmentWriteInput): Promise<CourseAssignment> {
  const form = buildAssignmentFormData(input);
  const { data } = await customApiClient.patch<ApiResponse<CourseAssignment>>(
    `/api/assignments/${encodeURIComponent(assignmentId)}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function deleteCourseAssignment(assignmentId: string): Promise<void> {
  await customApiClient.delete(`/api/assignments/${encodeURIComponent(assignmentId)}`);
}

export async function reorderCourseAssignments(courseId: string, assignmentIds: string[]): Promise<CourseAssignment[]> {
  const { data } = await customApiClient.post<ApiResponse<CourseAssignment[]>>(
    `/api/assignments/courses/${encodeURIComponent(courseId)}/reorder`,
    { assignment_ids: assignmentIds },
  );
  return data.data;
}

export async function getCourseAssignmentSubmissions(courseId: string, params?: {
  page?: number;
  page_size?: number;
  search?: string;
  assignment_id?: string;
  status?: AssignmentStatus;
}): Promise<PaginatedAssignments<AssignmentSubmission>> {
  const { data } = await customApiClient.get<ApiResponse<PaginatedAssignments<AssignmentSubmission>>>(
    `/api/assignments/courses/${encodeURIComponent(courseId)}/submissions`,
    { params },
  );
  return data.data;
}

export async function sendAssignmentFeedback(submissionId: string, input: {
  feedback_text: string;
  score?: number;
  feedback_files?: File[];
}): Promise<PaginatedAssignments<AssignmentSubmission>> {
  const form = new FormData();
  form.append('feedback_text', input.feedback_text);
  if (input.score !== undefined) form.append('score', String(input.score));
  input.feedback_files?.forEach(file => form.append('feedback_files', file));
  const { data } = await customApiClient.post<ApiResponse<PaginatedAssignments<AssignmentSubmission>>>(
    `/api/assignments/submissions/${encodeURIComponent(submissionId)}/feedback`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function getAssignmentFeedbackHistory(submissionId: string): Promise<AssignmentFeedbackHistory[]> {
  const { data } = await customApiClient.get<ApiResponse<AssignmentFeedbackHistory[]>>(
    `/api/assignments/submissions/${encodeURIComponent(submissionId)}/feedback-history`,
  );
  return data.data;
}
