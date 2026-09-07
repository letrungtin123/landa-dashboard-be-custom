import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Building2, Plus, Pencil, Trash2, Search, Power, Loader2, Settings2, X, Check, Globe, Users, BookOpen, Key, Eye, EyeOff, Layers, Mail, Network } from "lucide-react";
import { PageHeader } from '@/components/shared/page-header';
import { cn } from "@/utils/utils";
import { getIconComponent } from "@/utils/icon-map";
import { getModuleDisplayName } from "@/utils/module-labels";
import { useAuthStore } from "@/utils/store";
import { useTenantStore } from "@/utils/tenant-store";
import { useHeaderInfo } from "@/utils/header-store";
import { useLocaleStore } from "@/utils/locale-store";
import { formatLocaleDate } from "@/utils/locale-format";
import { getLocalizedApiError } from "@/utils/localized-error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  fetchTenants, createTenant, updateTenant, deleteTenant,
  fetchTenantModules, updateTenantModules, fetchTenantCourseComponentPermissions, updateTenantCourseComponentPermissions,
  fetchTenantRoleLabels, updateTenantRoleLabels,
  fetchTenantGroupLabels, updateTenantGroupLabels,
  fetchTenantSmtpConfig, updateTenantSmtpConfig,
  type Tenant, type TenantModule,
} from "@/api/custom-tenants";
import {
  getLocalizedDefaultGroupLabel,
  SYSTEM_GROUP_LABEL_KEYS,
  normalizeGroupLabels,
  type GroupLabelKey,
  type GroupLabelMap,
} from "@/utils/group-labels";
import {
  DEFAULT_ROLE_LABELS,
  SYSTEM_ROLE_KEYS,
  normalizeRoleLabels,
  type RoleLabelMap,
  type UserRole,
} from "@/utils/role-labels";
import {
  COURSE_COMPONENT_PERMISSION_OPTIONS,
  DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES,
  normalizeCourseComponentPermissionTypes,
  type CourseComponentPermissionType,
} from "@/utils/course-component-permissions";

const ROLE_LABEL_FIELD_LABEL_KEYS: Record<UserRole, string> = {
  superadmin: "tenantManagement.roleFields.superadmin",
  superuser: "tenantManagement.roleFields.superuser",
  staff: "tenantManagement.roleFields.staff",
  learner: "tenantManagement.roleFields.learner",
  learner_plus: "tenantManagement.roleFields.learnerPlus",
};

const GROUP_LABEL_FIELD_LABEL_KEYS: Record<GroupLabelKey, string> = {
  group: "tenantManagement.groupFields.group",
  subgroup: "tenantManagement.groupFields.subgroup",
  team: "tenantManagement.groupFields.team",
};

function hasAnyRoleLabel(labels: RoleLabelMap): boolean {
  return SYSTEM_ROLE_KEYS.some(role => !!labels[role]?.trim());
}

function hasAnyGroupLabel(labels: GroupLabelMap): boolean {
  return SYSTEM_GROUP_LABEL_KEYS.some(key => !!labels[key]?.trim());
}

