import { useState, useCallback } from 'react';
import { Search, Loader2, FolderCheck } from 'lucide-react';
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

interface Props {
  open: boolean;
  teamId: string;
  assignedCategoryIds: string[];
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function AssignCourseCategoriesModal({ open, teamId, assignedCategoryIds, onOpenChange, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const targetLabel = lowerGroupLabel(labels.team);

  const { data, isFetching } = useQuery({
    queryKey: ['course-categories-for-group'],
    queryFn: getCourseCategories,
    enabled: open,
    staleTime: 30000,
  });

  const mutation = useMutation({
    mutationFn: () => assignTeamCourseCategories(teamId, selected),
    onSuccess: (res) => {
      toast.success(`Đã phân ${res.assigned} danh mục khóa học${res.skipped ? ` (${res.skipped} đã có)` : ''}`);
      setSelected([]);
      setSearch('');
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi phân danh mục khóa học'),
  });

  const allCategories = data?.results ?? [];
  const filtered = search.trim()
    ? allCategories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : allCategories;
  const availableCategories = filtered.filter(c => !assignedCategoryIds.includes(c.id));
  const allSelected = availableCategories.length > 0 && availableCategories.every(c => selected.includes(c.id));

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
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Phân danh mục khóa học cho {targetLabel}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm danh mục khóa học..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="app-liquid-card overflow-hidden border border-border rounded-lg">
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
          {isFetching ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              {search ? 'Không tìm thấy danh mục' : 'Chưa có danh mục khóa học nào. Hãy tạo trong mục Course Categories.'}
            </div>
          ) : filtered.map(c => {
            const isAssigned = assignedCategoryIds.includes(c.id);
            const isSelected = selected.includes(c.id);
            return (
              <div
                key={c.id}
                onClick={() => !isAssigned && toggle(c.id)}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isAssigned
                    ? 'opacity-40 cursor-not-allowed bg-muted/20'
                    : isSelected
                    ? 'bg-primary/10 cursor-pointer'
                    : 'hover:bg-muted/30 cursor-pointer'
                }`}
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected || isAssigned ? 'bg-primary border-primary' : 'border-border'
                }`}>
                  {(isSelected || isAssigned) && <FolderCheck className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.course_count} courses</p>
                </div>
                {isAssigned && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                    Đã phân
                  </span>
                )}
              </div>
            );
          })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={availableCategories.length === 0} id="select-all-course-cats-add" />
            <label htmlFor="select-all-course-cats-add" className="text-xs font-medium cursor-pointer">Chọn tất cả</label>
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Đã chọn <span className="font-semibold text-primary">{selected.length}</span> danh mục
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Hủy</Button>
          <Button
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Phân {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

