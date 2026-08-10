// ═══════════════════════════════════════════════════════════════
// AI Chatbot — Shared helpers, skeletons, types
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  CheckCircle2, AlertCircle, Clock, Loader2, FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Animation variants ──
export const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

// ── Status Badge ──
export function statusBadge(status: string) {
  switch (status) {
    case "learned": return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="default" className="h-6 w-6 rounded-full bg-emerald-500/90 p-0 text-white" aria-label="Đã học"><CheckCircle2 className="h-3.5 w-3.5" /><span className="sr-only">Đã học</span></Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Đã học</TooltipContent>
      </Tooltip>
    );
    case "learning": return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="h-6 w-6 rounded-full bg-blue-500/20 p-0 text-blue-400" aria-label="Đang học"><Clock className="h-3.5 w-3.5 animate-spin" /><span className="sr-only">Đang học</span></Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Đang học</TooltipContent>
      </Tooltip>
    );
    case "deleting": return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="h-6 w-6 rounded-full bg-red-500/20 p-0 text-red-400" aria-label="Đang xoá"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="sr-only">Đang xoá</span></Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Đang xoá</TooltipContent>
      </Tooltip>
    );
    case "error": return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="h-6 w-6 rounded-full p-0" aria-label="Lỗi"><AlertCircle className="h-3.5 w-3.5" /><span className="sr-only">Lỗi</span></Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Lỗi</TooltipContent>
      </Tooltip>
    );
    default: return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="h-6 w-6 rounded-full p-0 text-muted-foreground" aria-label="Nháp"><Clock className="h-3.5 w-3.5" /><span className="sr-only">Nháp</span></Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Nháp</TooltipContent>
      </Tooltip>
    );
  }
}

// ── Formatters ──
export function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Debounce Hook ──
export function useDebounce(value: string, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}

// ── Pagination ──
const PAGE_SIZE_OPTIONS = [5, 10, 20];

export function PaginationBar({ page, totalPages, pageSize, onPageChange, onPageSizeChange }: {
  page: number; totalPages: number; pageSize: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Hiển thị</span>
        <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
          <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZE_OPTIONS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <span>/ trang</span>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Trước</Button>
          <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Sau</Button>
        </div>
      )}
    </div>
  );
}

// ── Skeleton Cards ──
export function KbCardSkeleton() {
  return (
    <div className="app-liquid-card rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function BotCardSkeleton() {
  return (
    <div className="app-liquid-card rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-3.5 w-full" />
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function TableSkeleton({ cols = 5, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center px-4 py-3 border-b last:border-0">
          {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}
