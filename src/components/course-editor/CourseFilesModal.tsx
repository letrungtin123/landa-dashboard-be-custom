import React, { useRef, useState } from 'react';
import { storageUrl } from '@/utils/storage-url';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  type CourseAsset
} from '@/api/custom-course-authoring';
import { useAuthStore } from '@/utils/store';

interface CourseFilesModalProps {
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CourseFilesModal({ courseId, isOpen, onClose }: CourseFilesModalProps) {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission('courses', 'can_edit');
  const canDelete = hasPermission('courses', 'can_delete');
  
  const getFileIcon = (fileName: string, contentType: string = '') => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext.match(/(jpg|jpeg|png|gif|svg|webp)/i) || contentType.startsWith('image/')) {
      return <FileImage className="w-6 h-6 text-indigo-500" />;
    }
    if (ext.match(/(pdf)/i)) return <FileText className="w-6 h-6 text-red-500" />;
    if (ext.match(/(doc|docx)/i)) return <FileText className="w-6 h-6 text-blue-500" />;
    if (ext.match(/(xls|xlsx|csv)/i)) return <FileSpreadsheet className="w-6 h-6 text-emerald-500" />;
    if (ext.match(/(mp4|webm|mov)/i) || contentType.startsWith('video/')) return <FileVideo className="w-6 h-6 text-purple-500" />;
    if (ext.match(/(mp3|wav|ogg)/i) || contentType.startsWith('audio/')) return <FileAudio className="w-6 h-6 text-yellow-500" />;
    if (ext.match(/(zip|rar|tar|gz|7z)/i)) return <FileArchive className="w-6 h-6 text-amber-600" />;
    if (ext.match(/(js|ts|jsx|tsx|json|html|css|xml)/i)) return <FileCode className="w-6 h-6 text-slate-500" />;
    return <File className="w-6 h-6 text-muted-foreground/60" />;
  };

  const isImage = (asset: CourseAsset) => {
    return asset.content_type?.toLowerCase().startsWith('image/') || asset.display_name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i);
  };

  const assetUrl = (asset: CourseAsset) => storageUrl(asset.url);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkOperating, setIsBulkOperating] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['course-assets', courseId, page],
    queryFn: () => getCourseAssets(courseId, page, 50),
    enabled: isOpen && !!courseId,
  });

  const assets = data?.assets || [];
  const totalCount = data?.totalCount || 0;

  // Upload Mutation
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

  // Delete Mutation
  const deleteMut = useMutation({
    mutationFn: (assetId: string) => deleteCourseAsset(courseId, assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
      toast.success('Đã xóa tệp');
      setSelectedIds([]);
    },
    onError: () => toast.error('Xóa tệp thất bại')
  });

  // Lock Mutation
  const lockMut = useMutation({
    mutationFn: ({ assetId, locked }: { assetId: string, locked: boolean }) =>
      updateCourseAssetLock(courseId, assetId, locked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
      toast.success('Đã cập nhật trạng thái khóa');
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
    if (selectedIds.length === assets.length) setSelectedIds([]);
    else setSelectedIds(assets.map(a => a.id));
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Bạn có chắc muốn xóa ${selectedIds.length} file đã chọn?`)) return;
    setIsBulkOperating(true);
    try {
      await Promise.all(selectedIds.map(id => deleteCourseAsset(courseId, id)));
      toast.success(`Đã xóa ${selectedIds.length} file`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
    } catch (error) {
      toast.error('Có lỗi xảy ra khi xóa hàng loạt');
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleBulkLock = async (locked: boolean) => {
    setIsBulkOperating(true);
    try {
      await Promise.all(selectedIds.map(id => updateCourseAssetLock(courseId, id, locked)));
      toast.success(`Đã ${locked ? 'khóa' : 'mở khóa'} ${selectedIds.length} file`);
      queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] });
    } catch (error) {
      toast.error('Có lỗi xảy ra khi cập nhật trạng thái');
    } finally {
      setIsBulkOperating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Đã copy đường dẫn URL');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[1100px] w-[95vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border border-border/50 shadow-2xl rounded-xl">
          <DialogHeader className="px-8 py-6 border-b border-border/40 shrink-0 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">Files & Uploads</DialogTitle>
                <p className="text-sm text-muted-foreground">Showing {assets.length} of {totalCount} assets</p>
              </div>
              <div className="flex gap-3">
                {canEdit && <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMut.isPending}
                  size="default"
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm font-medium px-5 rounded-full transition-all"
                >
                  {uploadMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Upload New File
                </Button>}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto bg-background p-8">
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/60">
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={assets.length > 0 && selectedIds.length === assets.length}
                        onCheckedChange={toggleAll}
                        className="rounded-[4px]"
                      />
                    </TableHead>
                    <TableHead className="w-[100px] text-center font-medium">Preview</TableHead>
                    <TableHead className="font-medium">File name</TableHead>
                    <TableHead className="w-[120px] font-medium text-right">Size</TableHead>
                    <TableHead className="w-[100px] text-center font-medium">Access</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={isFetching ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="border-b border-border/40">
                        <TableCell><Skeleton className="h-4 w-4 mx-auto rounded-md" /></TableCell>
                        <TableCell><Skeleton className="h-14 w-[80px] rounded-lg mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-48 mb-2" /><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 mx-auto rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8 ml-auto rounded-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : assets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <File className="w-6 h-6 text-muted-foreground/50" />
                          </div>
                          <p className="text-base font-medium">Chưa có file nào</p>
                          <p className="text-sm opacity-80">Hãy upload file mới để bắt đầu sử dụng.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    assets.map((asset) => (
                      <TableRow key={asset.id} className="group border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <TableCell className="text-center align-middle">
                          <Checkbox
                            checked={selectedIds.includes(asset.id)}
                            onCheckedChange={() => toggleOne(asset.id)}
                            className="rounded-[4px] border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </TableCell>
                        <TableCell className="align-middle">
                          <div className="flex justify-center">
                            {isImage(asset) ? (
                              <div className="h-14 w-[80px] rounded-lg border border-border/50 bg-black/5 flex items-center justify-center overflow-hidden shadow-sm">
                                <img src={assetUrl(asset)} alt={asset.display_name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                              </div>
                            ) : (
                              <div className="h-14 w-[80px] rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center">
                                {getFileIcon(asset.display_name, asset.content_type)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-middle py-4">
                          <div className="flex flex-col gap-1.5">
                            <span className="font-semibold text-[15px] text-foreground tracking-tight line-clamp-1" title={asset.display_name}>
                              {asset.display_name}
                            </span>
                            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
                              <span className="font-medium text-muted-foreground/80">{asset.date_added}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-middle font-medium text-muted-foreground/90 text-sm">
                          {asset.file_size ? (asset.file_size / 1024).toFixed(1) + ' KB' : '--'}
                        </TableCell>
                        <TableCell className="text-center align-middle">
                          <div className="flex justify-center">
                            {asset.is_locked ?? asset.locked ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                                <Lock className="w-3.5 h-3.5" /> Locked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground bg-muted/50">
                                <Unlock className="w-3.5 h-3.5 opacity-70" /> Public
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-muted data-[state=open]:opacity-100 data-[state=open]:bg-muted">
                                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 shadow-lg rounded-xl border-border/50">
                              <DropdownMenuItem onClick={() => window.open(assetUrl(asset), '_blank')} className="cursor-pointer py-2 px-3">
                                <Download className="w-4 h-4 mr-2.5 text-muted-foreground" />
                                <span className="font-medium">Tải xuống</span>
                              </DropdownMenuItem>
                              {canEdit && <DropdownMenuItem onClick={() => lockMut.mutate({ assetId: asset.id, locked: !(asset.is_locked ?? asset.locked) })} className="cursor-pointer py-2 px-3">
                                {asset.is_locked ?? asset.locked ? <Unlock className="w-4 h-4 mr-2.5 text-muted-foreground" /> : <Lock className="w-4 h-4 mr-2.5 text-amber-500" />}
                                <span className="font-medium">{asset.is_locked ?? asset.locked ? 'Mở khóa file' : 'Khóa file'}</span>
                              </DropdownMenuItem>}
                              {canDelete && <DropdownMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer py-2 px-3"
                                onClick={() => deleteMut.mutate(asset.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2.5" />
                                <span className="font-medium">Xóa file</span>
                              </DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.xlsx,.docx"
              onChange={handleFileChange}
            />
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.length > 0 && (
            <div className="bg-muted/50 border-t px-6 py-3 flex items-center justify-between shrink-0">
              <span className="text-sm font-medium">Đã chọn {selectedIds.length} tệp</span>
              <div className="flex items-center gap-2">
                {canEdit && <Button size="sm" variant="outline" className="gap-2" onClick={() => handleBulkLock(true)} disabled={isBulkOperating}>
                  <Lock className="w-4 h-4" /> Khóa
                </Button>}
                {canEdit && <Button size="sm" variant="outline" className="gap-2" onClick={() => handleBulkLock(false)} disabled={isBulkOperating}>
                  <Unlock className="w-4 h-4" /> Mở khóa
                </Button>}
                {canDelete && <Button size="sm" variant="destructive" className="gap-2" onClick={handleBulkDelete} disabled={isBulkOperating}>
                  {isBulkOperating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Xóa đã chọn
                </Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
