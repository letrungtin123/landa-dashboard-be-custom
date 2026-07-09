import { useState } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { UserPlus, BookPlus, Trash2, Users, BookOpen, Loader2, FolderOpen, FolderPlus, FolderKanban, Eye, FileText, FileImage, FileSpreadsheet, FileType, Film } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/utils/confirm-store';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getSubGroupDetail, removeMember, revokeCourse, revokeCategory, revokeCourseCategory,
  type SubGroupDetail,
} from '@/api/custom-groups';
import { getCourseCategoryCourses } from '@/api/custom-course-categories';
import { getDocuments } from '@/api/custom-library';
import { AddMembersModal } from './AddMembersModal';
import { AssignCoursesModal } from './AssignCoursesModal';
import { AssignCategoriesModal } from './AssignCategoriesModal';
import { AssignCourseCategoriesModal } from './AssignCourseCategoriesModal';


interface Props {
  sgId: string;
}

type Tab = 'members' | 'courses' | 'categories' | 'course_categories';

// Icon & color theo extension (reuse pattern từ documents-tab)
const EXT_ICONS: Record<string, React.ElementType> = {
  pdf: FileText, docx: FileText, doc: FileText,
  xlsx: FileSpreadsheet, xls: FileSpreadsheet,
  pptx: FileType, ppt: FileType,
  mp4: Film,
  jpg: FileImage, jpeg: FileImage, png: FileImage,
};

const EXT_COLORS: Record<string, string> = {
  pdf: 'text-red-500', docx: 'text-blue-500', doc: 'text-blue-500',
  xlsx: 'text-emerald-500', xls: 'text-emerald-500',
  pptx: 'text-orange-500', ppt: 'text-orange-500',
  mp4: 'text-purple-500',
  jpg: 'text-pink-500', jpeg: 'text-pink-500', png: 'text-pink-500',
};

const EXT_BG: Record<string, string> = {
  pdf: 'bg-red-500/10', docx: 'bg-blue-500/10', doc: 'bg-blue-500/10',
  xlsx: 'bg-emerald-500/10', xls: 'bg-emerald-500/10',
  pptx: 'bg-orange-500/10', ppt: 'bg-orange-500/10',
  mp4: 'bg-purple-500/10',
  jpg: 'bg-pink-500/10', jpeg: 'bg-pink-500/10', png: 'bg-pink-500/10',
};

// Tabs hiển thị trên UI (ẩn tab courses vì tạm không dùng phân course lẻ)
const VISIBLE_TABS: Tab[] = ['members', 'categories', 'course_categories'];

