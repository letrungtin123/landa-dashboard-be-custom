import { useId } from 'react';
import { Info, Lightbulb, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReportNarrativeView } from './report-chat-card.logic';

const PRIORITY_TONES: Record<'high' | 'medium' | 'low', string> = {
  high: 'border-rose-500/25 bg-rose-500/[0.08] text-rose-700 dark:text-rose-300',
  medium: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300',
  low: 'border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300',
};

/** The AI narrative stored with the report (generated in the request locale, never a source of numbers). */
export function ReportNarrativePanel({ view }: { view: ReportNarrativeView }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.045] p-2.5 dark:bg-violet-400/[0.05]" aria-labelledby={titleId}>
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" />
        <div className="min-w-0">
          <p id={titleId} className="text-[10px] font-semibold uppercase tracking-normal text-violet-700 dark:text-violet-300">
            {t('chatWidget.report.narrative.title')}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{t('chatWidget.report.narrative.description')}</p>
        </div>
      </div>
      {view.interpretation.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-muted-foreground">{t('chatWidget.report.narrative.interpretation')}</p>
          <ul className="mt-1 space-y-1 text-[11px] leading-4 text-foreground">
            {view.interpretation.map((item, index) => (
              <li key={`interpretation-${index}`} className="flex gap-2"><span className="text-violet-500" aria-hidden="true">•</span><span>{item}</span></li>
            ))}
          </ul>
        </div>
      )}
      {view.actions.length > 0 && (
        <div className="mt-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <Lightbulb className="h-3 w-3" aria-hidden="true" />
            {t('chatWidget.report.narrative.actions')}
          </p>
          <ul className="mt-1 space-y-1.5">
            {view.actions.map((action, index) => (
              <li key={`action-${index}`} className="flex min-w-0 flex-wrap items-start gap-1.5 text-[11px] leading-4 text-foreground">
                <span className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold leading-3 ${PRIORITY_TONES[action.priority]}`}>
                  {t(`chatWidget.report.narrative.priority_${action.priority}`)}
                </span>
                <span className="min-w-0 flex-1">{action.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.limitations.length > 0 && (
        <div className="mt-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5 dark:bg-white/[0.02]">
          <p className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <Info className="h-3 w-3" aria-hidden="true" />
            {t('chatWidget.report.narrative.limitations')}
          </p>
          <ul className="mt-0.5 space-y-0.5 text-[10px] leading-4 text-muted-foreground">
            {view.limitations.map((item, index) => (
              <li key={`limitation-${index}`}>
                {item.kind === 'known' ? t(`chatWidget.report.narrative.limitation_${item.key}`) : item.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
