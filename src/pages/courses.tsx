import { useState, useEffect, useRef } from 'react';
import { storageUrl } from '@/utils/storage-url';

import { useTenantStore } from '@/utils/tenant-store';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCourses, updateCourse, bulkCourseAction, deleteCourse, getCourseModalConfig, updateCourseModalConfig, sendCourseNotification, getCourseMentor, getCourseMentorCandidates, updateCourseMentor, getCourseMentorSection, updateCourseMentorSection, uploadCourseMentorSectionLogo, deleteCourseMentorSectionLogo, type CustomCourse, type CourseMentor, type CourseModalConfig } from '@/api/custom-courses';
import { createCourse, uploadCourseAsset, updateXBlock } from '@/api/custom-course-authoring';
import { useHeaderInfo } from '@/utils/header-store';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { confirmDialog } from '@/utils/confirm-store';
import {
  BookOpen, GraduationCap, Globe, Edit2, Plus, ImagePlus, Loader2, LayoutTemplate, ArrowRight, FolderOpen, Archive, ArchiveRestore, Settings2, Bell, Facebook, Instagram, MessageCircle, ChevronDown, Ban, Trash2, UserRound, Search, CheckCircle2, Mail, Phone, MoreHorizontal, Save, Sun, Moon, FileText, ClipboardList
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { CourseFilesModal } from '@/components/course-editor/CourseFilesModal';
import { Switch } from '@/components/ui/switch';
import FacebookIcon from '@/assets/SocialIcon/facebook.png';
import InstagramIcon from '@/assets/SocialIcon/instagram.png';
import ZaloIcon from '@/assets/SocialIcon/zalo.png';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function getCourseMentorDisplayName(course: CustomCourse): string {
  return course.mentor?.full_name || course.mentor?.username || course.mentor?.email || 'Chưa có mentor';
}

function formatCourseUpdatedAt(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CoursesPage() {
  useHeaderInfo('Khóa Học');

  const queryClient = useQueryClient();
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const currentUser = useAuthStore((s) => s.user);
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
      toast.success(`Đã tạo course: ${data.display_name}`);
      setShowCreate(false);
      setNewNumber(''); setNewName(''); setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
    },
    onError: (err: any) => {
      toast.error('Tạo thất bại: ' + (err?.response?.data?.error || err.message));
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
      if (!display_name) throw new Error("Không nhận được tên file từ server");

      // 2. Update Course image via custom courses API
      await updateCourse(courseId, { image_url: uploadResult?.url || '' });

      toast.success('Đã cập nhật ảnh đại diện khóa học!');
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
    } catch (err: any) {
      toast.error('Cập nhật ảnh thất bại: ' + (err?.response?.data?.error || err.message));
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
      toast.success('Đã cập nhật');
    },
    onError: () => toast.error('Cập nhật thất bại'),
  });

  // Bulk
  const bulkMut = useMutation({
    mutationFn: ({ action }: { action: 'staff_only' | 'public' }) =>
      bulkCourseAction(selected, action),
    onSuccess: (result, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
      setSelected([]);
      toast.success(`Đã chuyển ${result.updated} khóa học sang trạng thái ${action === 'public' ? 'hiển thị' : 'lưu trữ'}`);
    },
    onError: () => toast.error('Cập nhật hàng loạt thất bại'),
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
      toast.success('Đã xóa khóa học');
    },
    onError: (err: any, _courseId, context) => {
      context?.previousCourses.forEach(([queryKey, value]) => {
        queryClient.setQueryData(queryKey, value);
      });
      if (context?.previousSelected) setSelected(context.previousSelected);
      toast.error(err?.response?.data?.error || 'Xóa thất bại');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
    },
  });

  function handleDeleteCourse(course: CustomCourse) {
    confirmDialog({
      title: 'Xóa khóa học',
      description: `Bạn có chắc muốn xóa "${course.display_name}"? Sau khi xác nhận, khóa học sẽ không còn hiển thị trong danh sách.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
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
        title="Khóa học"
        description="Quản lý khóa học, nội dung và cấu hình cho học viên"
      />
      {/* Dialog tạo course */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Tạo Khóa Học Mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tên khóa học</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ví dụ: Văn hóa doanh nghiệp L&A" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Mô tả <span className="text-red-500">*</span></label>
              <textarea
                className="flex min-h-[96px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                maxLength={5000}
                placeholder="Nhập mô tả ngắn gọn về mục tiêu, nội dung hoặc đối tượng phù hợp của khóa học"
              />
              {!newDescription.trim() && (
                <p className="text-xs text-red-500">Bắt buộc nhập mô tả khóa học trước khi lưu.</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Tổ chức</label>
                <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newOrg} onChange={e => setNewOrg(e.target.value)} placeholder="LAndA2" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Mã khóa học</label>
                <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="000010" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Đợt (năm)</label>
                <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newRun} onChange={e => setNewRun(e.target.value)} placeholder="2026" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Mã khóa học sẽ là: <span className="font-mono font-semibold">course-v1:{newOrg}+{newNumber}+{newRun}</span></p>
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2 rounded-md">💡 Ngày bắt đầu được đặt là 01/01/2020 để khóa học tự động xuất bản và hiển thị cho học viên.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !canSubmitCreateCourse}>
              {createMut.isPending ? 'Đang tạo...' : 'Tạo khóa học'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Preview Card */}
      <Dialog open={!!previewCourse} onOpenChange={(o) => !o && setPreviewCourse(null)}>
        <DialogContent className="sm:max-w-[380px] p-5 border-border bg-background gap-0">
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[13px] font-medium leading-[18px]">
            💡 Phần này chỉ có chức năng xem trước giao diện tĩnh của card khóa học ở phía người học và không thể click tương tác
          </div>

          <div className="w-full rounded-[28px] border border-border bg-card p-2 pb-4 shadow-sm">
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
                  Bắt đầu học
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
        searchPlaceholder="Tìm khóa học..."
        filters={[
          {
            key: 'visibility',
            placeholder: 'Trạng thái',
            options: [
              { value: 'public', label: 'Đang hoạt động' },
              { value: 'staff_only', label: 'Đã lưu trữ' },
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
                  <Globe className="mr-1 h-3.5 w-3.5" /> Hiển thị ({selected.length})
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ action: 'staff_only' })} className="h-8 text-xs text-slate-600">
                  <Archive className="mr-1 h-3.5 w-3.5" /> Lưu trữ ({selected.length})
                </Button>
              </>
            )}
            {canAdd && <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Tạo khóa học
            </Button>}
          </div>
        }
      />

      <TooltipProvider delayDuration={300}>
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
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
                <p className="text-sm">Chưa có khóa học</p>
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
                        <Badge
                          variant="outline"
                          className={course.visible_to_staff_only
                            ? 'shrink-0 bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50'
                            : 'shrink-0 bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                          }
                        >
                          {course.visible_to_staff_only ? 'Đã lưu trữ' : 'Đang hoạt động'}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                          <div className="mb-0.5 text-muted-foreground">Tổ chức</div>
                          <div className="truncate font-mono font-medium">{course.org}</div>
                        </div>
                        <div>
                          <div className="mb-0.5 text-muted-foreground">Mentor</div>
                          <div className="flex min-w-0 items-center gap-1.5 font-medium">
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-cyan-600/70" />
                            <span className="truncate">{getCourseMentorDisplayName(course)}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="mb-0.5 text-muted-foreground">Cập nhật</div>
                          <div className="font-medium">{formatCourseUpdatedAt(course.updated_at)}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        {canEdit && (
                          <Button size="sm" asChild className="h-8 text-xs">
                            <Link to={`/courses/${course.id}/edit`}>
                              <Edit2 className="h-3.5 w-3.5" />
                              Chỉnh sửa
                            </Link>
                          </Button>
                        )}

                        <Button variant="outline" size="icon-sm"
                          onClick={() => setSelectedCourseFiles(course.id)}
                          className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/30"
                          title="Quản lý tệp tin"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon-sm" title="Thao tác khác">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => setPreviewCourse(course)} className="gap-2">
                              <LayoutTemplate className="h-4 w-4 text-sky-600" />
                              Xem thẻ preview
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setCourseInfoCourse(course)} className="gap-2">
                                <FileText className="h-4 w-4 text-emerald-600" />
                                Chỉnh thông tin
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem asChild className="gap-2">
                                <Link to={`/courses/${course.id}/assignments`}>
                                  <ClipboardList className="h-4 w-4 text-violet-600" />
                                  Bài tập
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => triggerUpload(course.id)} disabled={uploadingCourseId === course.id} className="gap-2">
                                {uploadingCourseId === course.id ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <ImagePlus className="h-4 w-4 text-indigo-600" />}
                                Đổi ảnh đại diện
                              </DropdownMenuItem>
                            )}
                            {canManageMentors && (
                              <DropdownMenuItem onClick={() => setMentorCourse(course)} className="gap-2">
                                <UserRound className="h-4 w-4 text-cyan-600" />
                                Chọn mentor
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => toggleVis.mutate({ id: course.id, visible: !course.visible_to_staff_only })} className="gap-2">
                                {course.visible_to_staff_only ? <ArchiveRestore className="h-4 w-4 text-amber-600" /> : <Archive className="h-4 w-4 text-slate-500" />}
                                {course.visible_to_staff_only ? 'Khôi phục hiển thị' : 'Lưu trữ khóa học'}
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setNotifyCourseId(course.id)} className="gap-2">
                                <Bell className="h-4 w-4 text-amber-600" />
                                Gửi thông báo
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setModalConfigCourseId(course.id)} className="gap-2">
                                <Settings2 className="h-4 w-4 text-violet-600" />
                                Cấu hình hộp thoại
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                onClick={() => handleDeleteCourse(course)}
                                disabled={deleteMut.isPending}
                                className="gap-2 text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                                Xóa vĩnh viễn
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
                  <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Khóa học</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">Tổ chức</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">Trạng thái</TableHead>

                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">Mentor</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider">Cập nhật</TableHead>
                  <TableHead className="text-center font-medium text-xs text-muted-foreground uppercase tracking-wider pr-5">Thao tác</TableHead>
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
                        <p className="text-sm">Chưa có khóa học</p>
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
                      <TableCell className="text-center">
                        <span className="text-xs font-mono font-medium bg-secondary px-2 py-0.5 rounded border border-border">{course.org}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={course.visible_to_staff_only
                            ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700/50'
                            : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                          }
                        >
                          {course.visible_to_staff_only ? 'Đã lưu trữ' : 'Đang hoạt động'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm">
                        <div className="mx-auto flex max-w-[180px] items-center justify-center gap-2">
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-cyan-600/70" />
                          <span className="truncate">{getCourseMentorDisplayName(course)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm whitespace-nowrap">{formatCourseUpdatedAt(course.updated_at)}</TableCell>
                      <TableCell className="pr-5 flex justify-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => setPreviewCourse(course)}
                              className="h-8 w-8 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/30"
                            >
                              <LayoutTemplate className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Xem thẻ xem trước</TooltipContent>
                        </Tooltip>

                        {canEdit && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => setCourseInfoCourse(course)}
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Chỉnh thông tin khóa học</TooltipContent>
                        </Tooltip>}

                        {canEdit && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => triggerUpload(course.id)}
                              disabled={uploadingCourseId === course.id}
                              className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                            >
                              {uploadingCourseId === course.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Đổi ảnh đại diện</TooltipContent>
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
                          <TooltipContent>Quản lý tệp tin</TooltipContent>
                        </Tooltip>

                        {canManageMentors && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => setMentorCourse(course)}
                              className="h-8 w-8 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950/30"
                            >
                              <UserRound className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{course.mentor?.full_name || course.mentor?.email || 'Chọn mentor'}</TooltipContent>
                        </Tooltip>}

                        {canEdit && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => toggleVis.mutate({ id: course.id, visible: !course.visible_to_staff_only })}
                              className={`h-8 w-8 ${course.visible_to_staff_only ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-950/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}
                            >
                              {course.visible_to_staff_only ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{course.visible_to_staff_only ? 'Khôi phục hiển thị' : 'Lưu trữ khóa học'}</TooltipContent>
                        </Tooltip>}

                        {canEdit && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => setNotifyCourseId(course.id)}
                              className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Gửi thông báo</TooltipContent>
                        </Tooltip>}

                        {canEdit && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => setModalConfigCourseId(course.id)}
                              className="h-8 w-8 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/30"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cấu hình hộp thoại</TooltipContent>
                        </Tooltip>}

                        {canEdit && <Tooltip>
                          <TooltipTrigger asChild>
                            <Link to={`/courses/${course.id}/assignments`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-fuchsia-600 hover:text-fuchsia-700 hover:bg-fuchsia-50 dark:text-fuchsia-400 dark:hover:bg-fuchsia-950/30">
                                <ClipboardList className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>Bài tập</TooltipContent>
                        </Tooltip>}

                        {canEdit && <Tooltip>
                          <TooltipTrigger asChild>
                            <Link to={`/courses/${course.id}/edit`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10">
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>Chỉnh sửa nội dung</TooltipContent>
                        </Tooltip>}

                        {canDelete && <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon"
                              onClick={() => handleDeleteCourse(course)}
                              disabled={deleteMut.isPending}
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Xóa vĩnh viễn</TooltipContent>
                        </Tooltip>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} limit={limit} total={total} totalPages={totalPages} onPageChange={setPage} onLimitChange={setLimit} label="khóa học" />
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
          open={!!notifyCourseId}
          onClose={() => setNotifyCourseId(null)}
        />
      )}
    </div>
  );
}

