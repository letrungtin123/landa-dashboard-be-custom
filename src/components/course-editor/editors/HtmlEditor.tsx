import React, { useEffect, useRef } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  deleteCourseAssetByStoragePath,
  updateXBlock,
  uploadCourseAsset,
} from '@/api/custom-course-authoring';
import { htmlImageDisplaySrc, htmlImageStoragePath } from '@/utils/storage-url';
import ImageCarousel from '../ImageCarousel';
import CarouselImageOrder from '../CarouselImageOrder';
import RichTextEditor from '../RichTextEditor';
import {
  getHtmlMediaImages,
  htmlMediaCarouselImages,
  htmlMediaMetadata,
  type HtmlMediaImage,
} from '../htmlMedia';
import { Field } from './VideoEditor';
import { useTranslation } from 'react-i18next';
import { getLocalizedApiError } from '@/utils/localized-error';

interface HtmlEditorProps {
  blockId: string;
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  htmlContent: string;
  onHtmlChange: (v: string) => void;
  metadata: Record<string, any>;
  onMetadataChange: (v: Record<string, any>) => void;
  courseId: string;
  onImmediateSaved?: () => void;
}

export default function HtmlEditor({
  blockId,
  displayName,
  onDisplayNameChange,
  htmlContent,
  onHtmlChange,
  metadata,
  onMetadataChange,
  courseId,
  onImmediateSaved,
}: HtmlEditorProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deletingPath, setDeletingPath] = React.useState<string | null>(null);

  const uploadedImages = React.useMemo(() => getHtmlMediaImages(metadata), [metadata]);
  const carouselImages = React.useMemo(() => htmlMediaCarouselImages(uploadedImages), [uploadedImages]);
  const metadataRef = useRef<Record<string, any>>(metadata);
  const uploadedImagesRef = useRef<HtmlMediaImage[]>(uploadedImages);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);
  useEffect(() => {
    uploadedImagesRef.current = uploadedImages;
  }, [uploadedImages]);

  const persistImages = React.useCallback(async (nextImages: HtmlMediaImage[]) => {
    if (!blockId) throw new Error(t('courseEditorForms.invalidBlockId'));
    const nextMetadata = htmlMediaMetadata(metadataRef.current, nextImages);
    const run = saveQueueRef.current.then(async () => {
      await updateXBlock(blockId, { metadata: nextMetadata });
    });
    saveQueueRef.current = run.catch(() => {});
    await run;
    metadataRef.current = nextMetadata;
    uploadedImagesRef.current = nextImages;
    onMetadataChange(nextMetadata);
    onImmediateSaved?.();
  }, [blockId, onImmediateSaved, onMetadataChange, t]);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);

    let uploadedPath = '';
    try {
      const result = await uploadCourseAsset(courseId, file);
      uploadedPath = htmlImageStoragePath(result?.url) || '';
      if (!uploadedPath) throw new Error(t('courseEditorForms.uploadResponseMissingPath'));

      const currentImages = uploadedImagesRef.current;
      const exists = currentImages.some((image) => image.src === uploadedPath);
      const nextImages = exists
        ? currentImages
        : [
            ...currentImages,
            {
              src: uploadedPath,
              alt: file.name,
              ...(typeof result?.id === 'string' ? { asset_id: result.id } : {}),
            },
          ];

      await persistImages(nextImages);
      toast.success(t('courseEditorForms.imageUploaded'));
    } catch (err: any) {
      if (uploadedPath) {
        deleteCourseAssetByStoragePath(courseId, uploadedPath).catch(() => {});
      }
      toast.error(t('courseEditorForms.imageUploadFailed', {
        message: getLocalizedApiError(err, t('courseUnit.unknownError')),
      }));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (image: HtmlMediaImage) => {
    setDeletingPath(image.src);
    try {
      const currentImages = uploadedImagesRef.current;
      const nextImages = currentImages.filter((item) => item.src !== image.src);
      await persistImages(nextImages);
      await deleteCourseAssetByStoragePath(courseId, image.src);
      toast.success(t('courseEditorForms.imageDeleted'));
    } catch (err: any) {
      toast.error(t('courseEditorForms.imageDeleteFailed', {
        message: getLocalizedApiError(err, t('courseUnit.unknownError')),
      }));
    } finally {
      setDeletingPath(null);
    }
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    const nextImages = [...uploadedImagesRef.current];
    const [moved] = nextImages.splice(fromIndex, 1);
    if (!moved) return;
    nextImages.splice(toIndex, 0, moved);

    persistImages(nextImages)
      .then(() => toast.success(t('courseEditorForms.imageOrderUpdated')))
      .catch((err: any) => {
        toast.error(t('courseEditorForms.imageOrderFailed', {
          message: getLocalizedApiError(err, t('courseUnit.unknownError')),
        }));
      });
  };

  return (
    <div className="space-y-6">
      <Field label={t('courseUnit.displayName')}>
        <input
          className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:bg-background focus:border-primary focus:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      <Field label={t('courseEditorForms.uploadedImages')}>
        <div className="app-liquid-card space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="default"
              size="sm"
              className="gap-2 h-9 rounded-lg px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !courseId || !blockId}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {t('courseEditorForms.uploadImage')}
            </Button>
            <span className="text-xs text-muted-foreground/80 font-medium">
              {t('courseEditorForms.uploadedImageHint')}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
          </div>

          {uploadedImages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-6 text-center text-sm text-muted-foreground">
              {t('courseEditorForms.noUploadedImages')}
            </div>
          ) : (
            <div className="space-y-4">
              {carouselImages.length >= 2 ? (
                <ImageCarousel images={carouselImages} />
              ) : (
                <div className="app-liquid-card rounded-lg border border-border bg-background p-2">
                  <img
                    src={htmlImageDisplaySrc(uploadedImages[0].src)}
                    alt={uploadedImages[0].alt || 'Uploaded image'}
                    className="max-h-[280px] w-full rounded-md object-contain"
                  />
                </div>
              )}

              <CarouselImageOrder
                images={uploadedImages.map((image) => ({
                  id: image.src,
                  src: htmlImageDisplaySrc(image.src),
                  alt: image.alt || image.src.split('/').pop(),
                  isDeleting: deletingPath === image.src,
                }))}
                onMove={handleMoveImage}
                onRemove={(idx) => {
                  const image = uploadedImages[idx];
                  if (image) handleDeleteImage(image);
                }}
              />
            </div>
          )}
        </div>
      </Field>

      <Field label={t('courseEditorForms.lessonContent')}>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t('courseEditorForms.lessonContentHint')}
        </p>
        <div className="rounded-xl overflow-hidden border border-input bg-background shadow-sm focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary transition-all duration-200">
          <RichTextEditorWithRef
            content={htmlContent}
            onChange={onHtmlChange}
          />
        </div>
      </Field>
    </div>
  );
}

function RichTextEditorWithRef({
  content, onChange,
}: {
  content: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <RichTextEditor
      content={content}
      onChange={onChange}
      onUnsupportedImagePaste={() => {
        toast.warning(t('courseEditorForms.clipboardExternalUrlNeeded'));
      }}
    />
  );
}
