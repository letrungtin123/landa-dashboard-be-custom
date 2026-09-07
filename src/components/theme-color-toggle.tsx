import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeColorStore, THEME_PALETTES, type ThemeColor } from '@/utils/theme-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const GRADIENT_THEMES: { name: ThemeColor; label: string; color: string }[] = [
  { name: 'orange', label: 'Orange', color: '#f97316' },
  { name: 'blue', label: 'Blue', color: '#2563eb' },
  { name: 'rose', label: 'Rose', color: '#e11d48' },
  { name: 'violet', label: 'Violet', color: '#7c3aed' },
  { name: 'green', label: 'Green', color: '#16a34a' },
  { name: 'amber', label: 'Amber', color: '#d97706' },
  { name: 'cyan', label: 'Cyan', color: '#0891b2' },
  { name: 'pink', label: 'Pink', color: '#db2777' },
  { name: 'emerald', label: 'Emerald', color: '#059669' },
  { name: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { name: 'cherry', label: 'Cherry', color: '#be123c' },
];

const SOLID_THEMES: { name: ThemeColor; label: string; color: string }[] = [
  { name: 'solid-blue', label: 'Solid Blue', color: '#2563eb' },
  { name: 'solid-zinc', label: 'Solid Zinc', color: '#52525b' },
  { name: 'solid-rose', label: 'Solid Rose', color: '#e11d48' },
  { name: 'solid-green', label: 'Solid Green', color: '#16a34a' },
  { name: 'solid-orange', label: 'Solid Orange', color: '#f97316' },
];

export function ThemeColorToggle() {
  const { t } = useTranslation();
  const { themeColor, setThemeColor } = useThemeColorStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Palette className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[140px] max-h-[350px] overflow-y-auto rounded-lg">
        <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('theme.gradients')}
        </div>
        {GRADIENT_THEMES.map((theme) => (
          <DropdownMenuItem
            key={theme.name}
            onClick={() => {
              setTimeout(() => {
                setThemeColor(theme.name);
              }, 150);
            }}
            className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${mounted && themeColor === theme.name ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'
              }`}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${theme.color}, ${THEME_PALETTES[theme.name].gradientTo})` }}
              />
              {theme.label}
            </div>
            <div
              className={`w-1.5 h-1.5 rounded-full transition-colors ${mounted && themeColor === theme.name ? 'bg-foreground' : 'bg-transparent'
                }`}
            />
          </DropdownMenuItem>
        ))}

        <div className="my-1 border-t border-border/50" />
        <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('theme.solidColors')}
        </div>

        {SOLID_THEMES.map((theme) => (
          <DropdownMenuItem
            key={theme.name}
            onClick={() => {
              setTimeout(() => {
                setThemeColor(theme.name);
              }, 150);
            }}
            className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${mounted && themeColor === theme.name ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'
              }`}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                style={{ background: theme.color }}
              />
              {theme.label}
            </div>
            <div
              className={`w-1.5 h-1.5 rounded-full transition-colors ${mounted && themeColor === theme.name ? 'bg-foreground' : 'bg-transparent'
                }`}
            />
          </DropdownMenuItem>
        ))}
        <div className="h-0.5" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
