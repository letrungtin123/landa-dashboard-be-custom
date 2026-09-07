import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  limitOptions?: number[];
  label?: string;
}

export function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
  limitOptions = [5, 10, 20],
  label,
}: PaginationProps) {
  const { t } = useTranslation();
  const translatedLabel = label || t('pagination.records');
  if (total <= 0) return null;

  // Hiển thị trang đầu, trang cuối và các trang gần trang hiện tại.
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-muted/20 gap-4 sm:gap-0" style={{ borderTop: '1px solid transparent', borderImage: 'linear-gradient(to right, transparent, var(--border), transparent) 1' }}>
      <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
        <div className="flex items-center gap-2">
          <span>{t('pagination.rowsPerPage')}</span>
          <Select
            value={limit.toString()}
            onValueChange={(v) => {
              onLimitChange(Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="h-8 w-[65px] bg-background">
              <SelectValue placeholder={limit} />
            </SelectTrigger>
            <SelectContent>
              {limitOptions.map((opt) => (
                <SelectItem key={opt} value={opt.toString()}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden sm:block">
          <Trans
            i18nKey="pagination.showing"
            values={{
              start: (page - 1) * limit + 1,
              end: Math.min(page * limit, total),
              total,
              label: translatedLabel,
            }}
            components={{ accent: <span className="text-foreground" /> }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="pagination-page-button h-8 w-8 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          {pageNumbers.map((pageNum, idx) => (
            <span key={pageNum} className="contents">
              {idx > 0 && pageNumbers[idx - 1] !== pageNum - 1 && (
                <span className="text-xs text-muted-foreground px-1">…</span>
              )}
              <Button
                variant={page === pageNum ? 'default' : 'ghost'}
                size="icon"
                onClick={() => onPageChange(pageNum)}
                aria-current={page === pageNum ? 'page' : undefined}
                className={`h-8 w-8 text-xs ${page === pageNum ? 'pagination-page-active font-bold' : 'pagination-page-button text-muted-foreground'}`}
              >
                {pageNum}
              </Button>
            </span>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="pagination-page-button h-8 w-8 text-muted-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