export function SubGroupDetailPanel({ sgId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [assignCoursesOpen, setAssignCoursesOpen] = useState(false);
  const [assignCategoriesOpen, setAssignCategoriesOpen] = useState(false);
  const [assignCourseCategoriesOpen, setAssignCourseCategoriesOpen] = useState(false);
  const [previewCatId, setPreviewCatId] = useState<string | null>(null);
  const [previewFileCatId, setPreviewFileCatId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCourseCategories, setSelectedCourseCategories] = useState<string[]>([]);
  const qc = useQueryClient();

  const { data: sg, isLoading } = useQuery<SubGroupDetail>({
    queryKey: ['subgroup-detail', sgId],
    queryFn: () => getSubGroupDetail(sgId),
    enabled: !!sgId,
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeMember(sgId, userId),
    onSuccess: () => {
      toast.success('Đã xóa thành viên');
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi xóa thành viên'),
  });

  const revokeMutation = useMutation({
    mutationFn: (courseId: string) => revokeCourse(sgId, courseId),
    onSuccess: () => {
      toast.success('Đã thu hồi course');
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi thu hồi course'),
  });

  const removeMultipleMembersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      await Promise.all(userIds.map(id => removeMember(sgId, id)));
    },
    onSuccess: () => {
      toast.success('Đã xóa các thành viên đã chọn');
      setSelectedMembers([]);
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi xóa thành viên'),
  });

  const revokeMultipleCoursesMutation = useMutation({
    mutationFn: async (courseIds: string[]) => {
      await Promise.all(courseIds.map(id => revokeCourse(sgId, id)));
    },
    onSuccess: () => {
      toast.success('Đã thu hồi các course đã chọn');
      setSelectedCourses([]);
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi thu hồi course'),
  });

  const revokeCategoryMutation = useMutation({
    mutationFn: (categoryId: string) => revokeCategory(sgId, categoryId),
    onSuccess: () => {
      toast.success('Đã thu hồi danh mục');
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi thu hồi danh mục'),
  });

  const revokeMultipleCategoriesMutation = useMutation({
    mutationFn: async (categoryIds: string[]) => {
      await Promise.all(categoryIds.map(id => revokeCategory(sgId, id)));
    },
    onSuccess: () => {
      toast.success('Đã thu hồi các danh mục đã chọn');
      setSelectedCategories([]);
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi thu hồi danh mục'),
  });

  const revokeCourseCategoryMutation = useMutation({
    mutationFn: (categoryId: string) => revokeCourseCategory(sgId, categoryId),
    onSuccess: () => {
      toast.success('Đã thu hồi danh mục khóa học');
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi thu hồi danh mục khóa học'),
  });

  const revokeMultipleCourseCategoriesMutation = useMutation({
    mutationFn: async (categoryIds: string[]) => {
      await Promise.all(categoryIds.map(id => revokeCourseCategory(sgId, id)));
    },
    onSuccess: () => {
      toast.success('Đã thu hồi các danh mục khóa học đã chọn');
      setSelectedCourseCategories([]);
      qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Lỗi thu hồi danh mục khóa học'),
  });

  const handleRemoveMember = (id: string, username: string) => {
    confirmDialog({
      title: 'Xóa thành viên',
      description: `Xóa "${username}" khỏi nhóm? User sẽ không còn thấy courses của nhóm này.`,
      variant: 'destructive',
      onConfirm: () => removeMemberMutation.mutate(id),
    });
  };

  const handleRevokeCourse = (courseId: string, displayName: string) => {
    confirmDialog({
      title: 'Thu hồi Course',
      description: `Thu hồi "${displayName}"? Các thành viên sẽ không còn thấy course này.`,
      variant: 'destructive',
      onConfirm: () => revokeMutation.mutate(courseId),
    });
  };

  const handleBulkRemoveMembers = () => {
    confirmDialog({
      title: 'Xóa nhiều thành viên',
      description: `Xóa ${selectedMembers.length} thành viên khỏi nhóm?`,
      variant: 'destructive',
      onConfirm: () => removeMultipleMembersMutation.mutate(selectedMembers),
    });
  };

  const handleBulkRevokeCourses = () => {
    confirmDialog({
      title: 'Thu hồi nhiều Course',
      description: `Thu hồi ${selectedCourses.length} course khỏi nhóm?`,
      variant: 'destructive',
      onConfirm: () => revokeMultipleCoursesMutation.mutate(selectedCourses),
    });
  };

  const handleRevokeCategory = (categoryId: string, name: string) => {
    confirmDialog({
      title: 'Thu hồi danh mục',
      description: `Thu hồi "${name}"? Các thành viên sẽ không còn thấy danh mục này.`,
      variant: 'destructive',
      onConfirm: () => revokeCategoryMutation.mutate(categoryId),
    });
  };

  const handleBulkRevokeCategories = () => {
    confirmDialog({
      title: 'Thu hồi nhiều danh mục',
      description: `Thu hồi ${selectedCategories.length} danh mục khỏi nhóm?`,
      variant: 'destructive',
      onConfirm: () => revokeMultipleCategoriesMutation.mutate(selectedCategories),
    });
  };

  const handleRevokeCourseCategory = (categoryId: string, name: string) => {
    confirmDialog({
      title: 'Thu hồi danh mục khóa học',
      description: `Thu hồi "${name}"? Các thành viên sẽ không còn thấy courses của danh mục này.`,
      variant: 'destructive',
      onConfirm: () => revokeCourseCategoryMutation.mutate(categoryId),
    });
  };

  const handleBulkRevokeCourseCategories = () => {
    confirmDialog({
      title: 'Thu hồi nhiều danh mục khóa học',
      description: `Thu hồi ${selectedCourseCategories.length} danh mục khóa học khỏi nhóm?`,
      variant: 'destructive',
      onConfirm: () => revokeMultipleCourseCategoriesMutation.mutate(selectedCourseCategories),
    });
  };

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllMembers = () => {
    if (sg?.members.length && selectedMembers.length === sg.members.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(sg?.members.map(m => m.id) ?? []);
    }
  };

  const toggleCourse = (id: string) => {
    setSelectedCourses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllCourses = () => {
    if (sg?.courses.length && selectedCourses.length === sg.courses.length) {
      setSelectedCourses([]);
    } else {
      setSelectedCourses(sg?.courses.map(c => c.course_id) ?? []);
    }
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllCategories = () => {
    if (sg?.categories.length && selectedCategories.length === sg.categories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(sg?.categories.map(c => c.category_id) ?? []);
    }
  };

  const toggleCourseCategory = (id: string) => {
    setSelectedCourseCategories(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllCourseCategories = () => {
    if (sg?.course_categories.length && selectedCourseCategories.length === sg.course_categories.length) {
      setSelectedCourseCategories([]);
    } else {
      setSelectedCourseCategories(sg?.course_categories.map(c => c.category_id) ?? []);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  if (!sg) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <h3 className="font-semibold text-foreground text-base">{sg.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{sg.org_group_name} · {sg.org_group_name}</p>
      </div>

      <div className="flex border-b border-border shrink-0 overflow-x-auto">
        {VISIBLE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            {tab === 'members' ? <Users className="h-3.5 w-3.5" /> : tab === 'courses' ? <BookOpen className="h-3.5 w-3.5" /> : tab === 'categories' ? <FolderOpen className="h-3.5 w-3.5" /> : <FolderKanban className="h-3.5 w-3.5" />}
            {tab === 'members' ? `Thành viên (${sg.member_count})` : tab === 'courses' ? `Courses (${sg.course_count})` : tab === 'categories' ? `Thư viện tài liệu (${sg.category_count})` : `Danh mục khoá học (${sg.course_category_count})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'members' && (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={sg.members.length > 0 && selectedMembers.length === sg.members.length}
                  onCheckedChange={toggleAllMembers}
                  disabled={sg.members.length === 0}
                  id="select-all-members"
                />
                <label htmlFor="select-all-members" className="text-sm font-medium cursor-pointer">Chọn tất cả</label>
                {selectedMembers.length > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 ml-2 text-xs"
                    onClick={handleBulkRemoveMembers}
                    disabled={removeMultipleMembersMutation.isPending}
                  >
                    {removeMultipleMembersMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Xóa ({selectedMembers.length})
                  </Button>
                )}
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAddMembersOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Thêm thành viên
              </Button>
            </div>
            {sg.members.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <Users className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">Chưa có thành viên</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sg.members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group">
                    <Checkbox
                      checked={selectedMembers.includes(m.id)}
                      onCheckedChange={() => toggleMember(m.id)}
                    />
                    {m.avatar ? (
                      <img src={storageUrl(m.avatar)} alt={m.username} className="w-8 h-8 rounded-full object-cover border border-border shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                        {m.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground/60 hidden group-hover:block shrink-0">
                      {format(new Date(m.added_at), 'dd/MM/yyyy')}
                    </span>
                    <button
                      onClick={() => handleRemoveMember(m.id, m.username)}
                      disabled={removeMemberMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      {removeMemberMutation.isPending && removeMemberMutation.variables === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'courses' && (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={sg.courses.length > 0 && selectedCourses.length === sg.courses.length}
                  onCheckedChange={toggleAllCourses}
                  disabled={sg.courses.length === 0}
                  id="select-all-courses"
                />
                <label htmlFor="select-all-courses" className="text-sm font-medium cursor-pointer">Chọn tất cả</label>
                {selectedCourses.length > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 ml-2 text-xs"
                    onClick={handleBulkRevokeCourses}
                    disabled={revokeMultipleCoursesMutation.isPending}
                  >
                    {revokeMultipleCoursesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Xóa ({selectedCourses.length})
                  </Button>
                )}
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAssignCoursesOpen(true)}>
                <BookPlus className="h-3.5 w-3.5" /> Phân khoá học
              </Button>
            </div>
            {sg.courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">Chưa có khoá học nào được phân</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sg.courses.map(c => (
                  <div key={c.course_id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group">
                    <Checkbox
                      checked={selectedCourses.includes(c.course_id)}
                      onCheckedChange={() => toggleCourse(c.course_id)}
                    />
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.display_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate font-mono">{c.course_id}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground/60 hidden group-hover:block shrink-0">
                      {format(new Date(c.assigned_at), 'dd/MM/yyyy')}
                    </span>
                    <button
                      onClick={() => handleRevokeCourse(c.course_id, c.display_name)}
                      disabled={revokeMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      {revokeMutation.isPending && revokeMutation.variables === c.course_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'categories' && (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={sg.categories.length > 0 && selectedCategories.length === sg.categories.length}
                  onCheckedChange={toggleAllCategories}
                  disabled={sg.categories.length === 0}
                  id="select-all-categories"
                />
                <label htmlFor="select-all-categories" className="text-sm font-medium cursor-pointer">Chọn tất cả</label>
                {selectedCategories.length > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 ml-2 text-xs"
                    onClick={handleBulkRevokeCategories}
                    disabled={revokeMultipleCategoriesMutation.isPending}
                  >
                    {revokeMultipleCategoriesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Xóa ({selectedCategories.length})
                  </Button>
                )}
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAssignCategoriesOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5" /> Phân thư viện tài liệu
              </Button>
            </div>
            {sg.categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <FolderOpen className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">Chưa có danh mục nào được phân</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sg.categories.map(c => (
                  <div
                    key={c.category_id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group cursor-pointer"
                    onClick={() => setPreviewFileCatId(c.category_id)}
                  >
                    <Checkbox
                      checked={selectedCategories.includes(c.category_id)}
                      onCheckedChange={() => toggleCategory(c.category_id)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <FolderOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    </div>
                    <Eye className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                    <span className="text-[11px] text-muted-foreground/60 hidden group-hover:block shrink-0">
                      {format(new Date(c.assigned_at), 'dd/MM/yyyy')}
                    </span>
                    <button
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleRevokeCategory(c.category_id, c.name); }}
                      disabled={revokeCategoryMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      {revokeCategoryMutation.isPending && revokeCategoryMutation.variables === c.category_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'course_categories' && (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={sg.course_categories.length > 0 && selectedCourseCategories.length === sg.course_categories.length}
                  onCheckedChange={toggleAllCourseCategories}
                  disabled={sg.course_categories.length === 0}
                  id="select-all-course-categories"
                />
                <label htmlFor="select-all-course-categories" className="text-sm font-medium cursor-pointer">Chọn tất cả</label>
                {selectedCourseCategories.length > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 ml-2 text-xs"
                    onClick={handleBulkRevokeCourseCategories}
                    disabled={revokeMultipleCourseCategoriesMutation.isPending}
                  >
                    {revokeMultipleCourseCategoriesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Xóa ({selectedCourseCategories.length})
                  </Button>
                )}
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAssignCourseCategoriesOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5" /> Phân danh mục courses
              </Button>
            </div>
            {sg.course_categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <FolderKanban className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">Chưa có danh mục khóa học nào được phân</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sg.course_categories.map(c => (
                  <div
                    key={c.category_id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group cursor-pointer"
                    onClick={() => setPreviewCatId(c.category_id)}
                  >
                    <Checkbox
                      checked={selectedCourseCategories.includes(c.category_id)}
                      onCheckedChange={() => toggleCourseCategory(c.category_id)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FolderKanban className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    </div>
                    <Eye className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                    <span className="text-[11px] text-muted-foreground/60 hidden group-hover:block shrink-0">
                      {format(new Date(c.assigned_at), 'dd/MM/yyyy')}
                    </span>
                    <button
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleRevokeCourseCategory(c.category_id, c.name); }}
                      disabled={revokeCourseCategoryMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      {revokeCourseCategoryMutation.isPending && revokeCourseCategoryMutation.variables === c.category_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AddMembersModal
        open={addMembersOpen}
        sgId={sgId}
        existingMemberIds={sg.members.map(m => m.id)}
        onOpenChange={setAddMembersOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
          qc.invalidateQueries({ queryKey: ['teams'] });
        }}
      />
      <AssignCoursesModal
        open={assignCoursesOpen}
        sgId={sgId}
        assignedCourseIds={sg.courses.map(c => c.course_id)}
        onOpenChange={setAssignCoursesOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
          qc.invalidateQueries({ queryKey: ['teams'] });
        }}
      />
      <AssignCategoriesModal
        open={assignCategoriesOpen}
        sgId={sgId}
        assignedCategoryIds={sg.categories.map(c => c.category_id)}
        onOpenChange={setAssignCategoriesOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
          qc.invalidateQueries({ queryKey: ['teams'] });
        }}
      />
      <AssignCourseCategoriesModal
        open={assignCourseCategoriesOpen}
        sgId={sgId}
        assignedCategoryIds={sg.course_categories.map(c => c.category_id)}
        onOpenChange={setAssignCourseCategoriesOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['subgroup-detail', sgId] });
          qc.invalidateQueries({ queryKey: ['teams'] });
        }}
      />
      {/* Preview courses in category modal */}
      <CourseCategoryPreviewModal
        catId={previewCatId}
        catName={sg.course_categories.find(c => c.category_id === previewCatId)?.name || ''}
        onClose={() => setPreviewCatId(null)}
      />
      {/* Preview files in category modal */}
      <FileCategoryPreviewModal
        catId={previewFileCatId}
        catName={sg.categories.find(c => c.category_id === previewFileCatId)?.name || ''}
        onClose={() => setPreviewFileCatId(null)}
      />
    </div>
  );
}


// ═══════════════════════════════════════
// Modal xem danh sách courses trong 1 danh mục
// ═══════════════════════════════════════

function CourseCategoryPreviewModal({ catId, catName, onClose }: { catId: string | null; catName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['course-category-courses-preview', catId],
    queryFn: () => getCourseCategoryCourses(catId!),
    enabled: catId !== null,
  });

  const courses = data?.results ?? [];

  return (
    <Dialog open={catId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" />
            {catName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{courses.length} courses trong danh mục</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-lg divide-y min-h-[120px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Chưa có course nào trong danh mục</p>
            </div>
          ) : (
            courses.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.display_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate font-mono">{c.course_id}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ═══════════════════════════════════════
// Modal xem danh sách files trong 1 danh mục
// ═══════════════════════════════════════

function FileCategoryPreviewModal({ catId, catName, onClose }: { catId: string | null; catName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['file-category-files-preview', catId],
    queryFn: () => getDocuments({ category_id: catId!, page: 1, page_size: 100 }),
    enabled: catId !== null,
  });

  const files: any[] = data?.documents ?? [];

  return (
    <Dialog open={catId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            {catName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{files.length} files trong danh mục</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-lg divide-y min-h-[120px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Chưa có file nào trong danh mục</p>
            </div>
          ) : (
            files.map(f => {
              const Icon = EXT_ICONS[f.extension] || FileText;
              const color = EXT_COLORS[f.extension] || 'text-muted-foreground';
              const bg = EXT_BG[f.extension] || 'bg-muted';
              return (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {f.extension.toUpperCase()} · {f.file_size_display}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