export default function TenantManagementPage() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  useHeaderInfo(t("tenantManagement.title"));
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showCreate, setShowCreate] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modulesTenant, setModulesTenant] = useState<Tenant | null>(null);
  const [modules, setModules] = useState<TenantModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [courseComponentPermissions, setCourseComponentPermissions] = useState<CourseComponentPermissionType[]>(
    DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES,
  );
  const [smtpTenant, setSmtpTenant] = useState<Tenant | null>(null);
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    is_enabled: false,
    host: "smtp.gmail.com",
    port: "587",
    secure: false,
    username: "",
    password: "",
    from_email: "",
    from_name: "",
    reply_to_email: "",
    copy_to_sender: true,
    copy_to_email: "",
  });

  // Form states
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDomainLearner, setFormDomainLearner] = useState("");
  const [formDomainAdmin, setFormDomainAdmin] = useState("");
  const [formMaxUsers, setFormMaxUsers] = useState<string>("");
  const [formMaxCourses, setFormMaxCourses] = useState<string>("");
  const [formGeminiApiKey, setFormGeminiApiKey] = useState("");
  const [formRoleLabels, setFormRoleLabels] = useState<RoleLabelMap>({});
  const [formRoleLabelsHadSaved, setFormRoleLabelsHadSaved] = useState(false);
  const [formGroupLabels, setFormGroupLabels] = useState<GroupLabelMap>({});
  const [formGroupLabelsHadSaved, setFormGroupLabelsHadSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const refreshRoleLabels = useAuthStore((s) => s.refreshRoleLabels);
  const refreshGroupLabels = useAuthStore((s) => s.refreshGroupLabels);

  const loadTenants = useCallback(async function loadTenants() {
    setLoading(true);
    try {
      const result = await fetchTenants({ page, page_size: 20, search: search || undefined });
      setTenants(result.data);
      setTotal(result.total);
    } catch {
      toast.error(t("tenantManagement.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [page, search, t]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  // ── Validate domain fields ──
  // Full URL hợp lệ: http:// hoặc https:// + hostname
  const URL_REGEX = /^https?:\/\/[a-zA-Z0-9]([a-zA-Z0-9.:@-]*[a-zA-Z0-9])?$/;

  function validateDomain(value: string, label: string): boolean {
    // Bỏ trailing slash trước khi validate
    const cleaned = value.replace(/\/+$/, '');
    if (!URL_REGEX.test(cleaned)) {
      toast.error(t("tenantManagement.invalidDomain", { label }));
      return false;
    }
    return true;
  }

  function validateForm(): boolean {
    if (!formName.trim() || !formSlug.trim()) { toast.error(t("tenantManagement.requiredFields")); return false; }

    const dl = formDomainLearner.trim();
    if (dl && !validateDomain(dl, t("tenantManagement.learnerDomain"))) return false;

    const da = formDomainAdmin.trim();
    if (da && !validateDomain(da, t("tenantManagement.adminDomain"))) return false;

    return true;
  }

  function resetForm() {
    setFormName("");
    setFormSlug("");
    setFormDomainLearner("");
    setFormDomainAdmin("");
    setFormMaxUsers("");
    setFormMaxCourses("");
    setFormGeminiApiKey("");
    setFormRoleLabels({});
    setFormRoleLabelsHadSaved(false);
    setFormGroupLabels({});
    setFormGroupLabelsHadSaved(false);
    setShowApiKey(false);
  }

  function setRoleLabel(role: UserRole, value: string) {
    setFormRoleLabels(prev => ({ ...prev, [role]: value }));
  }

  function setGroupLabel(key: GroupLabelKey, value: string) {
    setFormGroupLabels(prev => ({ ...prev, [key]: value }));
  }

  async function openEditTenant(tenant: Tenant) {
    setFormName(tenant.name);
    setFormSlug(tenant.slug);
    setFormDomainLearner(tenant.domain_learner || "");
    setFormDomainAdmin(tenant.domain_admin || "");
    setFormMaxUsers(tenant.max_users !== null ? String(tenant.max_users) : "");
    setFormMaxCourses(tenant.max_courses !== null ? String(tenant.max_courses) : "");
    const existingKey = (tenant.settings?.gemini_api_key as string) || "";
    setFormGeminiApiKey(existingKey);
    setShowApiKey(false);
    setFormRoleLabels({});
    setFormRoleLabelsHadSaved(false);
    setFormGroupLabels({});
    setFormGroupLabelsHadSaved(false);
    setEditTenant(tenant);

    try {
      const [roleLabelsResult, groupLabelsResult] = await Promise.all([
        fetchTenantRoleLabels(tenant.id),
        fetchTenantGroupLabels(tenant.id),
      ]);
      const roleLabels = normalizeRoleLabels(roleLabelsResult);
      const groupLabels = normalizeGroupLabels(groupLabelsResult);
      setFormRoleLabels(roleLabels);
      setFormRoleLabelsHadSaved(hasAnyRoleLabel(roleLabels));
      setFormGroupLabels(groupLabels);
      setFormGroupLabelsHadSaved(hasAnyGroupLabel(groupLabels));
    } catch {
      toast.error(t("tenantManagement.labelsLoadFailed"));
    }
  }

  // ── Create ──
  async function handleCreate() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const settings: Record<string, unknown> = {};
      if (formGeminiApiKey.trim()) settings.gemini_api_key = formGeminiApiKey.trim();
      const tenant = await createTenant({
        name: formName,
        slug: formSlug,
        domain_learner: formDomainLearner.trim().replace(/\/+$/, '') || null,
        domain_admin: formDomainAdmin.trim().replace(/\/+$/, '') || null,
        max_users: formMaxUsers ? parseInt(formMaxUsers, 10) : null,
        max_courses: formMaxCourses ? parseInt(formMaxCourses, 10) : null,
        settings: Object.keys(settings).length > 0 ? settings : undefined,
      });
      const labels = normalizeRoleLabels(formRoleLabels);
      if (hasAnyRoleLabel(labels)) {
        await updateTenantRoleLabels(tenant.id, labels);
      }
      const groupLabels = normalizeGroupLabels(formGroupLabels);
      if (hasAnyGroupLabel(groupLabels)) {
        await updateTenantGroupLabels(tenant.id, groupLabels);
      }
      toast.success(t("tenantManagement.created"));
      setShowCreate(false);
      resetForm();
      loadTenants();
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, t("tenantManagement.createFailed")));
    } finally { setSaving(false); }
  }

  // ── Update ──
  async function handleUpdate() {
    if (!editTenant) return;
    if (!validateForm()) return;
    setSaving(true);
    try {
      const updSettings: Record<string, unknown> = { ...(editTenant.settings || {}) };
      const nextGeminiApiKey = formGeminiApiKey.trim();
      if (nextGeminiApiKey) updSettings.gemini_api_key = nextGeminiApiKey;
      else delete updSettings.gemini_api_key;
      await updateTenant(editTenant.id, {
        name: formName,
        slug: formSlug,
        domain_learner: formDomainLearner.trim().replace(/\/+$/, '') || null,
        domain_admin: formDomainAdmin.trim().replace(/\/+$/, '') || null,
        max_users: formMaxUsers ? parseInt(formMaxUsers, 10) : null,
        max_courses: formMaxCourses ? parseInt(formMaxCourses, 10) : null,
        settings: updSettings,
      });
      const labels = normalizeRoleLabels(formRoleLabels);
      if (hasAnyRoleLabel(labels) || formRoleLabelsHadSaved) {
        await updateTenantRoleLabels(editTenant.id, labels);
      }
      const groupLabels = normalizeGroupLabels(formGroupLabels);
      if (hasAnyGroupLabel(groupLabels) || formGroupLabelsHadSaved) {
        await updateTenantGroupLabels(editTenant.id, groupLabels);
      }
      if (editTenant.id === activeTenantId) {
        await Promise.all([refreshRoleLabels(), refreshGroupLabels()]);
      }
      toast.success(t("tenantManagement.updated"));
      setEditTenant(null);
      loadTenants();
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, t("tenantManagement.updateFailed")));
    } finally { setSaving(false); }
  }

  // ── Toggle active ──
  async function handleToggleActive(tenant: Tenant) {
    try {
      await updateTenant(tenant.id, { is_active: !tenant.is_active });
      toast.success(tenant.is_active ? t("tenantManagement.deactivated") : t("tenantManagement.activated"));
      loadTenants();
    } catch { toast.error(t("tenantManagement.statusUpdateFailed")); }
  }

  // ── Delete ──
  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteTenant(deletingId);
      toast.success(t("tenantManagement.deleted"));
      setDeletingId(null);
      loadTenants();
    } catch { toast.error(t("tenantManagement.deleteFailed")); }
  }

  // ── Modules ──
  async function openModules(tenant: Tenant) {
    setModulesTenant(tenant);
    setModulesLoading(true);
    setCourseComponentPermissions(DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES);
    try {
      const [mods, componentPermissions] = await Promise.all([
        fetchTenantModules(tenant.id),
        fetchTenantCourseComponentPermissions(tenant.id),
      ]);
      setModules(mods);
      setCourseComponentPermissions(normalizeCourseComponentPermissionTypes(componentPermissions.allowed_component_types));
    } catch { toast.error(t("tenantManagement.modulesLoadFailed")); }
    finally { setModulesLoading(false); }
  }

  function toggleModule(moduleId: string) {
    setModules(function toggle(prev) {
      return prev.map(function mapMod(m) {
        return m.module_id === moduleId ? { ...m, is_enabled: !m.is_enabled } : m;
      });
    });
  }

  function setCourseComponentEnabled(componentType: CourseComponentPermissionType, enabled: boolean) {
    setCourseComponentPermissions(function update(prev) {
      const selected = new Set(prev);
      if (enabled) selected.add(componentType);
      else selected.delete(componentType);
      return DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES.filter(type => selected.has(type));
    });
  }

  async function saveModules() {
    if (!modulesTenant) return;
    setSaving(true);
    try {
      await Promise.all([
        updateTenantModules(
          modulesTenant.id,
          modules.map(function mapMod(m) { return { module_id: m.module_id, is_enabled: m.is_enabled }; })
        ),
        updateTenantCourseComponentPermissions(modulesTenant.id, courseComponentPermissions),
      ]);
      toast.success(t("tenantManagement.modulesUpdated"));
      setModulesTenant(null);
    } catch { toast.error(t("tenantManagement.modulesUpdateFailed")); }
    finally { setSaving(false); }
  }

  async function openSmtp(tenant: Tenant) {
    setSmtpTenant(tenant);
    setSmtpLoading(true);
    try {
      const config = await fetchTenantSmtpConfig(tenant.id);
      setSmtpHasPassword(config.has_password);
      setSmtpForm({
        is_enabled: config.is_enabled,
        host: config.host || "smtp.gmail.com",
        port: String(config.port || 587),
        secure: config.secure,
        username: config.username || "",
        password: "",
        from_email: config.from_email || config.username || "",
        from_name: config.from_name || tenant.name,
        reply_to_email: config.reply_to_email || "",
        copy_to_sender: config.copy_to_sender,
        copy_to_email: config.copy_to_email || config.username || "",
      });
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, t("tenantManagement.smtpLoadFailed")));
    } finally {
      setSmtpLoading(false);
    }
  }

  function setSmtpField(key: keyof typeof smtpForm, value: string | boolean) {
    setSmtpForm(prev => ({ ...prev, [key]: value }));
  }

  async function saveSmtp() {
    if (!smtpTenant) return;
    const port = parseInt(smtpForm.port, 10);
    if (!smtpForm.host.trim() || !smtpForm.username.trim() || !smtpForm.from_email.trim() || !port) {
      toast.error(t("tenantManagement.smtpRequiredFields"));
      return;
    }
    setSaving(true);
    try {
      await updateTenantSmtpConfig(smtpTenant.id, {
        is_enabled: smtpForm.is_enabled,
        host: smtpForm.host.trim(),
        port,
        secure: smtpForm.secure,
        username: smtpForm.username.trim(),
        password: smtpForm.password.trim() || undefined,
        from_email: smtpForm.from_email.trim(),
        from_name: smtpForm.from_name.trim(),
        reply_to_email: smtpForm.reply_to_email.trim() || null,
        copy_to_sender: smtpForm.copy_to_sender,
        copy_to_email: smtpForm.copy_to_email.trim() || null,
      });
      toast.success(t("tenantManagement.smtpSaved"));
      setSmtpTenant(null);
      setSmtpForm(prev => ({ ...prev, password: "" }));
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, t("tenantManagement.smtpSaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        icon={Building2}
        title={t("tenantManagement.title")}
        description={t("tenantManagement.description", { count: total })}
        actions={
          <Button onClick={function open() { resetForm(); setShowCreate(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> {t("tenantManagement.createTenant")}
          </Button>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("tenantManagement.searchPlaceholder")}
          value={search}
          onChange={function onChange(e) { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <TooltipProvider delayDuration={300}>
      <div className="app-data-table-shell rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("tenantManagement.name")}</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>{t("tenantManagement.learnerDomain")}</TableHead>
              <TableHead>{t("tenantManagement.adminDomain")}</TableHead>
              <TableHead className="text-center">{t("tenantManagement.userLimit")}</TableHead>
              <TableHead className="text-center">{t("tenantManagement.courseLimit")}</TableHead>
              <TableHead className="text-center">{t("tenantManagement.status")}</TableHead>
              <TableHead>{t("tenantManagement.createdAt")}</TableHead>
              <TableHead className="text-right">{t("tenantManagement.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : tenants.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">{t("tenantManagement.empty")}</TableCell></TableRow>
            ) : (
              <AnimatePresence>
                {tenants.map(function renderRow(tenant) {
                  return (
                    <motion.tr key={tenant.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="border-b transition-colors hover:bg-muted/50">
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{tenant.slug}</code></TableCell>
                      <TableCell>
                        {tenant.domain_learner ? (
                          <code className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-1 rounded flex items-center gap-1 w-fit">
                            <Globe className="h-3 w-3" />
                            {tenant.domain_learner}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tenant.domain_admin ? (
                          <code className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded flex items-center gap-1 w-fit">
                            <Globe className="h-3 w-3" />
                            {tenant.domain_admin}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs font-mono">
                          {tenant.max_users !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              {tenant.max_users}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">∞</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs font-mono">
                          {tenant.max_courses !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <BookOpen className="h-3 w-3 text-muted-foreground" />
                              {tenant.max_courses}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">∞</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={tenant.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={function click() { handleToggleActive(tenant); }}>
                          {tenant.is_active ? t("tenantManagement.active") : t("tenantManagement.inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatLocaleDate(tenant.created_at, locale)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={function click() { openModules(tenant); }}>
                                <Settings2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("tenantManagement.modules")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={function click() { openSmtp(tenant); }}>
                                <Mail className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>SMTP</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={function click() { openEditTenant(tenant); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("common.edit")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={function click() { setDeletingId(tenant.id); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("common.delete")}</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={function prev() { setPage(page - 1); }}>{t("tenantManagement.previous")}</Button>
          <span className="flex items-center px-3 text-sm text-muted-foreground">{t("tenantManagement.page", { page })}</span>
          <Button variant="outline" size="sm" disabled={tenants.length < 20} onClick={function next() { setPage(page + 1); }}>{t("tenantManagement.next")}</Button>
        </div>
      )}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={showCreate || !!editTenant} onOpenChange={function close() { setShowCreate(false); setEditTenant(null); }}>
        <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-muted/20 shrink-0">
            <DialogTitle>{editTenant ? t("tenantManagement.editTitle") : t("tenantManagement.createTitle")}</DialogTitle>
            <DialogDescription>{t("tenantManagement.formDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tenantManagement.tenantName")}</label>
              <Input value={formName} onChange={function onChange(e) { setFormName(e.target.value); }} placeholder="LANDA Demo" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input value={formSlug} onChange={function onChange(e) { setFormSlug(e.target.value); }} placeholder="landa-demo" />
              <p className="text-xs text-muted-foreground">{t("tenantManagement.slugHint")}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tenantManagement.learnerDomain")} <span className="text-muted-foreground font-normal">{t("tenantManagement.optional")}</span></label>
              <Input value={formDomainLearner} onChange={function onChange(e) { setFormDomainLearner(e.target.value); }} placeholder="https://lms.nesso.com.vn" />
              <p className="text-xs text-muted-foreground">{t("tenantManagement.learnerDomainHint")}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tenantManagement.adminDomain")} <span className="text-muted-foreground font-normal">{t("tenantManagement.optional")}</span></label>
              <Input value={formDomainAdmin} onChange={function onChange(e) { setFormDomainAdmin(e.target.value); }} placeholder="https://cms.nesso.com.vn" />
              <p className="text-xs text-muted-foreground">{t("tenantManagement.adminDomainHint")}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("tenantManagement.userLimit")}
                </label>
                <Input
                  type="number" min="0"
                  value={formMaxUsers}
                  onChange={function onChange(e) { setFormMaxUsers(e.target.value); }}
                  placeholder={t("tenantManagement.unlimited")}
                />
                <p className="text-xs text-muted-foreground">{t("tenantManagement.unlimitedHint")}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("tenantManagement.courseLimit")}
                </label>
                <Input
                  type="number" min="0"
                  value={formMaxCourses}
                  onChange={function onChange(e) { setFormMaxCourses(e.target.value); }}
                  placeholder={t("tenantManagement.unlimited")}
                />
                <p className="text-xs text-muted-foreground">{t("tenantManagement.unlimitedHint")}</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Gemini API Key <span className="text-muted-foreground font-normal">{t("tenantManagement.optional")}</span>
              </label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={formGeminiApiKey}
                  onChange={function onChange(e) { setFormGeminiApiKey(e.target.value); }}
                  placeholder="AIzaSy..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={function toggle() { setShowApiKey(!showApiKey); }}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("tenantManagement.geminiHint")}</p>
            </div>
            <div className="app-liquid-card space-y-3 rounded-lg border bg-muted/10 p-4">
              <div className="flex items-start gap-2">
                <Layers className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium">{t("tenantManagement.roleLabels")}</label>
                  <p className="text-xs text-muted-foreground">{t("tenantManagement.labelDefaultsHint")}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SYSTEM_ROLE_KEYS.map(function renderRoleInput(role) {
                  return (
                    <div key={role} className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t(ROLE_LABEL_FIELD_LABEL_KEYS[role])}</label>
                      <Input
                        maxLength={64}
                        value={formRoleLabels[role] || ""}
                        onChange={function onChange(e) { setRoleLabel(role, e.target.value); }}
                        placeholder={DEFAULT_ROLE_LABELS[role]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="app-liquid-card space-y-3 rounded-lg border bg-muted/10 p-4">
              <div className="flex items-start gap-2">
                <Network className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium">{t("tenantManagement.groupLabels")}</label>
                  <p className="text-xs text-muted-foreground">{t("tenantManagement.labelDefaultsHint")}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SYSTEM_GROUP_LABEL_KEYS.map(function renderGroupLabelInput(key) {
                  return (
                    <div key={key} className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t(GROUP_LABEL_FIELD_LABEL_KEYS[key])}</label>
                      <Input
                        maxLength={64}
                        value={formGroupLabels[key] || ""}
                        onChange={function onChange(e) { setGroupLabel(key, e.target.value); }}
                        placeholder={getLocalizedDefaultGroupLabel(key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/10 shrink-0">
            <DialogClose asChild><Button variant="outline">{t("common.cancel")}</Button></DialogClose>
            <Button onClick={editTenant ? handleUpdate : handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTenant ? t("tenantManagement.update") : t("tenantManagement.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deletingId} onOpenChange={function close() { setDeletingId(null); }}>
        <DialogContent className="sm:max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle>{t("tenantManagement.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("tenantManagement.deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">{t("common.cancel")}</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>{t("common.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMTP Dialog */}
      <Dialog open={!!smtpTenant} onOpenChange={function close() { setSmtpTenant(null); }}>
        <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {t("tenantManagement.smtpTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("tenantManagement.smtpDescriptionBefore")} <strong>{smtpTenant?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          {smtpLoading ? (
            <div className="space-y-3 py-4">
              <div className="h-9 rounded-md bg-muted/50 animate-pulse" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-9 rounded-md bg-muted/40 animate-pulse" />
                <div className="h-9 rounded-md bg-muted/40 animate-pulse" />
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="app-liquid-card flex items-center justify-between rounded-lg border bg-muted/10 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{t("tenantManagement.enableSmtp")}</div>
                  <div className="text-xs text-muted-foreground">{t("tenantManagement.enableSmtpDescription")}</div>
                </div>
                <Switch checked={smtpForm.is_enabled} onCheckedChange={function change(v) { setSmtpField("is_enabled", v); }} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Host</label>
                  <Input value={smtpForm.host} onChange={function change(e) { setSmtpField("host", e.target.value); }} placeholder="smtp.gmail.com" />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Port</label>
                    <Input type="number" value={smtpForm.port} onChange={function change(e) { setSmtpField("port", e.target.value); }} placeholder="587" />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={smtpForm.secure} onCheckedChange={function change(v) { setSmtpField("secure", v); }} />
                      SSL
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Username</label>
                  <Input value={smtpForm.username} onChange={function change(e) { setSmtpField("username", e.target.value); }} placeholder="admin@company.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Password/App password</label>
                  <Input
                    type="password"
                    value={smtpForm.password}
                    onChange={function change(e) { setSmtpField("password", e.target.value); }}
                    placeholder={smtpHasPassword ? t("tenantManagement.keepExistingPassword") : t("tenantManagement.enterAppPassword")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">From email</label>
                  <Input value={smtpForm.from_email} onChange={function change(e) { setSmtpField("from_email", e.target.value); }} placeholder="admin@company.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">From name</label>
                  <Input value={smtpForm.from_name} onChange={function change(e) { setSmtpField("from_name", e.target.value); }} placeholder="Landa LMS" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Reply-to</label>
                  <Input value={smtpForm.reply_to_email} onChange={function change(e) { setSmtpField("reply_to_email", e.target.value); }} placeholder="support@company.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("tenantManagement.copyRecipient")}</label>
                  <Input value={smtpForm.copy_to_email} onChange={function change(e) { setSmtpField("copy_to_email", e.target.value); }} placeholder="admin@company.com" />
                </div>
              </div>

              <div className="app-liquid-card flex items-center justify-between rounded-lg border bg-muted/10 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{t("tenantManagement.copyToOrganization")}</div>
                  <div className="text-xs text-muted-foreground">{t("tenantManagement.copyToOrganizationDescription")}</div>
                </div>
                <Switch checked={smtpForm.copy_to_sender} onCheckedChange={function change(v) { setSmtpField("copy_to_sender", v); }} />
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="outline">{t("common.cancel")}</Button></DialogClose>
            <Button onClick={saveSmtp} disabled={saving || smtpLoading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("tenantManagement.saveSmtp")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modules Toggle Dialog ── */}
      <Dialog open={!!modulesTenant} onOpenChange={function close() { setModulesTenant(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] md:h-auto md:max-h-[85vh] p-0 flex flex-col overflow-hidden border-0 shadow-2xl rounded-2xl">
          <div className="bg-gradient-to-br from-card to-muted/30 p-4 md:p-6 border-b border-border/50 shrink-0">
            <DialogHeader>
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2.5 md:p-3 bg-primary/10 rounded-xl md:rounded-2xl shadow-inner border border-primary/20">
                  <Settings2 className="w-6 h-6 md:w-8 md:h-8 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl md:text-2xl font-bold">{t("tenantManagement.modulePermissionsTitle")}</DialogTitle>
                  <DialogDescription className="text-sm md:text-base mt-1">
                    {t("tenantManagement.modulePermissionsBefore")} <strong className="text-foreground">{modulesTenant?.name}</strong>
                  </DialogDescription>
                </div>
              </div>
              <div className="mt-4 flex items-center">
                <Badge variant="outline" className="px-3 py-1 rounded-full bg-primary/5 text-primary border-primary/20 shadow-sm font-semibold text-xs md:text-sm">
                  <span className="relative flex h-2 w-2 mr-2 inline-flex">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  {t("tenantManagement.activeModules", { enabled: modules.filter(m => m.is_enabled).length, total: modules.length })}
                </Badge>
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 px-4 py-4 md:px-6 md:py-6 bg-muted/10 overflow-y-auto custom-scrollbar">
            {modulesLoading ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm">{t("tenantManagement.loadingConfiguration")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {modules.map(function renderMod(m) {
                  const Icon = getIconComponent(m.icon);
                  const moduleName = getModuleDisplayName(m.code, m.name);
                  const isCoursesModule = m.code === 'courses';
                  return (
                    <motion.div 
                      key={m.module_id} 
                      className={cn(
                        "relative flex flex-col gap-4 p-4 md:p-5 rounded-[16px] md:rounded-[20px] border transition-all duration-300",
                        isCoursesModule && "md:col-span-2",
                        m.is_enabled 
                          ? "border-primary/40 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/60" 
                          : "border-border/60 bg-muted/30 opacity-85 hover:opacity-100 hover:bg-muted/50"
                      )}
                      layout
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <div className={cn(
                          "p-2.5 md:p-3.5 rounded-[12px] md:rounded-[14px] shadow-inner border shrink-0",
                          m.is_enabled ? "bg-primary/10 text-primary border-primary/20" : "bg-background text-muted-foreground border-border/50"
                        )}>
                          <Icon className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className={cn("font-bold text-[14px] md:text-[15px] truncate", m.is_enabled ? "text-foreground" : "text-muted-foreground")}>
                                {moduleName}
                              </h4>
                            </div>
                            <Switch
                              checked={m.is_enabled}
                              onCheckedChange={function toggle() { toggleModule(m.module_id); }}
                              className={cn("mt-0.5 scale-90 md:scale-110 shadow-sm shrink-0", m.is_enabled && "data-[state=checked]:bg-emerald-500")}
                            />
                          </div>
                        </div>
                      </div>

                      {isCoursesModule && (
                        <div className={cn(
                          "rounded-xl border border-border/70 bg-background/70 p-3 md:p-4 space-y-3",
                          !m.is_enabled && "opacity-60"
                        )}>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-foreground">{t("tenantManagement.courseComponentsTitle")}</div>
                              <p className="text-xs text-muted-foreground">{t("tenantManagement.courseComponentsDescription")}</p>
                            </div>
                            <Badge variant="outline" className="w-fit rounded-full border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                              {courseComponentPermissions.length} / {COURSE_COMPONENT_PERMISSION_OPTIONS.length}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {COURSE_COMPONENT_PERMISSION_OPTIONS.map(function renderCourseComponent(option) {
                              const checked = courseComponentPermissions.includes(option.type);
                              return (
                                <label
                                  key={option.type}
                                  className={cn(
                                    "flex min-w-0 items-start gap-3 rounded-lg border bg-card/80 p-3 text-left transition-colors",
                                    m.is_enabled ? "cursor-pointer hover:border-primary/50 hover:bg-primary/5" : "cursor-not-allowed opacity-70"
                                  )}
                                >
                                  <Checkbox
                                    checked={checked}
                                    disabled={!m.is_enabled || saving}
                                    onCheckedChange={function change(value) { setCourseComponentEnabled(option.type, value === true); }}
                                    className="mt-0.5"
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-semibold leading-tight text-foreground">{t(`tenantManagement.courseComponents.${option.type}.label`)}</span>
                                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{t(`tenantManagement.courseComponents.${option.type}.description`)}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="p-4 md:p-6 bg-card border-t border-border/50 shrink-0 mt-auto">
            <div className="flex justify-end gap-2 md:gap-3 w-full">
              <DialogClose asChild><Button variant="outline" className="px-4 md:px-6 rounded-lg md:rounded-xl">{t("common.cancel")}</Button></DialogClose>
              <Button onClick={saveModules} disabled={saving} className="px-6 md:px-8 rounded-lg md:rounded-xl shadow-md">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {t("tenantManagement.saveModules")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
