import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDocuments, getAllCategories, uploadDocument, updateDocument, deleteDocument,
  bulkDocumentAction, type Document, type DocCategory,
} from '@/api/custom-library';
import { useTenantStore } from '@/utils/tenant-store';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { confirmDialog } from '@/utils/confirm-store';
import { useAuthStore } from '@/utils/store';
import {
  Upload, Trash2, Eye, EyeOff, FileText, FileImage,
  FileSpreadsheet, FileType, Film, FolderOpen, CheckCircle2, X,
} from 'lucide-react';

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

export default function DocumentsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [catFilter, setCatFilter] = useState('all');
  const [extFilter, setExtFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCatId, setBulkCatId] = useState<string>('');
  const activeTenantId = useTenantStore((s) => s.activeTenantId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAdd = hasPermission('library', 'can_add');
  const canEdit = hasPermission('library', 'can_edit');
  const canDelete = hasPermission('library', 'can_delete');

  useEffect(() => { setPage(1); }, [debouncedSearch, catFilter, extFilter]);

  // Fetch documents
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['landa-documents', page, limit, debouncedSearch, catFilter, extFilter, activeTenantId],
    queryFn: () => getDocuments({
      page, page_size: limit,
      search: debouncedSearch || undefined,
      category_id: catFilter !== 'all' ? catFilter : undefined,
      extension: extFilter !== 'all' ? extFilter : undefined,
    }),
  });

  // Fetch categories for filter dropdown
  const { data: categories } = useQuery({
    queryKey: ['landa-categories-all', activeTenantId],
    queryFn: getAllCategories,
  });

  const docs = data?.documents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  // Mutations
  const toggleVisibility = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) =>
      updateDocument(id, { is_visible: visible }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-documents'] });
      toast.success('Đã cập nhật');
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landa-documents'] });
      toast.success('Đã xóa tài liệu');
    },
  });

  const bulkMut = useMutation({
    mutationFn: ({ action, categoryId }: { action: 'show' | 'hide' | 'set_category'; categoryId?: string | null }) =>
      bulkDocumentAction(selected, action, categoryId),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['landa-documents'] });
      setSelected([]);
      setBulkCatId('');
      if (action === 'set_category') toast.success('Đã gán danh mục');
      else toast.success(action === 'show' ? 'Đã hiện tài liệu' : 'Đã ẩn tài liệu');
    },
  });

  // Upload
  const uploadMut = useMutation({
    mutationFn: uploadDocument,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['landa-documents'] });
      queryClient.invalidateQueries({ queryKey: ['landa-categories'] });
      toast.success(`Đã upload ${result.created} tài liệu`);
      if (result.errors?.length) {
        result.errors.forEach((e) => toast.error(e));
      }
    },
    onError: () => toast.error('Upload thất bại'),
  });

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.mp4,.jpg,.jpeg,.png';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files?.length) return;
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) formData.append('file', files[i]);
      uploadMut.mutate(formData);
    };
    input.click();
  };

  const handleDelete = (id: string, title: string) => {
    confirmDialog({
      title: 'Xóa tài liệu',
      description: `Xóa "${title}"? Hành động này không thể hoàn tác.`,
      variant: 'destructive',
      onConfirm: () => deleteMut.mutate(id),
    });
  };

  // Selection
  const allSelected = docs.length > 0 && docs.every((d) => selected.includes(d.id));
  const toggleAll = () => {
    setSelected(allSelected ? [] : docs.map((d) => d.id));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleBulkApply = () => {
    if (!bulkCatId) return;
    const catIdStr = bulkCatId === '__none__' ? null : bulkCatId;
    bulkMut.mutate({ action: 'set_category', categoryId: catIdStr });
  };

  const catOptions = (categories ?? []).map((c) => ({ value: String(c.id), label: `${c.name} (${c.doc_count})` }));
  const extOptions = ['pdf', 'docx', 'xlsx', 'pptx', 'mp4', 'jpg', 'png'].map((e) => ({ value: e, label: e.toUpperCase() }));

  return (
    <div className="space-y-4">
      {/* DEBUG: nếu thấy dòng này mà không thấy toolbar → TableToolbar bị lỗi */}
      {/* <div className="bg-yellow-200 text-black p-2 text-sm font-bold rounded">DEBUG: DocumentsTab render OK — search="{search}", docs={docs.length}, selected={selected.length}</div> */}
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm tài liệu..."
        filters={[
          { key: 'category', placeholder: 'Danh mục', options: catOptions },
          { key: 'extension', placeholder: 'Loại file', options: extOptions },
        ]}
        filterValues={{ category: catFilter, extension: extFilter }}
        onFilterChange={(key, val) => {
          if (key === 'category') setCatFilter(val);
          if (key === 'extension') setExtFilter(val);
        }}
        onReset={() => { setSearch(''); setCatFilter('all'); setExtFilter('all'); }}
        actions={
          canAdd ? (
            <Button size="sm" onClick={handleUpload} disabled={uploadMut.isPending} className="h-8 text-xs shadow-sm">
              <Upload className="mr-1 h-3.5 w-3.5" /> Upload
            </Button>
          ) : undefined
        }
      />

      {/* ── Bulk Action Bar (giống landa-admin) ── */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
          />
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {selected.length} đã chọn
          </span>

          <div className="h-5 w-px bg-border" />

          {/* Hiện thị */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkMut.mutate({ action: 'show' })}
            disabled={bulkMut.isPending}
            className="h-8 text-xs font-semibold shadow-sm"
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Hiện thị
          </Button>

          {/* Ẩn */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkMut.mutate({ action: 'hide' })}
            disabled={bulkMut.isPending}
            className="h-8 text-xs font-semibold shadow-sm"
          >
            <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Ẩn
          </Button>

          <div className="h-5 w-px bg-border" />

          {/* Gán danh mục dropdown + Áp dụng */}
          <div className="flex items-center gap-2">
            <Select value={bulkCatId} onValueChange={setBulkCatId}>
              <SelectTrigger className="h-8 w-[180px] text-xs bg-background border-input">
                <SelectValue placeholder="Gán danh mục..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs text-muted-foreground italic">Bỏ danh mục</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="default"
              onClick={handleBulkApply}
              disabled={!bulkCatId || bulkMut.isPending}
              className="h-8 text-xs font-semibold shadow-sm"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Áp dụng
            </Button>
          </div>

          {/* Bỏ chọn */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => { setSelected([]); setBulkCatId(''); }}
            className="h-7 w-7 ml-auto text-muted-foreground hover:text-foreground"
            title="Bỏ chọn tất cả"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-10 pl-4">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Tài liệu</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Loại</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Kích thước</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Danh mục</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Trạng thái</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Người đăng</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Ngày tạo</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground uppercase tracking-wider text-right pr-5">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={isFetching && docs.length > 0 ? 'opacity-50 pointer-events-none' : ''}>
              {isLoading ? (
                Array.from({ length: limit }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell className="pl-4"><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : docs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <div className="flex flex-col items-center text-muted-foreground">
                      <FolderOpen className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-sm">Chưa có tài liệu</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                docs.map((doc) => {
                  const Icon = EXT_ICONS[doc.extension] || FileText;
                  const color = EXT_COLORS[doc.extension] || 'text-muted-foreground';
                  return (
                    <TableRow key={doc.id} className="group hover:bg-muted/30 transition-colors border-border">
                      <TableCell className="pl-4">
                        <Checkbox checked={selected.includes(doc.id)} onCheckedChange={() => toggleOne(doc.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Icon className={`h-4 w-4 ${color} flex-shrink-0`} />
                          <span className="font-medium text-sm truncate max-w-[200px]">{doc.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono uppercase">{doc.extension}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{doc.file_size_display}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{doc.category_name || <span className="opacity-40">—</span>}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={doc.is_visible
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                            : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20'
                          }
                        >
                          {doc.is_visible ? 'Hiện' : 'Ẩn'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{doc.uploaded_by_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{doc.created_at}</TableCell>
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && <Button variant="ghost" size="icon"
                            onClick={() => toggleVisibility.mutate({ id: doc.id, visible: !doc.is_visible })}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground" title={doc.is_visible ? 'Ẩn' : 'Hiện'}
                          >
                            {doc.is_visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>}
                          {canDelete && <Button variant="ghost" size="icon"
                            onClick={() => handleDelete(doc.id, doc.title)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Xóa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} limit={limit} total={total} totalPages={totalPages} onPageChange={setPage} onLimitChange={setLimit} label="tài liệu" />
      </div>
    </div>
  );
}
