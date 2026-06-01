// ═══════════════════════════════════════════════════════════════
// TenantFilter — Bộ lọc tenant cho superadmin + superuser multi-tenant
// Hiển thị dropdown chọn tenant
// Render khi user.role === 'superadmin' hoặc superuser có nhiều managed_tenants
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { Building2, ChevronDown, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TenantFilterProps {
  /** Optional className cho container */
  className?: string;
}

export function TenantFilter({ className }: TenantFilterProps) {
  const user = useAuthStore((s) => s.user);
  const managedTenants = useAuthStore((s) => s.managedTenants);
  const { activeTenantId, activeTenantName, tenants, isLoading, fetchTenants, setActiveTenant } = useTenantStore();
  const qc = useQueryClient();

  const isSuperadmin = user?.role === 'superadmin';
  const isSuperuserMultiTenant = user?.role === 'superuser' && managedTenants.length > 1;
  const canSwitch = isSuperadmin || isSuperuserMultiTenant;

  // Fetch tenants khi mount (superadmin hoặc superuser multi-tenant)
  useEffect(() => {
    if (canSwitch && tenants.length === 0) {
      fetchTenants();
    }
  }, [canSwitch, tenants.length, fetchTenants]);

  // Không hiển thị nếu không có quyền switch
  if (!canSwitch) return null;

  const handleChange = (tenantId: string) => {
    const tenant = tenants.find(t => t.id === tenantId);
    if (tenant) {
      setActiveTenant(tenant.id, tenant.name);
      // Invalidate ALL queries để re-fetch với tenant mới
      qc.invalidateQueries();
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className || ''}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Đang tải tenants...</span>
      </div>
    );
  }

  if (tenants.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={activeTenantId || undefined} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-[200px] text-xs font-medium border-dashed">
          <SelectValue placeholder="Chọn tenant..." />
        </SelectTrigger>
        <SelectContent>
          {tenants.map(t => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activeTenantName && (
        <span className="text-[10px] text-muted-foreground/60 hidden lg:inline">
          Data scope: {activeTenantName}
        </span>
      )}
    </div>
  );
}
