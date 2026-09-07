import { useState, useEffect, useRef } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { useTranslation } from 'react-i18next';

import { useTenantStore } from '@/utils/tenant-store';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { getCourses, updateCourse, bulkCourseAction, deleteCourse, getCourseModalConfig, updateCourseModalConfig, sendCourseNotification, getCourseNotificationSmtpStatus, getCourseNotificationHistory, getCourseMentor, getCourseMentorCandidates, updateCourseMentor, getCourseMentorHistory, getCourseMentorSection, updateCourseMentorSection, uploadCourseMentorSectionLogo, deleteCourseMentorSectionLogo, type CustomCourse, type CourseMentor, type CourseModalConfig, type CourseNotificationHistoryItem } from '@/api/custom-courses';
import { createCourse, uploadCourseAsset, updateXBlock } from '@/api/custom-course-authoring';
import { useHeaderInfo } from '@/utils/header-store';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { getRoleLabel } from '@/utils/role-labels';
import { useAuthStore } from '@/utils/store';
import { useDebounce } from '@/hooks/use-debounce';
import { TableToolbar } from '@/components/shared/table-toolbar';
import { Pagination } from '@/components/shared/pagination';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { confirmDialog } from '@/utils/confirm-store';
import {
  BookOpen, GraduationCap, Globe, Edit2, Plus, ImagePlus, Loader2, LayoutTemplate, ArrowRight, ArrowLeft, FolderOpen, Archive, ArchiveRestore, Settings2, Bell, Facebook, Instagram, MessageCircle, ChevronDown, Ban, Trash2, UserRound, Search, CheckCircle2, Mail, Phone, MoreHorizontal, Save, Sun, Moon, FileText, ClipboardList, Info, History, Send, Users, Clock3, AlertCircle
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { CourseFilesModal } from '@/components/course-editor/CourseFilesModal';
import { Switch } from '@/components/ui/switch';
import FacebookIcon from '@/assets/SocialIcon/facebook.png';
import InstagramIcon from '@/assets/SocialIcon/instagram.png';
import ZaloIcon from '@/assets/SocialIcon/zalo.png';
import { Label } from '@/components/ui/label';
import i18n, { type AppLocale } from '@/i18n';
import { formatLocaleDate } from '@/utils/locale-format';
import { getLocalizedApiError } from '@/utils/localized-error';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function getCourseMentorDisplayName(course: CustomCourse): string {
  return course.mentor?.full_name || course.mentor?.username || course.mentor?.email || i18n.t('courses.noMentor');
}

function getCourseCreatorDisplayName(course: CustomCourse): string {
  return course.creator_display_name?.trim() || i18n.t('courses.noCreator');
}

function formatCourseUpdatedAt(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatLocaleDate(date, (i18n.language === 'en' ? 'en' : 'vi') as AppLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dateInputToLocalIso(value: string, endExclusive = false): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day + (endExclusive ? 1 : 0), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function CoursesPage() {
  const { t } = useTranslation();
  useHeaderInfo(t('courses.title'));

  const queryClient = useQueryClient();
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const currentUser = useAuthStore((s) => s.user);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const groupScopeText = `${labels.group}/${labels.subgroup}/${labels.team}`;
  const canAdd = hasPermission('courses', 'can_add');
  const canEdit = hasPermission('courses', 'can_edit');
  const canDelete = hasPermission('courses', 'can_delete');
  const canManageMentors = currentUser?.role === 'superuser' || currentUser?.role === 'superadmin';
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [visFilter, setVisFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewCourse, setPreviewCourse] = useState<CustomCourse | null>(null);
  const [selectedCourseFiles, setSelectedCourseFiles] = useState<string | null>(null);
  const [modalConfigCourseId, setModalConfigCourseId] = useState<string | null>(null);
  const [notifyCourseId, setNotifyCourseId] = useState<string | null>(null);
  const [mentorCourse, setMentorCourse] = useState<CustomCourse | null>(null);
  const [courseInfoCourse, setCourseInfoCourse] = useState<CustomCourse | null>(null);

  // --- Tạo course mới ---
  const [showCreate, setShowCreate] = useState(false);
  const [newOrg, setNewOrg] = useState('LAndA2');
  const [newNumber, setNewNumber] = useState('');
  const [newRun, setNewRun] = useState(String(new Date().getFullYear()));
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const canSubmitCreateCourse = Boolean(newName.trim() && newDescription.trim() && newNumber.trim() && newOrg.trim() && newRun.trim());

  const createMut = useMutation({
    mutationFn: () => createCourse({
      org: newOrg.trim(),
      number: newNumber.trim(),
      run: newRun.trim(),
      display_name: newName.trim(),
      description: newDescription.trim(),
      start: '2020-01-01T00:00:00Z',
    }),
    onSuccess: (data) => {
      toast.success(t('courses.created', { name: data.display_name }));
      setShowCreate(false);
      setNewNumber(''); setNewName(''); setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
    },
    onError: (err: unknown) => {
      toast.error(getLocalizedApiError(err, t('courses.createFailed')));
    },
  });

  // --- Upload Course Image ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCourseId, setUploadingCourseId] = useState<string | null>(null);

  const handleUploadCourseImage = async (courseId: string, file: File) => {
    setUploadingCourseId(courseId);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // 1. Upload to Assets API
      const uploadResult = await uploadCourseAsset(courseId, file);

      const display_name = uploadResult?.display_name || file.name;
      if (!display_name) throw new Error(t('courses.fileNameMissing'));

      // 2. Update Course image via custom courses API
      await updateCourse(courseId, { image_url: uploadResult?.url || '' });

      toast.success(t('courses.imageUpdated'));
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, t('courses.imageUpdateFailed')));
    } finally {
      setUploadingCourseId(null);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const courseId = fileInputRef.current?.getAttribute('data-course-id');
    if (!file || !courseId) return;

    handleUploadCourseImage(courseId, file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerUpload = (courseId: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-course-id', courseId);
      fileInputRef.current.click();
    }
  };

  useEffect(() => { setPage(1); }, [debouncedSearch, visFilter]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['landa-courses', page, limit, debouncedSearch, visFilter, activeTenantId],
    queryFn: () => getCourses({
      page, page_size: limit,
      search: debouncedSearch || undefined,
      visibility: visFilter !== 'all' ? visFilter as 'staff_only' | 'public' : undefined,
    }),
  });

  const courses = data?.courses ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  // Toggle visibility
  const toggleVis = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) =>
      updateCourse(id, { visible_to_staff_only: visible }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
      toast.success(t('courses.updated'));
    },
    onError: () => toast.error(t('courses.updateFailed')),
  });

  // Bulk
  const bulkMut = useMutation({
    mutationFn: ({ action }: { action: 'staff_only' | 'public' }) =>
      bulkCourseAction(selected, action),
    onSuccess: (result, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
      setSelected([]);
      toast.success(t('courses.bulkUpdated', { count: result.updated, status: action === 'public' ? t('courses.visibleStatus') : t('courses.archivedStatus') }));
    },
    onError: () => toast.error(t('courses.bulkUpdateFailed')),
  });

  // Delete course
  const deleteMut = useMutation({
    mutationFn: (courseId: string) => deleteCourse(courseId),
    onMutate: async (courseId) => {
      await queryClient.cancelQueries({ queryKey: ['landa-courses'] });
      const previousCourses = queryClient.getQueriesData<{
        courses: CustomCourse[];
        total: number;
        page: number;
        page_size: number;
      }>({ queryKey: ['landa-courses'] });
      const previousSelected = selected;

      queryClient.setQueriesData<{
        courses: CustomCourse[];
        total: number;
        page: number;
        page_size: number;
      }>({ queryKey: ['landa-courses'] }, (old) => {
        if (!old) return old;
        const nextCourses = old.courses.filter((item) => item.id !== courseId);
        const removed = old.courses.length - nextCourses.length;
        if (removed === 0) return old;
        return {
          ...old,
          courses: nextCourses,
          total: Math.max(0, old.total - removed),
        };
      });
      setSelected((prev) => prev.filter((id) => id !== courseId));

      return { previousCourses, previousSelected };
    },
    onSuccess: () => {
      toast.success(t('courses.deleted'));
    },
    onError: (err: unknown, _courseId, context) => {
      context?.previousCourses.forEach(([queryKey, value]) => {
        queryClient.setQueryData(queryKey, value);
      });
      if (context?.previousSelected) setSelected(context.previousSelected);
      toast.error(getLocalizedApiError(err, t('courses.deleteFailed')));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
    },
  });

  function handleDeleteCourse(course: CustomCourse) {
    confirmDialog({
      title: t('courses.deleteTitle'),
      description: t('courses.deleteDescription', { name: course.display_name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
      onConfirm: () => deleteMut.mutate(course.id),
    });
  }

  // Selection
  const allSelected = courses.length > 0 && courses.every((c) => selected.includes(c.id));
  const toggleAll = () => setSelected(allSelected ? [] : courses.map((c) => c.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto pb-10">

      <PageHeader
        icon={GraduationCap}
        title={t('courses.title')}
        description={t('courses.description')}
      />
      {/* Dialog tạo course */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">{t('courses.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('courses.courseName')}</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('courses.courseNameExample')} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('courses.descriptionLabel')} <span className="text-red-500">*</span></label>
              <textarea
                className="flex min-h-[96px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                maxLength={5000}
                placeholder={t('courses.descriptionPlaceholder')}
              />
              {!newDescription.trim() && (
                <p className="text-xs text-red-500">{t('courses.descriptionRequired')}</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('courses.organization')}</label>
                <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newOrg} onChange={e => setNewOrg(e.target.value)} placeholder="LAndA2" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('courses.courseCode')}</label>
                <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="000010" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('courses.runYear')}</label>
                <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newRun} onChange={e => setNewRun(e.target.value)} placeholder="2026" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('courses.courseCodePreview')} <span className="font-mono font-semibold">course-v1:{newOrg}+{newNumber}+{newRun}</span></p>
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2 rounded-md">{t('courses.startDateHint')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !canSubmitCreateCourse}>
              {createMut.isPending ? t('courses.creating') : t('courses.createCourse')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Preview Card */}
      <Dialog open={!!previewCourse} onOpenChange={(o) => !o && setPreviewCourse(null)}>
        <DialogContent className="sm:max-w-[380px] p-5 border-border bg-background gap-0">
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[13px] font-medium leading-[18px]">
            {t('courses.previewHint')}
          </div>

          <div className="app-liquid-card w-full rounded-[28px] border border-border bg-card p-2 pb-4 shadow-sm">
            {/* Ảnh bìa khóa học */}
            <div className="flex h-44 items-center justify-center relative overflow-hidden shrink-0 rounded-[20px] bg-muted">
              {previewCourse?.image_url && !previewCourse.image_url.includes('images/course_image') && !previewCourse.image_url.includes('images_course_image') ? (
                <img
                  src={storageUrl(previewCourse.image_url)}
                  alt={previewCourse.display_name}
                  className="absolute inset-0 z-10 h-full w-full object-cover rounded-[20px]"
                />
              ) : (
                <BookOpen className="h-12 w-12 text-muted-foreground/40" />
              )}
            </div>

            <div className="pt-4 px-2 flex flex-col flex-1">
              {/* Organization label nhỏ màu xanh */}
              <p className="mb-1.5 text-[13px] font-medium leading-[16px] text-primary">
                {previewCourse?.org || "LAndA"}
              </p>

              <h3 className="mb-5 text-[20px] font-bold leading-[26px] text-foreground line-clamp-2">
                {previewCourse?.display_name || "L&A System 4"}
              </h3>

              <div className="mt-auto pt-5">
                <button
                  className="w-fit rounded-full bg-primary px-8 py-3 text-[15px] font-bold leading-[18px] text-white transition-colors hover:bg-primary/90"
                >
                  {t('courses.startLearning')}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={onFileChange}
      />

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('courses.searchPlaceholder')}
        filters={[
          {
            key: 'visibility',
            placeholder: t('courses.status'),
            options: [
              { value: 'public', label: t('courses.active') },
              { value: 'staff_only', label: t('courses.archived') },
            ],
          },
        ]}
        filterValues={{ visibility: visFilter }}
        onFilterChange={(key, val) => {
          if (key === 'visibility') setVisFilter(val);
        }}
        onReset={() => { setSearch(''); setVisFilter('all'); }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 && canEdit && (
              <>
                <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ action: 'public' })} className="h-8 text-xs">
                  <Globe className="mr-1 h-3.5 w-3.5" /> {t('courses.showSelected', { count: selected.length })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ action: 'staff_only' })} className="h-8 text-xs text-slate-600">
                  <Archive className="mr-1 h-3.5 w-3.5" /> {t('courses.archiveSelected', { count: selected.length })}
                </Button>
              </>
            )}
            {canAdd && <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> {t('courses.createCourse')}
            </Button>}
          </div>
        }
      />

      <TooltipProvider delayDuration={300}>
        <div className="app-data-table-shell bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="divide-y divide-border md:hidden">
            {isLoading ? (
              Array.from({ length: Math.min(limit, 5) }).map((_, i) => (
                <div key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="mt-1 h-4 w-4" />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : courses.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                <GraduationCap className="mb-2 h-8 w-8 opacity-20" />
                <p className="text-sm">{t('courses.empty')}</p>
              </div>
            ) : (
              courses.map((course) => (
                <div key={course.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox checked={selected.includes(course.id)} onCheckedChange={() => toggleOne(course.id)} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm font-semibold text-foreground">{course.display_name}</div>
                            <div className="mt-1 truncate text-[11px] font-mono text-muted-foreground">{course.id}</div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Badge
                            variant="outline"
                            className={course.visible_to_staff_only
                              ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50'
                              : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                            }
                          >
                            {course.visible_to_staff_only ? t('courses.archived') : t('courses.active')}
                          </Badge>
                          {course.is_public && (
                            <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                              <Globe className="h-3 w-3" /> {t('courses.public')}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                          <div className="mb-0.5 text-muted-foreground">{t('courses.creator')}</div>
                          <div className="flex min-w-0 items-center gap-1.5 font-medium">
                            <Users className="h-3.5 w-3.5 shrink-0 text-indigo-600/70" />
                            <span className="truncate">{getCourseCreatorDisplayName(course)}</span>
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5 text-muted-foreground">{t('courses.mentor')}</div>
                          <div className="flex min-w-0 items-center gap-1.5 font-medium">
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-cyan-600/70" />
                            <span className="truncate">{getCourseMentorDisplayName(course)}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="mb-0.5 text-muted-foreground">{t('courses.updatedAt')}</div>
                          <div className="font-medium">{formatCourseUpdatedAt(course.updated_at)}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        {canEdit && (
                          <Button size="sm" asChild className="h-8 text-xs">
                            <Link to={`/courses/${course.id}/edit`}>
                              <Edit2 className="h-3.5 w-3.5" />
                              {t('courses.editContent')}
                            </Link>
                          </Button>
                        )}

                        <AppTooltip content={t('courses.manageFiles')}><Button variant="outline" size="icon-sm"
                          onClick={() => setSelectedCourseFiles(course.id)}
                          className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/30"
                          aria-label={t('courses.manageFiles')}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </Button></AppTooltip>

                        <DropdownMenu>
                          <AppTooltip content={t('courses.moreActions')}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label={t('courses.moreActions')}>
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                          </AppTooltip>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => setPreviewCourse(course)} className="gap-2">
                              <LayoutTemplate className="h-4 w-4 text-sky-600" />
                              {t('courses.previewCard')}
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setCourseInfoCourse(course)} className="gap-2">
                                <FileText className="h-4 w-4 text-emerald-600" />
                                {t('courses.editInfo')}
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem asChild className="gap-2">
                                <Link to={`/courses/${course.id}/assignments`}>
                                  <ClipboardList className="h-4 w-4 text-violet-600" />
                                  {t('courses.assignments')}
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => triggerUpload(course.id)} disabled={uploadingCourseId === course.id} className="gap-2">
                                {uploadingCourseId === course.id ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <ImagePlus className="h-4 w-4 text-indigo-600" />}
                                {t('courses.changeImage')}
                              </DropdownMenuItem>
                            )}
                            {canManageMentors && (
                              <DropdownMenuItem onClick={() => setMentorCourse(course)} className="gap-2">
                                <UserRound className="h-4 w-4 text-cyan-600" />
                                {t('courses.mentor')}
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => toggleVis.mutate({ id: course.id, visible: !course.visible_to_staff_only })} className="gap-2">
                                {course.visible_to_staff_only ? <ArchiveRestore className="h-4 w-4 text-amber-600" /> : <Archive className="h-4 w-4 text-slate-500" />}
                                {course.visible_to_staff_only ? t('courses.restoreVisibility') : t('courses.archiveCourse')}
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setNotifyCourseId(course.id)} className="gap-2">
                                <Bell className="h-4 w-4 text-amber-600" />
                                {t('courses.sendNotification')}
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setModalConfigCourseId(course.id)} className="gap-2">
                                <Settings2 className="h-4 w-4 text-violet-600" />
                                {t('courses.modalConfiguration')}
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                onClick={() => handleDeleteCourse(course)}
                                disabled={deleteMut.isPending}
                                className="gap-2 text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                                {t('courses.permanentDelete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                  <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">{t('courses.courseColumn')}</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">{t('courses.creator')}</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">{t('courses.status')}</TableHead>

                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">{t('courses.mentor')}</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">{t('courses.updatedAt')}</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider pr-5">{t('courses.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={isFetching && courses.length > 0 ? 'opacity-50 pointer-events-none' : ''}>
                {isLoading ? (
                  Array.from({ length: limit }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell className="pl-4"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><div className="space-y-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-52" /></div></TableCell>
                      <TableCell><Skeleton className="mx-auto h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="mx-auto h-5 w-16" /></TableCell>

                      <TableCell><Skeleton className="mx-auto h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="mx-auto h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="mx-auto h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : courses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <GraduationCap className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">{t('courses.empty')}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  courses.map((course) => (
                    <TableRow key={course.id} className="group hover:bg-muted/30 transition-colors border-border">
                      <TableCell className="pl-4">
                        <Checkbox checked={selected.includes(course.id)} onCheckedChange={() => toggleOne(course.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <BookOpen className="h-4 w-4 text-primary/60 flex-shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-sm truncate max-w-[280px]">{course.display_name}</span>
                            <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[280px]">{course.id}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <div className="mx-auto flex max-w-[180px] items-center justify-center gap-2 text-muted-foreground">
                          <Users className="h-3.5 w-3.5 shrink-0 text-indigo-600/70" />
                          <span className="truncate font-medium text-foreground">{getCourseCreatorDisplayName(course)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={course.visible_to_staff_only
                              ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50'
                              : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                            }
                          >
                            {course.visible_to_staff_only ? t('courses.archived') : t('courses.active')}
                          </Badge>
                          {course.is_public && (
                            <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                              <Globe className="h-3 w-3" /> {t('courses.public')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm">
                        <div className="mx-auto flex max-w-[180px] items-center justify-center gap-2">
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-cyan-600/70" />
                          <span className="truncate">{getCourseMentorDisplayName(course)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm whitespace-nowrap">{formatCourseUpdatedAt(course.updated_at)}</TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-center gap-1">
                          {canEdit && <Tooltip>
                            <TooltipTrigger asChild>
                              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10">
                                <Link to={`/courses/${course.id}/edit`}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('courses.editContentTooltip')}</TooltipContent>
                          </Tooltip>}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon"
                                onClick={() => setSelectedCourseFiles(course.id)}
                                className="h-8 w-8 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/30"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('courses.manageFiles')}</TooltipContent>
                          </Tooltip>

                          {canEdit && <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon"
                                onClick={() => toggleVis.mutate({ id: course.id, visible: !course.visible_to_staff_only })}
                                className={`h-8 w-8 ${course.visible_to_staff_only ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-950/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}
                              >
                                {course.visible_to_staff_only ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{course.visible_to_staff_only ? t('courses.restoreVisibility') : t('courses.archiveCourse')}</TooltipContent>
                          </Tooltip>}


                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => setPreviewCourse(course)}>
                                <LayoutTemplate className="h-4 w-4 text-sky-600" />
                                {t('courses.previewCardTooltip')}
                              </DropdownMenuItem>

                              {canEdit && (
                                <DropdownMenuItem onClick={() => setCourseInfoCourse(course)}>
                                  <FileText className="h-4 w-4 text-emerald-600" />
                                  {t('courses.editInfo')}
                                </DropdownMenuItem>
                              )}

                              {canEdit && (
                                <DropdownMenuItem
                                  onClick={() => triggerUpload(course.id)}
                                  disabled={uploadingCourseId === course.id}
                                >
                                  {uploadingCourseId === course.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                                  ) : (
                                    <ImagePlus className="h-4 w-4 text-indigo-600" />
                                  )}
                                  {t('courses.changeImage')}
                                </DropdownMenuItem>
                              )}

                              {canEdit && (
                                <DropdownMenuItem asChild>
                                  <Link to={`/courses/${course.id}/assignments`}>
                                    <ClipboardList className="h-4 w-4 text-fuchsia-600" />
                                    {t('courses.assignments')}
                                  </Link>
                                </DropdownMenuItem>
                              )}

                              {canManageMentors && (
                                <DropdownMenuItem onClick={() => setMentorCourse(course)}>
                                  <UserRound className="h-4 w-4 text-cyan-600" />
                                  {t('courses.mentor')}
                                </DropdownMenuItem>
                              )}

                              {canEdit && (
                                <DropdownMenuItem onClick={() => setNotifyCourseId(course.id)}>
                                  <Bell className="h-4 w-4 text-amber-600" />
                                  {t('courses.sendNotification')}
                                </DropdownMenuItem>
                              )}

                              {canEdit && (
                                <DropdownMenuItem onClick={() => setModalConfigCourseId(course.id)}>
                                  <Settings2 className="h-4 w-4 text-violet-600" />
                                  {t('courses.modalConfiguration')}
                                </DropdownMenuItem>
                              )}

                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteCourse(course)}
                                    disabled={deleteMut.isPending}
                                    className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {t('courses.permanentDelete')}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} limit={limit} total={total} totalPages={totalPages} onPageChange={setPage} onLimitChange={setLimit} label={t('courses.paginationLabel')} />
        </div>
      </TooltipProvider>

      <CourseFilesModal
        isOpen={!!selectedCourseFiles}
        onClose={() => setSelectedCourseFiles(null)}
        courseId={selectedCourseFiles || ''}
      />

      {mentorCourse && (
        <CourseMentorDialog
          course={mentorCourse}
          open={!!mentorCourse}
          onClose={() => setMentorCourse(null)}
        />
      )}

      {/* Dialog cấu hình Modal */}
      {courseInfoCourse && (
        <CourseInfoDialog
          course={courseInfoCourse}
          open={!!courseInfoCourse}
          onClose={() => setCourseInfoCourse(null)}
        />
      )}

      {modalConfigCourseId && (
        <CourseModalConfigDialog
          courseId={modalConfigCourseId}
          open={!!modalConfigCourseId}
          onClose={() => setModalConfigCourseId(null)}
        />
      )}

      {/* Dialog gửi thông báo */}
      {notifyCourseId && (
        <SendNotificationDialog
          courseId={notifyCourseId}
          isPublic={courses.find((course) => course.id === notifyCourseId)?.is_public === true}
          open={!!notifyCourseId}
          onClose={() => setNotifyCourseId(null)}
        />
      )}
    </div>
  );
}

// ── Course Modal Config Dialog (tách ra làm component riêng bên dưới) ──

function CourseInfoDialog({ course, open, onClose }: { course: CustomCourse; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(course.display_name);
  const [description, setDescription] = useState(course.description ?? '');

  useEffect(() => {
    if (!open) return;
    setDisplayName(course.display_name);
    setDescription(course.description ?? '');
  }, [course, open]);

  const saveMut = useMutation({
    mutationFn: () => updateCourse(course.id, {
      display_name: displayName.trim(),
      description: description.trim(),
    }),
    onSuccess: () => {
      toast.success(t('courses.infoUpdated'));
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
      onClose();
    },
    onError: (err: unknown) => {
      toast.error(getLocalizedApiError(err, t('courses.infoUpdateFailed')));
    },
  });

  const canSave = Boolean(displayName.trim() && description.trim()) && !saveMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('courses.courseInfoTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('courses.courseName')} <span className="text-red-500">*</span></Label>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={500}
              placeholder={t('courses.namePlaceholder')}
            />
            {!displayName.trim() && (
              <p className="text-xs text-red-500">{t('courses.nameRequired')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('courses.descriptionLabel')} <span className="text-red-500">*</span></Label>
            <textarea
              className="flex min-h-[132px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              placeholder={t('courses.descriptionInputPlaceholder')}
            />
            <div className="flex items-center justify-between gap-3">
              {!description.trim() ? (
                <p className="text-xs text-red-500">{t('courses.descriptionRequired')}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-muted-foreground">{description.length}/5000</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>{t('common.cancel')}</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave}>
            {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('courses.saveInfo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseMentorDialog({ course, open, onClose }: { course: CustomCourse; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const roleLabels = useAuthStore((s) => s.roleLabels);
  const [search, setSearch] = useState('');
  const [description, setDescription] = useState('');
  const debouncedSearch = useDebounce(search);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(5);
  const [historySearch, setHistorySearch] = useState('');
  const debouncedHistorySearch = useDebounce(historySearch);
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const lightLogoInputRef = useRef<HTMLInputElement>(null);
  const darkLogoInputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { data: currentMentor, isLoading: loadingCurrent } = useQuery({
    queryKey: ['course-mentor', course.id],
    queryFn: () => getCourseMentor(course.id),
    enabled: open && !!course.id,
    initialData: course.mentor ?? undefined,
  });

  const { data: candidates, isLoading: loadingCandidates, isFetching } = useQuery({
    queryKey: ['course-mentor-candidates', course.id, page, pageSize, debouncedSearch],
    queryFn: () => getCourseMentorCandidates(course.id, {
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
    }),
    enabled: open && !!course.id,
    staleTime: 30_000,
  });

  const { data: mentorSection, isLoading: loadingMentorSection } = useQuery({
    queryKey: ['course-mentor-section', course.id],
    queryFn: () => getCourseMentorSection(course.id),
    enabled: open && !!course.id,
  });

  const historySearchTerm = debouncedHistorySearch.replace(/\s+/g, ' ').trim();
  const historySearchTooShort = historySearchTerm.length === 1;
  const historySearchParam = historySearchTerm.length >= 2 ? historySearchTerm : undefined;
  const historyDateRangeInvalid = !!historyDateFrom && !!historyDateTo && historyDateFrom > historyDateTo;
  const historyDateFromParam = dateInputToLocalIso(historyDateFrom);
  const historyDateToParam = dateInputToLocalIso(historyDateTo, true);
  const historyHasActiveFilters = !!historySearchParam || !!historyDateFrom || !!historyDateTo;
  const historyQueryEnabled = open && historyOpen && !!course.id && !historySearchTooShort && !historyDateRangeInvalid;
  const resetHistoryPaging = () => setHistoryPage(1);

  const historyQuery = useQuery({
    queryKey: ['course-mentor-history', course.id, historyPage, historyPageSize, historySearchParam || '', historyDateFromParam || '', historyDateToParam || ''],
    queryFn: () => getCourseMentorHistory(course.id, {
      page: historyPage,
      page_size: historyPageSize,
      search: historySearchParam,
      date_from: historyDateFromParam,
      date_to: historyDateToParam,
    }),
    enabled: historyQueryEnabled,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!open) return;
    setDescription(mentorSection?.description ?? '');
  }, [mentorSection?.description, open]);

  const updateMut = useMutation({
    mutationFn: (mentorId: string | null) => updateCourseMentor(course.id, mentorId),
    onSuccess: (mentor) => {
      toast.success(mentor ? t('courses.mentorUpdated') : t('courses.mentorRemoved'));
      queryClient.setQueryData(['course-mentor', course.id], mentor);
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
      queryClient.invalidateQueries({ queryKey: ['course-mentor-history', course.id] });
      setHistoryPage(1);
      if (mentor) onClose();
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, t('courses.mentorUpdateFailed'))),
  });

  const updateSectionMut = useMutation({
    mutationFn: () => updateCourseMentorSection(course.id, { description: description.trim() || null }),
    onSuccess: (section) => {
      queryClient.setQueryData(['course-mentor-section', course.id], section);
      toast.success(t('courses.mentorSectionSaved'));
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, t('courses.mentorSectionSaveFailed'))),
  });

  const uploadLogoMut = useMutation({
    mutationFn: (args: { mode: 'light' | 'dark'; file: File }) => uploadCourseMentorSectionLogo(course.id, args.mode, args.file),
    onSuccess: (section) => {
      queryClient.setQueryData(['course-mentor-section', course.id], section);
      toast.success(t('courses.logoUploaded'));
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, t('courses.logoUploadFailed'))),
  });

  const deleteLogoMut = useMutation({
    mutationFn: (mode: 'light' | 'dark') => deleteCourseMentorSectionLogo(course.id, mode),
    onSuccess: (section) => {
      queryClient.setQueryData(['course-mentor-section', course.id], section);
      toast.success(t('courses.logoDeleted'));
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, t('courses.logoDeleteFailed'))),
  });

  const rows = candidates?.mentors ?? [];
  const totalPages = candidates?.total_pages ?? 1;
  const total = candidates?.total ?? 0;

  const avatarUrl = (mentor: CourseMentor | null | undefined) => storageUrl(mentor?.avatar || '') || null;
  const mentorName = (mentor: CourseMentor | null | undefined) => mentor?.full_name || mentor?.username || mentor?.email || t('courses.noMentor');
  const mentorRoleLabel = (mentor: CourseMentor | null | undefined) => {
    const apiLabel = mentor?.role_label?.trim();
    if (apiLabel) return apiLabel;
    return getRoleLabel(mentor?.role, roleLabels, mentor?.role || '');
  };
  const validLogoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
  const logoUrl = (path: string | null | undefined) => storageUrl(path || '') || '';
  const historyItems = historyQuery.data?.items ?? [];
  const historyTotal = historyQuery.data?.total ?? 0;
  const historyTotalPages = historyQuery.data?.total_pages ?? 1;
  const loadingFirstHistoryPage = historyQuery.isLoading && historyItems.length === 0;
  const historyContentKey = historySearchTooShort
    ? 'search-too-short'
    : historyDateRangeInvalid
      ? 'date-range-invalid'
      : loadingFirstHistoryPage
        ? `loading-${historyPage}-${historyPageSize}`
        : historyItems.length === 0
          ? `empty-${historyPage}-${historyPageSize}-${historySearchParam || ''}-${historyDateFrom}-${historyDateTo}`
          : `rows-${historyPage}-${historyPageSize}-${historySearchParam || ''}-${historyDateFrom}-${historyDateTo}`;
  const openHistory = () => {
    resetHistoryPaging();
    setHistoryOpen(true);
  };

  const handleLogoFile = (mode: 'light' | 'dark', file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('courses.logoTooLarge'));
      return;
    }
    if (!validLogoTypes.includes(file.type)) {
      toast.error(t('courses.logoTypeUnsupported'));
      return;
    }
    uploadLogoMut.mutate({ mode, file });
  };
  const logoSlots = [
    { mode: 'light' as const, label: t('courses.lightLogo'), hint: t('courses.lightLogoHint'), icon: Sun, path: mentorSection?.logo_light, inputRef: lightLogoInputRef },
    { mode: 'dark' as const, label: t('courses.darkLogo'), hint: t('courses.darkLogoHint'), icon: Moon, path: mentorSection?.logo_dark, inputRef: darkLogoInputRef },
  ];

  return (
    <>
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl md:max-w-3xl">
        <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <DialogHeader className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 pr-8 text-lg leading-6 sm:text-xl">
                <UserRound className="h-5 w-5 text-cyan-600" />
                {t('courses.selectMentorTitle')}
              </DialogTitle>
              <p className="text-xs text-muted-foreground font-mono break-all">{course.id}</p>
            </DialogHeader>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={openHistory}
                  aria-label={t('courses.viewMentorHistory')}
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('courses.mentorHistory')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
          <div className="app-liquid-card rounded-lg border border-border bg-background p-3 sm:rounded-xl sm:p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('courses.currentMentor')}</div>
            {loadingCurrent ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-52" />
                </div>
              </div>
            ) : currentMentor ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {avatarUrl(currentMentor) ? (
                    <img src={avatarUrl(currentMentor)!} alt={mentorName(currentMentor)} className="h-11 w-11 rounded-full object-cover ring-2 ring-cyan-500/20" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-50 text-cyan-700 ring-2 ring-cyan-500/20 dark:bg-cyan-950/30 dark:text-cyan-300">
                      <UserRound className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold">{mentorName(currentMentor)}</div>
                      {mentorRoleLabel(currentMentor) && (
                        <Badge variant="outline" className="h-5 max-w-full px-2 text-[11px] font-medium text-cyan-700 dark:text-cyan-300">
                          <span className="truncate">{mentorRoleLabel(currentMentor)}</span>
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{currentMentor.email}</span>
                      {currentMentor.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{currentMentor.phone}</span>}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={updateMut.isPending}
                  onClick={() => updateMut.mutate(null)}
                  className="w-full shrink-0 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30 sm:w-auto"
                >
                  {updateMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                  {t('courses.removeMentor')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-5 w-5" />
                </div>
                {t('courses.noMentorDescription')}
              </div>
            )}
          </div>

          <div className="app-liquid-card rounded-lg border border-border bg-background p-3 sm:rounded-xl sm:p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('courses.mentorSectionTitle')}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t('courses.mentorSectionDescription')}</p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={loadingMentorSection || updateSectionMut.isPending}
                onClick={() => updateSectionMut.mutate()}
                className="h-8 w-full text-xs sm:w-auto"
              >
                {updateSectionMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {t('courses.saveDescription')}
              </Button>
            </div>

            {loadingMentorSection ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-lg" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-32 rounded-lg" />
                  <Skeleton className="h-32 rounded-lg" />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={2000}
                    placeholder={t('courses.mentorDescriptionPlaceholder')}
                    className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring sm:min-h-24"
                  />
                  <div className="mt-1 text-right text-[11px] text-muted-foreground">{description.length}/2000</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {logoSlots.map((slot) => {
                    const Icon = slot.icon;
                    const url = logoUrl(slot.path);
                    const uploading = uploadLogoMut.isPending && uploadLogoMut.variables?.mode === slot.mode;
                    const deleting = deleteLogoMut.isPending && deleteLogoMut.variables === slot.mode;
                    const previewClass = slot.mode === 'dark'
                      ? 'border-slate-800 bg-slate-950 text-slate-300'
                      : 'border-slate-200 bg-white text-slate-500';
                    const previewLabelClass = slot.mode === 'dark'
                      ? 'bg-white/10 text-slate-200'
                      : 'bg-slate-100 text-slate-600';
                    return (
                      <div key={slot.mode} className="app-liquid-card rounded-lg border border-border bg-muted/20 p-3">
                        <input
                          ref={slot.inputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                          className="hidden"
                          onChange={(event) => {
                            handleLogoFile(slot.mode, event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold">{slot.label}</div>
                              <div className="text-[11px] text-muted-foreground">{slot.hint}</div>
                            </div>
                          </div>
                        </div>

                        <div className={`relative mb-3 flex h-20 items-center justify-center rounded-lg border border-dashed px-3 ${previewClass}`}>
                          {url ? (
                            <img src={url} alt={slot.label} className="max-h-12 max-w-full object-contain" />
                          ) : (
                            <div className="text-center text-xs text-current">{t('courses.noLogo')}</div>
                          )}
                          <span className={`absolute bottom-1.5 right-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${previewLabelClass}`}>
                            {slot.mode === 'dark' ? t('courses.darkBackground') : t('courses.lightBackground')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 flex-1 text-xs"
                            disabled={uploading || deleteLogoMut.isPending}
                            onClick={() => slot.inputRef.current?.click()}
                          >
                            {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
                            {url ? t('courses.changeLogo') : t('courses.upload')}
                          </Button>
                          {url && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                              disabled={deleting || uploadLogoMut.isPending}
                              onClick={() => deleteLogoMut.mutate(slot.mode)}
                            >
                              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('courses.searchMentors')}
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-border sm:max-h-80">
              {loadingCandidates ? (
                <div className="space-y-0 divide-y divide-border">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
                  <UserRound className="mb-2 h-8 w-8 opacity-30" />
                  {t('courses.noMatchingMentors')}
                </div>
              ) : (
                <div className={isFetching ? 'divide-y divide-border opacity-60' : 'divide-y divide-border'}>
                  {rows.map((mentor) => {
                    const active = currentMentor?.id === mentor.id;
                    return (
                      <button
                        key={mentor.id}
                        type="button"
                        disabled={active || updateMut.isPending}
                        onClick={() => updateMut.mutate(mentor.id)}
                        className="flex w-full flex-col gap-2 p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent sm:flex-row sm:items-center sm:gap-3"
                      >
                        <div className="flex w-full min-w-0 items-center gap-3 sm:flex-1">
                          {avatarUrl(mentor) ? (
                            <img src={avatarUrl(mentor)!} alt={mentorName(mentor)} className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <UserRound className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold">{mentorName(mentor)}</div>
                              {mentorRoleLabel(mentor) && (
                                <Badge variant="outline" className="h-5 max-w-full px-2 text-[11px] font-medium text-cyan-700 dark:text-cyan-300">
                                  <span className="truncate">{mentorRoleLabel(mentor)}</span>
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex min-w-0 items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{mentor.email}</span></span>
                              {mentor.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{mentor.phone}</span>}
                            </div>
                          </div>
                        </div>
                        {active ? (
                          <span className="ml-[52px] inline-flex w-fit items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300 sm:ml-0 sm:shrink-0">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {t('courses.selected')}
                          </span>
                        ) : (
                          <span className="ml-[52px] w-fit rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground sm:ml-0 sm:shrink-0">
                            {t('courses.select')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{total > 0 ? t('courses.matchingMentors', { count: total }) : t('courses.noAvailableMentors')}</span>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {t('courses.previous')}
                </Button>
                <span className="min-w-16 text-center">{t('courses.pageOf', { page, totalPages })}</span>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  {t('courses.next')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="m-0 shrink-0 rounded-none border-t border-border bg-muted/20 px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{t('courses.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="shrink-0 border-b border-border bg-muted/20 px-4 py-4 sm:px-6"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-cyan-600" />
              {t('courses.mentorChangeHistory')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-mono break-all">{course.id}</p>
          </DialogHeader>
        </motion.div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.03, ease: 'easeOut' }}
            className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]"
          >
            <label className="min-w-0 space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{t('courses.searchUsers')}</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={historySearch}
                  onChange={(event) => {
                    setHistorySearch(event.target.value);
                    resetHistoryPaging();
                  }}
                  placeholder={t('courses.historySearchPlaceholder')}
                  className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </label>
            <label className="min-w-0 space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{t('courses.fromDate')}</span>
              <input
                type="date"
                value={historyDateFrom}
                max={historyDateTo || undefined}
                onChange={(event) => {
                  setHistoryDateFrom(event.target.value);
                  resetHistoryPaging();
                }}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="min-w-0 space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{t('courses.toDate')}</span>
              <input
                type="date"
                value={historyDateTo}
                min={historyDateFrom || undefined}
                onChange={(event) => {
                  setHistoryDateTo(event.target.value);
                  resetHistoryPaging();
                }}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </motion.div>

          <AnimatePresence mode="wait" initial={false}>
            {historySearchTooShort || historyDateRangeInvalid ? (
              <motion.div
                key={historyContentKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex flex-col items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground"
              >
                <AlertCircle className="mb-2 h-8 w-8 opacity-40" />
                {historySearchTooShort ? t('courses.historySearchTooShort') : t('courses.invalidDateRange')}
              </motion.div>
            ) : loadingFirstHistoryPage ? (
              <motion.div
                key={historyContentKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="space-y-3"
              >
                {Array.from({ length: Math.min(historyPageSize, 5) }).map((_, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: idx * 0.035, ease: 'easeOut' }}
                    className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_160px]"
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-4 w-28" />
                  </motion.div>
                ))}
              </motion.div>
            ) : historyItems.length === 0 ? (
              <motion.div
                key={historyContentKey}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex flex-col items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground"
              >
                <History className="mb-2 h-8 w-8 opacity-30" />
                {historyHasActiveFilters ? t('courses.noMatchingHistory') : t('courses.noMentorHistory')}
              </motion.div>
            ) : (
              <motion.div
                key={historyContentKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="overflow-hidden rounded-xl border border-border"
              >
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_160px] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
                  <div>{t('courses.operator')}</div>
                  <div>{t('courses.changeDetails')}</div>
                  <div>{t('courses.time')}</div>
                </div>
                <div className="divide-y divide-border">
                  {historyItems.map((item, index) => {
                    const isAssign = item.action === 'assign';
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.14), ease: 'easeOut' }}
                        className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_160px] sm:gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:hidden">{t('courses.operator')}</div>
                          <div className="truncate font-medium text-foreground">{item.assigned_by_name}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:hidden">{t('courses.changeDetails')}</div>
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge
                              variant={isAssign ? 'secondary' : 'destructive'}
                              size="sm"
                              className={isAssign ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : undefined}
                            >
                              {isAssign ? t('courses.assigned') : t('courses.removed')}
                            </Badge>
                            <div className={isAssign ? 'truncate font-medium text-foreground' : 'truncate font-medium text-red-600 dark:text-red-400'}>
                              {isAssign ? item.assigned_to_name || t('courses.unknown') : t('courses.noMentorAssigned')}
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:hidden">{t('courses.time')}</div>
                          <div className="whitespace-nowrap text-muted-foreground">{formatCourseUpdatedAt(item.assigned_at)}</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!historySearchTooShort && !historyDateRangeInvalid && historyTotal > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="shrink-0 border-t border-border"
          >
            <Pagination
              page={historyQuery.data?.page ?? historyPage}
              limit={historyPageSize}
              total={historyTotal}
              totalPages={historyTotalPages}
              limitOptions={[5, 10, 15, 20]}
              label={t('courses.history')}
              onPageChange={setHistoryPage}
              onLimitChange={setHistoryPageSize}
            />
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.04 }}
        >
          <DialogFooter className="m-0 shrink-0 rounded-none border-t border-border bg-muted/20 px-4 py-3 sm:px-6">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setHistoryOpen(false)}>{t('courses.close')}</Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function CourseModalConfigDialog({ courseId, open, onClose }: { courseId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<CourseModalConfig>>({
    welcome_enabled: true,
    welcome_title: '',
    welcome_description: '',
    confirm_enabled: true,
    confirm_title: '',
    confirm_description: '',
    confirm_checkbox_text: '',
    completion_enabled: true,
    completion_title: '',
    completion_description: '',
    completion_social_type: '',
    completion_social_link: '',
  });

  const isValidUrl = (str: string) => {
    if (!str) return true;
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['course-modal-config', courseId],
    queryFn: () => getCourseModalConfig(courseId),
    enabled: open && !!courseId,
  });

  useEffect(() => {
    if (data) {
      setForm({
        welcome_enabled: data.welcome_enabled,
        welcome_title: data.welcome_title,
        welcome_description: data.welcome_description,
        confirm_enabled: data.confirm_enabled,
        confirm_title: data.confirm_title,
        confirm_description: data.confirm_description,
        confirm_checkbox_text: data.confirm_checkbox_text,
        completion_enabled: data.completion_enabled,
        completion_title: data.completion_title,
        completion_description: data.completion_description,
        completion_social_type: data.completion_social_type || '',
        completion_social_link: data.completion_social_link || '',
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => updateCourseModalConfig(courseId, form),
    onSuccess: () => {
      toast.success(t('courses.modalConfigSaved'));
      queryClient.invalidateQueries({ queryKey: ['course-modal-config', courseId] });
      onClose();
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, t('courses.saveFailed'))),
  });

  const updateField = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{t('courses.modalConfigTitle')}</DialogTitle>
          <p className="text-xs text-muted-foreground font-mono break-all">{courseId}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* ── Welcome Modal ── */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t('courses.welcomeModal')}</Label>
                <Switch
                  checked={form.welcome_enabled}
                  onCheckedChange={(v) => updateField('welcome_enabled', v)}
                />
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('courses.fieldTitle')} {form.welcome_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder={t('courses.welcomeTitlePlaceholder')} value={form.welcome_title || ''} onChange={e => updateField('welcome_title', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('courses.fieldDescription')} {form.welcome_enabled && <span className="text-red-500">*</span>}</label>
                  <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder={t('courses.welcomeDescriptionPlaceholder')} value={form.welcome_description || ''} onChange={e => updateField('welcome_description', e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Confirm Modal ── */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t('courses.confirmModal')}</Label>
                <Switch
                  checked={form.confirm_enabled}
                  onCheckedChange={(v) => updateField('confirm_enabled', v)}
                />
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('courses.fieldTitle')} {form.confirm_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder={t('courses.confirmTitlePlaceholder')} value={form.confirm_title || ''} onChange={e => updateField('confirm_title', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('courses.fieldDescription')} {form.confirm_enabled && <span className="text-red-500">*</span>}</label>
                  <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder={t('courses.confirmDescriptionPlaceholder')} value={form.confirm_description || ''} onChange={e => updateField('confirm_description', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('courses.checkboxText')} {form.confirm_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder={t('courses.confirmCheckboxPlaceholder')} value={form.confirm_checkbox_text || ''} onChange={e => updateField('confirm_checkbox_text', e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Completion Modal ── */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t('courses.completionModal')}</Label>
                <Switch
                  checked={form.completion_enabled}
                  onCheckedChange={(v) => updateField('completion_enabled', v)}
                />
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('courses.fieldTitle')} {form.completion_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder={t('courses.completionTitlePlaceholder')} value={form.completion_title || ''} onChange={e => updateField('completion_title', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('courses.fieldDescription')} {form.completion_enabled && <span className="text-red-500">*</span>}</label>
                  <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder={t('courses.completionDescriptionPlaceholder')} value={form.completion_description || ''} onChange={e => updateField('completion_description', e.target.value)} />
                </div>
                {form.completion_enabled && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border mt-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t('courses.socialType')}</label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const st = form.completion_social_type;
                                if (st === 'zaloOA') return <img src={ZaloIcon} alt="Zalo" className="w-5 h-5 object-contain" />;
                                if (st === 'facebook') return <img src={FacebookIcon} alt="Facebook" className="w-5 h-5 object-contain" />;
                                if (st === 'website') return <Globe className="w-5 h-5 text-slate-500" />;
                                if (st === 'instagram') return <img src={InstagramIcon} alt="Instagram" className="w-5 h-5 object-contain" />;
                                return <Ban className="w-5 h-5 text-muted-foreground/50" />;
                              })()}
                              <span>
                                {form.completion_social_type === 'zaloOA' ? 'Zalo OA' :
                                  form.completion_social_type === 'facebook' ? 'Facebook' :
                                    form.completion_social_type === 'website' ? 'Website' :
                                      form.completion_social_type === 'instagram' ? 'Instagram' : t('courses.notUsed')}
                              </span>
                            </div>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px] rounded-lg">
                          {[
                            { value: '', label: t('courses.notUsed'), icon: <Ban className="w-5 h-5 text-muted-foreground/50" /> },
                            { value: 'zaloOA', label: 'Zalo OA', icon: <img src={ZaloIcon} alt="Zalo" className="w-5 h-5 object-contain" /> },
                            { value: 'facebook', label: 'Facebook', icon: <img src={FacebookIcon} alt="Facebook" className="w-5 h-5 object-contain" /> },
                            { value: 'website', label: 'Website', icon: <Globe className="w-5 h-5 text-slate-500" /> },
                            { value: 'instagram', label: 'Instagram', icon: <img src={InstagramIcon} alt="Instagram" className="w-5 h-5 object-contain" /> },
                          ].map((type) => (
                            <DropdownMenuItem
                              key={type.value}
                              onClick={() => {
                                updateField('completion_social_type', type.value);
                                if (!type.value) {
                                  updateField('completion_social_link', '');
                                }
                              }}
                              className={`cursor-pointer text-[13px] mx-1 rounded-md mb-0.5 justify-between transition-colors ${form.completion_social_type === type.value ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}
                            >
                              <div className="flex items-center gap-2">
                                {type.icon}
                                {type.label}
                              </div>
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${form.completion_social_type === type.value ? 'bg-foreground' : 'bg-transparent'}`} />
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t('courses.url')}</label>
                      <input
                        className={`flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm ${!isValidUrl(form.completion_social_link || '') ? 'border-red-500 focus-visible:ring-red-500/30 text-red-600' : 'border-input'}`}
                        placeholder="https://..."
                        value={form.completion_social_link || ''}
                        onChange={e => updateField('completion_social_link', e.target.value)}
                        disabled={!form.completion_social_type}
                      />
                      {!isValidUrl(form.completion_social_link || '') && <p className="text-[10px] text-red-500 mt-1">{t('courses.invalidUrl')}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={
              saveMut.isPending ||
              (form.welcome_enabled && (!form.welcome_title?.trim() || !form.welcome_description?.trim())) ||
              (form.confirm_enabled && (!form.confirm_title?.trim() || !form.confirm_description?.trim() || !form.confirm_checkbox_text?.trim())) ||
              (form.completion_enabled && (!form.completion_title?.trim() || !form.completion_description?.trim())) ||
              (form.completion_enabled && !!form.completion_social_type && !form.completion_social_link?.trim()) ||
              (form.completion_enabled && !isValidUrl(form.completion_social_link || ''))
            }
          >
            {saveMut.isPending ? t('courses.saving') : t('courses.saveConfiguration')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Send Notification Dialog ──

function formatNotificationDate(value: string | null | undefined): string {
  if (!value) return i18n.t('courses.noTime');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return i18n.t('courses.noTime');
  return formatLocaleDate(date, (i18n.language === 'en' ? 'en' : 'vi') as AppLocale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function emailStatusLabel(status: string | null | undefined): string {
  if (status === 'done') return i18n.t('courses.emailDone');
  if (status === 'running') return i18n.t('courses.emailRunning');
  if (status === 'pending') return i18n.t('courses.emailPending');
  if (status === 'failed') return i18n.t('courses.emailFailed');
  return i18n.t('courses.emailNotSent');
}

function SendNotificationDialog({ courseId, isPublic, open, onClose }: { courseId: string; isPublic: boolean; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const labels = getGroupLabelSet(groupLabels);
  const teamLabelLower = lowerGroupLabel(labels.team);
  const historyLimit = 5;
  const [activeTab, setActiveTab] = useState('compose');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<CourseNotificationHistoryItem | null>(null);

  const smtpQuery = useQuery({
    queryKey: ['course-notification-smtp-status', activeTenantId],
    queryFn: () => getCourseNotificationSmtpStatus(),
    enabled: open,
    staleTime: 30_000,
  });
  const smtpStatus = smtpQuery.data;
  const emailAutomationReady = Boolean(smtpStatus?.can_send_email);
  const emailBadgeText = emailAutomationReady ? t('courses.emailAutomationEnabled') : t('courses.systemNotificationOnly');
  const emailDescription = emailAutomationReady
    ? t('courses.emailAutomationDescription')
    : t('courses.noEmailDescription');
  const emailTooltip = smtpQuery.isError
    ? t('courses.emailStatusCheckFailed')
    : t('courses.emailNotConfigured');

  const historyQuery = useQuery({
    queryKey: ['course-notification-history', activeTenantId, courseId, historyPage, historyLimit],
    queryFn: () => getCourseNotificationHistory(courseId, { page: historyPage, page_size: historyLimit }),
    enabled: open && activeTab === 'history',
  });
  const historyItems = historyQuery.data?.data ?? [];
  const historyTotal = historyQuery.data?.total ?? 0;
  const totalPages = historyQuery.data?.totalPages ?? 1;

  useEffect(() => {
    if (!open) return;
    setHistoryPage(1);
    setSelectedHistoryItem(null);
  }, [open, courseId]);

  useEffect(() => {
    if (activeTab !== 'history') setSelectedHistoryItem(null);
  }, [activeTab]);

  const closeDialog = () => {
    setTitle('');
    setMessage('');
    setActiveTab('compose');
    setHistoryPage(1);
    setSelectedHistoryItem(null);
    onClose();
  };

  const sendMut = useMutation({
    mutationFn: () => sendCourseNotification(courseId, {
      title: title.trim(),
      message: message.trim(),
    }),
    onSuccess: (data) => {
      const emailText = data.email_requested
        ? (data.email_job_queued ? ` ${t('courses.emailsSending', { count: data.recipients })}` : ` ${t('courses.noEmailsNeeded')}`)
        : '';
      toast.success(`${t('courses.notificationSent', { count: data.recipients })}${emailText}`);
      setTitle('');
      setMessage('');
      setActiveTab('history');
      setHistoryPage(1);
      setSelectedHistoryItem(null);
      queryClient.invalidateQueries({ queryKey: ['course-notification-history', activeTenantId, courseId] });
    },
    onError: (err: unknown) => toast.error(getLocalizedApiError(err, t('courses.notificationSendFailed'))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-3 text-xl">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 ring-1 ring-amber-500/20">
                <Bell className="h-5 w-5" />
              </span>
              <span>{t('courses.sendNotificationTitle')}</span>
            </DialogTitle>
            <p className="font-mono text-xs text-muted-foreground break-all">{courseId}</p>
          </DialogHeader>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-[520px] flex-col">
          <div className="px-5 pt-4 sm:px-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="compose" className="gap-2">
                <Send className="h-4 w-4" />
                {t('courses.sendNotification')}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                {t('courses.historyTab')}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden px-5 pb-4 sm:px-6">
            <AnimatePresence mode="wait">
              {activeTab === 'compose' ? (
                <TabsContent value="compose" forceMount asChild>
                  <motion.div
                    key="compose"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="mt-5 space-y-4"
                  >
                    <div className="grid gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold">{t('courses.notificationTitle')} <span className="text-red-500">*</span></label>
                        <input
                          className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
                          placeholder={t('courses.notificationTitlePlaceholder')}
                          value={title}
                          maxLength={180}
                          onChange={e => setTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold">{t('courses.notificationContent')} <span className="text-red-500">*</span></label>
                        <textarea
                          className="flex min-h-[132px] w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm leading-6 outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
                          placeholder={t('courses.notificationContentPlaceholder')}
                          value={message}
                          maxLength={4000}
                          onChange={e => setMessage(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="app-liquid-card rounded-2xl border border-border/80 bg-muted/20 p-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${emailAutomationReady ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`}>
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {smtpQuery.isLoading ? (
                              <Skeleton className="h-6 w-44 rounded-full" />
                            ) : (
                              <Badge
                                variant="secondary"
                                className={`rounded-full px-3 py-1 text-[11px] font-bold ${emailAutomationReady ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300'}`}
                              >
                                {emailBadgeText}
                              </Badge>
                            )}
                            {!emailAutomationReady && !smtpQuery.isLoading && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-600 transition hover:bg-red-500/15 dark:text-red-300"
                                    aria-label={t('courses.emailAutomationWhy')}
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[280px] border-red-500/20 bg-red-600 text-white">
                                  {emailTooltip}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          {smtpQuery.isLoading ? (
                            <Skeleton className="h-4 w-full max-w-[420px]" />
                          ) : (
                            <p className="text-xs leading-5 text-muted-foreground">
                              {emailDescription}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-sm leading-6 text-amber-900 dark:text-amber-200">
                      <div className="flex gap-3">
                        <Users className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                          {isPublic
                            ? t('courses.publicRecipientsDescription')
                            : t('courses.assignedRecipientsDescription', { group: teamLabelLower })}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </TabsContent>
              ) : (
                <TabsContent value="history" forceMount asChild>
                  <motion.div
                    key="history"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="mt-5 flex h-[410px] flex-col"
                  >
                    {selectedHistoryItem ? (
                      <motion.div
                        key={selectedHistoryItem.id}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="flex min-h-0 flex-1 flex-col"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-2"
                            onClick={() => setSelectedHistoryItem(null)}
                          >
                            <ArrowLeft className="h-4 w-4" />
                            {t('courses.back')}
                          </Button>
                          <Badge variant="secondary" className="rounded-full">
                            {formatNotificationDate(selectedHistoryItem.created_at)}
                          </Badge>
                        </div>
                        <div className="app-liquid-card min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('courses.notificationDetails')}</p>
                              <h3 className="mt-2 text-xl font-bold leading-7 text-foreground">{selectedHistoryItem.title}</h3>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Badge variant="secondary" className="gap-1.5 rounded-full">
                                <Users className="h-3.5 w-3.5" />
                                {t('courses.recipientCount', { count: selectedHistoryItem.recipient_count })}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`gap-1.5 rounded-full ${selectedHistoryItem.metadata?.send_email === true || selectedHistoryItem.email_status ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}
                              >
                                <Mail className="h-3.5 w-3.5" />
                                {emailStatusLabel(selectedHistoryItem.email_status)}
                              </Badge>
                            </div>
                          </div>

                          <div className="app-liquid-card mt-5 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm sm:grid-cols-2">
                            <div>
                              <p className="text-xs text-muted-foreground">{t('courses.sender')}</p>
                              <p className="mt-1 font-semibold text-foreground">{selectedHistoryItem.sent_by_display_name || t('courses.unknown')}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t('courses.sentAt')}</p>
                              <p className="mt-1 font-semibold text-foreground">{formatNotificationDate(selectedHistoryItem.created_at)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t('courses.emailStatus')}</p>
                              <p className="mt-1 font-semibold text-foreground">{emailStatusLabel(selectedHistoryItem.email_status)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t('courses.trackedEmails')}</p>
                              <p className="mt-1 font-semibold text-foreground">{selectedHistoryItem.email_queued_count || 0}</p>
                            </div>
                          </div>

                          <div className="mt-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('courses.content')}</p>
                            <div className="app-liquid-card mt-2 whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm leading-6 text-foreground">
                              {selectedHistoryItem.message || t('courses.noContent')}
                            </div>
                          </div>

                          {selectedHistoryItem.email_last_error && (
                            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.07] p-4 text-sm leading-6 text-red-700 dark:text-red-300">
                              <div className="flex gap-2">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{selectedHistoryItem.email_last_error}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ) : historyQuery.isLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <div key={index} className="rounded-2xl border border-border p-4">
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="mt-3 h-4 w-full" />
                            <Skeleton className="mt-2 h-4 w-1/2" />
                          </div>
                        ))}
                      </div>
                    ) : historyItems.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-center">
                        <Bell className="h-10 w-10 text-muted-foreground/40" />
                        <p className="mt-3 text-sm font-semibold">{t('courses.noNotifications')}</p>
                        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                          {t('courses.noNotificationsDescription')}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                          {historyItems.map((item) => {
                            const emailEnabled = item.metadata?.send_email === true || Boolean(item.email_status);
                            return (
                              <motion.button
                                type="button"
                                key={item.id}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={() => setSelectedHistoryItem(item)}
                                className="app-liquid-card w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{item.title}</p>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.message || t('courses.noContent')}</p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap gap-2">
                                    <Badge variant="secondary" className="gap-1.5 rounded-full">
                                      <Users className="h-3.5 w-3.5" />
                                      {t('courses.recipientCount', { count: item.recipient_count })}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className={`gap-1.5 rounded-full ${emailEnabled ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}
                                    >
                                      <Mail className="h-3.5 w-3.5" />
                                      {emailStatusLabel(item.email_status)}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    {formatNotificationDate(item.created_at)}
                                  </span>
                                  {item.sent_by_display_name && <span>{t('courses.sender')}: {item.sent_by_display_name}</span>}
                                  {item.email_queued_count > 0 && <span>{t('courses.emailsTracked', { count: item.email_queued_count })}</span>}
                                  {item.email_last_error && (
                                    <span className="inline-flex items-center gap-1.5 text-red-600">
                                      <AlertCircle className="h-3.5 w-3.5" />
                                      {item.email_last_error}
                                    </span>
                                  )}
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                        <div className="-mx-5 mt-4 overflow-hidden border-t border-border sm:-mx-6">
                          <Pagination
                            page={historyPage}
                            limit={historyLimit}
                            total={historyTotal}
                            totalPages={totalPages}
                            limitOptions={[5]}
                            label={t('courses.notifications')}
                            onPageChange={(nextPage) => {
                              setSelectedHistoryItem(null);
                              setHistoryPage(nextPage);
                            }}
                            onLimitChange={() => {
                              setSelectedHistoryItem(null);
                              setHistoryPage(1);
                            }}
                          />
                        </div>
                      </>
                    )}
                  </motion.div>
                </TabsContent>
              )}
            </AnimatePresence>
          </div>

          <DialogFooter className="m-0 border-t border-border bg-muted/20 px-5 py-4 sm:px-6">
            <Button variant="outline" onClick={closeDialog}>{t('courses.close')}</Button>
            {activeTab === 'compose' && (
              <Button
                onClick={() => sendMut.mutate()}
                disabled={sendMut.isPending || !title.trim() || !message.trim()}
                className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
              >
                {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendMut.isPending ? t('courses.sending') : t('courses.sendNotification')}
              </Button>
            )}
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
