// ============================================================
// groups.tsx — Group Management Page (Staff/Superuser only)
// Layout: 4-panel (OrgGroup | SubGroup | Team | Detail)
// ============================================================

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderTree, Users, MousePointerClick, UsersRound, ChevronRight, Building2, Network } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

import { OrgGroupPanel } from '@/components/groups/OrgGroupPanel';
import { SubGroupPanel } from '@/components/groups/SubGroupPanel';
import { TeamPanel } from '@/components/groups/TeamPanel';
import { TeamDetailPanel } from '@/components/groups/TeamDetailPanel';
import { getGroupLabelSet } from '@/utils/group-labels';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';

export default function GroupsPage() {
  const { t } = useTranslation();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedSubGroupId, setSelectedSubGroupId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);

  // Reset tất cả selections khi superadmin đổi tenant
  useEffect(() => {
    setSelectedGroupId('');
    setSelectedSubGroupId('');
    setSelectedTeamId('');
  }, [activeTenantId]);

  const handleSelectGroup = (id: string) => {
    setSelectedGroupId(id);
    setSelectedSubGroupId(''); // reset subgroup khi đổi group cha
    setSelectedTeamId('');
  };

  const handleSelectSubGroup = (id: string) => {
    setSelectedSubGroupId(id);
    setSelectedTeamId(''); // reset team khi đổi subgroup
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-6 py-4 border-b border-border/50 shrink-0 bg-card/50">
        <PageHeader
          icon={FolderTree}
          title={t('groups.title')}
          description={t('groups.description', labels)}
        />
      </div>

      {/* Breadcrumb indicator */}
      <div className="px-6 py-2 border-b border-border/30 bg-muted/20 flex flex-wrap items-center gap-2 text-xs text-muted-foreground shrink-0 overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => handleSelectGroup('')}
          className={`hover:underline transition-colors ${selectedGroupId ? 'text-primary font-medium' : 'text-muted-foreground/50'}`}>
          {labels.group}
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
        <button
          onClick={() => selectedGroupId && handleSelectSubGroup('')}
          className={`hover:underline transition-colors ${selectedSubGroupId ? 'text-primary font-medium' : selectedGroupId ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
          {labels.subgroup}
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
        <button
          onClick={() => selectedSubGroupId && setSelectedTeamId('')}
          className={`hover:underline transition-colors ${selectedTeamId ? 'text-primary font-medium' : selectedSubGroupId ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
          {labels.team}
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
        <span className={selectedTeamId ? 'text-primary font-medium' : 'text-muted-foreground/50'}>{t('groups.details')}</span>
      </div>

      {/* 4-Panel Layout */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Panel 1 — Org Groups */}
        <div className={`w-full md:w-60 shrink-0 flex-col overflow-hidden border-b md:border-b-0 md:border-r border-border/40 bg-card/30 ${selectedGroupId ? 'hidden md:flex' : 'flex flex-1 md:flex-none'}`}>
          <OrgGroupPanel
            selectedId={selectedGroupId}
            onSelect={handleSelectGroup}
          />
        </div>

        {/* Panel 2 — Sub Groups */}
        <div className={`w-full md:w-60 shrink-0 flex-col overflow-hidden border-b md:border-b-0 md:border-r border-border/40 bg-card/20 ${!selectedGroupId || selectedSubGroupId ? 'hidden md:flex' : 'flex flex-1 md:flex-none'}`}>
          {selectedGroupId ? (
            <SubGroupPanel
              groupId={selectedGroupId}
              selectedId={selectedSubGroupId}
              onSelect={handleSelectSubGroup}
            />
          ) : (
            <EmptyHint
              icon={<Building2 className="h-7 w-7" />}
              title={labels.subgroup}
              text={t('groups.selectParentGroup', { group: labels.group })}
            />
          )}
        </div>

        {/* Panel 3 — Teams */}
        <div className={`w-full md:w-60 shrink-0 flex-col overflow-hidden border-b md:border-b-0 md:border-r border-border/40 bg-card/10 ${!selectedSubGroupId || selectedTeamId ? 'hidden md:flex' : 'flex flex-1 md:flex-none'}`}>
          {selectedSubGroupId ? (
            <TeamPanel
              subgroupId={selectedSubGroupId}
              selectedId={selectedTeamId}
              onSelect={setSelectedTeamId}
            />
          ) : (
            <EmptyHint
              icon={<Network className="h-7 w-7" />}
              title={labels.team}
              text={selectedGroupId ? t('groups.selectSubgroup', { subgroup: labels.subgroup }) : ''}
            />
          )}
        </div>

        {/* Panel 4 — Detail (flex grow) */}
        <div className={`flex-1 flex-col overflow-hidden bg-background ${!selectedTeamId ? 'hidden md:flex' : 'flex'}`}>
          {selectedTeamId ? (
            <TeamDetailPanel teamId={selectedTeamId} />
          ) : (
            <EmptyHint
              icon={<MousePointerClick className="h-7 w-7" />}
              title={t('groups.detailOf', { team: labels.team })}
              text={
                selectedSubGroupId
                  ? t('groups.selectTeamToView', { team: labels.team })
                  : selectedGroupId
                    ? t('groups.selectSubgroupThenTeam', { subgroup: labels.subgroup, team: labels.team })
                    : t('groups.selectHierarchy', labels)
              }
              large
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ icon, text, title, large }: { icon: React.ReactNode; text: string; title?: string; large?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className={`rounded-2xl bg-muted/30 flex items-center justify-center text-muted-foreground/20 mb-3 ${large ? 'w-16 h-16' : 'w-12 h-12'}`}>
        {icon}
      </div>
      {title && (
        <p className={`font-semibold text-muted-foreground/40 mb-1 ${large ? 'text-sm' : 'text-xs'}`}>{title}</p>
      )}
      {text && (
        <p className={`text-muted-foreground/30 max-w-[160px] leading-relaxed ${large ? 'text-xs' : 'text-[11px]'}`}>{text}</p>
      )}
    </div>
  );
}
