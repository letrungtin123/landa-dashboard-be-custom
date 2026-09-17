import { useLocaleStore } from "@/utils/locale-store";
import i18n from "@/i18n";

const TENANT_DATA_LIMIT_REACHED_CODE = "TENANT_DATA_LIMIT_REACHED";
const TENANT_DATA_QUOTA_RECONCILING_CODE = "TENANT_DATA_QUOTA_RECONCILING";
const LESSON_AUTHOR_OUTLINE_BUSY_CODE = "LESSON_AUTHOR_OUTLINE_BUSY";
const LESSON_AUTHOR_APPLY_IN_PROGRESS_CODE = "LESSON_AUTHOR_APPLY_IN_PROGRESS";
const COURSE_ASSET_STORAGE_SIZE_LIMIT_CODE = "COURSE_ASSET_STORAGE_SIZE_LIMIT";

/**
 * API error text is treated as external data. It can be displayed in the
 * Vietnamese source UI, but English mode always uses a translated UI fallback
 * so API responses cannot leave Vietnamese messages in the English interface.
 */
export function getLocalizedApiError(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { code?: unknown; message?: unknown; error?: unknown } } })?.response;
  const locale = useLocaleStore.getState().locale;
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
