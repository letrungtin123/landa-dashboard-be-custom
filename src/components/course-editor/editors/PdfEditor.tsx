import React, { useState, useRef } from 'react';
import { FileText, ExternalLink, Upload, Link2, Loader2, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import { deleteCourseAsset, deleteCourseAssetByStoragePath, uploadCourseAsset } from '@/api/custom-course-authoring';
import { toast } from 'sonner';
import { cn } from '@/utils/utils';
import { COURSE_ASSET_MAX_UPLOAD_BYTES, COURSE_ASSET_MAX_UPLOAD_LABEL } from '@/utils/course-asset-upload';
import { extractPdfStoragePath, getPdfFileName, isUploadedPdfAssetUrl, resolvePdfEmbedUrl, resolvePdfFileUrl } from '@/utils/pdf-url';
import { useTranslation } from 'react-i18next';
import { getLocalizedApiError } from '@/utils/localized-error';

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
  const { t } = useTranslation();
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
      toast.error(t('courseEditorForms.pdfOnly'));
      return;
    }

    if (file.size > COURSE_ASSET_MAX_UPLOAD_BYTES) {
      toast.error(t('courseEditorForms.fileTooLarge', { size: COURSE_ASSET_MAX_UPLOAD_LABEL }));
      return;
    }

    if (!courseId) {
      toast.error(t('courseEditorForms.courseIdRequired'));
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
          toast.success(t('courseEditorForms.uploadSavedDraft', { name: file.name }));
        } catch (saveErr) {
          const uploadedPath = extractPdfStoragePath(storedPdfUrl);
          if (uploadedPath) await deleteCourseAssetByStoragePath(courseId, uploadedPath).catch(() => {});
          onPdfUrlChange(previousPdfUrl);
          setUploadedFileName(previousFileName);
          throw saveErr;
        }
      } else {
        toast.error(t('courseEditorForms.uploadMissingUrl'));
      }
    } catch (err: any) {
      toast.error(t('courseEditorForms.uploadFailed', {
        message: getLocalizedApiError(err, t('courseUnit.unknownError')),
      }));
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
      toast.success(t('courseEditorForms.pdfRemoved'));
    } catch (err) {
      onPdfUrlChange(previousPdfUrl);
      setUploadedFileName(previousFileName);
      toast.error(t('courseEditorForms.pdfRemoveSaveFailed'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const embedUrl = mode === 'link' ? resolvePdfEmbedUrl(pdfUrl) : '';
  const fileUrl = resolvePdfFileUrl(pdfUrl);

  return (
    <div className="space-y-5">
      <Field label={t('courseUnit.displayName')}>
        <input
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      {/* ── Mode Selector ── */}
      <div className="space-y-3">
        <label className="text-sm font-medium">{t('courseEditorForms.pdfSource')}</label>
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
              <p className="text-sm font-semibold">{t('courseEditorForms.enterUrl')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('courseEditorForms.directOrGoogleDriveUrl')}</p>
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
              <p className="text-sm font-semibold">{t('courseEditorForms.uploadPdf')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('courseEditorForms.uploadFromComputer', { size: COURSE_ASSET_MAX_UPLOAD_LABEL })}</p>
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
              {t('courseEditorForms.pdfLink')}
            </label>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
              value={pdfUrl}
              onChange={e => onPdfUrlChange(e.target.value)}
              placeholder={t('courseEditorForms.pdfUrlPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('courseEditorForms.pdfUrlHint')}
            </p>
          </div>

          {/* Preview */}
          {embedUrl ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">{t('courseEditorForms.preview')}</label>
                <a
                  href={fileUrl || pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {t('courseEditorForms.openNewTab')} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="app-liquid-card border border-border rounded-xl overflow-hidden bg-muted/30">
                <iframe
                  src={embedUrl}
                  title={t('courseEditorForms.pdfPreviewTitle')}
                  className="w-full h-[400px]"
                  allow="autoplay"
                />
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{t('courseEditorForms.pdfPreviewHint')}</p>
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
                  <p className="text-sm font-medium text-primary">{t('courseEditorForms.uploading')}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60">
                    <Upload className="h-7 w-7 text-muted-foreground/60" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">{t('courseEditorForms.choosePdf')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('courseEditorForms.pdfFormatHint', { size: COURSE_ASSET_MAX_UPLOAD_LABEL })}</p>
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
              {t('courseEditorForms.chooseOtherFile')}
            </Button>
          )}
        </div>
      )}

      <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
        <strong>{t('courseEditorForms.note')}</strong>{' '}
        {mode === 'link'
          ? t('courseEditorForms.pdfPublicNote')
          : t('courseEditorForms.pdfStorageNote')}
      </div>
    </div>
  );
}
