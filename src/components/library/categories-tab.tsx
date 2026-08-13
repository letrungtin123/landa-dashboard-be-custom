import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCategories, getAllCategories, createCategory, updateCategory, getCategoryPublicImpact, deleteCategory,
  bulkDeleteCategories, type DocCategory,
} from '@/api/custom-library';
import { useTenantStore } from '@/utils/tenant-store';
import { useDebounce } from '@/hooks/use-debounce';
import { TableToolbar } from '@/components/shared/table-toolbar';
import { Pagination } from '@/components/shared/pagination';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { confirmDialog } from '@/utils/confirm-store';
import { Plus, Pencil, Trash2, FolderOpen, Loader2, X, Globe } from 'lucide-react';
import { useAuthStore } from '@/utils/store';
import { getGroupLabelSet } from '@/utils/group-labels';
import { AppTooltip } from '@/components/ui/tooltip';

export default function CategoriesTab() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('library', 'can_add');
  const canEdit = hasPermission('library', 'can_edit');
  const canDelete = hasPermission('library', 'can_delete');
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCat, setEditCat] = useState<DocCategory | null>(null);
  const [catName, setCatName] = useState('');

  // Search + filter + pagination (server-side)
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [docCountFilter, setDocCountFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const activeTenantId = useTenantStore((s) => s.activeTenantId);

  useEffect(() => { setPage(1); }, [debouncedSearch, docCountFilter]);

  // Fetch categories (server-side pagination + search + filter)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['landa-categories', page, limit, debouncedSearch, docCountFilter, activeTenantId],
    queryFn: () => getCategories({
      page,
      page_size: limit,
      search: debouncedSearch || undefined,
      doc_count: docCountFilter !== 'all' ? docCountFilter : undefined,
    }),
  });

  const cats = data?.categories ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  // Create
  const createMut = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-categories'] });
      toast.success('Đã tạo danh mục');
      setDialogOpen(false);
      setCatName('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Tạo thất bại'),
  });

  // Update
  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-categories'] });
      toast.success('Đã cập nhật');
      setDialogOpen(false);
      setEditCat(null);
      setCatName('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Cập nhật thất bại'),
  });

  // Delete
  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-categories'] });
      toast.success('Đã xóa danh mục');
    },
  });

  // Bulk delete
  const bulkDeleteMut = useMutation({
    mutationFn: bulkDeleteCategories,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['landa-categories'] });
      setSelected([]);
      toast.success(`Đã xóa ${result.deleted} danh mục`);
    },
  });

  const openCreate = () => {
    setEditCat(null);
    setCatName('');
    setDialogOpen(true);
  };

  const openEdit = (cat: DocCategory) => {
    setEditCat(cat);
    setCatName(cat.name);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!catName.trim()) return;
    if (editCat) {
      updateMut.mutate({ id: editCat.id, name: catName.trim() });
    } else {
      createMut.mutate(catName.trim());
    }
  };

  const handleDelete = (cat: DocCategory) => {
    confirmDialog({
      title: 'Xóa danh mục',
      description: `Xóa "${cat.name}"? Tài liệu sẽ không bị xóa nhưng sẽ mất danh mục.`,
      variant: 'destructive',
      onConfirm: () => deleteMut.mutate(cat.id),
    });
  };

  const handleBulkDelete = () => {
    confirmDialog({
      title: 'Xóa hàng loạt',
      description: `Xóa ${selected.length} danh mục đã chọn?`,
      variant: 'destructive',
      onConfirm: () => bulkDeleteMut.mutate(selected),
    });
  };

  const allSelected = cats.length > 0 && cats.every((c) => selected.includes(c.id));
  const toggleAll = () => setSelected(allSelected ? [] : cats.map((c) => c.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const isSaving = createMut.isPending || updateMut.isPending;

  const publicMut = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => updateCategory(id, { is_public: isPublic }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-categories'] });
      queryClient.invalidateQueries({ queryKey: ['landa-categories-all'] });
      queryClient.invalidateQueries({ queryKey: ['team-detail'] });
      toast.success('Đã cập nhật trạng thái công khai danh mục');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Cập nhật trạng thái công khai thất bại'),
  });

  const handleTogglePublic = async (cat: DocCategory) => {
    if (cat.is_public) {
      publicMut.mutate({ id: cat.id, isPublic: false });
      return;
    }
    try {
      const impact = await getCategoryPublicImpact(cat.id);
      const assignmentText = impact.assignments.slice(0, 8)
        .map((item) => `${item.group_name} / ${item.subgroup_name} / ${item.team_name}`)
        .join('\n');
      const extra = Math.max(0, impact.total - impact.assignments.length);
      const labelSet = getGroupLabelSet(useAuthStore.getState().groupLabels);
      const scopeText = `${labelSet.group}/${labelSet.subgroup}/${labelSet.team}`;
      const teamLabel = labelSet.team.toLocaleLowerCase('vi-VN');
      const suffix = extra > 0 ? `\n... và ${extra} ${teamLabel} khác` : "";
      confirmDialog({
        title: 'Bật Công khai danh mục tài liệu',
        description: `Nếu bật danh mục này công khai, tất cả học viên không phân biệt ${scopeText} sẽ đều nhìn thấy tài liệu trong danh mục và có thể truy cập. Hệ thống sẽ tự động xoá danh mục này khỏi ${scopeText} hiện tại${assignmentText ? `:\n${assignmentText}${suffix}` : '.'}`,
        confirmText: 'Bật Công khai',
        cancelText: 'Hủy',
        variant: 'destructive',
        onConfirm: () => publicMut.mutate({ id: cat.id, isPublic: true }),
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Không thể kiểm tra phân quyền danh mục');
    }
  };


  return (
    <div className="space-y-4">
      {/* DEBUG: xác nhận code mới đã load */}
      {/* <div className="bg-green-200 text-black p-2 text-sm font-bold rounded">DEBUG: CategoriesTab v2 — search="{search}", cats={cats.length}, total={total}</div> */}
      {/* Search + Filter + Actions */}
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm danh mục..."
        filters={[
          {
            key: 'doc_count',
            placeholder: 'Tài liệu',
            options: [
              { value: 'has_docs', label: 'Có tài liệu' },
              { value: 'empty', label: 'Trống' },
            ],
          },
        ]}
        filterValues={{ doc_count: docCountFilter }}
        onFilterChange={(key, val) => {
          if (key === 'doc_count') setDocCountFilter(val);
        }}
        onReset={() => { setSearch(''); setDocCountFilter('all'); }}
        actions={
          canAdd ? (
            <Button size="sm" onClick={openCreate} className="h-8 text-xs shadow-sm">
              <Plus className="mr-1 h-3.5 w-3.5" /> Thêm danh mục
            </Button>
          ) : undefined
        }
      />

      {/* ── Bulk Action Bar ── */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
          />
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {selected.length} đã chọn
          </span>

          <div className="h-5 w-px bg-border" />

          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={bulkDeleteMut.isPending}
            className="h-8 text-xs font-semibold shadow-sm"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Xóa ({selected.length})
          </Button>

          <AppTooltip content="Bỏ chọn tất cả"><Button
            size="icon"
            variant="ghost"
            onClick={() => setSelected([])}
            className="h-7 w-7 ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Bỏ chọn tất cả"
          >
            <X className="h-4 w-4" />
          </Button></AppTooltip>
        </div>
      )}

      {/* Table */}
      <div className="app-data-table-shell bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="divide-y divide-border md:hidden">
          {isLoading ? (
            Array.from({ length: Math.min(limit, 5) }).map((_, i) => (
              <div key={i} className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="mt-1 h-4 w-4" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-36" />
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : cats.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
              <FolderOpen className="mb-2 h-8 w-8 opacity-20" />
              <p className="text-sm">{debouncedSearch || docCountFilter !== 'all' ? 'Không tìm thấy danh mục' : 'Chưa có danh mục'}</p>
            </div>
          ) : (
            cats.map((cat) => (
              <div key={cat.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox checked={selected.includes(cat.id)} onCheckedChange={() => toggleOne(cat.id)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="line-clamp-2 text-sm font-semibold text-foreground">{cat.name}</div>
                          {cat.is_public && <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-[10px] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"><Globe className="h-3 w-3" /> Công khai</Badge>}
                        </div>
                        <div className="mt-1 truncate text-xs font-mono text-muted-foreground">{cat.slug}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">{cat.doc_count}</Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <div className="mb-0.5 text-muted-foreground">Số tài liệu</div>
                        <div className="font-medium">{cat.doc_count}</div>
                      </div>
                      <div>
                        <div className="mb-0.5 text-muted-foreground">Thứ tự</div>
                        <div className="font-medium">{cat.sort_order}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-1">
                      {canEdit && <AppTooltip content={cat.is_public ? "Tắt Công khai" : "Bật Công khai"}><Button variant="ghost" size="icon-sm" onClick={() => handleTogglePublic(cat)}
                        className={cat.is_public ? "text-sky-600" : "text-muted-foreground hover:text-sky-600"} aria-label={cat.is_public ? "Tắt Công khai" : "Bật Công khai"}>
                        <Globe className="h-3.5 w-3.5" />
                      </Button></AppTooltip>}
                      {canEdit && <AppTooltip content="Sửa"><Button variant="ghost" size="icon-sm" onClick={() => openEdit(cat)}
                        className="text-muted-foreground hover:text-foreground" aria-label="Sửa">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button></AppTooltip>}
                      {canDelete && <AppTooltip content="Xóa"><Button variant="ghost" size="icon-sm" onClick={() => handleDelete(cat)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Xóa">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button></AppTooltip>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-10 pl-4">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Tên danh mục</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Mã danh mục</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Số tài liệu</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Thứ tự</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider text-right pr-5">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={isFetching && cats.length > 0 ? 'opacity-50 pointer-events-none' : ''}>
              {isLoading ? (
                Array.from({ length: limit }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell className="pl-4"><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : cats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center text-muted-foreground">
                      <FolderOpen className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-sm">{debouncedSearch || docCountFilter !== 'all' ? 'Không tìm thấy danh mục' : 'Chưa có danh mục'}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                cats.map((cat) => (
                  <TableRow key={cat.id} className="group hover:bg-muted/30 transition-colors border-border">
                    <TableCell className="pl-4">
                      <Checkbox checked={selected.includes(cat.id)} onCheckedChange={() => toggleOne(cat.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2"><span className="font-medium text-sm">{cat.name}</span>{cat.is_public && <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-[10px] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"><Globe className="h-3 w-3" /> Công khai</Badge>}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">{cat.slug}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{cat.doc_count}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{cat.sort_order}</TableCell>
                    <TableCell className="text-right pr-5">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && <AppTooltip content={cat.is_public ? "Tắt Công khai" : "Bật Công khai"}><Button variant="ghost" size="icon" onClick={() => handleTogglePublic(cat)}
                          className={cat.is_public ? "h-8 w-8 text-sky-600" : "h-8 w-8 text-muted-foreground hover:text-sky-600"} aria-label={cat.is_public ? "Tắt Công khai" : "Bật Công khai"}>
                          <Globe className="h-3.5 w-3.5" />
                        </Button></AppTooltip>}
                        {canEdit && <AppTooltip content="Sửa"><Button variant="ghost" size="icon" onClick={() => openEdit(cat)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Sửa">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button></AppTooltip>}
                        {canDelete && <AppTooltip content="Xóa"><Button variant="ghost" size="icon" onClick={() => handleDelete(cat)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Xóa">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button></AppTooltip>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination
          page={page}
          limit={limit}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onLimitChange={setLimit}
          label="danh mục"
        />
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editCat ? 'Sửa danh mục' : 'Thêm danh mục'}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Tên danh mục"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={!catName.trim() || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editCat ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
