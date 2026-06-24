import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronRight, Users } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/utils/confirm-store';
import { useAuthStore } from '@/utils/store';
import {
  getSubGroups, createSubGroup, updateSubGroup, deleteSubGroup,
  type SubGroup,
} from '@/api/custom-groups';

interface Props {
  groupId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SubGroupPanel({ groupId, selectedId, onSelect }: Props) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('groups', 'can_add');
  const canEdit = hasPermission('groups', 'can_edit');
  const canDelete = hasPermission('groups', 'can_delete');
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sub-groups', groupId],
    queryFn: () => getSubGroups(groupId),
    enabled: !!groupId,
  });

  const createMutation = useMutation({
    mutationFn: () => createSubGroup(groupId, { name: newName.trim() }),
    onSuccess: () => {
      toast.success('Đã tạo nhóm');
      qc.invalidateQueries({ queryKey: ['sub-groups', groupId] });
      qc.invalidateQueries({ queryKey: ['org-groups'] }); // update subgroup_count badge
      setNewName('');
      setShowCreate(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi tạo nhóm'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateSubGroup(id, { name }),
    onSuccess: () => {
      toast.success('Đã cập nhật');
      qc.invalidateQueries({ queryKey: ['sub-groups', groupId] });
      setEditId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi cập nhật'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSubGroup(id),
    onSuccess: (_, id) => {
      toast.success('Đã xóa nhóm');
      qc.invalidateQueries({ queryKey: ['sub-groups', groupId] });
      qc.invalidateQueries({ queryKey: ['org-groups'] });
      if (selectedId === id) onSelect('');
    },
    onError: () => toast.error('Lỗi xóa nhóm'),
  });

  const subgroups: SubGroup[] = data?.subgroups ?? [];

  const handleDelete = (sg: SubGroup) => {
    confirmDialog({
      title: 'Xóa Nhóm',
      description: `Xóa "${sg.name}" sẽ xóa toàn bộ thành viên và course đã phân.`,
      variant: 'destructive',
      onConfirm: () => deleteMutation.mutate(sg.id),
    });
  };

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phòng ban</span>
        {canAdd && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> Tạo mới
        </Button>}
      </div>

      {showCreate && (
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex gap-2">
          <Input
            autoFocus
            placeholder="Tên phòng ban..."
            className="h-8 text-sm"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) createMutation.mutate();
              if (e.key === 'Escape') { setShowCreate(false); setNewName(''); }
            }}
          />
          <Button size="sm" className="h-8 px-3" disabled={!newName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}>
            Tạo
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5 flex gap-2">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))
        ) : subgroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Chưa có phòng ban nào</p>
          </div>
        ) : subgroups.map(sg => (
          <div
            key={sg.id}
            onClick={() => onSelect(sg.id)}
            className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${selectedId === sg.id
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/40 text-foreground'
              }`}
          >
            {editId === sg.id ? (
              <Input
                autoFocus
                className="h-6 text-xs flex-1"
                value={editName}
                onClick={e => e.stopPropagation()}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => setEditId(null)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editName.trim()) {
                    updateMutation.mutate({ id: sg.id, name: editName.trim() });
                    setEditId(null);
                  }
                  if (e.key === 'Escape') setEditId(null);
                }}
              />
            ) : (
              <>
                <span className="flex-1 text-sm font-medium truncate">{sg.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {sg.team_count > 0 && (
                    <span className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-mono">
                      {sg.team_count} team
                    </span>
                  )}
                </div>
                <div className="hidden group-hover:flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  {canEdit && <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditId(sg.id); setEditName(sg.name); }}>
                    <Pencil className="h-3 w-3" />
                  </button>}
                  {canDelete && <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(sg)}>
                    <Trash2 className="h-3 w-3" />
                  </button>}
                </div>
                {selectedId === sg.id && <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
