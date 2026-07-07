import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronRight, FolderOpen } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/utils/confirm-store';
import { useAuthStore } from '@/utils/store';
import {
  getOrgGroups, createOrgGroup, updateOrgGroup, deleteOrgGroup,
  type OrgGroup,
} from '@/api/custom-groups';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function OrgGroupPanel({ selectedId, onSelect }: Props) {
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
    queryKey: ['org-groups'],
    queryFn: () => getOrgGroups({ page_size: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: () => createOrgGroup({ name: newName.trim() }),
    onSuccess: () => {
      toast.success('Đã tạo công ty');
      qc.invalidateQueries({ queryKey: ['org-groups'] });
      setNewName('');
      setShowCreate(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi tạo công ty'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateOrgGroup(id, { name }),
    onSuccess: () => {
      toast.success('Đã cập nhật');
      qc.invalidateQueries({ queryKey: ['org-groups'] });
      setEditId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi cập nhật'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteOrgGroup(id),
    onSuccess: (_, id) => {
      toast.success('Đã xóa công ty');
      qc.invalidateQueries({ queryKey: ['org-groups'] });
      if (selectedId === id) onSelect('');
    },
    onError: () => toast.error('Lỗi xóa công ty'),
  });

  const groups: OrgGroup[] = data?.groups ?? [];

  const handleDelete = (g: OrgGroup) => {
    confirmDialog({
      title: 'Xóa Công ty',
      description: `Xóa "${g.name}" sẽ xóa toàn bộ chi nhánh và phòng ban bên trong. Không thể hoàn tác.`,
      variant: 'destructive',
      onConfirm: () => deleteMutation.mutate(g.id),
    });
  };

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Công ty</span>
        {canAdd && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> Tạo mới
        </Button>}
      </div>

      {showCreate && (
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex gap-2">
          <Input
            autoFocus
            placeholder="Tên công ty..."
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
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5"><Skeleton className="h-4 w-3/4" /></div>
          ))
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <FolderOpen className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Chưa có công ty nào</p>
          </div>
        ) : groups.map(g => (
          <div
            key={g.id}
            onClick={() => onSelect(g.id)}
            className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${selectedId === g.id
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/40 text-foreground'
              }`}
          >
            {editId === g.id ? (
              <Input
                autoFocus
                className="h-6 text-xs flex-1"
                value={editName}
                onClick={e => e.stopPropagation()}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => setEditId(null)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editName.trim()) {
                    updateMutation.mutate({ id: g.id, name: editName.trim() });
                    setEditId(null);
                  }
                  if (e.key === 'Escape') setEditId(null);
                }}
              />
            ) : (
              <>
                <span className="flex-1 text-sm font-medium truncate">{g.name}</span>
                {g.subgroup_count > 0 && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-mono">
                    {g.subgroup_count}
                  </span>
                )}
                <div className="hidden group-hover:flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  {canEdit && <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditId(g.id); setEditName(g.name); }}>
                    <Pencil className="h-3 w-3" />
                  </button>}
                  {canDelete && <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(g)}>
                    <Trash2 className="h-3 w-3" />
                  </button>}
                </div>
                {selectedId === g.id && <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
