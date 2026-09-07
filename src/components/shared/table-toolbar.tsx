import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  placeholder: string;
  options: FilterOption[];
}

interface TableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  onReset?: () => void;
  actions?: React.ReactNode;
}

export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  filterValues = {},
  onFilterChange,
  onReset,
  actions,
}: TableToolbarProps) {
  const { t } = useTranslation();
  const isFiltered = search.length > 0 || Object.values(filterValues).some(v => v !== 'all' && v !== '');

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 w-full pb-3 border-b border-border/50">
      {/* Search */}
      <div className="relative w-full sm:max-w-sm group/search">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 transition-colors duration-200 group-focus-within/search:text-foreground" />
        <Input
          placeholder={searchPlaceholder || t('table.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 w-full bg-muted/40 border-border/50 hover:border-border hover:bg-muted/60 focus-visible:bg-background focus-visible:border-border shadow-none rounded-lg transition-all duration-200 text-sm placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Filters + Reset */}
      <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
        {filters.length > 0 && (
          <div className="hidden sm:flex items-center mr-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        )}

        {filters.map((filter) => {
          const currentValue = filterValues[filter.key] || 'all';
          const isActive = currentValue !== 'all';

          return (
            <Select
              key={filter.key}
              value={currentValue}
              onValueChange={(v) => onFilterChange?.(filter.key, v ?? 'all')}
            >
              <SelectTrigger
                className={`
                  h-8 w-full sm:w-auto sm:min-w-[120px] rounded-full text-xs font-medium
                  transition-all duration-200 ease-[var(--ease-out-expo)]
                  shadow-none border
                  ${isActive
                    ? 'app-liquid-filter-active font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <SelectValue placeholder={filter.placeholder} />
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-xl border-border/60 backdrop-blur-md bg-popover/95 min-w-[160px]">
                <SelectItem
                  value="all"
                  className="rounded-lg text-xs text-muted-foreground focus:text-foreground"
                >
                  {t('table.all', { label: filter.placeholder })}
                </SelectItem>
                <div className="my-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                {filter.options.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="rounded-lg text-xs font-medium text-foreground/80 focus:text-foreground transition-colors duration-150"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        {isFiltered && onReset && (
          <Button
            variant="ghost"
            onClick={onReset}
            className="h-8 px-3 text-xs text-muted-foreground hover:text-destructive rounded-full border border-transparent hover:border-destructive/20 hover:bg-destructive/5 shadow-none transition-all duration-200"
            aria-label={t('table.resetFilters')}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            {t('table.resetFilters')}
          </Button>
        )}
        
        {actions && (
          <div className="ml-2 flex items-center">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

