import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { AiCreditState } from '@/api/ai-credits';
import { cn } from '@/utils/utils';
import { aiRingProgress, aiStateTone } from './ai-credits-usage.logic';
import { AI_EASE } from './ai-credits-ui';

const VIEW = 200;
const STROKE = 15;
const RADIUS = (VIEW - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Radial meter of the month. The track is a light step of the state hue; the arc draws in on mount. */
export function AiCreditRing({ state, percent, label, className, children }: {
  state: AiCreditState;
  percent: number | null;
  /** Accessible description of what the ring shows. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const gradientId = `ai-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const tone = aiStateTone(state);
  const progress = aiRingProgress(state, percent);
  const offset = CIRCUMFERENCE * (1 - progress / 100);
  return (
    <div className={cn('relative aspect-square w-[168px] shrink-0 sm:w-[196px]', className)} role="img" aria-label={label}>
      <div
        aria-hidden
        className="absolute inset-5 rounded-full opacity-50 blur-2xl"
        style={{ background: `radial-gradient(circle, ${tone.from} 0%, transparent 70%)` }}
      />
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="relative h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tone.from} />
            <stop offset="100%" stopColor={tone.to} />
          </linearGradient>
        </defs>
        <circle cx={VIEW / 2} cy={VIEW / 2} r={RADIUS} fill="none" stroke={tone.track} strokeWidth={STROKE} />
        {state === 'unvalued' && (
          <circle cx={VIEW / 2} cy={VIEW / 2} r={RADIUS} fill="none" stroke={tone.to} strokeOpacity={0.35}
            strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" />
        )}
        {progress > 0 && (
          <motion.circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={RADIUS}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.25, ease: AI_EASE }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">{children}</div>
    </div>
  );
}
