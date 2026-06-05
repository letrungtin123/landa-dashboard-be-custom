import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Plus, Pencil, Trash2, Search, Power, Loader2, Settings2, X, Check, Globe } from "lucide-react";
import { PageHeader } from '@/components/shared/page-header';

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
  fetchTenantModules, updateTenantModules,
  type Tenant, type TenantModule,
} from "@/api/custom-tenants";

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
  const [formDomain, setFormDomain] = useState("");
  const [saving, setSaving] = useState(false);

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

  // ── Create ──
  async function handleCreate() {
    if (!formName.trim() || !formSlug.trim()) { toast.error("Điền đầy đủ thông tin"); return; }
    setSaving(true);
    try {
      await createTenant({ name: formName, slug: formSlug, domain: formDomain.trim() || null });
      toast.success("Tạo tenant thành công");
      setShowCreate(false);
      setFormName(""); setFormSlug(""); setFormDomain("");
      loadTenants();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi tạo tenant");
    } finally { setSaving(false); }
  }

  // ── Update ──
  async function handleUpdate() {
    if (!editTenant) return;
    setSaving(true);
    try {
      await updateTenant(editTenant.id, { name: formName, slug: formSlug, domain: formDomain.trim() || null });
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
          <Button onClick={function open() { setFormName(""); setFormSlug(""); setFormDomain(""); setShowCreate(true); }} className="gap-2">
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
              <TableHead>Domain</TableHead>
              <TableHead className="text-center">Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : tenants.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Chưa có tenant nào</TableCell></TableRow>
            ) : (
              <AnimatePresence>
                {tenants.map(function renderRow(t) {
                  return (
                    <motion.tr key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="border-b transition-colors hover:bg-muted/50">
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{t.slug}</code></TableCell>
                      <TableCell>
                        {t.domain ? (
                          <code className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-1 rounded flex items-center gap-1 w-fit">
                            <Globe className="h-3 w-3" />
                            {t.domain}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
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
                          <Button variant="ghost" size="icon" onClick={function click() { setFormName(t.name); setFormSlug(t.slug); setFormDomain(t.domain || ""); setEditTenant(t); }} title="Sửa">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTenant ? "Sửa Tenant" : "Tạo Tenant Mới"}</DialogTitle>
            <DialogDescription>Điền thông tin tổ chức/đơn vị</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              <label className="text-sm font-medium">Domain <span className="text-muted-foreground font-normal">(tùy chọn)</span></label>
              <Input value={formDomain} onChange={function onChange(e) { setFormDomain(e.target.value); }} placeholder="lms.nesso.vn,cms.nesso.vn" />
              <p className="text-xs text-muted-foreground">Nhập các domain cách nhau bằng dấu phẩy (không có dấu cách). Ví dụ: lms.nesso.vn,cms.nesso.vn</p>
            </div>
          </div>
          <DialogFooter>
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
        <DialogContent>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modules — {modulesTenant?.name}</DialogTitle>
            <DialogDescription>Bật/tắt modules cho tenant này</DialogDescription>
          </DialogHeader>
          {modulesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
              {modules.map(function renderMod(m) {
                return (
                  <div key={m.module_id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{m.name}</span>
                      <code className="text-xs text-muted-foreground">{m.code}</code>
                    </div>
                    <Switch checked={m.is_enabled} onCheckedChange={function toggle() { toggleModule(m.module_id); }} />
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
            <Button onClick={saveModules} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
