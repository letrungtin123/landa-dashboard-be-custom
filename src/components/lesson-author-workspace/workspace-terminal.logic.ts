import type { WorkspaceFailureStage, WorkspaceLocale, WorkspaceStatus } from '../../api/lesson-author-workspace.contract';
import { workspacePreserveFailureCopy } from './workspace-preserve-failure.logic';
import { workspaceReviewCopy, workspaceReviewRequired } from './workspace-review.logic';

/** Plain VI/EN text for a run that ended: the step that stopped, what happened
 * and what is kept. Pure; rendered by WorkspaceTerminalPanel. */
export function workspaceTerminalFailureText(status: WorkspaceStatus, locale: WorkspaceLocale): { stage: string | null; message: string; note: string | null } {
  const vi = locale === 'vi';
  const stageNames: Record<WorkspaceFailureStage, readonly [string, string]> = {
    source_snapshot: ['đọc tài liệu nguồn', 'reading source documents'],
    course_skeleton: ['tạo khung khóa học', 'creating the course outline'],
    chapter_blueprint: ['tạo nội dung chương', 'creating chapter content'],
    validate_architecture: ['kiểm tra cấu trúc khóa học', 'validating the course structure'],
    publish_inventory: ['ghi nhận cây nội dung', 'committing the content tree'],
    generate_unit: ['soạn nội dung bài học', 'writing lesson content'],
    validate_chapter: ['kiểm tra nội dung chương', 'validating chapter content'],
    finalize_course: ['hoàn tất khóa học', 'finalizing the course'],
  };
  const chapter = status.failure_chapter_key?.match(/^chapter-(\d+)$/)?.[1];
  const stage = status.failure_stage ? `${stageNames[status.failure_stage][vi ? 0 : 1]}${chapter ? ` (${vi ? 'Chương' : 'Chapter'} ${chapter})` : ''}` : null;
  const kept = workspacePreserveFailureCopy(status.failure_code, locale);
  if (kept) return { stage, ...kept };
  // Not a failure: the content is complete and saved; held questions wait for the author ("Chờ duyệt").
  if (workspaceReviewRequired(status)) return { stage: null,
    message: workspaceReviewCopy[locale].pendingLead, note: workspaceReviewCopy[locale].pendingNote };
  if (status.failure_code === 'RUN_STOPPED_BY_AUTHOR') return {
    stage: null,
    message: vi ? 'Bạn đã dừng việc tạo nội dung. Các phần đã tạo xong vẫn được giữ.'
      : 'You stopped creating content. Everything that was finished is kept.',
    note: null,
  };
  if (status.failure_code === 'ORCHESTRATION_V2_EXECUTION_RUNTIME_CHANGED') return {
    stage, message: vi ? 'Cấu hình AI của doanh nghiệp đã thay đổi trong lúc tạo nội dung.' : 'The organization AI configuration changed while content was being created.',
    note: vi ? 'Yêu cầu của bước này chưa được gửi đến AI và không phát sinh lượt gọi cho lần thử đó.' : 'This step was not sent to the AI provider, so that attempt did not create a provider call.',
  };
  if (status.failure_code === 'ORCHESTRATION_V2_SOURCE_DOCUMENT_MISSING') return {
    stage, message: vi ? 'Tài liệu nguồn đã bị xoá (hoặc Kho tri thức của AI ID đã đổi) nên phần này chưa soạn được.'
      : 'The source document was deleted (or the AI ID Knowledge Base was changed), so this part could not be written.',
    note: vi ? 'Các phần đã soạn xong vẫn được giữ. Bạn có thể tự soạn phần còn thiếu hoặc tạo bản thiết kế mới.'
      : 'Everything already written is kept. You can write the missing part yourself or start a new design.',
  };
  if (status.failure_code === 'AI_PROVIDER_AUTH_REJECTED') return {
    stage, message: vi ? 'Nhà cung cấp AI từ chối thông tin xác thực. Hãy kiểm tra API key của doanh nghiệp.' : 'The AI provider rejected the credentials. Check the organization API key.', note: null,
  };
  if (status.failure_code === 'AI_PROVIDER_QUOTA_EXHAUSTED') return {
    stage, message: vi ? 'API key đã hết hạn mức/tiền — vui lòng nạp thêm hoặc đổi key.' : 'The AI provider key has run out of quota or credit. Top it up or change the key.',
    note: vi ? 'Hệ thống đã dừng thay vì tạo nội dung dự phòng cho các bước còn lại.' : 'The run stopped instead of filling the remaining steps with fallback content.',
  };
  if (status.failure_code === 'AI_PROVIDER_RATE_LIMITED') return {
    stage, message: vi ? 'Nhà cung cấp AI đang giới hạn tần suất gọi của API key này. Vui lòng thử lại sau ít phút hoặc nâng hạn mức.' : 'The AI provider is rate limiting this API key. Try again in a few minutes or raise the rate limit.',
    note: null,
  };
  if (status.failure_code === 'IDM_UNITS_MOSTLY_FALLBACK') return {
    stage, message: vi ? 'Phần lớn bài học là bản dự phòng dựng từ tài liệu nguồn, chưa được AI soạn. Cần biên tập trước khi dùng hoặc tạo lại khi AI sẵn sàng.' : 'Most lessons are fallback drafts rebuilt from the source, not written by the AI. Edit them before use or regenerate when the AI is available.',
    note: vi ? 'Bạn vẫn có thể xem, sửa và áp dụng các nội dung đã tạo.' : 'You can still review, edit and apply the generated content.',
  };
  if (status.failure_code === 'PROVIDER_OUTCOME_UNKNOWN') return {
    stage, message: vi ? 'Yêu cầu đã được gửi đến AI nhưng hệ thống chưa xác nhận được kết quả.' : 'The request reached the AI provider, but its result could not be confirmed.',
    note: vi ? 'Hệ thống không tự gọi lại mù quáng để tránh tạo nội dung hoặc chi phí trùng.' : 'The system did not blindly replay the request, preventing duplicate content or charges.',
  };
  if (status.failure_stage === 'finalize_course' && status.unit_count > 0 && status.ready_unit_count === status.unit_count) return {
    stage,
    message: vi ? 'Nội dung bài học đã được tạo và lưu. Hệ thống chưa hoàn tất bước kiểm tra cuối.' : 'Lesson content was created and saved, but the final check did not complete.',
    note: vi ? 'Bạn vẫn có thể xem bản thiết kế khoá học. Hãy tải lại trạng thái trước khi thử thao tác tiếp theo.' : 'You can still review the draft. Reload its saved state before the next action.',
  };
  return { stage,
    message: vi ? 'Hệ thống không thể hoàn tất bước này sau các lần thử an toàn.' : 'The system could not complete this step after its safe attempts.',
    note: status.failure_code ? (vi ? 'Các phần đã ghi nhận trước đó vẫn được giữ nguyên.' : 'Previously committed sections remain available.') : null };
}
