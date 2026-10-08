import { ArrowRight, CalendarSearch, Filter, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ReportChatFilter } from '@/api/custom-chat';
import type { ReportEmptyStateView } from './report-chat-card.logic';

/**
 * An empty period is not a dead end: say why there is nothing, offer the
 * closest month that has data (computed by the backend) and a shortcut to
 * the filter editor.
 */
export function ReportEmptyStatePanel({
  view,
  applying,
  onUseNearest,
  onChangeRange,
}: {
  view: ReportEmptyStateView;
  applying?: boolean;
  onUseNearest: (filter: ReportChatFilter) => void;
  onChangeRange: () => void;
}) {
  const { t } = useTranslation();
  if (view.reason === 'no_scope') {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-3 text-[11px] leading-5 text-muted-foreground dark:bg-white/[0.02]" role="status">
        {t('chatWidget.report.noAccessibleScope')}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-3 dark:bg-white/[0.02]" role="status">
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground">
          <SearchX className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{t('chatWidget.report.empty.title')}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {view.period
              ? t('chatWidget.report.empty.description', { period: view.period })
              : t('chatWidget.report.empty.descriptionNoPeriod')}
          </p>
          {view.nearest && (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {t(`chatWidget.report.empty.nearest_${view.nearest.direction}`, { period: view.nearest.label })}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {view.nearest && (
          <Button
            type="button"
            size="sm"
            className="h-8 min-w-0 max-w-full gap-1.5 px-2.5 text-[10px]"
            disabled={Boolean(applying)}
            onClick={() => onUseNearest(view.nearest!.filter)}
          >
            <CalendarSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('chatWidget.report.empty.useNearest', { period: view.nearest.label })}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-[10px]" onClick={onChangeRange}>
          <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('chatWidget.report.empty.changeRange')}
        </Button>
      </div>
    </div>
  );
}
