import type { ReactNode } from 'react';
import { ArrowRight, Building2, CalendarDays, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ReportChatFilter, ReportClarification, ReportUnitLevel } from '@/api/custom-chat';
import { getReportClarificationOptions, getReportClarificationReasonKey } from './report-chat-card.logic';

/**
 * A report question the backend could not resolve safely (ambiguous period
 * or unit, a unit outside the user's scope...). Each chip carries a complete
 * filter and re-runs the original question with it.
 */
export function ReportClarificationPanel({
  clarification,
  fallback,
  isEnglish,
  unitLabels,
  applying,
  onChoose,
  onOpenFilters,
}: {
  clarification: ReportClarification;
  /** The persisted assistant text, shown when no reason is known to this client. */
  fallback: ReactNode;
  isEnglish: boolean;
  unitLabels: Record<ReportUnitLevel, string>;
  applying?: boolean;
  onChoose: (filter: ReportChatFilter) => void;
  onOpenFilters: () => void;
}) {
  const { t } = useTranslation();
  const options = getReportClarificationOptions(clarification, isEnglish);
  const params = {
    mention: clarification.params.mention ?? '',
    unit: clarification.params.unit_name ?? '',
    maxDays: clarification.params.max_days ?? 366,
  };
  return (
    <div className="space-y-2.5">
      <div className="space-y-1 text-[12px] leading-5 text-foreground" role="status">
        {clarification.reasons.length > 0
          ? clarification.reasons.map((reason) => (
            <p key={reason}>{t(`chatWidget.report.clarification.reasons.${getReportClarificationReasonKey(reason, clarification.params)}`, params)}</p>
          ))
          : <div>{fallback}</div>}
      </div>
      {options.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">{t('chatWidget.report.clarification.choose')}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {options.map((option) => {
              const unitText = option.unit
                ? t('chatWidget.report.chips.unit', { level: unitLabels[option.unit.level], name: option.unit.name })
                : option.allScope ? t('chatWidget.report.clarification.allScope') : null;
              const label = [unitText, option.period].filter(Boolean).join(' · ');
              return (
                <li key={option.id} className="min-w-0">
                  <button
                    type="button"
                    disabled={Boolean(applying)}
                    onClick={() => onChoose(option.filter)}
                    aria-label={t('chatWidget.report.clarification.optionAria', { label })}
                    className="group flex w-full min-w-0 items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.04] px-2.5 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      {unitText && (
                        <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-4 text-foreground">
                          <Building2 className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate">{unitText}</span>
                        </span>
                      )}
                      {option.unit?.path && <span className="block truncate text-[10px] leading-4 text-muted-foreground">{option.unit.path}</span>}
                      {option.period && (
                        <span className={`flex min-w-0 items-center gap-1 leading-4 ${unitText ? 'text-[10px] text-muted-foreground' : 'text-[11px] font-semibold text-foreground'}`}>
                          <CalendarDays className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate">{option.period}</span>
                        </span>
                      )}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-[10px]" onClick={onOpenFilters}>
        <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t('chatWidget.report.clarification.openFilters')}
      </Button>
    </div>
  );
}
