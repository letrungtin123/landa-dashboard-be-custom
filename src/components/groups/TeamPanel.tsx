import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, ChevronRight, Users } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/utils/confirm-store';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { useAuthStore } from '@/utils/store';
import {
  getTeams, createTeam, updateTeam, deleteTeam,
  type Team,
} from '@/api/custom-groups';
import { getLocalizedApiError } from '@/utils/localized-error';

interface Props {
  subgroupId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TeamPanel({ subgroupId, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('groups', 'can_add');
  const canEdit = hasPermission('groups', 'can_edit');
  const canDelete = hasPermission('groups', 'can_delete');
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const teamLabelLower = lowerGroupLabel(labels.team);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['teams', subgroupId],
    queryFn: () => getTeams(subgroupId),
    enabled: !!subgroupId,
  });

  const createMutation = useMutation({
    mutationFn: () => createTeam(subgroupId, { name: newName.trim() }),
    onSuccess: () => {
      toast.success(t('groups.created', { label: teamLabelLower }));
      qc.invalidateQueries({ queryKey: ['teams', subgroupId] });
      qc.invalidateQueries({ queryKey: ['sub-groups'] }); // update team_count badge
      setNewName('');
      setShowCreate(false);
    },
    onError: (error: unknown) => toast.error(getLocalizedApiError(error, t('groups.createFailed', { label: teamLabelLower }))),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateTeam(id, { name }),
    onSuccess: () => {
      toast.success(t('groups.updated'));
      qc.invalidateQueries({ queryKey: ['teams', subgroupId] });
      setEditId(null);
    },
    onError: (error: unknown) => toast.error(getLocalizedApiError(error, t('groups.updateFailed'))),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: (_, id) => {
      toast.success(t('groups.deleted', { label: teamLabelLower }));
      qc.invalidateQueries({ queryKey: ['teams', subgroupId] });
      qc.invalidateQueries({ queryKey: ['sub-groups'] });
      if (selectedId === id) onSelect('');
    },
    onError: () => toast.error(t('groups.deleteFailed', { label: teamLabelLower })),
  });

  const teams: Team[] = data?.teams ?? [];

  const handleDelete = (team: Team) => {
    confirmDialog({
      title: t('groups.deleteTitle', { label: labels.team }),
      description: t('groups.deleteTeamDescription', { name: team.name }),
      variant: 'destructive',
      onConfirm: () => deleteMutation.mutate(team.id),
    });
  };

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{labels.team}</span>
        {canAdd && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> {t('groups.createNew')}
        </Button>}
      </div>

      {showCreate && (
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex gap-2">
          <Input
            autoFocus
            placeholder={t('groups.namePlaceholder', { label: teamLabelLower })}
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
            {t('groups.create')}
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
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">{t('groups.none', { label: teamLabelLower })}</p>
          </div>
        ) : teams.map(team => (
          <div
            key={team.id}
            onClick={() => onSelect(team.id)}
            className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${selectedId === team.id
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/40 text-foreground'
              }`}
          >
            {editId === team.id ? (
              <Input
                autoFocus
                className="h-6 text-xs flex-1"
                value={editName}
                onClick={e => e.stopPropagation()}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => setEditId(null)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editName.trim()) {
                    updateMutation.mutate({ id: team.id, name: editName.trim() });
                    setEditId(null);
                  }
                  if (e.key === 'Escape') setEditId(null);
                }}
              />
            ) : (
              <>
                <span className="flex-1 text-sm font-medium truncate">{team.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {team.member_count > 0 && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-mono">
                      {team.member_count}
                    </span>
                  )}
                  {team.course_count > 0 && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-mono">
                      {team.course_count}
                    </span>
                  )}
                </div>
                <div className="hidden group-hover:flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  {canEdit && <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditId(team.id); setEditName(team.name); }}>
                    <Pencil className="h-3 w-3" />
                  </button>}
                  {canDelete && <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(team)}>
                    <Trash2 className="h-3 w-3" />
                  </button>}
                </div>
                {selectedId === team.id && <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