// ── Course Modal Config Dialog (tách ra làm component riêng bên dưới) ──

function CourseInfoDialog({ course, open, onClose }: { course: CustomCourse; open: boolean; onClose: () => void }) {
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
      toast.success('Đã cập nhật thông tin khóa học');
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
      onClose();
    },
    onError: (err: any) => {
      toast.error('Cập nhật thất bại: ' + (err?.response?.data?.error || err?.response?.data?.message || err.message));
    },
  });

  const canSave = Boolean(displayName.trim() && description.trim()) && !saveMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thông tin khóa học</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tên khóa học <span className="text-red-500">*</span></Label>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={500}
              placeholder="Nhập tên khóa học"
            />
            {!displayName.trim() && (
              <p className="text-xs text-red-500">Bắt buộc nhập tên khóa học.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Mô tả <span className="text-red-500">*</span></Label>
            <textarea
              className="flex min-h-[132px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              placeholder="Nhập mô tả khóa học"
            />
            <div className="flex items-center justify-between gap-3">
              {!description.trim() ? (
                <p className="text-xs text-red-500">Bắt buộc nhập mô tả khóa học trước khi lưu.</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-muted-foreground">{description.length}/5000</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>Hủy</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave}>
            {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Lưu thông tin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseMentorDialog({ course, open, onClose }: { course: CustomCourse; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [description, setDescription] = useState('');
  const debouncedSearch = useDebounce(search);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const lightLogoInputRef = useRef<HTMLInputElement>(null);
  const darkLogoInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!open) return;
    setDescription(mentorSection?.description ?? '');
  }, [mentorSection?.description, open]);

  const updateMut = useMutation({
    mutationFn: (mentorId: string | null) => updateCourseMentor(course.id, mentorId),
    onSuccess: (mentor) => {
      toast.success(mentor ? 'Đã cập nhật mentor' : 'Đã gỡ mentor');
      queryClient.setQueryData(['course-mentor', course.id], mentor);
      queryClient.invalidateQueries({ queryKey: ['landa-courses'] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Cập nhật mentor thất bại'),
  });

  const updateSectionMut = useMutation({
    mutationFn: () => updateCourseMentorSection(course.id, { description: description.trim() || null }),
    onSuccess: (section) => {
      queryClient.setQueryData(['course-mentor-section', course.id], section);
      toast.success('Đã lưu thông tin hiển thị');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Lưu thông tin thất bại'),
  });

  const uploadLogoMut = useMutation({
    mutationFn: (args: { mode: 'light' | 'dark'; file: File }) => uploadCourseMentorSectionLogo(course.id, args.mode, args.file),
    onSuccess: (section) => {
      queryClient.setQueryData(['course-mentor-section', course.id], section);
      toast.success('Đã upload logo');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Upload logo thất bại'),
  });

  const deleteLogoMut = useMutation({
    mutationFn: (mode: 'light' | 'dark') => deleteCourseMentorSectionLogo(course.id, mode),
    onSuccess: (section) => {
      queryClient.setQueryData(['course-mentor-section', course.id], section);
      toast.success('Đã xóa logo');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Xóa logo thất bại'),
  });

  const rows = candidates?.mentors ?? [];
  const totalPages = candidates?.total_pages ?? 1;
  const total = candidates?.total ?? 0;

  const avatarUrl = (mentor: CourseMentor | null | undefined) => storageUrl(mentor?.avatar || '') || null;
  const mentorName = (mentor: CourseMentor | null | undefined) => mentor?.full_name || mentor?.username || mentor?.email || 'Chưa có mentor';
  const validLogoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
  const logoUrl = (path: string | null | undefined) => storageUrl(path || '') || '';

  const handleLogoFile = (mode: 'light' | 'dark', file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File quá lớn. Tối đa 5MB');
      return;
    }
    if (!validLogoTypes.includes(file.type)) {
      toast.error('Định dạng không hỗ trợ. Chấp nhận JPEG, PNG, WEBP, SVG, GIF');
      return;
    }
    uploadLogoMut.mutate({ mode, file });
  };
  const logoSlots = [
    { mode: 'light' as const, label: 'Logo sáng', hint: 'Dùng cho giao diện light', icon: Sun, path: mentorSection?.logo_light, inputRef: lightLogoInputRef },
    { mode: 'dark' as const, label: 'Logo tối', hint: 'Dùng cho giao diện dark', icon: Moon, path: mentorSection?.logo_dark, inputRef: darkLogoInputRef },
  ];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl md:max-w-3xl">
        <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-4 sm:px-6 sm:py-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8 text-lg leading-6 sm:text-xl">
              <UserRound className="h-5 w-5 text-cyan-600" />
              Chọn mentor cho khóa học
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-mono break-all">{course.id}</p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
          <div className="rounded-lg border border-border bg-background p-3 sm:rounded-xl sm:p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mentor hiện tại</div>
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
                    <div className="truncate text-sm font-semibold">{mentorName(currentMentor)}</div>
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
                  Gỡ mentor
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-5 w-5" />
                </div>
                Course này chưa có mentor. Chọn một staff bên dưới để gán.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background p-3 sm:rounded-xl sm:p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thông tin hiển thị trên section Người Hướng Dẫn ở trang learner</div>
                <p className="mt-1 text-xs text-muted-foreground">Mô tả và logo light/dark cho section Người hướng dẫn của riêng course này.</p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={loadingMentorSection || updateSectionMut.isPending}
                onClick={() => updateSectionMut.mutate()}
                className="h-8 w-full text-xs sm:w-auto"
              >
                {updateSectionMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Lưu mô tả
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
                    placeholder="Nhập mô tả công ty hoặc thông tin mentor section..."
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
                      <div key={slot.mode} className="rounded-lg border border-border bg-muted/20 p-3">
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
                            <div className="text-center text-xs text-current">Chưa có logo</div>
                          )}
                          <span className={`absolute bottom-1.5 right-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${previewLabelClass}`}>
                            {slot.mode === 'dark' ? 'Nền tối' : 'Nền sáng'}
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
                            {url ? 'Đổi ảnh' : 'Upload'}
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
                placeholder="Tìm staff theo tên, email hoặc username..."
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
                  Không tìm thấy staff phù hợp.
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
                            <div className="truncate text-sm font-semibold">{mentorName(mentor)}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex min-w-0 items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{mentor.email}</span></span>
                              {mentor.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{mentor.phone}</span>}
                            </div>
                          </div>
                        </div>
                        {active ? (
                          <span className="ml-[52px] inline-flex w-fit items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300 sm:ml-0 sm:shrink-0">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Đang chọn
                          </span>
                        ) : (
                          <span className="ml-[52px] w-fit rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground sm:ml-0 sm:shrink-0">
                            Chọn
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{total > 0 ? `${total} staff phù hợp` : 'Không có staff'}</span>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Trước
                </Button>
                <span className="min-w-16 text-center">Trang {page}/{totalPages}</span>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Sau
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="m-0 shrink-0 rounded-none border-t border-border bg-muted/20 px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseModalConfigDialog({ courseId, open, onClose }: { courseId: string; open: boolean; onClose: () => void }) {
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
      toast.success('Đã lưu cấu hình modal');
      queryClient.invalidateQueries({ queryKey: ['course-modal-config', courseId] });
      onClose();
    },
    onError: () => toast.error('Lưu thất bại'),
  });

  const updateField = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Cấu hình hộp thoại — Khóa học</DialogTitle>
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
                <Label className="text-sm font-semibold">Hộp thoại chào mừng</Label>
                <Switch
                  checked={form.welcome_enabled}
                  onCheckedChange={(v) => updateField('welcome_enabled', v)}
                />
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tiêu đề {form.welcome_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder="Chào mừng bạn đến với khóa học!" value={form.welcome_title || ''} onChange={e => updateField('welcome_title', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mô tả {form.welcome_enabled && <span className="text-red-500">*</span>}</label>
                  <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Chúc bạn có một trải nghiệm học tập thật tốt..." value={form.welcome_description || ''} onChange={e => updateField('welcome_description', e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Confirm Modal ── */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Hộp thoại xác nhận (0% tiến độ)</Label>
                <Switch
                  checked={form.confirm_enabled}
                  onCheckedChange={(v) => updateField('confirm_enabled', v)}
                />
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tiêu đề {form.confirm_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder="Hoàn thành khóa học!" value={form.confirm_title || ''} onChange={e => updateField('confirm_title', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mô tả {form.confirm_enabled && <span className="text-red-500">*</span>}</label>
                  <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Cảm ơn bạn đã nỗ lực hoàn thành chương trình đào tạo..." value={form.confirm_description || ''} onChange={e => updateField('confirm_description', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Nội dung ô đánh dấu {form.confirm_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder="Tôi xác nhận đã hoàn thành khóa học..." value={form.confirm_checkbox_text || ''} onChange={e => updateField('confirm_checkbox_text', e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Completion Modal ── */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Hộp thoại hoàn thành (100% tiến độ)</Label>
                <Switch
                  checked={form.completion_enabled}
                  onCheckedChange={(v) => updateField('completion_enabled', v)}
                />
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tiêu đề {form.completion_enabled && <span className="text-red-500">*</span>}</label>
                  <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" placeholder="Chúc mừng!" value={form.completion_title || ''} onChange={e => updateField('completion_title', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mô tả {form.completion_enabled && <span className="text-red-500">*</span>}</label>
                  <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Trở thành đối tác chiến lược..." value={form.completion_description || ''} onChange={e => updateField('completion_description', e.target.value)} />
                </div>
                {form.completion_enabled && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border mt-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Loại mạng xã hội</label>
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
                                      form.completion_social_type === 'instagram' ? 'Instagram' : 'Không dùng'}
                              </span>
                            </div>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px] rounded-lg">
                          {[
                            { value: '', label: 'Không dùng', icon: <Ban className="w-5 h-5 text-muted-foreground/50" /> },
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
                      <label className="text-xs text-muted-foreground">Đường dẫn</label>
                      <input
                        className={`flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm ${!isValidUrl(form.completion_social_link || '') ? 'border-red-500 focus-visible:ring-red-500/30 text-red-600' : 'border-input'}`}
                        placeholder="https://..."
                        value={form.completion_social_link || ''}
                        onChange={e => updateField('completion_social_link', e.target.value)}
                        disabled={!form.completion_social_type}
                      />
                      {!isValidUrl(form.completion_social_link || '') && <p className="text-[10px] text-red-500 mt-1">Đường dẫn không hợp lệ</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
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
            {saveMut.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Send Notification Dialog ──

function SendNotificationDialog({ courseId, open, onClose }: { courseId: string; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const sendMut = useMutation({
    mutationFn: () => sendCourseNotification(courseId, { title, message }),
    onSuccess: (data) => {
      toast.success(`Đã gửi thông báo cho ${data.recipients} learner`);
      setTitle('');
      setMessage('');
      onClose();
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error;
      if (errMsg === 'No enrolled learners found') {
        toast.error('Không tìm thấy học viên nào! Có thể do khóa học chưa có ai đăng ký hoặc các group được gán khóa học đang trống.');
      } else {
        toast.error(errMsg || 'Gửi thông báo thất bại');
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            Gửi thông báo
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-mono break-all">{courseId}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tiêu đề <span className="text-red-500">*</span></label>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              placeholder="Tiêu đề thông báo..."
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Nội dung <span className="text-red-500">*</span></label>
            <textarea
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Nội dung thông báo..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 rounded-md">
            ⚠️ Thông báo sẽ gửi cho learner đã <strong>đăng ký</strong> khóa học + <strong>thuộc team</strong> được phân quyền xem khóa học này.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button
            onClick={() => sendMut.mutate()}
            disabled={sendMut.isPending || !title.trim() || !message.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {sendMut.isPending ? 'Đang gửi...' : 'Gửi thông báo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
