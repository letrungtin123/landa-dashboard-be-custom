import { Check, ChevronDown, Globe2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppLocale } from "@/i18n";
import { useLocaleStore } from "@/utils/locale-store";
import { cn } from "@/utils/utils";

const OPTIONS: ReadonlyArray<{ locale: AppLocale; labelKey: "vietnamese" | "english" }> = [
  { locale: "vi", labelKey: "vietnamese" },
  { locale: "en", labelKey: "english" },
];

interface LanguageSwitcherProps {
  className?: string;
  variant?: "dashboard" | "auth";
}

export function LanguageSwitcher({ className, variant = "dashboard" }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const isAuth = variant === "auth";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("language.change")}
          title={t("language.current", { language: t(`language.${locale === "vi" ? "vietnamese" : "english"}`) })}
          className={cn(
            "h-8 gap-1 rounded-lg px-2 text-[11px] font-bold tracking-[0.08em] transition-all",
            isAuth
              ? "border border-white/15 bg-slate-950/35 text-white/90 hover:bg-white/10 hover:text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            className,
          )}
        >
          <Globe2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden min-[420px]:inline">{locale.toUpperCase()}</span>
          <ChevronDown className="hidden h-3 w-3 opacity-70 min-[420px]:inline" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
          {t("language.change")}
        </DropdownMenuLabel>
        {OPTIONS.map((option) => {
          const selected = option.locale === locale;
          return (
            <DropdownMenuItem
              key={option.locale}
              onSelect={() => setLocale(option.locale)}
              className={cn("cursor-pointer rounded-lg px-2 py-2 text-sm", selected && "bg-primary/10 font-semibold text-primary")}
            >
              <span className="flex-1">{t(`language.${option.labelKey}`)}</span>
              {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
