import React, { useState, useRef } from 'react';
import { FileText, ExternalLink, Upload, Link2, Loader2, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import { deleteCourseAsset, deleteCourseAssetByStoragePath, uploadCourseAsset } from '@/api/custom-course-authoring';
import { toast } from 'sonner';
import { cn } from '@/utils/utils';
import { COURSE_ASSET_MAX_UPLOAD_BYTES, COURSE_ASSET_MAX_UPLOAD_LABEL } from '@/utils/course-asset-upload';
import { extractPdfStoragePath, getPdfFileName, isUploadedPdfAssetUrl, resolvePdfEmbedUrl, resolvePdfFileUrl } from '@/utils/pdf-url';

interface PdfEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  pdfUrl: string;
  onPdfUrlChange: (v: string) => void;
  courseId?: string;
  onAutoSave?: (nextPdfUrl: string) => void | Promise<void>;
}

type InputMode = 'link' | 'upload';

/**
 * PdfEditor — Admin editor cho PDF XBlock.
 * 2 chế độ: nhập link Google Drive HOẶC upload file PDF trực tiếp.
 */
export default function PdfEditor({
  displayName, onDisplayNameChange,
  pdfUrl, onPdfUrlChange,
  courseId,
  onAutoSave,
}: PdfEditorProps) {
  // Detect mode dựa vào URL hiện tại, bao gồm storage path mới của backend.
  const isAssetUrl = isUploadedPdfAssetUrl(pdfUrl);
  const [mode, setMode] = useState<InputMode>(isAssetUrl ? 'upload' : 'link');
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>(() => (
    isAssetUrl ? getPdfFileName(pdfUrl) : ''
  ));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Chỉ chấp nhận file PDF');
      return;
    }

    if (file.size > COURSE_ASSET_MAX_UPLOAD_BYTES) {
      toast.error(`File quá lớn (tối đa ${COURSE_ASSET_MAX_UPLOAD_LABEL})`);
      return;
    }

    if (!courseId) {
      toast.error('Không xác định được course ID');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadCourseAsset(courseId, file);
      const assetUrl = result?.asset?.storage_path || result?.storage_path || result?.asset?.url || result?.url || '';
      const storedPdfUrl = extractPdfStoragePath(assetUrl) || assetUrl;
      if (storedPdfUrl) {
        const previousPdfUrl = pdfUrl;
        const previousFileName = uploadedFileName;
        onPdfUrlChange(storedPdfUrl);
        setUploadedFileName(file.name);
        try {
          await onAutoSave?.(storedPdfUrl);
          toast.success(`Đã upload và lưu draft: ${file.name}`);
        } catch (saveErr) {
          const uploadedPath = extractPdfStoragePath(storedPdfUrl);
          if (uploadedPath) await deleteCourseAssetByStoragePath(courseId, uploadedPath).catch(() => {});
          onPdfUrlChange(previousPdfUrl);
          setUploadedFileName(previousFileName);
          throw saveErr;
        }
      } else {
        toast.error('Upload thành công nhưng không nhận được URL');
      }
    } catch (err: any) {
      toast.error(`Upload thất bại: ${err?.message || 'Lỗi không rõ'}`);
    } finally {
      setUploading(false);
      // Reset input để cho phép chọn lại cùng file
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearUpload = async () => {
    const previousPdfUrl = pdfUrl;
    const previousFileName = uploadedFileName;
    const storagePath = extractPdfStoragePath(pdfUrl);
    const legacyAssetKey = !storagePath && (pdfUrl.includes('/asset-v1:') || pdfUrl.includes('/c4x/'))
      ? getPdfFileName(pdfUrl, '')
      : '';

    onPdfUrlChange('');
    setUploadedFileName('');
    try {
      await onAutoSave?.('');
      if (courseId) {
        try {
          if (storagePath) {
            await deleteCourseAssetByStoragePath(courseId, storagePath);
          } else if (legacyAssetKey) {
            await deleteCourseAsset(courseId, legacyAssetKey);
          }
        } catch (err) {
          console.warn('Failed to delete course asset:', err);
        }
      }
      toast.success('Đã gỡ tài liệu PDF khỏi draft');
    } catch (err) {
      onPdfUrlChange(previousPdfUrl);
      setUploadedFileName(previousFileName);
      toast.error('Không thể lưu thay đổi gỡ tài liệu PDF');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const embedUrl = mode === 'link' ? resolvePdfEmbedUrl(pdfUrl) : '';
  const fileUrl = resolvePdfFileUrl(pdfUrl);

  return (
    <div className="space-y-5">
      <Field label="Tên hiển thị">
        <input
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      {/* ── Mode Selector ── */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Nguồn tài liệu PDF</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setMode('link'); if (isAssetUrl) void clearUpload(); }}
            className={cn(
              "flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left",
              mode === 'link'
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-background hover:border-primary/30 hover:bg-muted/30"
            )}
          >
            <div className={cn(
              "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
              mode === 'link' ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Nhập link URL</p>
              <p className="text-xs text-muted-foreground mt-0.5">Google Drive hoặc URL trực tiếp</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { setMode('upload'); if (!isAssetUrl) onPdfUrlChange(''); setUploadedFileName(''); }}
            className={cn(
              "flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left",
              mode === 'upload'
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-background hover:border-primary/30 hover:bg-muted/30"
            )}
          >
            <div className={cn(
              "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
              mode === 'upload' ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Upload file PDF</p>
              <p className="text-xs text-muted-foreground mt-0.5">Tải lên từ máy tính (tối đa {COURSE_ASSET_MAX_UPLOAD_LABEL})</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Link Mode ── */}
      {mode === 'link' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-500" />
              Link PDF
            </label>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
              value={pdfUrl}
              onChange={e => onPdfUrlChange(e.target.value)}
              placeholder="https://drive.google.com/file/d/.../view"
            />
            <p className="text-xs text-muted-foreground">
              Dán link Google Drive public share hoặc URL trực tiếp đến file .pdf.
            </p>
          </div>

          {/* Preview */}
          {embedUrl ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Xem trước</label>
                <a
                  href={fileUrl || pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Mở trong tab mới <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
                <iframe
                  src={embedUrl}
                  title="PDF Preview"
                  className="w-full h-[400px]"
                  allow="autoplay"
                />
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nhập link PDF ở trên để xem trước nội dung tài liệu.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Upload Mode ── */}
      {mode === 'upload' && (
        <div className="space-y-3">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileUpload}
          />

          {uploadedFileName && pdfUrl ? (
            // Đã upload — hiển thị info
            <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/15 shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300 truncate">
                  {uploadedFileName}
                </p>
                <p className="text-xs text-green-600/70 dark:text-green-400/70 font-mono truncate mt-0.5">
                  {pdfUrl}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-green-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={clearUpload}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            // Chưa upload — drop zone
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "w-full flex flex-col items-center gap-3 p-10 rounded-xl border-2 border-dashed transition-all",
                uploading
                  ? "border-primary/40 bg-primary/5 cursor-wait"
                  : "border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
              )}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm font-medium text-primary">Đang upload...</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60">
                    <Upload className="h-7 w-7 text-muted-foreground/60" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Nhấn để chọn file PDF</p>
                    <p className="text-xs text-muted-foreground mt-1">Hỗ trợ file .pdf, tối đa {COURSE_ASSET_MAX_UPLOAD_LABEL}</p>
                  </div>
                </>
              )}
            </button>
          )}

          {/* Chọn file khác */}
          {uploadedFileName && pdfUrl && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5" />
              Chọn file khác
            </Button>
          )}
        </div>
      )}

      <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
        <strong>Lưu ý:</strong>{' '}
        {mode === 'link'
          ? 'Đảm bảo file PDF đã được chia sẻ công khai (public) trên Google Drive.'
          : 'File upload sẽ được lưu trữ trên hệ thống cùng với course.'}
      </div>
    </div>
  );
}
