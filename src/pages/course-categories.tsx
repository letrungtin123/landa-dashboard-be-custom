import { useState, useCallback } from 'react';
import { TenantFilter } from '@/components/shared/TenantFilter';
import { useTenantStore } from '@/utils/tenant-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, BookOpen, FolderKanban, Search, ChevronLeft, BookPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/utils/confirm-store';
import { useAuthStore } from '@/utils/store';
import {
  getCourseCategories,
  createCourseCategory,
  updateCourseCategory,
  deleteCourseCategory,
  getCourseCategoryCourses,
  addCoursesToCategory,
  removeCourseFromCategory,
  type CourseCategory,
  type CourseCategoryMembership,
} from '@/api/custom-course-categories';
import { getCourses } from '@/api/custom-courses';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useDebounce } from '@/hooks/use-debounce';

export default function CourseCategoriesPage() {
  const qc = useQueryClient();
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('course_categories', 'can_add');
  const canEdit = hasPermission('course_categories', 'can_edit');
  const canDelete = hasPermission('course_categories', 'can_delete');
  const [editingCat, setEditingCat] = useState<CourseCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailCatId, setDetailCatId] = useState<string | null>(null);

  // ── Categories list ──
  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ['course-categories', activeTenantId],
    queryFn: getCourseCategories,
  });
  const categories = catData?.results ?? [];

  // ── Create/Edit Dialog ──
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formOrder, setFormOrder] = useState(0);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string; sort_order?: number }) =>
      createCourseCategory(payload),
    onSuccess: () => {
      toast.success('Đã tạo danh mục');
      qc.invalidateQueries({ queryKey: ['course-categories'] });
      setCreateOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi tạo danh mục'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; description?: string; sort_order?: number }) =>
      updateCourseCategory(id, payload),
    onSuccess: () => {
      toast.success('Đã cập nhật danh mục');
      qc.invalidateQueries({ queryKey: ['course-categories'] });
      setEditingCat(null);
      resetForm();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi cập nhật'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCourseCategory,
    onSuccess: () => {
      toast.success('Đã xóa danh mục');
      qc.invalidateQueries({ queryKey: ['course-categories'] });
    },
    onError: () => toast.error('Lỗi xóa danh mục'),
  });

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormOrder(0);
  };

  const openCreate = () => {
    resetForm();
    setCreateOpen(true);
  };

  const openEdit = (cat: CourseCategory) => {
    setFormName(cat.name);
    setFormDesc(cat.description);
    setFormOrder(cat.sort_order);
    setEditingCat(cat);
  };

  const handleDelete = (cat: CourseCategory) => {
    confirmDialog({
      title: 'Xóa danh mục',
      description: `Xóa "${cat.name}"? Tất cả courses sẽ bị gỡ khỏi danh mục này.`,
      variant: 'destructive',
      onConfirm: () => deleteMutation.mutate(cat.id),
    });
  };

  const handleSubmit = () => {
    if (!formName.trim()) return;
    if (editingCat) {
      updateMutation.mutate({ id: editingCat.id, name: formName.trim(), description: formDesc.trim(), sort_order: formOrder });
    } else {
      createMutation.mutate({ name: formName.trim(), description: formDesc.trim(), sort_order: formOrder });
    }
  };

  const isDialogOpen = createOpen || !!editingCat;
  const closeDialog = () => {
    setCreateOpen(false);
    setEditingCat(null);
    resetForm();
  };

  // ── Detail view (courses in category) ──
  if (detailCatId) {
    return <CategoryDetailView catId={detailCatId} onBack={() => setDetailCatId(null)} />;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <TenantFilter className="mb-2" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Danh mục khóa học</h1>
          <p className="text-sm text-muted-foreground mt-1">Quản lý danh mục để phân nhóm courses</p>
        </div>
        {canAdd && <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Tạo danh mục
        </Button>}
      </div>

      {catLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground">Chưa có danh mục nào</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card
              key={cat.id}
              className="group hover:shadow-md transition-all cursor-pointer"
              onClick={() => setDetailCatId(cat.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FolderKanban className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">{cat.name}</CardTitle>
                      {cat.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{cat.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                    {canEdit && <button
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => openEdit(cat)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>}
                    {canDelete && <button
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() => handleDelete(cat)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{cat.course_count} courses</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Sửa danh mục' : 'Tạo danh mục mới'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tên danh mục *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="VD: Onboarding, Kỹ năng mềm..."
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Mô tả</label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Mô tả ngắn (tùy chọn)"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Thứ tự</label>
              <Input
                type="number"
                value={formOrder}
                onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Hủy</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCat ? 'Lưu' : 'Tạo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ═══════════════════════════════════════
// Category Detail View — Courses inside a category
// ═══════════════════════════════════════

function CategoryDetailView({ catId, onBack }: { catId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: catData } = useQuery({
    queryKey: ['course-categories'],
    queryFn: getCourseCategories,
  });
  const cat = catData?.results?.find((c) => c.id === catId);

  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['course-category-courses', catId],
    queryFn: () => getCourseCategoryCourses(catId),
    enabled: !!catId,
  });
  const courses = coursesData?.results ?? [];

  const removeMutation = useMutation({
    mutationFn: (courseId: string) => removeCourseFromCategory(catId, courseId),
    onSuccess: () => {
      toast.success('Đã gỡ course');
      qc.invalidateQueries({ queryKey: ['course-category-courses', catId] });
      qc.invalidateQueries({ queryKey: ['course-categories'] });
    },
    onError: () => toast.error('Lỗi gỡ course'),
  });

  const handleRemove = (courseId: string, name: string) => {
    confirmDialog({
      title: 'Gỡ course',
      description: `Gỡ "${name}" khỏi danh mục?`,
      variant: 'destructive',
      onConfirm: () => removeMutation.mutate(courseId),
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{cat?.name || 'Danh mục'}</h1>
            <p className="text-sm text-muted-foreground">{courses.length} courses</p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <BookPlus className="h-4 w-4" /> Thêm course
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : courses.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground">Chưa có course nào trong danh mục</p>
        </Card>
      ) : (
        <div className="border rounded-xl divide-y">
          {courses.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.display_name}</p>
                <p className="text-[11px] text-muted-foreground truncate font-mono">{c.course_id}</p>
              </div>
              <button
                onClick={() => handleRemove(c.course_id, c.display_name)}
                disabled={removeMutation.isPending}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
              >
                {removeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <AddCoursesToCategoryModal
        open={addOpen}
        onOpenChange={setAddOpen}
        catId={catId}
        existingCourseIds={courses.map((c) => c.course_id)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['course-category-courses', catId] });
          qc.invalidateQueries({ queryKey: ['course-categories'] });
        }}
      />
    </div>
  );
}


// ═══════════════════════════════════════
// Modal: Add Courses to Category
// ═══════════════════════════════════════

function AddCoursesToCategoryModal({
  open,
  onOpenChange,
  catId,
  existingCourseIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  catId: string;
  existingCourseIds: string[];
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['courses-for-category', debouncedSearch, page],
    queryFn: () => getCourses({ page, page_size: 20, search: debouncedSearch }),
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: () => addCoursesToCategory(catId, selected),
    onSuccess: (res) => {
      toast.success(`Đã thêm ${res.assigned} course${res.skipped ? ` (${res.skipped} đã có)` : ''}`);
      setSelected([]);
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Lỗi thêm course'),
  });

  const courses = data?.courses ?? [];
  const available = courses.filter((c) => !existingCourseIds.includes(c.id));

  const toggle = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Thêm course vào danh mục</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm course theo tên..."
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-lg divide-y min-h-[200px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : courses.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              Không tìm thấy course
            </div>
          ) : courses.map((c) => {
            const isAssigned = existingCourseIds.includes(c.id);
            const isSelected = selected.includes(c.id);
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 ${isAssigned ? 'opacity-40' : 'cursor-pointer'}`}
                onClick={() => !isAssigned && toggle(c.id)}
              >
                <Checkbox
                  checked={isSelected || isAssigned}
                  disabled={isAssigned}
                  className="pointer-events-none"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.display_name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{c.id}</p>
                </div>
                {isAssigned && <span className="text-[10px] text-muted-foreground shrink-0">Đã có</span>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {data && data.total > 20 && (
              <div className="flex items-center gap-1 text-xs">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-7 w-7 p-0">
                  ←
                </Button>
                <span className="text-muted-foreground">Trang {page}</span>
                <Button size="sm" variant="ghost" disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)} className="h-7 w-7 p-0">
                  →
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Đã chọn <span className="font-semibold text-primary">{selected.length}</span>
              </span>
            )}
            <Button
              onClick={() => assignMutation.mutate()}
              disabled={selected.length === 0 || assignMutation.isPending}
              size="sm"
            >
              {assignMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Thêm ({selected.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
