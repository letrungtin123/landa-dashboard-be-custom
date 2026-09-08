import { useLocaleStore } from "@/utils/locale-store";
import i18n from "@/i18n";

const TENANT_DATA_LIMIT_REACHED_CODE = "TENANT_DATA_LIMIT_REACHED";
const TENANT_DATA_QUOTA_RECONCILING_CODE = "TENANT_DATA_QUOTA_RECONCILING";

/**
 * API error text is treated as external data. It can be displayed in the
 * Vietnamese source UI, but English mode always uses a translated UI fallback
 * so API responses cannot leave Vietnamese messages in the English interface.
 */
export function getLocalizedApiError(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { code?: unknown; message?: unknown; error?: unknown } } })?.response;
  if (response?.data?.code === TENANT_DATA_LIMIT_REACHED_CODE) {
    return i18n.t("tenantManagement.quotaLimitReached", { lng: useLocaleStore.getState().locale });
  }
  if (response?.data?.code === TENANT_DATA_QUOTA_RECONCILING_CODE) {
    return i18n.t("tenantManagement.quotaReconciling", { lng: useLocaleStore.getState().locale });
  }
  const rawMessage = response?.data?.message ?? response?.data?.error;

  if (useLocaleStore.getState().locale === "vi" && typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage;
  }

  return fallback;
}
