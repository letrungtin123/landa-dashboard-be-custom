import { useState, useCallback, useEffect } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { Search, Loader2, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers, type CustomUser } from '@/api/custom-users';
import { addMembers, addTeamMembers } from '@/api/custom-groups';

interface Props {
  open: boolean;
  sgId: string;
  teamId?: string;
  existingMemberIds: string[];
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function AddMembersModal({ open, sgId, teamId, existingMemberIds, onOpenChange, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 400);
  const targetLabel = teamId ? 'phòng ban' : 'chi nhánh';

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { data, isFetching } = useQuery({
    queryKey: ['users-for-group', debouncedSearch, page],
    queryFn: () => fetchUsers({ page, page_size: 20, search: debouncedSearch, role: 'learner,learner_plus' }),
    enabled: open,
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () => teamId ? addTeamMembers(teamId, selected) : addMembers(sgId, selected),
    onSuccess: (res) => {
      toast.success(`Đã thêm ${res.added} thành viên${res.skipped ? ` (${res.skipped} đã có)` : ''}`);
      setSelected([]);
      setSearch('');
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast.error('Lỗi thêm thành viên'),
  });

  const users: CustomUser[] = data?.data ?? [];
  const availableUsers = users.filter(u => !existingMemberIds.includes(u.id));
  const allSelected = availableUsers.length > 0 && availableUsers.every(u => selected.includes(u.id));

  const toggle = useCallback((id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(prev => prev.filter(id => !availableUsers.find(u => u.id === id)));
    } else {
      const newIds = availableUsers.map(u => u.id).filter(id => !selected.includes(id));
      setSelected(prev => [...prev, ...newIds]);
    }
  }, [allSelected, availableUsers, selected]);

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
          <DialogTitle>Thêm thành viên vào {targetLabel}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm user theo tên hoặc email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {isFetching ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Skeleton className="w-5 h-5 rounded shrink-0" />
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-3.5 w-24 rounded" />
                    <Skeleton className="h-3 w-36 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              Không tìm thấy user
            </div>
          ) : users.map(u => {
            const isExisting = existingMemberIds.includes(u.id);
            const isSelected = selected.includes(u.id);
            return (
              <div
                key={u.id}
                onClick={() => !isExisting && toggle(u.id)}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isExisting
                    ? 'opacity-40 cursor-not-allowed bg-muted/20'
                    : isSelected
                      ? 'bg-primary/10 cursor-pointer'
                      : 'hover:bg-muted/30 cursor-pointer'
                  }`}
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected || isExisting ? 'bg-primary border-primary' : 'border-border'
                  }`}>
                  {(isSelected || isExisting) && <UserCheck className="h-3 w-3 text-white" />}
                </div>
                {u.avatar_url ? (
                  <img src={storageUrl(u.avatar_url)} alt={u.username} className="w-8 h-8 rounded-full object-cover border border-border shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-semibold shrink-0">
                    {u.username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                {isExisting && <span className="text-[10px] text-muted-foreground">Đã có</span>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={availableUsers.length === 0} id="select-all-add" />
            <label htmlFor="select-all-add" className="text-xs font-medium cursor-pointer">Chọn tất cả trang này</label>
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Đã chọn <span className="font-semibold text-primary">{selected.length}</span> user
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mt-1">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Trang {page} / {Math.max(1, Math.ceil((data?.total || 0) / 20))}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil((data?.total || 0) / 20)} className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Hủy</Button>
          <Button
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Thêm {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
