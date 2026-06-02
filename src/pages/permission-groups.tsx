import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { useTenantStore } from '@/utils/tenant-store';
import { toast } from "sonner";
import {
  ShieldCheck, Plus, Pencil, Trash2, Search, Loader2, Users, UserPlus, X,
  Check, ToggleLeft, ToggleRight, Shield, Eye, PlusCircle, Edit3, Trash, Save, ChevronRight, Undo2,
} from "lucide-react";
import { useAuthStore } from "@/utils/store";
import { useHeaderInfo } from "@/utils/header-store";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/shared/pagination";
import { TableToolbar } from "@/components/shared/table-toolbar";
import { confirmDialog } from "@/utils/confirm-store";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  fetchPermGroups, fetchPermGroupById, createPermGroup, updatePermGroup, deletePermGroup,
  updatePermMatrix, addMembersToGroup, removeMemberFromGroup,
  type PermissionGroup, type PermissionGroupDetail, type ModulePermission, type GroupMember,
} from "@/api/custom-permissions";
import { fetchTenants, type Tenant } from "@/api/custom-tenants";
import { fetchUsers, type CustomUser } from "@/api/custom-users";

const ACTIONS = ["can_view", "can_add", "can_edit", "can_delete"] as const;
const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  can_view: { label: "Xem", icon: Eye, color: "text-blue-500" },
  can_add: { label: "Thêm", icon: PlusCircle, color: "text-emerald-500" },
  can_edit: { label: "Sửa", icon: Edit3, color: "text-amber-500" },
  can_delete: { label: "Xóa", icon: Trash, color: "text-red-500" },
};

