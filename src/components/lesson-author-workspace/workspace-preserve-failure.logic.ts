import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';

/**
 * QLT-6 "Keep the material as it is": plain copy for the run failures of a kept
 * document. The code stays in the status payload only; the text never shows it.
 */
const COPY: Readonly<Record<string, { vi: [string, string | null]; en: [string, string | null] }>> = Object.freeze({
  IDM_PRESERVE_SOURCE_TOO_LARGE: {
    vi: ['Tài liệu quá dài để giữ nguyên trong một khoá học (nhiều hơn 24 chương, 120 bài hoặc 400 phần).',
      'Hãy chia tài liệu thành vài tệp nhỏ hơn rồi tạo nội dung cho từng phần.'],
    en: ['The material is too long to keep as it is in one course (more than 24 chapters, 120 lessons or 400 parts).',
      'Split the material into a few smaller files, then create content for each part.'],
  },
  IDM_PRESERVE_SOURCE_EMPTY: {
    vi: ['Tài liệu không còn nội dung nào để giữ lại: chỉ có số trang hoặc dòng đầu trang, chân trang.',
      'Hãy kiểm tra lại tệp (ví dụ tệp quét ảnh không đọc được chữ) rồi tải lên bản có nội dung chữ.'],
    en: ['The material has nothing left to keep: only page numbers or page header and footer lines.',
      'Check the file (for example a scanned file whose text cannot be read) and upload a version with text.'],
  },
  IDM_PRESERVE_HTML_NOT_ALLOWED: {
    vi: ['Đơn vị của bạn chưa cho dùng loại nội dung văn bản, nên không thể giữ nguyên tài liệu.',
      'Hãy nhờ quản trị viên bật loại nội dung văn bản cho khoá học rồi thử lại.'],
    en: ['Your organization does not allow text content, so the material cannot be kept as it is.',
      'Ask your administrator to turn on text content for courses, then try again.'],
  },
});

/** Integrity stops: the system would have had to change the material, so it stopped instead. */
const INTEGRITY_CODES: ReadonlySet<string> = new Set([
  'IDM_PRESERVE_TEXT_MISMATCH', 'IDM_PRESERVE_UNIT_INVALID', 'IDM_PRESERVE_COVERAGE_INVALID',
  'IDM_PRESERVE_SEGMENTATION_INVALID', 'IDM_PRESERVE_MODE_MISMATCH',
]);
const INTEGRITY = {
  vi: ['Hệ thống chưa giữ được nguyên văn từng chữ của tài liệu, nên đã dừng thay vì thay đổi nội dung.',
    'Các phần đã tạo trước đó vẫn được giữ. Hãy thử tạo lại; nếu vẫn lỗi, hãy liên hệ bộ phận hỗ trợ.'],
  en: ['The system could not keep every word of the material exactly, so it stopped instead of changing the content.',
    'Parts created earlier are kept. Try creating it again; if it still fails, contact support.'],
} as const;

/** Plain message and note for a kept-document failure code, or null for any other code. */
export function workspacePreserveFailureCopy(code: string | null | undefined, locale: WorkspaceLocale):
{ message: string; note: string | null } | null {
  if (!code) return null;
  const copy = Object.prototype.hasOwnProperty.call(COPY, code) ? COPY[code]![locale]
    : INTEGRITY_CODES.has(code) ? INTEGRITY[locale] : null;
  return copy ? { message: copy[0], note: copy[1] } : null;
}
