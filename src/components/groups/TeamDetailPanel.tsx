import { useEffect, useState } from 'react';
import { storageUrl } from '@/utils/storage-url';
import {
  UserPlus,
  Trash2,
  Users,
  Loader2,
  BookOpen,
  FolderOpen,
  FolderPlus,
  FolderKanban,
  Eye,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileType,
  Film,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/utils/confirm-store';
import { getGroupLabelSet, lowerGroupLabel } from '@/utils/group-labels';
import { useAuthStore } from '@/utils/store';
import { useDebounce } from '@/hooks/use-debounce';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getTeamDetail,
  getTeamMembers,
  getTeamCategories,
  getTeamCourseCategories,
  removeTeamMember,
  revokeTeamCategory,
  revokeTeamCourseCategory,
  type TeamDetail,
} from '@/api/custom-groups';
import { getCourseCategoryCourses } from '@/api/custom-course-categories';
import { getDocuments } from '@/api/custom-library';
import { AddMembersModal } from './AddMembersModal';
import { AssignCategoriesModal } from './AssignCategoriesModal';
import { AssignCourseCategoriesModal } from './AssignCourseCategoriesModal';

interface Props {
  teamId: string;
}

type Tab = 'members' | 'categories' | 'course_categories';

const TEAM_DETAIL_PAGE_SIZE = 20;
const VISIBLE_TABS: Tab[] = ['members', 'categories', 'course_categories'];

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

