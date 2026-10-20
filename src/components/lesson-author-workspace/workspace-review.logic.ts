import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { workspaceLocationText } from '../../api/workspace-apply-reason.logic';
import type { WorkspaceReviewItem, WorkspaceReviewList } from '../../api/workspace-review';

/**
 * "Chờ duyệt" presentation rules. A run that finished its content but held a
 * few assessment questions for the author (ASSESSMENT_REVIEW_REQUIRED) is a
 * completed run waiting for review, not a failure: the content is saved and
 * can be applied while the author checks the held questions.
 */
export const WORKSPACE_REVIEW_REQUIRED_CODE = 'ASSESSMENT_REVIEW_REQUIRED';

export function workspaceReviewRequired(status: { status: string; failure_code?: string | null } | null | undefined): boolean {
  return status?.status === 'needs_action' && status.failure_code === WORKSPACE_REVIEW_REQUIRED_CODE;
}

export interface WorkspaceReviewProgress { total: number; resolved: number; open: number; percent: number; done: boolean }

export function workspaceReviewProgress(list: Pick<WorkspaceReviewList, 'total_count' | 'resolved_count' | 'open_count'> | null | undefined): WorkspaceReviewProgress {
  const total = list?.total_count ?? 0, resolved = Math.min(list?.resolved_count ?? 0, total), open = Math.max(0, total - resolved);
  return { total, resolved, open, percent: total ? Math.round((resolved / total) * 100) : 0, done: total > 0 && open === 0 };
}

export const workspaceReviewCopy = {
  vi: {
    pendingTitle: 'Hoàn tất – chờ duyệt',
    pendingLead: 'AI đã soạn xong nội dung và lưu vào bản thiết kế. Một số câu hỏi kiểm tra được AI tạm giữ để bạn đối chiếu với tài liệu nguồn. Hãy xem từng mục rồi đánh dấu đã kiểm tra.',
    pendingNote: 'Trong lúc duyệt, bạn vẫn có thể áp dụng nội dung vào khoá học.',
    doneTitle: 'Đã duyệt xong',
    doneLead: 'Bạn đã kiểm tra tất cả câu hỏi được AI tạm giữ.',
    progress: (resolved: number, total: number) => `Đã kiểm tra ${resolved}/${total} mục`,
    more: 'Danh sách chỉ hiển thị một phần. Hãy đánh dấu các mục bên dưới rồi tải lại để xem tiếp.',
    loading: 'Đang tải danh sách chờ duyệt…',
    empty: 'Không có câu hỏi nào cần duyệt.',
    reload: 'Tải lại',
    unknownPlace: 'Bài học chưa rõ vị trí',
    heldQuestion: 'AI đã tạm giữ một câu hỏi trắc nghiệm (chọn một đáp án) cho bài học này vì cần người đối chiếu với tài liệu nguồn.',
    heldOther: 'AI đã tạm giữ một câu hỏi kiểm tra cho bài học này vì cần người đối chiếu với tài liệu nguồn.',
    objectives: 'Mục tiêu học mà câu hỏi cần kiểm tra:',
    markChecked: 'Đánh dấu đã kiểm tra',
    markCheckedHint: 'AI sẽ không thêm câu hỏi này. Nếu cần, bạn tự soạn câu hỏi trong khoá học.',
    useExisting: (title: string) => `Câu hỏi «${title}» đã kiểm tra mục tiêu này`,
    existingQuestion: (number: number) => `nội dung ${number}`,
    saving: 'Đang lưu…',
    checkedReplan: 'Đã kiểm tra – không dùng câu hỏi AI tạm giữ',
    checkedExisting: 'Đã kiểm tra – dùng câu hỏi có sẵn trong bài',
    readOnly: 'Chỉ người được quyền áp dụng nội dung vào khoá học mới đánh dấu được.',
  },
  en: {
    pendingTitle: 'Completed – waiting for review',
    pendingLead: 'The AI finished the content and saved it in the design. It held back a few check questions for you to compare with the source documents. Look at each item, then mark it as checked.',
    pendingNote: 'You can still apply the content to the course while you review.',
    doneTitle: 'Review complete',
    doneLead: 'You have checked every question the AI held back.',
    progress: (resolved: number, total: number) => `${resolved} of ${total} checked`,
    more: 'Only part of the list is shown. Mark the items below, then reload to see the rest.',
    loading: 'Loading the review list…',
    empty: 'No questions need review.',
    reload: 'Reload',
    unknownPlace: 'Lesson with an unknown place',
    heldQuestion: 'The AI held back a multiple-choice question (one correct answer) for this lesson because a person needs to compare it with the source documents.',
    heldOther: 'The AI held back a check question for this lesson because a person needs to compare it with the source documents.',
    objectives: 'Learning objectives the question should check:',
    markChecked: 'Mark as checked',
    markCheckedHint: 'The AI will not add this question. If needed, write one yourself in the course.',
    useExisting: (title: string) => `Question "${title}" already checks this objective`,
    existingQuestion: (number: number) => `content ${number}`,
    saving: 'Saving…',
    checkedReplan: 'Checked – the held question is not used',
    checkedExisting: 'Checked – an existing question in the lesson is used',
    readOnly: 'Only people who can apply content to the course can mark items.',
  },
} as const;

export function workspaceReviewHeadline(progress: WorkspaceReviewProgress, locale: WorkspaceLocale) {
  const c = workspaceReviewCopy[locale];
  return progress.done ? { tone: 'done' as const, title: c.doneTitle, lead: c.doneLead, note: null }
    : { tone: 'pending' as const, title: c.pendingTitle, lead: c.pendingLead, note: c.pendingNote };
}

/** Everything one item row shows, in the UI language. */
export function workspaceReviewItemView(item: WorkspaceReviewItem, locale: WorkspaceLocale) {
  const c = workspaceReviewCopy[locale];
  const where = workspaceLocationText(item.location, locale);
  return {
    where: where ? where.charAt(0).toLocaleUpperCase() + where.slice(1) : c.unknownPlace,
    what: item.required_kind === 'single_choice' ? c.heldQuestion : c.heldOther,
    objectives: item.learning_objectives,
    status: item.status === 'open' ? null : item.decision === 'valid_assessment' ? c.checkedExisting : c.checkedReplan,
    candidates: item.candidate_components.map(candidate => ({ node_id: candidate.node_id,
      label: c.useExisting(candidate.title ?? c.existingQuestion(candidate.number)) })),
  };
}
