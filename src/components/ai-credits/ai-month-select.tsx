import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocaleStore } from '@/utils/locale-store';
import { cn } from '@/utils/utils';
import { formatMonthLabel } from './ai-credits-format.logic';

/** Month picker ("YYYY-MM" values, newest first) with locale month names. */
export function AiMonthSelect({ months, value, onChange, className, disabled }: {
  months: readonly string[];
  value: string | null | undefined;
  onChange: (month: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocaleStore(state => state.locale);
  const options = value && !months.includes(value) ? [value, ...months] : [...months];
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled || options.length === 0}>
      <SelectTrigger className={cn('h-9 min-w-[180px] rounded-xl bg-background/80 font-medium', className)} aria-label={t('aiCredits.common.selectMonth')}>
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <SelectValue placeholder={t('aiCredits.common.selectMonth')} />
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map(month => <SelectItem key={month} value={month}>{formatMonthLabel(month, locale)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