export default function PermissionGroupsPage() {
  useHeaderInfo("Nhóm Quyền");

  // ── List state ──
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Detail dialog ──
  const [detail, setDetail] = useState<PermissionGroupDetail | null>(null);
  const [matrixPerms, setMatrixPerms] = useState<ModulePermission[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // ── Pending member changes (local until save) ──
  const [pendingAddMembers, setPendingAddMembers] = useState<GroupMember[]>([]);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[]>([]);

  // ── Add Member dialog ──
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<CustomUser[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // ── Create/Edit dialog ──
  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<PermissionGroup | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Auth ──
  const user = useAuthStore(function getUser(s) { return s.user; });
  const hasPermission = useAuthStore(function getPerm(s) { return s.hasPermission; });
  const isSuperadmin = user?.role === "superadmin";
  const canAdd = hasPermission('permission_groups', 'can_add');
  const canEdit = hasPermission('permission_groups', 'can_edit');
  const canDelete = hasPermission('permission_groups', 'can_delete');
  const [tenantList, setTenantList] = useState<Tenant[]>([]);
  const activeTenantId = useTenantStore((s) => s.activeTenantId);

  // ── Load groups ──
  const loadGroups = useCallback(async function loadGroups() {
    setLoading(true);
    try {
      const result = await fetchPermGroups({ page, page_size: limit, search: search || undefined });
      setGroups(result.data);
      setTotal(result.total);
    } catch { toast.error("Không thể tải danh sách nhóm quyền"); }
    finally { setLoading(false); }
  }, [page, limit, search, activeTenantId]);

  useEffect(function init() { loadGroups(); }, [loadGroups]);
  useEffect(function resetPage() { setPage(1); }, [search, limit]);

  // Load tenants cho superadmin
  useEffect(function loadTenants() {
    if (!isSuperadmin) return;
    fetchTenants({ page: 1, page_size: 100 })
      .then(function onOk(res) { setTenantList(res.data); })
      .catch(function onErr() { /* ignore */ });
  }, [isSuperadmin]);

  // ── Open detail ──
  async function openDetail(groupId: string) {
    setDetailLoading(true);
    setMatrixDirty(false);
    setPendingAddMembers([]);
    setPendingRemoveIds([]);
    setShowDetail(true);
    try {
      const d = await fetchPermGroupById(groupId);
      setDetail(d);
      setMatrixPerms(d.permissions);
    } catch { toast.error("Lỗi tải chi tiết nhóm quyền"); setShowDetail(false); }
    finally { setDetailLoading(false); }
  }

  // ── Matrix toggle ──
  function togglePerm(moduleCode: string, action: typeof ACTIONS[number]) {
    setMatrixPerms(function toggle(prev) {
      return prev.map(function mapPerm(p) {
        if (p.code !== moduleCode) return p;
        return { ...p, [action]: !p[action] };
      });
    });
    setMatrixDirty(true);
  }

  // ── Toggle all for a module ──
  function toggleAllForModule(moduleCode: string) {
    setMatrixPerms(function toggle(prev) {
      return prev.map(function mapPerm(p) {
        if (p.code !== moduleCode) return p;
        const allEnabled = ACTIONS.every(a => p[a]);
        const newVal = !allEnabled;
        return { ...p, can_view: newVal, can_add: newVal, can_edit: newVal, can_delete: newVal };
      });
    });
    setMatrixDirty(true);
  }

  // ── Toggle all for an action column ──
  function toggleAllForAction(action: typeof ACTIONS[number]) {
    setMatrixPerms(function toggle(prev) {
      const allEnabled = prev.every(p => p[action]);
      const newVal = !allEnabled;
      return prev.map(p => ({ ...p, [action]: newVal }));
    });
    setMatrixDirty(true);
  }

  // ── Unified save: matrix + member changes ──
  async function saveAll() {
    if (!detail) return;
    setSaving(true);
    try {
      // 1) Save permission matrix if changed
      if (matrixDirty) {
        await updatePermMatrix(
          detail.id,
          matrixPerms.map(function mapPerm(p) {
            return { module_code: p.code, can_view: p.can_view, can_add: p.can_add, can_edit: p.can_edit, can_delete: p.can_delete };
          })
        );
      }

      // 2) Remove members
      for (const userId of pendingRemoveIds) {
        await removeMemberFromGroup(detail.id, userId);
      }

      // 3) Add new members
      if (pendingAddMembers.length > 0) {
        await addMembersToGroup(detail.id, pendingAddMembers.map(m => m.id));
      }

      toast.success("Đã lưu thay đổi");
      setMatrixDirty(false);
      setPendingAddMembers([]);
      setPendingRemoveIds([]);
      setShowDetail(false);
      setDetail(null);

      // Reload group list
      loadGroups();
    } catch { toast.error("Lỗi lưu thay đổi"); }
    finally { setSaving(false); }
  }

  // ── CRUD ──
  async function handleCreate() {
    if (!formName.trim()) { toast.error("Nhập tên nhóm quyền"); return; }
    if (isSuperadmin && !formTenantId) { toast.error("Chọn tenant"); return; }
    setSaving(true);
    try {
      await createPermGroup({ name: formName, description: formDesc, tenant_id: isSuperadmin ? formTenantId : undefined });
      toast.success("Tạo nhóm quyền thành công");
      setShowCreate(false); setFormName(""); setFormDesc(""); setFormTenantId("");
      loadGroups();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi tạo nhóm quyền"); }
    finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!editGroup) return;
    setSaving(true);
    try {
      await updatePermGroup(editGroup.id, { name: formName, description: formDesc });
      toast.success("Cập nhật thành công");
      setEditGroup(null);
      loadGroups();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Lỗi cập nhật"); }
    finally { setSaving(false); }
  }

  function handleDeleteConfirm(groupId: string) {
    confirmDialog({
      title: "Xóa nhóm quyền",
      description: "Xóa nhóm quyền sẽ gỡ quyền của tất cả thành viên. Thao tác không thể hoàn tác.",
      variant: "destructive",
      onConfirm: async function doDelete() {
        try {
          await deletePermGroup(groupId);
          toast.success("Xóa thành công");
          loadGroups();
          if (detail?.id === groupId) { setShowDetail(false); setDetail(null); }
        } catch { toast.error("Lỗi xóa nhóm quyền"); }
      },
    });
  }

  // ── Member management — load ALL staff users with their current group info ──
  async function loadStaffForAdd(searchTerm = "") {
    setMemberLoading(true);
    try {
      const result = await fetchUsers({ page: 1, page_size: 100, role: "staff", search: searchTerm || undefined });
      // Show all staff — those already in THIS group will be hidden; those in OTHER groups will be disabled
      setMemberResults(result.data);
    } catch { toast.error("Lỗi tải danh sách staff"); }
    finally { setMemberLoading(false); }
  }

  // Check if a user is already a member of the currently-viewed group (original + pending)
  function isAlreadyInThisGroup(userId: string) {
    if (pendingRemoveIds.includes(userId)) return false; // marked for removal
    if (pendingAddMembers.some(m => m.id === userId)) return true;
    return detail?.members.some(function check(m) { return m.id === userId; }) ?? false;
  }

  // Check if a user is in ANOTHER group (not this one)
  function isInOtherGroup(user: CustomUser) {
    return !!user.permission_group_id && user.permission_group_id !== detail?.id;
  }

  function toggleUserSelect(userId: string) {
    setSelectedUserIds(function toggle(prev) {
      return prev.includes(userId) ? prev.filter(function f(id) { return id !== userId; }) : [...prev, userId];
    });
  }

  // Add members locally (pending until save)
  function handleAddMembersLocal() {
    if (!detail) return;
    // Get full user info for selected users
    const usersToAdd = memberResults.filter(u => selectedUserIds.includes(u.id));
    const newMembers: GroupMember[] = usersToAdd.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      full_name: u.full_name,
      avatar_url: u.avatar_url,
    }));

    // Add to pending, also remove from pendingRemoveIds if re-adding
    setPendingAddMembers(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      return [...prev, ...newMembers.filter(m => !existingIds.has(m.id))];
    });
    setPendingRemoveIds(prev => prev.filter(id => !selectedUserIds.includes(id)));

    setShowAddMember(false);
    setSelectedUserIds([]);
    setMemberSearch("");
    setMemberResults([]);
    toast.success(`Đã thêm ${usersToAdd.length} thành viên (chưa lưu)`);
  }

  // Remove member locally (pending until save)
  function handleRemoveMemberLocal(userId: string, username: string) {
    // If this is a pending add, just remove from pending
    if (pendingAddMembers.some(m => m.id === userId)) {
      setPendingAddMembers(prev => prev.filter(m => m.id !== userId));
      toast.success(`Đã bỏ ${username} (chưa lưu)`);
      return;
    }
    // If this is an original member, mark for removal
    setPendingRemoveIds(prev => [...prev, userId]);
    toast.success(`Đã đánh dấu xóa ${username} (chưa lưu)`);
  }

  // Undo a pending removal
  function undoRemoveMember(userId: string) {
    setPendingRemoveIds(prev => prev.filter(id => id !== userId));
  }

  const totalPages = Math.ceil(total / limit) || 1;

  // ── Computed: local members list (original + pending adds - pending removes) ──
  const localMembers: GroupMember[] = (() => {
    if (!detail) return [];
    const origFiltered = detail.members.filter(m => !pendingRemoveIds.includes(m.id));
    return [...origFiltered, ...pendingAddMembers];
  })();

  // ── Computed: is anything dirty? ──
  const isDirty = matrixDirty || pendingAddMembers.length > 0 || pendingRemoveIds.length > 0;

  // Count enabled permissions for a module
  function countEnabled(p: ModulePermission) {
    return ACTIONS.filter(a => p[a]).length;
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto pb-10">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Nhóm quyền</h1>
            <p className="text-xs text-muted-foreground">Quản lý phân quyền cho các vai trò trong hệ thống</p>
          </div>
        </div>
        <div className="flex items-center gap-3">

          {canAdd && (
            <Button
              onClick={function open() { setFormName(""); setFormDesc(""); setFormTenantId(""); setShowCreate(true); }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20 border-0 gap-2"
            >
              <Plus className="h-4 w-4" /> Tạo nhóm
            </Button>
          )}
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input
          placeholder="Tìm nhóm quyền theo tên..."
          className="pl-10 h-11 bg-card border-border/50 rounded-xl text-sm shadow-sm focus-visible:ring-primary/30"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Groups Grid ── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-3 flex flex-col"
            >
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="flex gap-2 pt-2 mt-auto">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </motion.div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <ShieldCheck className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Chưa có nhóm quyền</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Tạo nhóm quyền để phân quyền truy cập cho các staff và người dùng trong hệ thống.
          </p>
          <Button
            onClick={function open() { setFormName(""); setFormDesc(""); setFormTenantId(""); setShowCreate(true); }}
            className="mt-5 gap-2"
            variant="outline"
          >
            <Plus className="h-4 w-4" /> Tạo nhóm đầu tiên
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(function renderCard(g, idx) {
            return (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: idx * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
                onClick={function open() { openDetail(g.id); }}
                className="group bg-card hover:bg-accent/30 rounded-2xl border border-border/50 hover:border-primary/30 p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 relative overflow-hidden flex flex-col"
              >
                {/* Decorative gradient line */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 shrink-0 transition-colors">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {g.name}
                      </h3>
                      {isSuperadmin && g.tenant_name && (
                        <p className="text-[10px] text-muted-foreground/60 truncate">{g.tenant_name}</p>
                      )}
                    </div>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={function edit() { setFormName(g.name); setFormDesc(g.description); setEditGroup(g); }}
                          title="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={function del() { handleDeleteConfirm(g.id); }}
                          title="Xóa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed flex-1">{g.description || '\u00A0'}</p>

                <div className="flex items-center gap-2 mt-auto pt-1">
                  <Badge variant="secondary" className="text-[10px] font-medium gap-1 bg-primary/8 text-primary border-primary/15 hover:bg-primary/12 px-2 py-0.5">
                    <Users className="h-3 w-3" />{g.member_count} thành viên
                  </Badge>
                  <span className="text-[10px] text-muted-foreground/50">
                    {g.created_at ? new Date(g.created_at).toLocaleDateString("vi-VN") : ""}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 ml-auto group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && groups.length > 0 && (
        <Pagination page={page} limit={limit} total={total} totalPages={totalPages} onPageChange={setPage} onLimitChange={setLimit} label="nhóm quyền" />
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── Detail Dialog (Tabs: Phân quyền + Thành viên) ──       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={showDetail} onOpenChange={function close(v) {
        if (!v) {
          if (isDirty) {
            confirmDialog({
              title: "Có thay đổi chưa lưu",
              description: "Bạn có thay đổi chưa lưu. Nếu đóng, tất cả thay đổi sẽ bị mất.",
              variant: "destructive",
              onConfirm: function discard() {
                setShowDetail(false);
                setDetail(null);
                setMatrixDirty(false);
                setPendingAddMembers([]);
                setPendingRemoveIds([]);
              },
            });
          } else {
            setShowDetail(false);
            setDetail(null);
          }
        }
      }}>
        <DialogContent className="sm:max-w-6xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl gap-0">
          {/* Dialog header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border/50 bg-primary/5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-lg text-foreground truncate">{detail?.name || "..."}</h2>
              {detail?.description && (
                <p className="text-xs text-muted-foreground truncate">{detail.description}</p>
              )}
            </div>
            {isDirty && (
              <div className="flex items-center gap-2">
                {/* Change summary badges */}
                <div className="flex items-center gap-1.5">
                  {matrixDirty && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">Quyền</span>
                  )}
                  {pendingAddMembers.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">+{pendingAddMembers.length}</span>
                  )}
                  {pendingRemoveIds.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-medium">-{pendingRemoveIds.length}</span>
                  )}
                </div>
                <Button
                  onClick={saveAll}
                  disabled={saving}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 gap-1.5 shadow-md shadow-primary/20"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Lưu thay đổi
                </Button>
              </div>
            )}
          </div>

          {detailLoading ? (
            <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: '55vh' }}>
              {/* Skeleton tabs */}
              <div className="flex gap-2 mx-6 mt-4">
                <Skeleton className="h-9 w-40 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
              </div>
              {/* Skeleton matrix */}
              <div className="px-6 pb-6 mt-4 space-y-2 flex-1">
                <Skeleton className="h-10 w-full rounded-lg" />
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ opacity: 1 - i * 0.12 }} />
                ))}
              </div>
            </div>
          ) : detail ? (
            <Tabs defaultValue="permissions" className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: '55vh' }}>
              <TabsList className="shrink-0 mx-6 mt-4 bg-muted/50 p-1 rounded-xl h-auto">
                <TabsTrigger value="permissions" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 text-xs font-medium py-2 px-4">
                  <Shield className="h-3.5 w-3.5" /> Ma trận phân quyền
                </TabsTrigger>
                <TabsTrigger value="members" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2 text-xs font-medium py-2 px-4">
                  <Users className="h-3.5 w-3.5" /> Thành viên
                  <Badge variant="secondary" className={`ml-0.5 text-[10px] px-1.5 py-0 h-4 font-mono ${(pendingAddMembers.length > 0 || pendingRemoveIds.length > 0) ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : ''}`}>{localMembers.length}</Badge>
                </TabsTrigger>
              </TabsList>

              {/* ── Tab: Permissions matrix ── */}
              <TabsContent value="permissions" className="flex-1 overflow-auto px-6 pb-6 mt-4">
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl border border-border/50 overflow-hidden shadow-sm"
                >
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border/50 bg-muted/30">
                        <TableHead className="min-w-[220px] pl-4 py-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Module</span>
                        </TableHead>
                        {ACTIONS.map(function renderHead(action) {
                          const meta = ACTION_META[action];
                          const Icon = meta.icon;
                          const allOn = matrixPerms.every(p => p[action]);
                          return (
                            <TableHead key={action} className="text-center w-24 py-3">
                              <button
                                className="flex flex-col items-center gap-1 mx-auto group/col cursor-pointer"
                                onClick={() => toggleAllForAction(action)}
                                title={allOn ? "Tắt tất cả" : "Bật tất cả"}
                              >
                                <Icon className={`h-3.5 w-3.5 ${meta.color} opacity-70 group-hover/col:opacity-100 transition-opacity`} />
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{meta.label}</span>
                              </button>
                            </TableHead>
                          );
                        })}
                        <TableHead className="w-20 text-center py-3">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tất cả</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matrixPerms.map(function renderPerm(p, idx) {
                        const enabled = countEnabled(p);
                        const allOn = enabled === ACTIONS.length;
                        return (
                          <TableRow key={p.code} className={`hover:bg-muted/20 transition-colors border-border/30 ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}>
                            <TableCell className="pl-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <span className="font-medium text-sm text-foreground">{p.name}</span>
                                <code className="text-[9px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded-md font-mono">{p.code}</code>
                              </div>
                            </TableCell>
                            {ACTIONS.map(function renderCell(action) {
                              const isOn = p[action];
                              return (
                                <TableCell key={action} className="text-center py-2.5">
                                  <button
                                    onClick={() => togglePerm(p.code, action)}
                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                                      isOn
                                        ? 'bg-primary/15 text-primary hover:bg-primary/25 shadow-sm'
                                        : 'bg-transparent text-muted-foreground/25 hover:bg-muted/50 hover:text-muted-foreground/50'
                                    }`}
                                  >
                                    <Check className={`h-4 w-4 transition-transform ${isOn ? 'scale-100' : 'scale-75'}`} />
                                  </button>
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center py-2.5">
                              <button
                                onClick={() => toggleAllForModule(p.code)}
                                className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                  allOn
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                                    : enabled > 0
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                                      : 'bg-muted/30 text-muted-foreground/40 hover:bg-muted/50'
                                }`}
                                title={allOn ? "Tắt tất cả" : "Bật tất cả"}
                              >
                                {enabled}/{ACTIONS.length}
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </motion.div>
              </TabsContent>

              {/* ── Tab: Members ── */}
              <TabsContent value="members" className="flex-1 overflow-auto px-6 pb-6 mt-4">
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {localMembers.length > 0 ? `${localMembers.length} thành viên` : 'Chưa có thành viên'}
                      </p>
                      {(pendingAddMembers.length > 0 || pendingRemoveIds.length > 0) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium italic">
                          chưa lưu
                        </span>
                      )}
                    </div>
                    {canEdit && <Button
                      size="sm"
                      onClick={function open() { setShowAddMember(true); setMemberSearch(""); setMemberResults([]); setSelectedUserIds([]); loadStaffForAdd(); }}
                      className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground border-0 shadow-sm"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Thêm thành viên
                    </Button>}
                  </div>

                  {/* Pending removals — show with undo option */}
                  {pendingRemoveIds.length > 0 && (
                    <div className="space-y-1">
                      {detail.members.filter(m => pendingRemoveIds.includes(m.id)).map(function renderRemoved(m) {
                        return (
                          <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-red-300 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5">
                            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-500/15 flex items-center justify-center text-xs font-bold text-red-400 shrink-0 line-through">
                              {m.username?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-red-600 dark:text-red-400 truncate line-through opacity-60">{m.full_name || m.username}</p>
                              <p className="text-[10px] text-red-400 dark:text-red-500 truncate">Đánh dấu xóa</p>
                            </div>
                            <button
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                              onClick={function undo() { undoRemoveMember(m.id); }}
                              title="Hoàn tác"
                            >
                              <Undo2 className="h-3 w-3" /> Hoàn tác
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {localMembers.length === 0 && pendingRemoveIds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
                        <Users className="w-7 h-7 text-muted-foreground/20" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Chưa có thành viên nào</p>
                      <p className="text-xs text-muted-foreground/60 max-w-xs">Thêm thành viên để áp dụng bộ quyền này cho họ.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {localMembers.map(function renderMember(m) {
                        const isPendingAdd = pendingAddMembers.some(p => p.id === m.id);
                        return (
                          <div key={m.id} className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            isPendingAdd
                              ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5'
                              : 'border-border/30 hover:border-primary/20 bg-card hover:bg-accent/20'
                          }`}>
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                              isPendingAdd
                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-primary/15 text-primary'
                            }`}>
                              {m.username?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm text-foreground truncate">{m.full_name || m.username}</p>
                                {isPendingAdd && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium shrink-0">Mới</span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                            </div>
                            {canEdit && (
                              <button
                                className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                onClick={function remove() { handleRemoveMemberLocal(m.id, m.full_name || m.username); }}
                                title="Xóa khỏi nhóm"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── Add Member Dialog ──                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Thêm thành viên
            </DialogTitle>
            <DialogDescription>Chọn staff để thêm vào nhóm "{detail?.name}"</DialogDescription>
          </DialogHeader>

          {/* Info: 1 group per user rule */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <Shield className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              Mỗi staff chỉ được gán vào <span className="font-semibold">1 nhóm quyền duy nhất</span>. Staff đã có nhóm sẽ không thể chọn.
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input
                placeholder="Tìm username hoặc email..."
                className="pl-9 h-10 rounded-xl"
                value={memberSearch}
                onChange={function onChange(e) { setMemberSearch(e.target.value); }}
                onKeyDown={function onKey(e) { if (e.key === "Enter") loadStaffForAdd(memberSearch); }}
              />
              <Button
                onClick={function search() { loadStaffForAdd(memberSearch); }}
                disabled={memberLoading}
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
              >
                {memberLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>

            <div className="max-h-[350px] overflow-y-auto rounded-xl border border-border/50">
              {memberResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Search className="h-6 w-6 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {memberLoading ? "Đang tải..." : memberSearch ? "Không tìm thấy staff" : "Nhập từ khóa và nhấn Enter để tìm"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {memberResults.map(function renderResult(u) {
                    // Skip users already in THIS group
                    if (isAlreadyInThisGroup(u.id)) return null;

                    const inOtherGroup = isInOtherGroup(u);
                    const isSelected = selectedUserIds.includes(u.id);
                    const isDisabled = inOtherGroup;

                    return (
                      <div
                        key={u.id}
                        className={`flex items-center gap-3 p-3 transition-all ${
                          isDisabled
                            ? "opacity-60 cursor-not-allowed bg-muted/20"
                            : isSelected
                              ? "bg-primary/5 cursor-pointer"
                              : "hover:bg-muted/30 cursor-pointer"
                        }`}
                        onClick={function click() {
                          if (!isDisabled) toggleUserSelect(u.id);
                        }}
                      >
                        {/* Checkbox */}
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                          isDisabled
                            ? 'border-border/30 bg-muted/30'
                            : isSelected
                              ? 'bg-primary border-primary'
                              : 'border-border/50'
                        }`}>
                          {isSelected && !isDisabled && <Check className="h-3 w-3 text-white" />}
                          {isDisabled && <X className="h-3 w-3 text-muted-foreground/40" />}
                        </div>

                        {/* User info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{u.full_name || u.username}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                        </div>

                        {/* Group status */}
                        {inOtherGroup ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 shrink-0">
                            <Shield className="h-2.5 w-2.5" />
                            {u.permission_group_name || "Nhóm khác"}
                          </span>
                        ) : (
                          <Badge variant="outline" className="shrink-0 text-[10px] rounded-md text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10">
                            Chưa gán
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedUserIds.length > 0 && (
              <div className="flex items-center gap-2 py-1">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                  {selectedUserIds.length} đã chọn
                </Badge>
                <button
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={function clear() { setSelectedUserIds([]); }}
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild><Button variant="outline" className="rounded-xl">Hủy</Button></DialogClose>
            <Button
              onClick={handleAddMembersLocal}
              disabled={selectedUserIds.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-xl gap-1.5"
            >
              Thêm {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── Create/Edit Dialog ──                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={showCreate || !!editGroup} onOpenChange={function close() { setShowCreate(false); setEditGroup(null); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editGroup ? <Pencil className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
              {editGroup ? "Sửa nhóm quyền" : "Tạo nhóm quyền mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Tên nhóm <span className="text-destructive">*</span></label>
              <Input
                value={formName}
                onChange={function onChange(e) { setFormName(e.target.value); }}
                placeholder="VD: Content Editor, Moderator..."
                className="rounded-xl h-10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Mô tả</label>
              <Textarea
                value={formDesc}
                onChange={function onChange(e) { setFormDesc(e.target.value); }}
                placeholder="Mô tả ngắn gọn về quyền hạn của nhóm..."
                rows={3}
                className="rounded-xl resize-none"
              />
            </div>
            {isSuperadmin && showCreate && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tenant <span className="text-destructive">*</span></label>
                <Select value={formTenantId} onValueChange={setFormTenantId}>
                  <SelectTrigger className="rounded-xl h-10">
                    <SelectValue placeholder="Chọn tenant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantList.map(function renderOpt(t) {
                      return <SelectItem key={t.id} value={t.id}>{t.name} ({t.slug})</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild><Button variant="outline" className="rounded-xl">Hủy</Button></DialogClose>
            <Button
              onClick={editGroup ? handleUpdate : handleCreate}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-xl gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editGroup ? "Cập nhật" : "Tạo nhóm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
