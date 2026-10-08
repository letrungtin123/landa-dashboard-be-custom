import { BookOpen, Building2, CalendarDays, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReportUnitLevel } from '@/api/custom-chat';
import type { ReportAppliedChip } from './report-chat-card.logic';

const CHIP_CLASS = 'inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-medium leading-4 text-foreground dark:bg-white/[0.04]';
const EDITABLE_CLASS = `${CHIP_CLASS} transition-colors hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60`;

/**
 * The filters the snapshot was really built with (period, units, course).
 * Period and unit chips open the existing filter editor; the course comes
 * from the question and is shown read-only.
 */
export function ReportAppliedFilterChips({
  chips,
  unitLabels,
  onEdit,
}: {
  chips: ReportAppliedChip[];
  unitLabels: Record<ReportUnitLevel, string>;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  if (chips.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={t('chatWidget.report.chips.label')}>
      {chips.map((chip, index) => {
        if (chip.kind === 'course') {
          return (
            <li key={`course-${index}`} className="min-w-0 max-w-full">
              <span className={CHIP_CLASS} title={chip.name}>
                <BookOpen className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{t('chatWidget.report.chips.course', { name: chip.name })}</span>
              </span>
            </li>
          );
        }
        const text = chip.kind === 'period'
          ? [
            chip.label,
            chip.clampedToToday ? t('chatWidget.report.chips.untilToday') : null,
            chip.isDefault ? t('chatWidget.report.chips.defaultPeriod') : null,
          ].filter(Boolean).join(' · ')
          : chip.kind === 'unit'
            ? t('chatWidget.report.chips.unit', { level: unitLabels[chip.level], name: chip.name })
            : t('chatWidget.report.allAccessibleScope');
        const Icon = chip.kind === 'period' ? CalendarDays : Building2;
        return (
          <li key={`${chip.kind}-${index}`} className="min-w-0 max-w-full">
            <button
              type="button"
              className={EDITABLE_CLASS}
              onClick={onEdit}
              title={text}
              aria-label={t('chatWidget.report.chips.edit', { value: text })}
            >
              <Icon className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{text}</span>
              <Pencil className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
