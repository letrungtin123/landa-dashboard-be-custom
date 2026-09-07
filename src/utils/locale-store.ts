import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/i18n";

interface LocaleState {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "landa-dashboard-locale",
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<LocaleState> | undefined;
        return {
          ...currentState,
          ...persisted,
          locale: isAppLocale(persisted?.locale) ? persisted.locale : DEFAULT_LOCALE,
        };
      },
    },
  ),
);
