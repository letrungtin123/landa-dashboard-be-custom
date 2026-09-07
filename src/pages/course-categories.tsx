import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { useTenantStore } from '@/utils/tenant-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, BookOpen, FolderKanban, Search, ChevronLeft, BookPlus, X, LayoutGrid, CheckCircle2, Circle, Globe } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/utils';
import { confirmDialog } from '@/utils/confirm-store';
import { useAuthStore } from '@/utils/store';
import { getGroupLabelSet } from '@/utils/group-labels';
import {
  getCourseCategories,
  createCourseCategory,
  updateCourseCategory,
  deleteCourseCategory,
  getCourseCategoryCourses,
  addCoursesToCategory,
  removeCourseFromCategory,
  getCourseCategoryPublicImpact,
  type CourseCategory,
  type CourseCategoryMembership,
} from '@/api/custom-course-categories';
import { getCourses } from '@/api/custom-courses';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useDebounce } from '@/hooks/use-debounce';
import { AppTooltip } from '@/components/ui/tooltip';
import { useHeaderInfo } from '@/utils/header-store';
import { getLocalizedApiError } from '@/utils/localized-error';

export default function CourseCategoriesPage() {
  const { t } = useTranslation();
  useHeaderInfo(t('courseCategories.title'));
  const qc = useQueryClient();
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('course_categories', 'can_add');
  const canEdit = hasPermission('course_categories', 'can_edit');
  const canDelete = hasPermission('course_categories', 'can_delete');
  const [editingCat, setEditingCat] = useState<CourseCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailCatId, setDetailCatId] = useState<string | null>(null);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  // ── Categories list ──
  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ['course-categories', activeTenantId],
    queryFn: () => getCourseCategories(),
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
      toast.success(t('courseCategories.created'));
      qc.invalidateQueries({ queryKey: ['course-categories'] });
      setCreateOpen(false);
      resetForm();
    },
    onError: (e: unknown) => toast.error(getLocalizedApiError(e, t('courseCategories.createFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; description?: string; sort_order?: number; is_public?: boolean }) =>
      updateCourseCategory(id, payload),
    onSuccess: () => {
      toast.success(t('courseCategories.updated'));
      qc.invalidateQueries({ queryKey: ['course-categories'] });
      setEditingCat(null);
      resetForm();
    },
    onError: (e: unknown) => toast.error(getLocalizedApiError(e, t('courseCategories.updateFailed'))),
  });

  const publicMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => updateCourseCategory(id, { is_public: isPublic }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-categories'] });
      qc.invalidateQueries({ queryKey: ['course-categories-for-group'] });
      qc.invalidateQueries({ queryKey: ['team-detail'] });
      toast.success(t('courseCategories.publicStatusUpdated'));
    },
    onError: (e: unknown) => toast.error(getLocalizedApiError(e, t('courseCategories.publicStatusUpdateFailed'))),
  });

  const handleTogglePublic = async (cat: CourseCategory) => {
    if (cat.is_public) {
      publicMutation.mutate({ id: cat.id, isPublic: false });
      return;
    }
    try {
      const impact = await getCourseCategoryPublicImpact(cat.id);
      const assignmentText = impact.assignments.slice(0, 8).map((item) => `${item.group_name} / ${item.subgroup_name} / ${item.team_name}`).join('\n');
      const extra = Math.max(0, impact.total - impact.assignments.length);
      const labelSet = getGroupLabelSet(useAuthStore.getState().groupLabels);
      const scopeText = `${labelSet.group}/${labelSet.subgroup}/${labelSet.team}`;
      const suffix = extra > 0 ? t('courseCategories.andOtherTeams', { count: extra, team: labelSet.team }) : "";
      confirmDialog({
        title: t('courseCategories.publicImpactTitle'),
        description: assignmentText
          ? t('courseCategories.publicImpactWithAssignments', { scope: scopeText, assignments: assignmentText, suffix })
          : t('courseCategories.publicImpactWithoutAssignments', { scope: scopeText }),
        confirmText: t('courseCategories.enablePublic'),
        cancelText: t('common.cancel'),
        variant: 'destructive',
        onConfirm: () => publicMutation.mutate({ id: cat.id, isPublic: true }),
      });
    } catch (e: unknown) {
      toast.error(getLocalizedApiError(e, t('courseCategories.enablePublicFailed')));
    }
  };
  const deleteMutation = useMutation({
    mutationFn: deleteCourseCategory,
    onSuccess: () => {
      toast.success(t('courseCategories.deleted'));
      qc.invalidateQueries({ queryKey: ['course-categories'] });
    },
    onError: () => toast.error(t('courseCategories.deleteFailed')),
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
      title: t('courseCategories.deleteTitle'),
      description: t('courseCategories.deleteDescription', { name: cat.name }),
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
    return <CategoryDetailView catId={detailCatId} onBack={() => setDetailCatId(null)} canEdit={canEdit} canDelete={canDelete} />;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      <PageHeader
        icon={FolderKanban}
        title={t('courseCategories.title')}
        description={t('courseCategories.description')}
        actions={
          canAdd ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> {t('courseCategories.createCategory')}
            </Button>
          ) : undefined
        }
      />

      {catLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[24px]" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed rounded-[32px] bg-muted/10">
          <div className="h-16 w-16 bg-muted/30 rounded-full flex items-center justify-center mb-4">
            <LayoutGrid className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{t('courseCategories.emptyTitle')}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">{t('courseCategories.emptyDescription')}</p>
          {canAdd && (
            <Button onClick={openCreate} className="mt-6 gap-2 rounded-full px-6">
              <Plus className="h-4 w-4" /> {t('courseCategories.createFirst')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="app-liquid-card group relative flex flex-col p-5 rounded-[24px] hover:-translate-y-1 hover:border-primary/30 transition-[transform,border-color,box-shadow] duration-150 ease-out cursor-pointer overflow-hidden will-change-transform"
              onClick={() => setDetailCatId(cat.id)}
            >
              {/* Background accent */}
              <div className="absolute top-0 right-0 w-28 h-28 bg-primary/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none opacity-60" />
              
              <div className="flex items-start justify-between relative z-10 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0 shadow-inner">
                  <FolderKanban className="h-6 w-6 text-primary drop-shadow-sm" />
                </div>
                
                <div className="flex items-center gap-1.5 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-150 ease-out shrink-0" onClick={(e) => e.stopPropagation()}>
                  {canEdit && <AppTooltip content={cat.is_public ? t('courseCategories.turnPublicOff') : t('courseCategories.turnPublicOn')}><Button variant="outline" size="icon" className={cn("h-8 w-8 rounded-full bg-background shadow-sm", cat.is_public ? "text-sky-600 border-sky-200" : "hover:bg-sky-50 hover:text-sky-600")} onClick={() => handleTogglePublic(cat)} aria-label={cat.is_public ? t('courseCategories.turnPublicOff') : t('courseCategories.turnPublicOn')}>
                    <Globe className="h-3.5 w-3.5" />
                  </Button></AppTooltip>}
                  {canEdit && (
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full bg-background shadow-sm hover:bg-primary/10 hover:text-primary hover:border-primary/20" onClick={() => openEdit(cat)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full bg-background shadow-sm hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20" onClick={() => handleDelete(cat)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="relative z-10 flex-1 flex flex-col">
                <div className="flex items-center gap-2"><h3 className="text-lg font-bold text-foreground mb-1 truncate group-hover:text-primary transition-colors">{cat.name}</h3>{cat.is_public && <Badge variant="outline" className="mb-1 shrink-0 gap-1 border-sky-200 bg-sky-50 text-[10px] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"><Globe className="h-3 w-3" /> {t('courseCategories.public')}</Badge>}</div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[40px]">
                  {cat.description || <span className="italic opacity-50">{t('courseCategories.noDescription')}</span>}
                </p>
                
                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <BookOpen className="h-4 w-4 text-muted-foreground/70" />
                    <span>{t('courseCategories.courseCount', { count: cat.course_count })}</span>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <ChevronLeft className="h-4 w-4 rotate-180" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat ? t('courseCategories.editTitle') : t('courseCategories.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('courseCategories.categoryName')} *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('courseCategories.namePlaceholder')}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('courseCategories.descriptionLabel')}</label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder={t('courseCategories.descriptionPlaceholder')}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('courseCategories.sortOrder')}</label>
              <Input
                type="number"
                value={formOrder}
                onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t('common.cancel')}</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCat ? t('courseCategories.save') : t('courseCategories.create')}
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

function CategoryDetailView({ catId, onBack, canEdit, canDelete }: { catId: string; onBack: () => void; canEdit: boolean; canDelete: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: catData } = useQuery({
    queryKey: ['course-categories'],
    queryFn: () => getCourseCategories(),
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
      toast.success(t('courseCategories.removedCourse'));
      qc.invalidateQueries({ queryKey: ['course-category-courses', catId] });
      qc.invalidateQueries({ queryKey: ['course-categories'] });
    },
    onError: () => toast.error(t('courseCategories.removeCourseFailed')),
  });

  const handleRemove = (courseId: string, name: string) => {
    confirmDialog({
      title: t('courseCategories.removeCourseTitle'),
      description: t('courseCategories.removeCourseDescription', { name }),
      variant: 'destructive',
      onConfirm: () => removeMutation.mutate(courseId),
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="app-liquid-card relative p-8 rounded-[32px] overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Button variant="outline" size="icon" onClick={onBack} className="h-10 w-10 rounded-full shrink-0 shadow-sm hover:bg-primary/5 hover:text-primary">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-2.5 py-0.5 text-xs rounded-full">
                  {t('courseCategories.title')}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{cat?.name || t('courseCategories.loading')}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {cat?.description || t('courseCategories.detailDescription')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col items-end px-5 py-2.5 bg-background/50 backdrop-blur-md rounded-2xl border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">{t('courseCategories.total')}</span>
              <span className="text-xl font-bold text-foreground flex items-center gap-2">
                {courses.length} <BookOpen className="h-4 w-4 text-primary" />
              </span>
            </div>
            {canEdit && (
              <Button onClick={() => setAddOpen(true)} className="gap-2 h-12 px-6 rounded-2xl shadow-md hover:shadow-lg transition-all">
                <BookPlus className="h-4 w-4" /> {t('courseCategories.addCourse')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed rounded-[32px] bg-muted/10">
          <div className="h-16 w-16 bg-muted/30 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{t('courseCategories.noCoursesTitle')}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-6">{t('courseCategories.noCoursesDescription')}</p>
          {canEdit && (
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2 rounded-full px-6">
              <Plus className="h-4 w-4" /> {t('courseCategories.addNow')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {courses.map((c, i) => (
              <motion.div 
                key={c.id} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="app-liquid-card flex items-center gap-4 px-5 py-4 rounded-[20px] hover:border-primary/30 group transition-all"
              >
                <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">{c.display_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono font-semibold tracking-wider">
                      {c.course_id}
                    </code>
                  </div>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(c.course_id, c.display_name)}
                    disabled={removeMutation.isPending}
                    className="opacity-0 group-hover:opacity-100 h-9 w-9 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                  >
                    {removeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </Button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
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
  const { t } = useTranslation();
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
      toast.success(t('courseCategories.assignedCourses', { count: res.assigned, skipped: res.skipped ? t('courseCategories.skipped', { count: res.skipped }) : '' }));
      if (res.conflicts?.length) {
        const preview = res.conflicts.slice(0, 5).map((item) => t('courseCategories.conflictEntry', { course: item.display_name, category: item.category_name })).join('\n');
        const extra = res.conflicts.length > 5 ? t('courseCategories.conflictsSuffix', { count: res.conflicts.length - 5 }) : '';
        toast.warning(t('courseCategories.conflicts', { details: preview, suffix: extra }));
      }
      setSelected([]);
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(getLocalizedApiError(e, t('courseCategories.addCoursesFailed'))),
  });

  const courses = data?.courses ?? [];
  const available = courses.filter((c) => !existingCourseIds.includes(c.id) && !c.category_id);

  const toggle = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-0 shadow-2xl rounded-[32px]">
        <div className="bg-gradient-to-br from-card to-muted/30 p-6 border-b border-border/50">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-2xl shadow-inner border border-primary/20">
                <BookPlus className="w-7 h-7 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">{t('courseCategories.addCoursesTitle')}</DialogTitle>
                <DialogDescription className="text-sm mt-1">
                  {t('courseCategories.addCoursesDescription')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 bg-muted/5 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('courseCategories.searchCourses')}
              className="pl-11 h-12 rounded-xl bg-background border-border/50 shadow-sm text-base focus-visible:ring-primary/20"
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-border/50 rounded-2xl bg-background shadow-inner divide-y min-h-[300px] max-h-[450px] custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm">{t('courseCategories.loadingCourses')}</p>
              </div>
            ) : courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium">{t('courseCategories.noMatchingCourses')}</p>
              </div>
            ) : courses.map((c) => {
              const isAssigned = existingCourseIds.includes(c.id) || c.category_id === catId;
              const isInOtherCategory = !isAssigned && Boolean(c.category_id && c.category_id !== catId);
              const existingCategoryName = c.category_name?.trim() || t('courseCategories.otherCategory');
              const isDisabled = isAssigned || isInOtherCategory;
              const isSelected = selected.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3.5 transition-colors",
                    isDisabled ? "bg-muted/30 opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-muted/50",
                    isSelected && !isDisabled ? "bg-primary/5 hover:bg-primary/10" : ""
                  )}
                  onClick={() => !isDisabled && toggle(c.id)}
                >
                  <div className="shrink-0">
                    {isAssigned ? (
                      <CheckCircle2 className="h-5 w-5 text-muted-foreground opacity-50" />
                    ) : isSelected ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-bold truncate", isSelected ? "text-primary" : "text-foreground")}>
                      {c.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{c.id}</p>
                  </div>
                  {isInOtherCategory && (
                    <AppTooltip content={t('courseCategories.alreadyInCategory', { category: existingCategoryName })}><Badge
                      variant="secondary"

                      className="max-w-[220px] truncate text-[10px] shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    >
                      {t('courseCategories.alreadyInCategory', { category: existingCategoryName })}
                    </Badge></AppTooltip>
                  )}
                  {isAssigned && (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider shrink-0 bg-muted-foreground/10 text-muted-foreground">
                      {t('courseCategories.alreadyAdded')}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="p-6 bg-card border-t border-border/50">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {data && data.total > 20 && (
                <div className="flex items-center gap-1.5 text-sm bg-muted/50 px-2 py-1 rounded-lg">
                  <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-7 w-7 rounded-md hover:bg-background shadow-sm">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-muted-foreground font-medium px-2">{t('courseCategories.page', { page })}</span>
                  <Button size="icon" variant="ghost" disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)} className="h-7 w-7 rounded-md hover:bg-background shadow-sm">
                    <ChevronLeft className="h-4 w-4 rotate-180" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t('courseCategories.selected')} <strong className="text-primary text-base ml-1">{selected.length}</strong>
              </span>
              <Button
                onClick={() => assignMutation.mutate()}
                disabled={selected.length === 0 || assignMutation.isPending}
                className="gap-2 rounded-xl px-6 shadow-md"
              >
                {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('courseCategories.addToCategory')}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
