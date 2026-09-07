import { useLocaleStore } from "@/utils/locale-store";

/**
 * API error text is treated as external data. It can be displayed in the
 * Vietnamese source UI, but English mode always uses a translated UI fallback
 * so API responses cannot leave Vietnamese messages in the English interface.
 */
export function getLocalizedApiError(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: unknown; error?: unknown } } })?.response;
  const rawMessage = response?.data?.message ?? response?.data?.error;

  if (useLocaleStore.getState().locale === "vi" && typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage;
  }

  return fallback;
}
