import { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, FolderCheck, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getCourseCategories } from '@/api/custom-course-categories';
import { assignTeamCourseCategories } from '@/api/custom-groups';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { useAuthStore } from '@/utils/store';
import { useDebounce } from '@/hooks/use-debounce';

interface Props {
  open: boolean;
  teamId: string;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

const PAGE_SIZE = 30;

export function AssignCourseCategoriesModal({ open, teamId, onOpenChange, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 400);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const targetLabel = lowerGroupLabel(labels.team);

  useEffect(() => { setPage(1); }, [debouncedSearch, teamId]);

  const { data, isFetching } = useQuery({
    queryKey: ['course-categories-for-group', teamId, debouncedSearch, page],
    queryFn: () => getCourseCategories({
      page,
      page_size: PAGE_SIZE,
      search: debouncedSearch,
      assigned_team_id: teamId,
    }),
    enabled: open,
    staleTime: 30000,
  });

  const mutation = useMutation({
    mutationFn: () => assignTeamCourseCategories(teamId, selected),
    onSuccess: (res) => {
      toast.success(`Đã phân ${res.assigned} danh mục khóa học${res.skipped ? ` (${res.skipped} đã có)` : ''}`);
      setSelected([]);
      setSearch('');
      setPage(1);
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi phân danh mục khóa học'),
  });

  const categories = data?.results ?? [];
  const availableCategories = categories.filter(c => !c.is_assigned_to_team && !c.is_public);
  const allSelected = availableCategories.length > 0 && availableCategories.every(c => selected.includes(c.id));
  const totalPages = data?.totalPages ?? 1;

  const toggle = useCallback((id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(prev => prev.filter(id => !availableCategories.find(c => c.id === id)));
    } else {
      const newIds = availableCategories.map(c => c.id).filter(id => !selected.includes(id));
      setSelected(prev => [...prev, ...newIds]);
    }
  }, [allSelected, availableCategories, selected]);

  const handleClose = () => {
    setSearch('');
    setSelected([]);
    setPage(1);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Phân danh mục khóa học cho {targetLabel}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm danh mục khóa học..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="app-liquid-card min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
          <div className="max-h-[45vh] overflow-y-auto divide-y divide-border sm:max-h-72">
            {isFetching ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-center text-sm text-muted-foreground">
                {search ? 'Không tìm thấy danh mục' : 'Chưa có danh mục khóa học nào. Hãy tạo trong mục Danh mục khóa học.'}
              </div>
            ) : categories.map(c => {
              const isAssigned = Boolean(c.is_assigned_to_team);
              const isPublic = Boolean(c.is_public);
              const isDisabled = isAssigned || isPublic;
              const isSelected = selected.includes(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => !isDisabled && toggle(c.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    isAssigned
                      ? 'cursor-not-allowed bg-muted/20 opacity-40'
                      : isSelected
                      ? 'cursor-pointer bg-primary/10'
                      : 'cursor-pointer hover:bg-muted/30'
                  }`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected || isAssigned ? 'border-primary bg-primary' : 'border-border'
                  }`}>
                    {(isSelected || isAssigned) && <FolderCheck className="h-3 w-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.course_count} khóa học</p>
                  </div>
                  {isAssigned && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      Đã phân
                    </span>
                  )}
                  {isPublic && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-300">
                      <Globe className="h-3 w-3" /> Công khai
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={availableCategories.length === 0} id="select-all-course-cats-add" />
            <label htmlFor="select-all-course-cats-add" className="cursor-pointer text-xs font-medium">Chọn tất cả trang này</label>
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Đã chọn <span className="font-semibold text-primary">{selected.length}</span> danh mục
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isFetching} className="h-7 w-7 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Trang {page} / {Math.max(1, totalPages)}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching} className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>Hủy</Button>
          <Button
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Phân {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
