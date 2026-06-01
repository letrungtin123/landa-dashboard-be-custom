// ============================================================
// groups.tsx — Group Management Page (Staff/Superuser only)
// Layout: 4-panel (OrgGroup | SubGroup | Team | Detail)
// ============================================================

import { useState } from 'react';
import { FolderTree, Users, MousePointerClick, UsersRound, ChevronRight, Building2, Network } from 'lucide-react';
import { TenantFilter } from '@/components/shared/TenantFilter';
import { OrgGroupPanel } from '@/components/groups/OrgGroupPanel';
import { SubGroupPanel } from '@/components/groups/SubGroupPanel';
import { TeamPanel } from '@/components/groups/TeamPanel';
import { TeamDetailPanel } from '@/components/groups/TeamDetailPanel';

export default function GroupsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedSubGroupId, setSelectedSubGroupId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

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
      <div className="px-6 py-4 border-b border-border/50 shrink-0 flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FolderTree className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight tracking-tight">Quản lý nhóm</h1>
            <p className="text-xs text-muted-foreground">
              Tổ chức học viên theo nhóm và phân quyền xem khóa học
            </p>
          </div>
        </div>
        <TenantFilter />
      </div>

      {/* Breadcrumb indicator */}
      <div className="px-6 py-2 border-b border-border/30 bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <span className={selectedGroupId ? 'text-primary font-medium' : 'text-muted-foreground/50'}>Tổ chức</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
        <span className={selectedSubGroupId ? 'text-primary font-medium' : 'text-muted-foreground/50'}>Phòng ban</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
        <span className={selectedTeamId ? 'text-primary font-medium' : 'text-muted-foreground/50'}>Team</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
        <span className={selectedTeamId ? 'text-primary font-medium' : 'text-muted-foreground/50'}>Chi tiết</span>
      </div>

      {/* 4-Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel 1 — Org Groups */}
        <div className="w-60 shrink-0 flex flex-col overflow-hidden border-r border-border/40 bg-card/30">
          <OrgGroupPanel
            selectedId={selectedGroupId}
            onSelect={handleSelectGroup}
          />
        </div>

        {/* Panel 2 — Sub Groups */}
        <div className="w-60 shrink-0 flex flex-col overflow-hidden border-r border-border/40 bg-card/20">
          {selectedGroupId ? (
            <SubGroupPanel
              groupId={selectedGroupId}
              selectedId={selectedSubGroupId}
              onSelect={handleSelectSubGroup}
            />
          ) : (
            <EmptyHint
              icon={<Building2 className="h-7 w-7" />}
              title="Phòng ban"
              text="Chọn một tổ chức ở panel bên trái"
            />
          )}
        </div>

        {/* Panel 3 — Teams */}
        <div className="w-60 shrink-0 flex flex-col overflow-hidden border-r border-border/40 bg-card/10">
          {selectedSubGroupId ? (
            <TeamPanel
              subgroupId={selectedSubGroupId}
              selectedId={selectedTeamId}
              onSelect={setSelectedTeamId}
            />
          ) : (
            <EmptyHint
              icon={<Network className="h-7 w-7" />}
              title="Team"
              text={selectedGroupId ? 'Chọn một phòng ban' : ''}
            />
          )}
        </div>

        {/* Panel 4 — Detail (flex grow) */}
        <div className="flex-1 overflow-hidden bg-background">
          {selectedTeamId ? (
            <TeamDetailPanel teamId={selectedTeamId} />
          ) : (
            <EmptyHint
              icon={<MousePointerClick className="h-7 w-7" />}
              title="Chi tiết Team"
              text={
                selectedSubGroupId
                  ? 'Chọn một team để xem chi tiết'
                  : selectedGroupId
                    ? 'Chọn phòng ban → team'
                    : 'Chọn tổ chức → phòng ban → team'
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
