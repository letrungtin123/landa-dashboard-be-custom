import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Plus, Pencil, Trash2, Search, Power, Loader2, Settings2, X, Check, Globe, Users, BookOpen, Key, Eye, EyeOff, Layers } from "lucide-react";
import { PageHeader } from '@/components/shared/page-header';
import { cn } from "@/utils/utils";
import { getIconComponent } from "@/utils/icon-map";
import { useAuthStore } from "@/utils/store";
import { useTenantStore } from "@/utils/tenant-store";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  fetchTenants, createTenant, updateTenant, deleteTenant,
  fetchTenantModules, updateTenantModules, fetchTenantRoleLabels, updateTenantRoleLabels,
  type Tenant, type TenantModule,
} from "@/api/custom-tenants";
import {
  DEFAULT_ROLE_LABELS,
  SYSTEM_ROLE_KEYS,
  normalizeRoleLabels,
  type RoleLabelMap,
  type UserRole,
} from "@/utils/role-labels";

const ROLE_LABEL_FIELD_LABELS: Record<UserRole, string> = {
  superadmin: "Super Admin",
  superuser: "Superuser",
  staff: "Staff",
  learner: "Learner",
  learner_plus: "Learner+",
};

function hasAnyRoleLabel(labels: RoleLabelMap): boolean {
  return SYSTEM_ROLE_KEYS.some(role => !!labels[role]?.trim());
}