function PaginationControls({
  page,
  totalPages,
  isFetching,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1 || isFetching}
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground">
        Trang {page} / {Math.max(1, totalPages)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages || isFetching}
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function TabSearch({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-9 pl-9"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TeamDetailPanel({ teamId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [assignCategoriesOpen, setAssignCategoriesOpen] = useState(false);
  const [assignCourseCategoriesOpen, setAssignCourseCategoriesOpen] = useState(false);
  const [previewCatId, setPreviewCatId] = useState<string | null>(null);
  const [previewFileCatId, setPreviewFileCatId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCourseCategories, setSelectedCourseCategories] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [courseCategorySearch, setCourseCategorySearch] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [courseCategoryPage, setCourseCategoryPage] = useState(1);
  const debouncedMemberSearch = useDebounce(memberSearch, 350);
  const debouncedCategorySearch = useDebounce(categorySearch, 350);
  const debouncedCourseCategorySearch = useDebounce(courseCategorySearch, 350);
  const qc = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const groupLabels = useAuthStore((s) => s.groupLabels);
  const canEdit = hasPermission('groups', 'can_edit');
  const labels = getGroupLabelSet(groupLabels);
  const teamLabelLower = lowerGroupLabel(labels.team);

  const { data: sg, isLoading } = useQuery<TeamDetail>({
    queryKey: ['team-detail', teamId],
    queryFn: () => getTeamDetail(teamId),
    enabled: !!teamId,
  });

  const membersQuery = useQuery({
    queryKey: ['team-detail-members', teamId, debouncedMemberSearch, memberPage],
    queryFn: () => getTeamMembers(teamId, {
      page: memberPage,
      page_size: TEAM_DETAIL_PAGE_SIZE,
      search: debouncedMemberSearch || undefined,
    }),
    enabled: !!teamId && activeTab === 'members',
  });

  const categoriesQuery = useQuery({
    queryKey: ['team-detail-categories', teamId, debouncedCategorySearch, categoryPage],
    queryFn: () => getTeamCategories(teamId, {
      page: categoryPage,
      page_size: TEAM_DETAIL_PAGE_SIZE,
      search: debouncedCategorySearch || undefined,
    }),
    enabled: !!teamId && activeTab === 'categories',
  });

  const courseCategoriesQuery = useQuery({
    queryKey: ['team-detail-course-categories', teamId, debouncedCourseCategorySearch, courseCategoryPage],
    queryFn: () => getTeamCourseCategories(teamId, {
      page: courseCategoryPage,
      page_size: TEAM_DETAIL_PAGE_SIZE,
      search: debouncedCourseCategorySearch || undefined,
    }),
    enabled: !!teamId && activeTab === 'course_categories',
  });

  const members = membersQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const courseCategories = courseCategoriesQuery.data?.data ?? [];
  const memberTotalPages = membersQuery.data?.totalPages ?? 1;
  const categoryTotalPages = categoriesQuery.data?.totalPages ?? 1;
  const courseCategoryTotalPages = courseCategoriesQuery.data?.totalPages ?? 1;

  useEffect(() => { setMemberPage(1); }, [teamId, debouncedMemberSearch]);
  useEffect(() => { setCategoryPage(1); }, [teamId, debouncedCategorySearch]);
  useEffect(() => { setCourseCategoryPage(1); }, [teamId, debouncedCourseCategorySearch]);
  useEffect(() => { setSelectedMembers([]); }, [teamId, debouncedMemberSearch, memberPage]);
  useEffect(() => { setSelectedCategories([]); }, [teamId, debouncedCategorySearch, categoryPage]);
  useEffect(() => { setSelectedCourseCategories([]); }, [teamId, debouncedCourseCategorySearch, courseCategoryPage]);

  const invalidateTeamQueries = () => {
    qc.invalidateQueries({ queryKey: ['team-detail', teamId] });
    qc.invalidateQueries({ queryKey: ['team-detail-members', teamId] });
    qc.invalidateQueries({ queryKey: ['team-detail-categories', teamId] });
    qc.invalidateQueries({ queryKey: ['team-detail-course-categories', teamId] });
    qc.invalidateQueries({ queryKey: ['teams'] });
  };

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      toast.success('Đã xóa thành viên');
      invalidateTeamQueries();
    },
    onError: () => toast.error('Lỗi xóa thành viên'),
  });

  const removeMultipleMembersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      await Promise.all(userIds.map(id => removeTeamMember(teamId, id)));
    },
    onSuccess: () => {
      toast.success('Đã xóa các thành viên đã chọn');
      setSelectedMembers([]);
      invalidateTeamQueries();
    },
    onError: () => toast.error('Lỗi xóa thành viên'),
  });

  const revokeCategoryMutation = useMutation({
    mutationFn: (categoryId: string) => revokeTeamCategory(teamId, categoryId),
    onSuccess: () => {
      toast.success('Đã thu hồi danh mục');
      invalidateTeamQueries();
    },
    onError: () => toast.error('Lỗi thu hồi danh mục'),
  });

  const revokeMultipleCategoriesMutation = useMutation({
    mutationFn: async (categoryIds: string[]) => {
      await Promise.all(categoryIds.map(id => revokeTeamCategory(teamId, id)));
    },
    onSuccess: () => {
      toast.success('Đã thu hồi các danh mục đã chọn');
      setSelectedCategories([]);
      invalidateTeamQueries();
    },
    onError: () => toast.error('Lỗi thu hồi danh mục'),
  });

  const revokeCourseCategoryMutation = useMutation({
    mutationFn: (categoryId: string) => revokeTeamCourseCategory(teamId, categoryId),
    onSuccess: () => {
      toast.success('Đã thu hồi danh mục khóa học');
      invalidateTeamQueries();
    },
    onError: () => toast.error('Lỗi thu hồi danh mục khóa học'),
  });

  const revokeMultipleCourseCategoriesMutation = useMutation({
    mutationFn: async (categoryIds: string[]) => {
      await Promise.all(categoryIds.map(id => revokeTeamCourseCategory(teamId, id)));
    },
    onSuccess: () => {
      toast.success('Đã thu hồi các danh mục khóa học đã chọn');
      setSelectedCourseCategories([]);
      invalidateTeamQueries();
    },
    onError: () => toast.error('Lỗi thu hồi danh mục khóa học'),
  });

  const handleRemoveMember = (userId: string, username: string) => {
    confirmDialog({
      title: 'Xóa thành viên',
      description: `Xóa ${username} khỏi ${teamLabelLower}?`,
      variant: 'destructive',
      onConfirm: () => removeMemberMutation.mutate(userId),
    });
  };

  const handleBulkRemoveMembers = () => {
    confirmDialog({
      title: 'Xóa nhiều thành viên',
      description: `Xóa ${selectedMembers.length} thành viên khỏi ${teamLabelLower}?`,
      variant: 'destructive',
      onConfirm: () => removeMultipleMembersMutation.mutate(selectedMembers),
    });
  };

  const handleRevokeCategory = (categoryId: string, name: string) => {
    confirmDialog({
      title: 'Thu hồi danh mục',
      description: `Thu hồi "${name}"? Thành viên sẽ không còn thấy tài liệu trong danh mục này.`,
      variant: 'destructive',
      onConfirm: () => revokeCategoryMutation.mutate(categoryId),
    });
  };

  const handleBulkRevokeCategories = () => {
    confirmDialog({
      title: 'Thu hồi nhiều danh mục',
      description: `Thu hồi ${selectedCategories.length} danh mục khỏi ${teamLabelLower}?`,
      variant: 'destructive',
      onConfirm: () => revokeMultipleCategoriesMutation.mutate(selectedCategories),
    });
  };

  const handleRevokeCourseCategory = (categoryId: string, name: string) => {
    confirmDialog({
      title: 'Thu hồi danh mục khóa học',
      description: `Thu hồi "${name}"? Các thành viên sẽ không còn thấy khóa học trong danh mục này.`,
      variant: 'destructive',
      onConfirm: () => revokeCourseCategoryMutation.mutate(categoryId),
    });
  };

  const handleBulkRevokeCourseCategories = () => {
    confirmDialog({
      title: 'Thu hồi nhiều danh mục khóa học',
      description: `Thu hồi ${selectedCourseCategories.length} danh mục khóa học khỏi ${teamLabelLower}?`,
      variant: 'destructive',
      onConfirm: () => revokeMultipleCourseCategoriesMutation.mutate(selectedCourseCategories),
    });
  };

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllMembers = () => {
    const visibleIds = members.map(m => m.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedMembers.includes(id));
    setSelectedMembers(allVisibleSelected ? [] : visibleIds);
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllCategories = () => {
    const visibleIds = categories.map(c => c.category_id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedCategories.includes(id));
    setSelectedCategories(allVisibleSelected ? [] : visibleIds);
  };

  const toggleCourseCategory = (id: string) => {
    setSelectedCourseCategories(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllCourseCategories = () => {
    const visibleIds = courseCategories.map(c => c.category_id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedCourseCategories.includes(id));
    setSelectedCourseCategories(allVisibleSelected ? [] : visibleIds);
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  if (!sg) return null;

  const allMembersSelected = members.length > 0 && members.every(m => selectedMembers.includes(m.id));
  const allCategoriesSelected = categories.length > 0 && categories.every(c => selectedCategories.includes(c.category_id));
  const allCourseCategoriesSelected = courseCategories.length > 0 && courseCategories.every(c => selectedCourseCategories.includes(c.category_id));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-foreground">{sg.name}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {labels.subgroup}: {sg.subgroup_name} · {labels.group}: {sg.org_group_name}
        </p>
      </div>

      <div className="flex shrink-0 overflow-x-auto border-b border-border">
        {VISIBLE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors ${activeTab === tab
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            {tab === 'members' ? <Users className="h-3.5 w-3.5" /> : tab === 'categories' ? <FolderOpen className="h-3.5 w-3.5" /> : <FolderKanban className="h-3.5 w-3.5" />}
            {tab === 'members' ? `Thành viên (${sg.member_count})` : tab === 'categories' ? `Thư viện tài liệu (${sg.category_count})` : `Danh mục khoá học (${sg.course_category_count})`}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'members' && (
          <>
            <div className="space-y-3 border-b border-border px-4 py-3">
              <TabSearch value={memberSearch} placeholder="Tìm thành viên theo tên hoặc email..." onChange={setMemberSearch} />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    checked={allMembersSelected}
                    onCheckedChange={toggleAllMembers}
                    disabled={members.length === 0 || membersQuery.isFetching}
                    id="select-all-members"
                  />
                  <label htmlFor="select-all-members" className="cursor-pointer text-sm font-medium">Chọn tất cả trang này</label>
                  {selectedMembers.length > 0 && canEdit && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={handleBulkRemoveMembers}
                      disabled={removeMultipleMembersMutation.isPending}
                    >
                      {removeMultipleMembersMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                      Xóa ({selectedMembers.length})
                    </Button>
                  )}
                </div>
                {canEdit && (
                  <Button size="sm" className="h-8 gap-1.5 text-xs sm:self-auto" onClick={() => setAddMembersOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> Thêm thành viên
                  </Button>
                )}
              </div>
            </div>
            {membersQuery.isFetching && !membersQuery.data ? (
              <LoadingRows />
            ) : members.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <Users className="mb-2 h-10 w-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">{debouncedMemberSearch ? 'Không tìm thấy thành viên phù hợp' : 'Chưa có thành viên'}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {members.map(m => (
                  <div key={m.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                    <Checkbox
                      checked={selectedMembers.includes(m.id)}
                      onCheckedChange={() => toggleMember(m.id)}
                    />
                    {m.avatar ? (
                      <img src={storageUrl(m.avatar)} alt={m.username} className="h-8 w-8 shrink-0 rounded-full border border-border object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-muted-foreground">
                        {m.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{m.username}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground/60 group-hover:block">
                      {format(new Date(m.added_at), 'dd/MM/yyyy')}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveMember(m.id, m.username)}
                        disabled={removeMemberMutation.isPending}
                        className="p-1.5 text-muted-foreground opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        {removeMemberMutation.isPending && removeMemberMutation.variables === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <PaginationControls page={memberPage} totalPages={memberTotalPages} isFetching={membersQuery.isFetching} onPageChange={setMemberPage} />
          </>
        )}

        {activeTab === 'categories' && (
          <>
            <div className="space-y-3 border-b border-border px-4 py-3">
              <TabSearch value={categorySearch} placeholder="Tìm danh mục tài liệu..." onChange={setCategorySearch} />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    checked={allCategoriesSelected}
                    onCheckedChange={toggleAllCategories}
                    disabled={categories.length === 0 || categoriesQuery.isFetching}
                    id="select-all-categories"
                  />
                  <label htmlFor="select-all-categories" className="cursor-pointer text-sm font-medium">Chọn tất cả trang này</label>
                  {selectedCategories.length > 0 && canEdit && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={handleBulkRevokeCategories}
                      disabled={revokeMultipleCategoriesMutation.isPending}
                    >
                      {revokeMultipleCategoriesMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                      Xóa ({selectedCategories.length})
                    </Button>
                  )}
                </div>
                {canEdit && (
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAssignCategoriesOpen(true)}>
                    <FolderPlus className="h-3.5 w-3.5" /> Phân thư viện tài liệu
                  </Button>
                )}
              </div>
            </div>
            {categoriesQuery.isFetching && !categoriesQuery.data ? (
              <LoadingRows />
            ) : categories.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <FolderOpen className="mb-2 h-10 w-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">{debouncedCategorySearch ? 'Không tìm thấy danh mục tài liệu phù hợp' : 'Chưa có danh mục nào được phân'}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {categories.map(c => (
                  <div
                    key={c.category_id}
                    className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                    onClick={() => setPreviewFileCatId(c.category_id)}
                  >
                    <Checkbox
                      checked={selectedCategories.includes(c.category_id)}
                      onCheckedChange={() => toggleCategory(c.category_id)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                      <FolderOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    </div>
                    <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground/60 group-hover:block">
                      {format(new Date(c.assigned_at), 'dd/MM/yyyy')}
                    </span>
                    {canEdit && (
                      <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleRevokeCategory(c.category_id, c.name); }}
                        disabled={revokeCategoryMutation.isPending}
                        className="p-1.5 text-muted-foreground opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        {revokeCategoryMutation.isPending && revokeCategoryMutation.variables === c.category_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <PaginationControls page={categoryPage} totalPages={categoryTotalPages} isFetching={categoriesQuery.isFetching} onPageChange={setCategoryPage} />
          </>
        )}

        {activeTab === 'course_categories' && (
          <>
            <div className="space-y-3 border-b border-border px-4 py-3">
              <TabSearch value={courseCategorySearch} placeholder="Tìm danh mục khoá học..." onChange={setCourseCategorySearch} />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    checked={allCourseCategoriesSelected}
                    onCheckedChange={toggleAllCourseCategories}
                    disabled={courseCategories.length === 0 || courseCategoriesQuery.isFetching}
                    id="select-all-course-categories"
                  />
                  <label htmlFor="select-all-course-categories" className="cursor-pointer text-sm font-medium">Chọn tất cả trang này</label>
                  {selectedCourseCategories.length > 0 && canEdit && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={handleBulkRevokeCourseCategories}
                      disabled={revokeMultipleCourseCategoriesMutation.isPending}
                    >
                      {revokeMultipleCourseCategoriesMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                      Xóa ({selectedCourseCategories.length})
                    </Button>
                  )}
                </div>
                {canEdit && (
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAssignCourseCategoriesOpen(true)}>
                    <FolderPlus className="h-3.5 w-3.5" /> Phân danh mục khoá học
                  </Button>
                )}
              </div>
            </div>
            {courseCategoriesQuery.isFetching && !courseCategoriesQuery.data ? (
              <LoadingRows />
            ) : courseCategories.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <FolderKanban className="mb-2 h-10 w-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">{debouncedCourseCategorySearch ? 'Không tìm thấy danh mục khóa học phù hợp' : 'Chưa có danh mục khóa học nào được phân'}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {courseCategories.map(c => (
                  <div
                    key={c.category_id}
                    className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                    onClick={() => setPreviewCatId(c.category_id)}
                  >
                    <Checkbox
                      checked={selectedCourseCategories.includes(c.category_id)}
                      onCheckedChange={() => toggleCourseCategory(c.category_id)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FolderKanban className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    </div>
                    <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground/60 group-hover:block">
                      {format(new Date(c.assigned_at), 'dd/MM/yyyy')}
                    </span>
                    {canEdit && (
                      <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleRevokeCourseCategory(c.category_id, c.name); }}
                        disabled={revokeCourseCategoryMutation.isPending}
                        className="p-1.5 text-muted-foreground opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        {revokeCourseCategoryMutation.isPending && revokeCourseCategoryMutation.variables === c.category_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <PaginationControls page={courseCategoryPage} totalPages={courseCategoryTotalPages} isFetching={courseCategoriesQuery.isFetching} onPageChange={setCourseCategoryPage} />
          </>
        )}
      </div>

      <AddMembersModal
        open={addMembersOpen}
        teamId={teamId}
        onOpenChange={setAddMembersOpen}
        onSuccess={invalidateTeamQueries}
      />
      <AssignCategoriesModal
        open={assignCategoriesOpen}
        teamId={teamId}
        onOpenChange={setAssignCategoriesOpen}
        onSuccess={invalidateTeamQueries}
      />
      <AssignCourseCategoriesModal
        open={assignCourseCategoriesOpen}
        teamId={teamId}
        onOpenChange={setAssignCourseCategoriesOpen}
        onSuccess={invalidateTeamQueries}
      />
      <CourseCategoryPreviewModal
        catId={previewCatId}
        catName={courseCategories.find(c => c.category_id === previewCatId)?.name || ''}
        onClose={() => setPreviewCatId(null)}
      />
      <FileCategoryPreviewModal
        catId={previewFileCatId}
        catName={categories.find(c => c.category_id === previewFileCatId)?.name || ''}
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
          <p className="text-xs text-muted-foreground">{courses.length} khóa học trong danh mục</p>
        </DialogHeader>

        <div className="app-liquid-card flex-1 overflow-y-auto border rounded-lg divide-y min-h-[120px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Chưa có khóa học nào trong danh mục</p>
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
          <p className="text-xs text-muted-foreground">{files.length} tài liệu trong danh mục</p>
        </DialogHeader>

        <div className="app-liquid-card flex-1 overflow-y-auto border rounded-lg divide-y min-h-[120px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Chưa có tài liệu nào trong danh mục</p>
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
