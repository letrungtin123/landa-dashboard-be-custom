import { useEffect } from "react";
import i18n from "@/i18n";
import { useLocaleStore } from "@/utils/locale-store";

/** Synchronizes the persisted browser-only locale with i18next and the document. */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [locale]);

  return <>{children}</>;
}
