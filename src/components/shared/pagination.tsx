import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  label = 'bản ghi',
}: PaginationProps) {
  if (total <= 0) return null;

  // Hiển thị trang đầu, trang cuối và các trang gần trang hiện tại.
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-muted/20 gap-4 sm:gap-0" style={{ borderTop: '1px solid transparent', borderImage: 'linear-gradient(to right, transparent, var(--border), transparent) 1' }}>
      <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
        <div className="flex items-center gap-2">
          <span>Số dòng:</span>
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
          Hiển thị{' '}
          <span className="text-foreground">{(page - 1) * limit + 1}</span> đến{' '}
          <span className="text-foreground">{Math.min(page * limit, total)}</span>{' '}
          trong tổng <span className="text-foreground">{total}</span> {label}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="h-8 w-8 bg-background"
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
                variant={page === pageNum ? 'default' : 'outline'}
                size="icon"
                onClick={() => onPageChange(pageNum)}
                className={`h-8 w-8 text-xs ${page !== pageNum ? 'bg-background' : 'ring-1 ring-primary/20'}`}
              >
                {pageNum}
              </Button>
            </span>
          ))}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="h-8 w-8 bg-background"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
