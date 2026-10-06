import { useLocaleStore } from "@/utils/locale-store";
import i18n from "@/i18n";

const TENANT_DATA_LIMIT_REACHED_CODE = "TENANT_DATA_LIMIT_REACHED";
const TENANT_DATA_QUOTA_RECONCILING_CODE = "TENANT_DATA_QUOTA_RECONCILING";
const LESSON_AUTHOR_OUTLINE_BUSY_CODE = "LESSON_AUTHOR_OUTLINE_BUSY";
const LESSON_AUTHOR_APPLY_IN_PROGRESS_CODE = "LESSON_AUTHOR_APPLY_IN_PROGRESS";
const COURSE_ASSET_STORAGE_SIZE_LIMIT_CODE = "COURSE_ASSET_STORAGE_SIZE_LIMIT";
const COURSE_PUBLISH_ERRORS: Record<string, { vi: string; en: string }> = {
  COURSE_PUBLISH_GOVERNANCE_UNAVAILABLE: {
    vi: "Kiểm soát xuất bản chưa sẵn sàng.",
    en: "Publishing governance is not ready.",
  },
  COURSE_PUBLISH_CANDIDATE_REQUIRED: {
    vi: "Cần tạo hoặc chọn bản duyệt hiện hành trước khi xuất bản.",
    en: "Create or select a current review candidate before publishing.",
  },
  COURSE_PUBLISH_CANDIDATE_EXPIRED: {
    vi: "Bản duyệt đã hết hạn. Hãy tạo bản duyệt mới.",
    en: "The review candidate expired. Create a new candidate.",
  },
  COURSE_PUBLISH_CANDIDATE_STALE: {
    vi: "Nội dung hoặc cấu trúc đã thay đổi. Hãy kiểm tra lại và tạo bản duyệt mới.",
    en: "Content or structure changed. Review it again and create a new candidate.",
  },
  COURSE_PUBLISH_POLICY_CHANGED: {
    vi: "Chính sách xuất bản đã thay đổi. Hãy tạo bản duyệt mới.",
    en: "The publishing policy changed. Create a new review candidate.",
  },
  COURSE_PUBLISH_APPROVAL_REQUIRED: {
    vi: "Bản duyệt cần được chuyên gia được phân công phê duyệt.",
    en: "An assigned specialist must approve this review candidate.",
  },
  COURSE_PUBLISH_QUALITY_RECEIPT_STALE: {
    vi: "Bằng chứng chất lượng không còn khớp nội dung hiện tại.",
    en: "Quality evidence no longer matches the current content.",
  },
  COURSE_PUBLISH_ASSESSMENT_REVIEW_REQUIRED: {
    vi: "Vẫn còn yêu cầu bài đánh giá cần được xử lý.",
    en: "Required assessments are still incomplete.",
  },
  COURSE_PUBLISH_CRITICAL_FINDINGS_UNRESOLVED: {
    vi: "Vẫn còn phát hiện chất lượng nghiêm trọng cần xử lý.",
    en: "Critical quality findings still need resolution.",
  },
  COURSE_PUBLISH_COMMIT_INVALID: {
    vi: "Nội dung đã thay đổi trong lúc xuất bản. Chưa có dữ liệu nào được công khai.",
    en: "Content changed during publishing. No data was released.",
  },
};

/**
 * API error text is treated as external data. It can be displayed in the
 * Vietnamese source UI, but English mode always uses a translated UI fallback
 * so API responses cannot leave Vietnamese messages in the English interface.
 */
export function getLocalizedApiError(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { code?: unknown; message?: unknown; error?: unknown } } })?.response;
  const locale = useLocaleStore.getState().locale;
  const publishError = typeof response?.data?.code === "string"
    ? COURSE_PUBLISH_ERRORS[response.data.code]
    : undefined;
  if (publishError) return locale === "en" ? publishError.en : publishError.vi;
  if (response?.data?.code === TENANT_DATA_LIMIT_REACHED_CODE) {
    return i18n.t("tenantManagement.quotaLimitReached", { lng: locale });
  }
  if (response?.data?.code === TENANT_DATA_QUOTA_RECONCILING_CODE) {
    return i18n.t("tenantManagement.quotaReconciling", { lng: locale });
  }
  if (response?.data?.code === LESSON_AUTHOR_OUTLINE_BUSY_CODE) {
    return locale === "en"
      ? "This course is being updated elsewhere. Please try again shortly."
      : "Khóa học đang được cập nhật ở nơi khác. Vui lòng thử lại sau.";
  }
  if (response?.data?.code === LESSON_AUTHOR_APPLY_IN_PROGRESS_CODE) {
    return locale === "en"
      ? "This proposal is already being applied. Please wait a moment."
      : "Đề xuất đang được áp dụng. Vui lòng chờ trong giây lát.";
  }
  if (response?.data?.code === COURSE_ASSET_STORAGE_SIZE_LIMIT_CODE) {
    return i18n.t("courseEditorForms.assetStorageLimitReached", { lng: locale });
  }
  const rawMessage = response?.data?.message ?? response?.data?.error;

  if (locale === "vi" && typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage;
  }

  return fallback;
}