export default function TenantManagementPage() {
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
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const refreshRoleLabels = useAuthStore((s) => s.refreshRoleLabels);

  const loadTenants = useCallback(async function loadTenants() {
    setLoading(true);
    try {
      const result = await fetchTenants({ page, page_size: 20, search: search || undefined });
      setTenants(result.data);
      setTotal(result.total);
    } catch (err) {
      toast.error("Không thể tải danh sách tenant");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  // ── Validate domain fields ──
  // Full URL hợp lệ: http:// hoặc https:// + hostname
  const URL_REGEX = /^https?:\/\/[a-zA-Z0-9]([a-zA-Z0-9.:@-]*[a-zA-Z0-9])?$/;

  function validateDomain(value: string, label: string): boolean {
    // Bỏ trailing slash trước khi validate
    const cleaned = value.replace(/\/+$/, '');
    if (!URL_REGEX.test(cleaned)) {
      toast.error(`${label} không hợp lệ. Nhập đầy đủ URL gồm http:// hoặc https://. Ví dụ: https://lms.nesso.com.vn`);
      return false;
    }
    return true;
  }

  function validateForm(): boolean {
    if (!formName.trim() || !formSlug.trim()) { toast.error("Điền đầy đủ thông tin"); return false; }

    const dl = formDomainLearner.trim();
    if (dl && !validateDomain(dl, "Domain Learner")) return false;

    const da = formDomainAdmin.trim();
    if (da && !validateDomain(da, "Domain Admin")) return false;

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
    setShowApiKey(false);
  }

  function setRoleLabel(role: UserRole, value: string) {
    setFormRoleLabels(prev => ({ ...prev, [role]: value }));
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
    setEditTenant(tenant);

    try {
      const labels = normalizeRoleLabels(await fetchTenantRoleLabels(tenant.id));
      setFormRoleLabels(labels);
      setFormRoleLabelsHadSaved(hasAnyRoleLabel(labels));
    } catch {
      toast.error("Không thể tải tên hiển thị vai trò");
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
      toast.success("Tạo tenant thành công");
      setShowCreate(false);
      resetForm();
      loadTenants();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi tạo tenant");
    } finally { setSaving(false); }
  }

  // ── Update ──
  async function handleUpdate() {
    if (!editTenant) return;
    if (!validateForm()) return;
    setSaving(true);
    try {
      const updSettings: Record<string, unknown> = { ...(editTenant.settings || {}) };
      if (formGeminiApiKey.trim()) {
        updSettings.gemini_api_key = formGeminiApiKey.trim();
      }
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
      if (editTenant.id === activeTenantId) {
        await refreshRoleLabels();
      }
      toast.success("Cập nhật thành công");
      setEditTenant(null);
      loadTenants();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi cập nhật");
    } finally { setSaving(false); }
  }

  // ── Toggle active ──
  async function handleToggleActive(tenant: Tenant) {
    try {
      await updateTenant(tenant.id, { is_active: !tenant.is_active });
      toast.success(tenant.is_active ? "Đã vô hiệu hóa" : "Đã kích hoạt");
      loadTenants();
    } catch { toast.error("Lỗi cập nhật trạng thái"); }
  }

  // ── Delete ──
  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteTenant(deletingId);
      toast.success("Xóa thành công");
      setDeletingId(null);
      loadTenants();
    } catch { toast.error("Lỗi xóa tenant"); }
  }

  // ── Modules ──
  async function openModules(tenant: Tenant) {
    setModulesTenant(tenant);
    setModulesLoading(true);
    try {
      const mods = await fetchTenantModules(tenant.id);
      setModules(mods);
    } catch { toast.error("Lỗi tải modules"); }
    finally { setModulesLoading(false); }
  }

  function toggleModule(moduleId: string) {
    setModules(function toggle(prev) {
      return prev.map(function mapMod(m) {
        return m.module_id === moduleId ? { ...m, is_enabled: !m.is_enabled } : m;
      });
    });
  }

  async function saveModules() {
    if (!modulesTenant) return;
    setSaving(true);
    try {
      await updateTenantModules(
        modulesTenant.id,
        modules.map(function mapMod(m) { return { module_id: m.module_id, is_enabled: m.is_enabled }; })
      );
      toast.success("Cập nhật modules thành công");
      setModulesTenant(null);
    } catch { toast.error("Lỗi cập nhật modules"); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        icon={Building2}
        title="Quản lý Tenant"
        description={`Quản lý tổ chức/đơn vị trong hệ thống (${total})`}
        actions={
          <Button onClick={function open() { resetForm(); setShowCreate(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Tạo Tenant
          </Button>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm tenant..."
          value={search}
          onChange={function onChange(e) { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Domain Learner</TableHead>
              <TableHead>Domain Admin</TableHead>
              <TableHead className="text-center">Quota Users</TableHead>
              <TableHead className="text-center">Quota Courses</TableHead>
              <TableHead className="text-center">Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : tenants.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Chưa có tenant nào</TableCell></TableRow>
            ) : (
              <AnimatePresence>
                {tenants.map(function renderRow(t) {
                  return (
                    <motion.tr key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="border-b transition-colors hover:bg-muted/50">
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{t.slug}</code></TableCell>
                      <TableCell>
                        {t.domain_learner ? (
                          <code className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-1 rounded flex items-center gap-1 w-fit">
                            <Globe className="h-3 w-3" />
                            {t.domain_learner}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.domain_admin ? (
                          <code className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded flex items-center gap-1 w-fit">
                            <Globe className="h-3 w-3" />
                            {t.domain_admin}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs font-mono">
                          {t.max_users !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              {t.max_users}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">∞</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs font-mono">
                          {t.max_courses !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <BookOpen className="h-3 w-3 text-muted-foreground" />
                              {t.max_courses}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">∞</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={t.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={function click() { handleToggleActive(t); }}>
                          {t.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(t.created_at).toLocaleDateString("vi-VN")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={function click() { openModules(t); }} title="Modules">
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={function click() { openEditTenant(t); }} title="Sửa">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={function click() { setDeletingId(t.id); }} title="Xóa">
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={function prev() { setPage(page - 1); }}>Trước</Button>
          <span className="flex items-center px-3 text-sm text-muted-foreground">Trang {page}</span>
          <Button variant="outline" size="sm" disabled={tenants.length < 20} onClick={function next() { setPage(page + 1); }}>Sau</Button>
        </div>
      )}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={showCreate || !!editTenant} onOpenChange={function close() { setShowCreate(false); setEditTenant(null); }}>
        <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-muted/20 shrink-0">
            <DialogTitle>{editTenant ? "Sửa Tenant" : "Tạo Tenant Mới"}</DialogTitle>
            <DialogDescription>Điền thông tin tổ chức/đơn vị</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tên tenant</label>
              <Input value={formName} onChange={function onChange(e) { setFormName(e.target.value); }} placeholder="LANDA Demo" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input value={formSlug} onChange={function onChange(e) { setFormSlug(e.target.value); }} placeholder="landa-demo" />
              <p className="text-xs text-muted-foreground">Chỉ chứa chữ thường, số và dấu gạch ngang</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Domain Learner <span className="text-muted-foreground font-normal">(tùy chọn)</span></label>
              <Input value={formDomainLearner} onChange={function onChange(e) { setFormDomainLearner(e.target.value); }} placeholder="https://lms.nesso.com.vn" />
              <p className="text-xs text-muted-foreground">URL đầy đủ trang học viên. Ví dụ: https://lms.nesso.com.vn</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Domain Admin <span className="text-muted-foreground font-normal">(tùy chọn)</span></label>
              <Input value={formDomainAdmin} onChange={function onChange(e) { setFormDomainAdmin(e.target.value); }} placeholder="https://cms.nesso.com.vn" />
              <p className="text-xs text-muted-foreground">URL đầy đủ trang quản trị. Ví dụ: https://cms.nesso.com.vn</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Giới hạn User
                </label>
                <Input
                  type="number" min="0"
                  value={formMaxUsers}
                  onChange={function onChange(e) { setFormMaxUsers(e.target.value); }}
                  placeholder="Không giới hạn"
                />
                <p className="text-xs text-muted-foreground">Để trống = không giới hạn</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  Giới hạn Course
                </label>
                <Input
                  type="number" min="0"
                  value={formMaxCourses}
                  onChange={function onChange(e) { setFormMaxCourses(e.target.value); }}
                  placeholder="Không giới hạn"
                />
                <p className="text-xs text-muted-foreground">Để trống = không giới hạn</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Gemini API Key <span className="text-muted-foreground font-normal">(tùy chọn)</span>
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
              <p className="text-xs text-muted-foreground">API key Google Gemini cho AI Chatbot. Lấy từ Google AI Studio.</p>
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <div className="flex items-start gap-2">
                <Layers className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium">Tên hiển thị vai trò</label>
                  <p className="text-xs text-muted-foreground">Để trống để dùng tên mặc định hiện tại trên hệ thống.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SYSTEM_ROLE_KEYS.map(function renderRoleInput(role) {
                  return (
                    <div key={role} className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{ROLE_LABEL_FIELD_LABELS[role]}</label>
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
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/10 shrink-0">
            <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
            <Button onClick={editTenant ? handleUpdate : handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTenant ? "Cập nhật" : "Tạo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deletingId} onOpenChange={function close() { setDeletingId(null); }}>
        <DialogContent className="sm:max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>Bạn có chắc chắn muốn xóa tenant này? Thao tác không thể hoàn tác.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>Xóa</Button>
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
                  <DialogTitle className="text-xl md:text-2xl font-bold">Phân quyền Module</DialogTitle>
                  <DialogDescription className="text-sm md:text-base mt-1">
                    Cấu hình tính năng cho <strong className="text-foreground">{modulesTenant?.name}</strong>
                  </DialogDescription>
                </div>
              </div>
              <div className="mt-4 flex items-center">
                <Badge variant="outline" className="px-3 py-1 rounded-full bg-primary/5 text-primary border-primary/20 shadow-sm font-semibold text-xs md:text-sm">
                  <span className="relative flex h-2 w-2 mr-2 inline-flex">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  Đang kích hoạt: {modules.filter(m => m.is_enabled).length} / {modules.length} modules
                </Badge>
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 px-4 py-4 md:px-6 md:py-6 bg-muted/10 overflow-y-auto custom-scrollbar">
            {modulesLoading ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm">Đang tải cấu hình...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {modules.map(function renderMod(m) {
                  const Icon = getIconComponent(m.icon);
                  return (
                    <motion.div 
                      key={m.module_id} 
                      className={cn(
                        "relative flex items-start gap-3 md:gap-4 p-4 md:p-5 rounded-[16px] md:rounded-[20px] border transition-all duration-300",
                        m.is_enabled 
                          ? "border-primary/40 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/60" 
                          : "border-border/60 bg-muted/30 opacity-85 hover:opacity-100 hover:bg-muted/50"
                      )}
                      layout
                    >
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
                              {m.name}
                            </h4>
                            <div className="mt-1.5 md:mt-2">
                              <code className={cn(
                                "text-[9px] md:text-[10px] uppercase tracking-widest font-bold px-2 md:px-2.5 py-1 rounded border",
                                m.is_enabled ? "bg-primary/5 text-primary/80 border-primary/20" : "bg-background text-muted-foreground border-border/50"
                              )}>
                                {m.code}
                              </code>
                            </div>
                          </div>
                          <Switch 
                            checked={m.is_enabled} 
                            onCheckedChange={function toggle() { toggleModule(m.module_id); }} 
                            className={cn("mt-0.5 scale-90 md:scale-110 shadow-sm shrink-0", m.is_enabled && "data-[state=checked]:bg-emerald-500")}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="p-4 md:p-6 bg-card border-t border-border/50 shrink-0 mt-auto">
            <div className="flex justify-end gap-2 md:gap-3 w-full">
              <DialogClose asChild><Button variant="outline" className="px-4 md:px-6 rounded-lg md:rounded-xl">Hủy</Button></DialogClose>
              <Button onClick={saveModules} disabled={saving} className="px-6 md:px-8 rounded-lg md:rounded-xl shadow-md">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Lưu
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
