import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
// Removed PermissionsService
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Eye, Plus, Pencil, Trash2 } from 'lucide-react';
import { getLocalizedApiError } from '@/utils/localized-error';

type PermissionsJsonb = Record<string, Record<string, { view: boolean; add: boolean; edit: boolean; delete: boolean }>>;

interface ModuleTab {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  available_actions?: Record<string, boolean>;
}

interface ModuleWithTabs {
  id: string;
  code: string;
  name: string;
  tabs: ModuleTab[];
}

type PermissionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  tenantId: string;
  onSuccess?: () => void;
};

export function PermissionsDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  tenantId,
  onSuccess,
}: PermissionsDialogProps) {
  const { t } = useTranslation();
  const actionMeta = [
    { key: 'view' as const, label: t('permissionsDialog.view'), icon: Eye },
    { key: 'add' as const, label: t('permissionsDialog.add'), icon: Plus },
    { key: 'edit' as const, label: t('permissionsDialog.edit'), icon: Pencil },
    { key: 'delete' as const, label: t('permissionsDialog.delete'), icon: Trash2 },
  ];
  const [modules, setModules] = useState<ModuleWithTabs[]>([]);
  const [permissions, setPermissions] = useState<PermissionsJsonb>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!open || !groupId || !tenantId) return;
    try {
      setIsLoading(true);
      const mockModules = [
        { id: '1', code: 'dashboard', name: 'Dashboard', tabs: [{ id: '1-1', code: 'general', name: 'General' }] }
      ];
      setModules(mockModules as any);
      setPermissions({});
    } catch {
      toast.error(t('permissionsDialog.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [open, groupId, tenantId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getPermValue = (moduleCode: string, tabCode: string, action: 'view' | 'add' | 'edit' | 'delete') => {
    return permissions?.[moduleCode]?.[tabCode]?.[action] ?? false;
  };

  const togglePermission = (moduleCode: string, tabCode: string, action: 'view' | 'add' | 'edit' | 'delete') => {
    setPermissions((prev) => ({
      ...prev,
      [moduleCode]: {
        ...(prev[moduleCode] || {}),
        [tabCode]: {
          view: prev?.[moduleCode]?.[tabCode]?.view ?? false,
          add: prev?.[moduleCode]?.[tabCode]?.add ?? false,
          edit: prev?.[moduleCode]?.[tabCode]?.edit ?? false,
          delete: prev?.[moduleCode]?.[tabCode]?.delete ?? false,
          [action]: !(prev?.[moduleCode]?.[tabCode]?.[action] ?? false),
        },
      },
    }));
  };

  const toggleAllForTab = (moduleCode: string, tabCode: string, value: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleCode]: {
        ...(prev[moduleCode] || {}),
        [tabCode]: { view: value, add: value, edit: value, delete: value },
      },
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await new Promise(res => setTimeout(res, 500));
      toast.success(t('permissionsDialog.saved'));
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(getLocalizedApiError(error, t('permissionsDialog.saveFailed')));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 border-border overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 shrink-0" style={{ borderBottom: '1px solid transparent', borderImage: 'linear-gradient(to right, transparent, var(--border), transparent) 1' }}>
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              {t('permissionsDialog.title')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {t('permissionsDialog.description', { groupName })}
            </DialogDescription>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {isLoading ? (
            <div className="space-y-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <div className="border border-border rounded-lg p-3 space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            modules.map((mod) => (
              <div key={mod.id} className="space-y-2">
                <h3 className="text-[13px] font-semibold text-foreground">{mod.name}</h3>

                <div className="border border-border rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_repeat(4,56px)_40px] items-center px-3 py-2 bg-muted/50 border-b border-border gap-1">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('permissionsDialog.tab')}</span>
                    {actionMeta.map((a) => (
                      <span key={a.key} className="text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">
                        {a.label}
                      </span>
                    ))}
                    <span className="text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">{t('permissionsDialog.all')}</span>
                  </div>

                  {/* Rows */}
                  {mod.tabs.map((tab, ti) => {
                    // Check if all available actions are turned on
                    const applicableActions = actionMeta.filter(
                      (a) => tab.available_actions?.[a.key] !== false
                    );
                    const allOn = applicableActions.every((a) =>
                      getPermValue(mod.code, tab.code, a.key)
                    );

                    return (
                      <div
                        key={tab.id}
                        className={`grid grid-cols-[1fr_repeat(4,56px)_40px] items-center px-3 py-2.5 gap-1 ${
                          ti < mod.tabs.length - 1 ? 'border-b border-border' : ''
                        }`}
                      >
                        <span className="text-[13px] font-medium text-foreground">{tab.name}</span>
                        {actionMeta.map((a) => {
                          const isAvailable = tab.available_actions?.[a.key] !== false; // Default to true if not specified
                          return (
                            <div key={a.key} className="flex justify-center">
                              <Switch
                                checked={isAvailable && getPermValue(mod.code, tab.code, a.key)}
                                onCheckedChange={() => togglePermission(mod.code, tab.code, a.key)}
                                disabled={!isAvailable}
                                className={`scale-[0.8] ${!isAvailable ? 'opacity-30' : ''}`}
                              />
                            </div>
                          );
                        })}
                        <div className="flex justify-center">
                          <Switch
                            checked={applicableActions.length > 0 && allOn}
                            onCheckedChange={(v) => toggleAllForTab(mod.code, tab.code, v)}
                            disabled={applicableActions.length === 0}
                            className={`scale-[0.8] ${applicableActions.length === 0 ? 'opacity-30' : ''}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 shrink-0" style={{ borderTop: '1px solid transparent', borderImage: 'linear-gradient(to right, transparent, var(--border), transparent) 1' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 text-[13px]"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="h-9 px-5 text-[13px] transition-all duration-200 active:scale-[0.97]"
          >
            {isSaving ? t('permissionsDialog.saving') : t('permissionsDialog.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
