import React, { useRef } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  deleteCourseAssetByStoragePath,
  updateXBlock,
  uploadCourseAsset,
} from '@/api/custom-course-authoring';
import { htmlImageDisplaySrc, htmlImageStoragePath } from '@/utils/storage-url';
import ImageCarousel from '../ImageCarousel';
import RichTextEditor from '../RichTextEditor';
import {
  getHtmlMediaImages,
  htmlMediaCarouselImages,
  htmlMediaMetadata,
  type HtmlMediaImage,
} from '../htmlMedia';
import { Field } from './VideoEditor';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deletingPath, setDeletingPath] = React.useState<string | null>(null);

  const uploadedImages = React.useMemo(() => getHtmlMediaImages(metadata), [metadata]);
  const carouselImages = React.useMemo(() => htmlMediaCarouselImages(uploadedImages), [uploadedImages]);

  const persistImages = React.useCallback(async (nextImages: HtmlMediaImage[]) => {
    if (!blockId) throw new Error('Block ID khong hop le');
    const nextMetadata = htmlMediaMetadata(metadata, nextImages);
    await updateXBlock(blockId, { metadata: nextMetadata });
    onMetadataChange(nextMetadata);
    onImmediateSaved?.();
  }, [blockId, metadata, onImmediateSaved, onMetadataChange]);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);

    let uploadedPath = '';
    try {
      const result = await uploadCourseAsset(courseId, file);
      uploadedPath = htmlImageStoragePath(result?.url) || '';
      if (!uploadedPath) throw new Error('Upload response khong co storage path');

      const exists = uploadedImages.some((image) => image.src === uploadedPath);
      const nextImages = exists
        ? uploadedImages
        : [
            ...uploadedImages,
            {
              src: uploadedPath,
              alt: file.name,
              ...(typeof result?.id === 'string' ? { asset_id: result.id } : {}),
            },
          ];

      await persistImages(nextImages);
      toast.success('Da upload va luu anh');
    } catch (err: any) {
      if (uploadedPath) {
        deleteCourseAssetByStoragePath(courseId, uploadedPath).catch(() => {});
      }
      toast.error('Upload anh that bai: ' + (err?.response?.data?.message || err?.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (image: HtmlMediaImage) => {
    setDeletingPath(image.src);
    try {
      const nextImages = uploadedImages.filter((item) => item.src !== image.src);
      await persistImages(nextImages);
      await deleteCourseAssetByStoragePath(courseId, image.src);
      toast.success('Da xoa anh');
    } catch (err: any) {
      toast.error('Xoa anh that bai: ' + (err?.response?.data?.message || err?.response?.data?.error || err.message));
    } finally {
      setDeletingPath(null);
    }
  };

  return (
    <div className="space-y-6">
      <Field label="Ten hien thi">
        <input
          className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:bg-background focus:border-primary focus:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      <Field label="Anh upload rieng">
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="default"
              size="sm"
              className="gap-2 h-9 rounded-lg px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !courseId || !blockId}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Upload anh
            </Button>
            <span className="text-xs text-muted-foreground/80 font-medium">
              Anh upload o day duoc luu ngay sau khi upload thanh cong. Khi co tu 2 anh, hai FE se hien thi dang carousel.
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
              Chua co anh upload rieng.
            </div>
          ) : (
            <div className="space-y-4">
              {carouselImages.length >= 2 ? (
                <ImageCarousel images={carouselImages} />
              ) : (
                <div className="rounded-lg border border-border bg-background p-2">
                  <img
                    src={htmlImageDisplaySrc(uploadedImages[0].src)}
                    alt={uploadedImages[0].alt || 'Uploaded image'}
                    className="max-h-[280px] w-full rounded-md object-contain"
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {uploadedImages.map((image) => (
                  <div key={image.src} className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
                    <div className="flex h-32 items-center justify-center bg-muted/30 p-2">
                      <img
                        src={htmlImageDisplaySrc(image.src)}
                        alt={image.alt || 'Uploaded image'}
                        className="max-h-full max-w-full rounded object-contain"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border p-2">
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {image.alt || image.src.split('/').pop()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteImage(image)}
                        disabled={deletingPath === image.src}
                        aria-label="Xoa anh upload"
                      >
                        {deletingPath === image.src
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Field>

      <Field label="Noi dung bai hoc (Rich Text + anh paste tu web)">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Noi dung HTML ben duoi chi duoc luu khi bam nut Luu thay doi. Anh paste tu website khac se giu nguyen vi tri trong HTML va khong bi dua vao carousel.
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
  return (
    <RichTextEditor
      content={content}
      onChange={onChange}
      onUnsupportedImagePaste={() => {
        toast.warning('Clipboard image khong co URL ben ngoai. Hay dung nut Upload anh de luu anh vao he thong.');
      }}
    />
  );
}
