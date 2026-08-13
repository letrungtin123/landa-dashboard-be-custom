import React, { useEffect, useMemo, useRef, useState } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  File, FileImage, FileText, Lock, Unlock, Trash2,
  MoreHorizontal, Plus, Loader2, Download,
  FileSpreadsheet, FileVideo, FileAudio, FileArchive, FileCode
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getCourseAssets,
  uploadCourseAsset,
  deleteCourseAsset,
  updateCourseAssetLock,
  updateCourseAssetReference,
  type CourseAsset
} from '@/api/custom-course-authoring';
import { useAuthStore } from '@/utils/store';
import { AppTooltip } from '@/components/ui/tooltip';

interface CourseFilesModalProps {
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 40;
const ROW_HEIGHT = 108;
const OVERSCAN_ROWS = 8;
const LOAD_MORE_THRESHOLD = 560;

function isImageAsset(asset: CourseAsset): boolean {
  return Boolean(
    asset.content_type?.toLowerCase().startsWith('image/') ||
    asset.display_name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i),
  );
}

function formatFileSize(value: number | null | undefined): string {
  const size = Number(value || 0);
  if (!size) return '--';
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function formatAssetDate(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CourseFilesModal({ courseId, isOpen, onClose }: CourseFilesModalProps) {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission('courses', 'can_edit');
  const canDelete = hasPermission('courses', 'can_delete');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkOperating, setIsBulkOperating] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const getFileIcon = (fileName: string, contentType: string = '') => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext.match(/(jpg|jpeg|png|gif|svg|webp)/i) || contentType.startsWith('image/')) {
      return <FileImage className="h-6 w-6 text-indigo-500" />;
    }
    if (ext.match(/(pdf)/i)) return <FileText className="h-6 w-6 text-red-500" />;
    if (ext.match(/(doc|docx)/i)) return <FileText className="h-6 w-6 text-blue-500" />;
    if (ext.match(/(xls|xlsx|csv)/i)) return <FileSpreadsheet className="h-6 w-6 text-emerald-500" />;
    if (ext.match(/(mp4|webm|mov)/i) || contentType.startsWith('video/')) return <FileVideo className="h-6 w-6 text-purple-500" />;
    if (ext.match(/(mp3|wav|ogg)/i) || contentType.startsWith('audio/')) return <FileAudio className="h-6 w-6 text-yellow-500" />;
    if (ext.match(/(zip|rar|tar|gz|7z)/i)) return <FileArchive className="h-6 w-6 text-amber-600" />;
    if (ext.match(/(js|ts|jsx|tsx|json|html|css|xml)/i)) return <FileCode className="h-6 w-6 text-slate-500" />;
    return <File className="h-6 w-6 text-muted-foreground/60" />;
  };

  const assetUrl = (asset: CourseAsset) => storageUrl(asset.storage_path || asset.url);
  const assetDownloadUrl = (asset: CourseAsset) => {
    const url = assetUrl(asset);
    return `${url}${url.includes('?') ? '&' : '?'}download=1`;
  };

  const assetsQuery = useInfiniteQuery({
    queryKey: ['course-assets', courseId, 'cursor'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getCourseAssets(courseId, {
      cursor: pageParam,
      pageSize: PAGE_SIZE,
      cursorPagination: true,
    }),
    getNextPageParam: (lastPage) => lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    enabled: isOpen && !!courseId,
    staleTime: 30_000,
  });

  const assets = useMemo(
    () => assetsQuery.data?.pages.flatMap((page) => page.assets) ?? [],
    [assetsQuery.data],
  );
  const totalCount = assetsQuery.data?.pages[0]?.totalCount ?? null;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedAssets = assets.filter(asset => selectedIdSet.has(asset.id));
  const selectedEditableAssets = selectedAssets.filter(asset => !asset.is_outline_media);
  const protectedSelectionCount = selectedAssets.length - selectedEditableAssets.length;
  const canSelectAll = assets.length > 0 && assets.every(asset => selectedIdSet.has(asset.id));
  const isInitialLoading = assetsQuery.isLoading && assets.length === 0;
  const isLoadingMore = assetsQuery.isFetchingNextPage;
  const hasMoreAssets = Boolean(assetsQuery.hasNextPage);
  const fetchMoreAssets = assetsQuery.fetchNextPage;

  const virtual = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
    const endIndex = Math.min(
      assets.length,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
    );

    return {
      paddingTop: startIndex * ROW_HEIGHT,
      paddingBottom: Math.max(0, (assets.length - endIndex) * ROW_HEIGHT),
      items: assets.slice(startIndex, endIndex),
    };
  }, [assets, scrollTop, viewportHeight]);

  const virtualRowStyle = {
    height: ROW_HEIGHT,
    contentVisibility: 'auto',
    containIntrinsicSize: `${ROW_HEIGHT}px`,
  } as React.CSSProperties;

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [courseId, isOpen]);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) return;
    const element = scrollRef.current;
    const updateSize = () => setViewportHeight(element.clientHeight || 600);
    updateSize();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!isOpen || !element || !hasMoreAssets || isLoadingMore) return;
    if (element.scrollHeight <= element.clientHeight + LOAD_MORE_THRESHOLD) {
      fetchMoreAssets();
    }
  }, [assets.length, fetchMoreAssets, hasMoreAssets, isLoadingMore, isOpen]);

  const maybeFetchNextPage = (element: HTMLDivElement) => {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < LOAD_MORE_THRESHOLD && hasMoreAssets && !isLoadingMore) {
      fetchMoreAssets();
    }
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setScrollTop(element.scrollTop);
    setViewportHeight(element.clientHeight || 600);
    maybeFetchNextPage(element);
  };

  const notifyProtectedSkip = () => {
    if (protectedSelectionCount > 0) {
      toast.warning(`Đã bỏ qua ${protectedSelectionCount} tệp đang dùng trong cây bài học.`);
    }
  };

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadCourseAsset(courseId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
      toast.success('Đã tải lên tệp thành công');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Tải lên thất bại');
    }
  });

  const deleteMut = useMutation({
    mutationFn: (assetId: string) => deleteCourseAsset(courseId, assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
      toast.success('Đã xóa tệp');
      setSelectedIds([]);
    },
    onError: () => toast.error('Xóa tệp thất bại')
  });

  const lockMut = useMutation({
    mutationFn: ({ assetId, locked }: { assetId: string, locked: boolean }) =>
      updateCourseAssetLock(courseId, assetId, locked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
      toast.success('Đã cập nhật trạng thái khóa');
    },
    onError: () => toast.error('Cập nhật thất bại')
  });

  const refMut = useMutation({
    mutationFn: ({ assetIds, isReference }: { assetIds: string[], isReference: boolean }) =>
      updateCourseAssetReference(courseId, assetIds, isReference),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
      toast.success('Đã cập nhật hiển thị tham khảo');
    },
    onError: () => toast.error('Cập nhật thất bại')
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const validExts = ['.pdf', '.xlsx', '.docx'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      if (!validExts.includes(ext)) {
        toast.error('Chỉ hỗ trợ upload định dạng PDF, XLSX và DOCX');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      uploadMut.mutate(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (canSelectAll) setSelectedIds([]);
    else setSelectedIds(assets.map(a => a.id));
  };

  const handleDownloadAsset = (asset: CourseAsset) => {
    const link = document.createElement('a');
    link.href = assetDownloadUrl(asset);
    link.download = asset.display_name || 'file';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleBulkDelete = async () => {
    const editableIds = selectedEditableAssets.map(asset => asset.id);
    if (editableIds.length === 0) {
      toast.warning('Không có tệp nào có thể xoá trong lựa chọn hiện tại.');
      return;
    }
    notifyProtectedSkip();
    if (!confirm(`Bạn có chắc muốn xóa ${editableIds.length} file đã chọn?`)) return;
    setIsBulkOperating(true);
    try {
      await Promise.all(editableIds.map(id => deleteCourseAsset(courseId, id)));
      toast.success(`Đã xóa ${editableIds.length} file`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
    } catch {
      toast.error('Có lỗi xảy ra khi xóa hàng loạt');
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleBulkLock = async (locked: boolean) => {
    const editableIds = selectedEditableAssets.map(asset => asset.id);
    if (editableIds.length === 0) {
      toast.warning('Không có tệp nào có thể cập nhật quyền truy cập.');
      return;
    }
    notifyProtectedSkip();
    setIsBulkOperating(true);
    try {
      await Promise.all(editableIds.map(id => updateCourseAssetLock(courseId, id, locked)));
      toast.success(`Đã ${locked ? 'khóa' : 'mở khóa'} ${editableIds.length} file`);
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
    } catch {
      toast.error('Có lỗi xảy ra khi cập nhật trạng thái');
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleBulkReference = async (isReference: boolean) => {
    if (selectedIds.length === 0) return;
    setIsBulkOperating(true);
    try {
      await updateCourseAssetReference(courseId, selectedIds, isReference);
      toast.success(`Đã ${isReference ? 'hiển thị' : 'ẩn'} ${selectedIds.length} tài liệu tham khảo`);
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
    } catch {
      toast.error('Có lỗi xảy ra khi cập nhật trạng thái');
    } finally {
      setIsBulkOperating(false);
    }
  };

  const renderSkeletonRows = (rows: number) => Array.from({ length: rows }).map((_, i) => (
    <TableRow key={`skeleton-${i}`} className="border-b border-border/40">
      <TableCell><Skeleton className="mx-auto h-4 w-4 rounded-md" /></TableCell>
      <TableCell><Skeleton className="mx-auto h-14 w-[80px] rounded-lg" /></TableCell>
      <TableCell><Skeleton className="mb-2 h-5 w-48" /><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="mx-auto h-5 w-16 rounded-full" /></TableCell>
      <TableCell><Skeleton className="mx-auto h-5 w-10 rounded-full" /></TableCell>
      <TableCell><Skeleton className="ml-auto h-8 w-16 rounded-full" /></TableCell>
    </TableRow>
  ));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85vh] w-[95vw] flex-col gap-0 overflow-hidden rounded-xl border border-border/50 p-0 shadow-2xl sm:max-w-[1100px]">
        <DialogHeader className="shrink-0 border-b border-border/40 bg-muted/20 px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">Tệp & Tải lên</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Đã tải {assets.length}{totalCount !== null ? ` / ${totalCount}` : ''} tệp{hasMoreAssets ? ' - cuộn xuống để tải thêm' : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              {canEdit && <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMut.isPending}
                size="default"
                className="gap-2 rounded-full bg-primary px-5 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
              >
                {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Tải tệp mới
              </Button>}
            </div>
          </div>
        </DialogHeader>

        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto bg-background p-8">
          <div className="app-data-table-shell overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow className="border-b border-border/60 bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={canSelectAll}
                      onCheckedChange={toggleAll}
                      disabled={assets.length === 0}
                      className="rounded-[4px]"
                    />
                  </TableHead>
                  <TableHead className="w-[100px] text-center font-medium">Xem trước</TableHead>
                  <TableHead className="font-medium">Tên tệp</TableHead>
                  <TableHead className="w-[120px] text-right font-medium">Dung lượng</TableHead>
                  <TableHead className="w-[100px] text-center font-medium">Truy cập</TableHead>
                  <TableHead className="w-[120px] text-center font-medium">Tham khảo</TableHead>
                  <TableHead className="w-[104px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isInitialLoading ? (
                  renderSkeletonRows(7)
                ) : assets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <File className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-base font-medium">Chưa có file nào</p>
                        <p className="text-sm opacity-80">Hãy upload file mới để bắt đầu sử dụng.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {virtual.paddingTop > 0 && (
                      <TableRow className="border-0 hover:bg-transparent" style={{ height: virtual.paddingTop }}>
                        <TableCell colSpan={7} className="p-0" />
                      </TableRow>
                    )}
                    {virtual.items.map((asset) => (
                      <TableRow key={asset.id} className="group border-b border-border/40 hover:bg-muted/30" style={virtualRowStyle}>
                        <TableCell className="text-center align-middle">
                          <AppTooltip content={asset.is_outline_media ? 'Tệp đang dùng trong cây bài học nên không thể xoá hoặc chuyển riêng tư.' : undefined}><Checkbox
                            checked={selectedIdSet.has(asset.id)}
                            onCheckedChange={() => toggleOne(asset.id)}
                            aria-label={asset.is_outline_media ? 'Tệp đang dùng trong cây bài học nên không thể xoá hoặc chuyển riêng tư.' : undefined}
                            className="rounded-[4px] border-muted-foreground/30 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                          /></AppTooltip>
                        </TableCell>
                        <TableCell className="align-middle">
                          <div className="flex justify-center">
                            {isImageAsset(asset) ? (
                              <div className="flex h-14 w-[80px] items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-black/5 shadow-sm">
                                <img
                                  src={assetUrl(asset)}
                                  alt={asset.display_name}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex h-14 w-[80px] items-center justify-center rounded-lg border border-border/50 bg-muted/30">
                                {getFileIcon(asset.display_name, asset.content_type)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-middle py-4">
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <AppTooltip content={asset.display_name}><span className="line-clamp-1 text-[15px] font-semibold tracking-tight text-foreground" >
                              {asset.display_name}
                            </span></AppTooltip>
                            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
                              <span className="font-medium text-muted-foreground/80">{formatAssetDate(asset.date_added)}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {asset.is_outline_media ? (
                                <span className="inline-flex w-fit items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                                  Đang dùng trong bài học
                                </span>
                              ) : (
                                <span className="inline-flex w-fit items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  Tệp upload trực tiếp
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-middle text-sm font-medium text-muted-foreground/90">
                          {formatFileSize(asset.file_size)}
                        </TableCell>
                        <TableCell className="text-center align-middle">
                          <div className="flex justify-center">
                            {asset.is_locked ?? asset.locked ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                                <Lock className="h-3.5 w-3.5" /> Đã khóa
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                <Unlock className="h-3.5 w-3.5 opacity-70" /> Công khai
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center align-middle">
                          <div className="flex justify-center">
                            {canEdit ? (
                              <AppTooltip content={asset.is_outline_media ? 'Tệp đang dùng trong cây bài học nên không thể chuyển riêng tư.' : undefined}><Checkbox
                                checked={asset.is_reference || false}
                                disabled={refMut.isPending}
                                aria-label={asset.is_outline_media ? 'Tệp đang dùng trong cây bài học nên không thể chuyển riêng tư.' : undefined}
                                onCheckedChange={(checked) => refMut.mutate({ assetIds: [asset.id], isReference: !!checked })}
                                className="rounded-[4px] data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
                              /></AppTooltip>
                            ) : (
                              <Checkbox checked={asset.is_reference || false} disabled className="rounded-[4px]" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <div className="flex justify-end gap-1">
                            <AppTooltip content="Tải xuống"><Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => handleDownloadAsset(asset)}
                              aria-label={`Tải xuống ${asset.display_name}`}

                            >
                              <Download className="h-4 w-4" />
                            </Button></AppTooltip>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-100 transition-opacity hover:bg-muted data-[state=open]:bg-muted md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 md:data-[state=open]:opacity-100">
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-xl border-border/50 shadow-lg">
                                <DropdownMenuItem onClick={() => handleDownloadAsset(asset)} className="cursor-pointer px-3 py-2">
                                  <Download className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">Tải xuống</span>
                                </DropdownMenuItem>
                                {canEdit && <DropdownMenuItem
                                  disabled={asset.is_outline_media}
                                  onClick={() => {
                                    if (asset.is_outline_media) return;
                                    lockMut.mutate({ assetId: asset.id, locked: !(asset.is_locked ?? asset.locked) });
                                  }}
                                  className="cursor-pointer px-3 py-2"
                                >
                                  {asset.is_locked ?? asset.locked ? <Unlock className="mr-2.5 h-4 w-4 text-muted-foreground" /> : <Lock className="mr-2.5 h-4 w-4 text-amber-500" />}
                                  <span className="font-medium">{asset.is_locked ?? asset.locked ? 'Mở khóa file' : 'Khóa file'}</span>
                                </DropdownMenuItem>}
                                {canDelete && <DropdownMenuItem
                                  className="cursor-pointer px-3 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  disabled={asset.is_outline_media}
                                  onClick={() => {
                                    if (asset.is_outline_media) return;
                                    deleteMut.mutate(asset.id);
                                  }}
                                >
                                  <Trash2 className="mr-2.5 h-4 w-4" />
                                  <span className="font-medium">Xóa file</span>
                                </DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {virtual.paddingBottom > 0 && (
                      <TableRow className="border-0 hover:bg-transparent" style={{ height: virtual.paddingBottom }}>
                        <TableCell colSpan={7} className="p-0" />
                      </TableRow>
                    )}
                    {isLoadingMore && renderSkeletonRows(3)}
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          {assets.length > 0 && (
            <div className="flex items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
              <span>{hasMoreAssets ? 'Còn tệp phía dưới' : 'Đã tải hết danh sách hiện có'}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMoreAssets || isLoadingMore}
                onClick={() => fetchMoreAssets()}
                className="gap-2"
              >
                {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 rotate-180" />}
                {isLoadingMore ? 'Đang tải...' : 'Tải thêm'}
              </Button>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.xlsx,.docx"
            onChange={handleFileChange}
          />
        </div>

        {selectedAssets.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/50 px-6 py-3">
            <span className="text-sm font-medium">Đã chọn {selectedAssets.length} tệp</span>
            <div className="flex items-center gap-2">
              {canEdit && <Button size="sm" variant="outline" className="gap-2" onClick={() => handleBulkReference(true)} disabled={isBulkOperating}>
                <FileText className="h-4 w-4" /> Bật tham khảo
              </Button>}
              {canEdit && <Button size="sm" variant="outline" className="gap-2" onClick={() => handleBulkReference(false)} disabled={isBulkOperating}>
                <FileText className="h-4 w-4 opacity-50" /> Tắt tham khảo
              </Button>}
              {canEdit && <Button size="sm" variant="outline" className="gap-2" onClick={() => handleBulkLock(true)} disabled={isBulkOperating}>
                <Lock className="h-4 w-4" /> Khóa
              </Button>}
              {canEdit && <Button size="sm" variant="outline" className="gap-2" onClick={() => handleBulkLock(false)} disabled={isBulkOperating}>
                <Unlock className="h-4 w-4" /> Mở khóa
              </Button>}
              {canDelete && <Button size="sm" variant="destructive" className="gap-2" onClick={handleBulkDelete} disabled={isBulkOperating}>
                {isBulkOperating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Xóa đã chọn
              </Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}