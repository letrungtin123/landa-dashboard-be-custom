// Small building blocks shared by the AI usage page and the superadmin page.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import type { AiCreditState } from '@/api/ai-credits';
import { cn } from '@/utils/utils';
import { aiStateTone } from './ai-credits-usage.logic';

export const AI_EASE = [0.16, 1, 0.3, 1] as const;

/** Entrance used by every section: fade + small rise, staggered by index. */
export function AiReveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: AI_EASE, delay: Math.min(index, 6) * 0.06 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * A number that counts up to its value. Server rendering (and the first
 * paint without a window) shows the final value directly.
 */
export function AiAnimatedNumber({ value, format, className, duration = 0.9 }: {
  value: number | null;
  format: (value: number | null) => string;
  className?: string;
  duration?: number;
}) {
  const live = typeof window !== 'undefined';
  const [display, setDisplay] = useState<number | null>(() => (live && value !== null ? 0 : value));
  const current = useRef<number>(live ? 0 : value ?? 0);
  useEffect(() => {
    if (value === null) { setDisplay(null); return; }
    const controls = animate(current.current, value, {
      duration,
      ease: AI_EASE,
      onUpdate: latest => { current.current = latest; setDisplay(latest); },
    });
    return () => controls.stop();
  }, [value, duration]);
  return <span className={cn('tabular-nums', className)}>{format(display)}</span>;
}

/** Card shell of a section: title row with an icon tile, optional actions, then content. */
export function AiSectionCard({ icon: Icon, title, description, actions, className, bodyClassName, children }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
            {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('px-4 pb-4 pt-4 sm:px-5 sm:pb-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Label + value tile (sentence-case label, value in the UI sans). */
export function AiStatTile({ icon: Icon, label, value, hint, className }: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-2xl border border-border/60 bg-background/55 px-3.5 py-3 backdrop-blur-sm dark:bg-white/[0.02]', className)}>
      <p className="flex items-start gap-1.5 text-[11px] font-medium leading-4 text-muted-foreground">
        {Icon && <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span className="line-clamp-2">{label}</span>
      </p>
      <div className="mt-1.5 truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">{value}</div>
      {hint && <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** State pill with a dot; color is never the only cue (the label says it). */
export function AiStateChip({ state, className }: { state: AiCreditState; className?: string }) {
  const { t } = useTranslation();
  const tone = aiStateTone(state);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', tone.chip, className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `linear-gradient(135deg, ${tone.from}, ${tone.to})` }} aria-hidden />
      {t(tone.labelKey)}
    </span>
  );
}

/** Thin usage meter: the fill carries the state, the track is a light step of the same hue. */
export function AiUsageMeter({ state, percent, className }: { state: AiCreditState; percent: number | null; className?: string }) {
  const tone = aiStateTone(state);
  const width = state === 'unlimited' ? 100 : state === 'unvalued' ? 0 : Math.min(100, Math.max(0, percent ?? 0));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full', className)} style={{ backgroundColor: tone.track }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${tone.from}, ${tone.to})` }}
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.9, ease: AI_EASE }}
      />
    </div>
  );
}

/** Label + control + hint/error for the superadmin forms. */
export function AiFormField({ id, label, optionalLabel, hint, error, children, className }: {
  id: string;
  label: string;
  optionalLabel?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {label}
        {optionalLabel && <span className="font-normal text-muted-foreground">({optionalLabel})</span>}
      </label>
      {children}
      {error
        ? <p id={`${id}-error`} className="text-[11px] leading-4 text-destructive" role="alert">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
