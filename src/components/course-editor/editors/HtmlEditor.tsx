import React, { useRef } from 'react';
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
    if (!blockId) throw new Error('Block ID không hợp lệ');
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
      if (!uploadedPath) throw new Error('Upload response không có storage path');

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
      toast.success('Đã upload và lưu ảnh');
    } catch (err: any) {
      if (uploadedPath) {
        deleteCourseAssetByStoragePath(courseId, uploadedPath).catch(() => {});
      }
      toast.error('Upload ảnh thất bại: ' + (err?.response?.data?.message || err?.response?.data?.error || err.message));
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
      toast.success('Đã xóa ảnh');
    } catch (err: any) {
      toast.error('Xóa ảnh thất bại: ' + (err?.response?.data?.message || err?.response?.data?.error || err.message));
    } finally {
      setDeletingPath(null);
    }
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    const nextImages = [...uploadedImages];
    const [moved] = nextImages.splice(fromIndex, 1);
    if (!moved) return;
    nextImages.splice(toIndex, 0, moved);

    persistImages(nextImages)
      .then(() => toast.success('Đã cập nhật thứ tự ảnh'))
      .catch((err: any) => {
        toast.error('Cập nhật thứ tự ảnh thất bại: ' + (err?.response?.data?.message || err?.response?.data?.error || err.message));
      });
  };

  return (
    <div className="space-y-6">
      <Field label="Tên hiển thị">
        <input
          className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:bg-background focus:border-primary focus:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      <Field label="Ảnh upload riêng">
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
              Upload ảnh
            </Button>
            <span className="text-xs text-muted-foreground/80 font-medium">
              Ảnh upload ở đây được lưu ngay sau khi upload thành công. Khi có từ 2 ảnh, hai FE sẽ hiển thị dạng carousel.
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
              Chưa có ảnh upload riêng.
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

      <Field label="Nội dung bài học (Rich Text + ảnh paste từ web)">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Nội dung HTML bên dưới chỉ được lưu khi bấm nút Lưu thay đổi. Ảnh paste từ website khác sẽ giữ nguyên vị trí trong HTML và không bị đưa vào carousel.
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
        toast.warning('Clipboard image không có URL bên ngoài. Hãy dùng nút Upload ảnh để lưu ảnh vào hệ thống.');
      }}
    />
  );
}
