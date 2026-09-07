import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { vi } from "./locales/vi";

export const SUPPORTED_LOCALES = ["vi", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "vi";

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function toIntlLocale(locale: AppLocale): "vi-VN" | "en-US" {
  return locale === "en" ? "en-US" : "vi-VN";
}

export default i18n;
