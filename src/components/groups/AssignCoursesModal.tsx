import { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, BookCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDebounce } from '@/hooks/use-debounce';
import { getCourses } from '@/api/custom-courses';
import { assignTeamCourses } from '@/api/custom-groups';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { useAuthStore } from '@/utils/store';

interface Props {
  open: boolean;
  teamId: string;
  assignedCourseIds: string[];
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function AssignCoursesModal({ open, teamId, assignedCourseIds, onOpenChange, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 400);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const targetLabel = lowerGroupLabel(labels.team);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { data, isFetching } = useQuery({
    queryKey: ['courses-for-group', debouncedSearch, page],
    queryFn: () => getCourses({ page, page_size: 30, search: debouncedSearch }),
    enabled: open,
    staleTime: 30000,
  });

  const mutation = useMutation({
    mutationFn: () => assignTeamCourses(teamId, selected),
    onSuccess: (res) => {
      toast.success(`Đã phân ${res.assigned} course${res.skipped ? ` (${res.skipped} đã có)` : ''}`);
      setSelected([]);
      setSearch('');
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi phân course'),
  });

  // getCourses trả về { data: LandaCourse[], total, ... }
  const courses = data?.courses ?? [];
  const availableCourses = courses.filter(c => !assignedCourseIds.includes(c.id));
  const allSelected = availableCourses.length > 0 && availableCourses.every(c => selected.includes(c.id));

  const toggle = useCallback((id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(prev => prev.filter(id => !availableCourses.find(c => c.id === id)));
    } else {
      const newIds = availableCourses.map(c => c.id).filter(id => !selected.includes(id));
      setSelected(prev => [...prev, ...newIds]);
    }
  }, [allSelected, availableCourses, selected]);

  const handleClose = () => {
    setSearch('');
    setSelected([]);
    setPage(1);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Phân course cho {targetLabel}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm course theo tên..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {isFetching ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : courses.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              Không tìm thấy course
            </div>
          ) : courses.map(c => {
            const isAssigned = assignedCourseIds.includes(c.id);
            const isSelected = selected.includes(c.id);
            return (
              <div
                key={c.id}
                onClick={() => !isAssigned && toggle(c.id)}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isAssigned
                    ? 'opacity-40 cursor-not-allowed bg-muted/20'
                    : isSelected
                    ? 'bg-emerald-500/10 cursor-pointer'
                    : 'hover:bg-muted/30 cursor-pointer'
                }`}
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected || isAssigned ? 'bg-emerald-500 border-emerald-500' : 'border-border'
                }`}>
                  {(isSelected || isAssigned) && <BookCheck className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.display_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate font-mono">{c.id}</p>
                </div>
                {isAssigned && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">
                    Đã phân
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={availableCourses.length === 0} id="select-all-courses-add" />
            <label htmlFor="select-all-courses-add" className="text-xs font-medium cursor-pointer">Chọn tất cả trang này</label>
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Đã chọn <span className="font-semibold text-emerald-600">{selected.length}</span> course
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mt-1">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Trang {page} / {Math.max(1, Math.ceil((data?.total || 0) / 30))}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil((data?.total || 0) / 30)} className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Hủy</Button>
          <Button
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Phân {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
