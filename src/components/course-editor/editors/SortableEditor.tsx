import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, ImagePlus, Loader2, Video, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import { uploadCourseAsset, deleteCourseAssetByStoragePath } from '@/api/custom-course-authoring';
import { toast } from 'sonner';
import { storageUrl } from '@/utils/storage-url';
import { COURSE_ASSET_MAX_UPLOAD_BYTES, COURSE_ASSET_MAX_UPLOAD_LABEL } from '@/utils/course-asset-upload';
import ImageCarousel from '../ImageCarousel';
import UploadedVideoPreview from '../UploadedVideoPreview';
import CarouselImageOrder from '../CarouselImageOrder';
import {
  extractYoutubeId,
  normalizeProblemMedia,
  resolveProblemMediaImageUrl,
  toYoutubeUrl,
  type ProblemMedia,
} from '../problemMedia';

interface SortableItem {
  id: number;
  text: string;
}

interface SortableEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  questionText: string;
  onQuestionChange: (v: string) => void;
  items: SortableItem[];
  onItemsChange: (items: SortableItem[]) => void;
  problemMedia?: ProblemMedia;
  onProblemMediaChange?: (v: ProblemMedia) => void;
  courseId?: string;
  onAutoSave?: (nextMedia: ProblemMedia) => void | Promise<void>;
}

export default function SortableEditor({
  displayName, onDisplayNameChange,
  questionText, onQuestionChange,
  items, onItemsChange,
  problemMedia,
  onProblemMediaChange,
  courseId,
  onAutoSave,
}: SortableEditorProps) {
  const [nextId, setNextId] = useState(() => {
    const maxId = items.reduce((m, i) => Math.max(m, i.id), 0);
    return maxId + 1;
  });
  const [dragging, setDragging] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const media = normalizeProblemMedia(problemMedia);
  const mediaRef = useRef<ProblemMedia>(media);
  const mediaSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  const [youtubeInput, setYoutubeInput] = useState(() => media.youtube_url || (media.youtube_id ? toYoutubeUrl(media.youtube_id) : ''));
  const youtubeId = extractYoutubeId(youtubeInput);

  const updateProblemMedia = (next: ProblemMedia) => {
    const normalized = normalizeProblemMedia(next);
    mediaRef.current = normalized;
    onProblemMediaChange?.(normalized);
  };
  const persistMediaDraft = (nextMedia: ProblemMedia) => {
    const run = mediaSaveQueueRef.current.then(async () => {
      await onAutoSave?.(nextMedia);
    });
    mediaSaveQueueRef.current = run.catch(() => {});
    return run;
  };

  const handleYoutubeChange = (value: string) => {
    setYoutubeInput(value);
    const id = extractYoutubeId(value);
    updateProblemMedia({
      ...media,
      youtube_id: id || undefined,
      youtube_url: id ? toYoutubeUrl(id) : undefined,
    });
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!courseId) {
      toast.error('Thiếu courseId, không thể upload ảnh');
      return;
    }
    setUploading(true);
    const uploadedPaths: string[] = [];
    try {
      const uploaded: { src: string; alt: string }[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadCourseAsset(courseId, file);
        const src = result?.url || result?.storage_path || '';
        if (src) {
          uploaded.push({ src, alt: file.name });
          uploadedPaths.push(src);
        }
      }
      if (uploaded.length > 0) {
        const currentMedia = mediaRef.current;
        const nextMedia = { ...currentMedia, images: [...currentMedia.images, ...uploaded] };
        updateProblemMedia(nextMedia);
        try {
          await persistMediaDraft(nextMedia);
          toast.success(`Đã upload ${uploaded.length} ảnh và lưu draft`);
        } catch (saveErr) {
          await Promise.allSettled(uploadedPaths.map(path => deleteCourseAssetByStoragePath(courseId, path)));
          updateProblemMedia(currentMedia);
          throw saveErr;
        }
      }
    } catch (err: any) {
      toast.error('Upload ảnh thất bại: ' + (err?.response?.data?.error || err.message || 'Unknown'));
    } finally {
      setUploading(false);
    }
  };

  const handleUploadVideo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!courseId) { toast.error('Thiếu courseId'); return; }
    const file = files[0];
    if (file.size > COURSE_ASSET_MAX_UPLOAD_BYTES) {
      toast.error(`Video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa ${COURSE_ASSET_MAX_UPLOAD_LABEL}.`);
      return;
    }
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
      toast.error('Chỉ chấp nhận MP4, WebM, MOV.'); return;
    }
    setVideoUploading(true);
    try {
      const result = await uploadCourseAsset(courseId, file);
      const path = result?.storage_path || result?.url || '';
      if (path) {
        const previousMedia = mediaRef.current;
        const nextMedia = { ...previousMedia, video_storage_path: path, youtube_id: undefined, youtube_url: undefined };
        updateProblemMedia(nextMedia);
        setYoutubeInput('');
        try {
          await persistMediaDraft(nextMedia);
          toast.success('Upload video thành công và đã lưu draft');
        } catch (saveErr) {
          await deleteCourseAssetByStoragePath(courseId, path).catch(() => {});
          updateProblemMedia(previousMedia);
          throw saveErr;
        }
      }
    } catch (err: any) {
      toast.error('Upload video thất bại: ' + (err?.response?.data?.error || err.message || 'Unknown'));
    } finally { setVideoUploading(false); }
  };

  const handleDeleteVideo = async () => {
    const currentMedia = mediaRef.current;
    const videoPath = currentMedia.video_storage_path;
    if (!videoPath) return;
    const nextMedia = { ...currentMedia, video_storage_path: undefined };
    updateProblemMedia(nextMedia);
    let pendingDelete = false;
    try {
      await persistMediaDraft(nextMedia);
    } catch (err: any) {
      updateProblemMedia(currentMedia);
      toast.error('Lưu thay đổi media thất bại: ' + (err?.response?.data?.error || err.message || 'Unknown'));
      return;
    }
    if (courseId) {
      try {
        const result = await deleteCourseAssetByStoragePath(courseId, videoPath);
        pendingDelete = !!result?.pending_delete;
      } catch {}
    }
    toast.success(pendingDelete ? 'Đã gỡ video khỏi bản nháp; file published được giữ để learner không lỗi.' : 'Đã xóa video');
  };

  const handleRemoveImage = async (idx: number) => {
    const currentMedia = mediaRef.current;
    const removedImage = currentMedia.images[idx];
    if (!removedImage) return;
    const nextMedia = { ...currentMedia, images: currentMedia.images.filter((_, i) => i !== idx) };
    updateProblemMedia(nextMedia);
    try {
      await persistMediaDraft(nextMedia);
      if (courseId) await deleteCourseAssetByStoragePath(courseId, removedImage.src).catch(() => {});
      toast.success('Đã xóa ảnh và lưu draft');
    } catch (err: any) {
      updateProblemMedia(currentMedia);
      toast.error('Xóa ảnh thất bại: ' + (err?.response?.data?.error || err.message || 'Unknown'));
    }
  };

  const handleMoveImage = async (fromIndex: number, toIndex: number) => {
    const currentMedia = mediaRef.current;
    const nextImages = [...currentMedia.images];
    const [moved] = nextImages.splice(fromIndex, 1);
    if (!moved) return;
    nextImages.splice(toIndex, 0, moved);
    const nextMedia = { ...currentMedia, images: nextImages };
    updateProblemMedia(nextMedia);
    try {
      await persistMediaDraft(nextMedia);
    } catch (err: any) {
      updateProblemMedia(currentMedia);
      toast.error('Cập nhật thứ tự ảnh thất bại: ' + (err?.response?.data?.error || err.message || 'Unknown'));
    }
  };

  const resolvedImages = media.images.map((img) => ({
    ...img,
    src: resolveProblemMediaImageUrl(img.src),
  }));

  const addItem = () => {
    onItemsChange([...items, { id: nextId, text: '' }]);
    setNextId(nextId + 1);
  };

  const updateItem = (idx: number, text: string) => {
    onItemsChange(items.map((item, i) => i === idx ? { ...item, text } : item));
  };

  const removeItem = (idx: number) => {
    onItemsChange(items.filter((_, i) => i !== idx));
  };

  const moveItem = (from: number, to: number) => {
    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    onItemsChange(arr);
  };

  const handleDragStart = (idx: number) => setDragging(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragging !== null && dragging !== idx) {
      moveItem(dragging, idx);
      setDragging(idx);
    }
  };
  const handleDragEnd = () => setDragging(null);

  return (
    <div className="space-y-5">
      <Field label="Tên hiển thị">
        <input
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      {/* ── Media minh họa ── */}
      <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold">Media minh họa</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Video sẽ hiển thị trước ảnh và nằm ngay phía trên bài tập.
          </p>
        </div>

        {!media.video_storage_path && (
          <Field label="YouTube URL hoặc Video ID">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Video className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                value={youtubeInput}
                onChange={e => handleYoutubeChange(e.target.value)}
                placeholder="https://youtube.com/watch?v=... hoặc dQw4w9WgXcQ"
              />
            </div>
            {youtubeInput && !youtubeId && (
              <p className="text-xs text-destructive mt-2">Chỉ chấp nhận link YouTube hoặc Video ID hợp lệ.</p>
            )}
          </Field>
        )}

        {youtubeId && (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
            <iframe
              key={youtubeId}
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
              title="YouTube Preview"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* Uploaded video preview */}
        {media.video_storage_path && (
          <div className="space-y-2">
              <UploadedVideoPreview storagePath={media.video_storage_path} />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5" onClick={handleDeleteVideo}>
                <Trash2 className="h-3.5 w-3.5" /> Xóa video
              </Button>
            </div>
          </div>
        )}

        {/* Video upload button */}
        {!youtubeId && !media.video_storage_path && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
            <Button type="button" variant="default" size="sm" className="gap-2" onClick={() => videoFileInputRef.current?.click()} disabled={videoUploading}>
              {videoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload video
            </Button>
            <span className="text-xs text-muted-foreground">Tối đa {COURSE_ASSET_MAX_UPLOAD_LABEL} • MP4, WebM, MOV</span>
            <input ref={videoFileInputRef} type="file" accept=".mp4,.webm,.mov" className="hidden" onChange={e => { handleUploadVideo(e.target.files); e.target.value = ''; }} />
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Upload ảnh
            </Button>
            <span className="text-xs text-muted-foreground">Từ 2 ảnh trở lên sẽ hiển thị dạng carousel.</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                handleUploadImages(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {resolvedImages.length === 1 && (
            <div className="relative rounded-lg border border-border bg-background p-2">
              <img
                src={resolvedImages[0].src}
                alt={resolvedImages[0].alt || 'Sortable image'}
                className="max-h-[260px] w-full rounded-md object-contain"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8 bg-background/80 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleRemoveImage(0)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {resolvedImages.length >= 2 && (
            <div className="space-y-2">
              <ImageCarousel images={resolvedImages} />
              <CarouselImageOrder
                images={resolvedImages.map((img, idx) => ({
                  id: `${img.src}-${idx}`,
                  src: img.src,
                  alt: img.alt,
                }))}
                onMove={handleMoveImage}
                onRemove={handleRemoveImage}
              />
            </div>
          )}
        </div>
      </div>

      <Field label="Câu hỏi / Hướng dẫn">
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          rows={3}
          value={questionText}
          onChange={e => onQuestionChange(e.target.value)}
          placeholder="Hãy sắp xếp các bước theo đúng thứ tự..."
        />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Các bước / Items ({items.length})</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kéo thả để đổi thứ tự. Thứ tự này là thứ tự <strong>đúng</strong> — học sinh sẽ thấy thứ tự xáo trộn.
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" /> Thêm bước
          </Button>
        </div>

        {items.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
            Chưa có bước nào. Nhấn "Thêm bước" để bắt đầu.
          </div>
        )}

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 bg-card transition-all ${dragging === idx ? 'opacity-50 scale-[0.99] border-primary' : 'border-border hover:border-primary/30'}`}
            >
              <div className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground shrink-0">
                <GripVertical className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0 min-w-[32px] text-center">
                {idx + 1}
              </span>
              <input
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                value={item.text}
                onChange={e => updateItem(idx, e.target.value)}
                placeholder={`Bước ${idx + 1}...`}
              />
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                onClick={() => removeItem(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-300">
        <strong>Lưu ý:</strong> Học sinh sẽ thấy các bước bị xáo trộn ngẫu nhiên. Thứ tự bạn đặt ở đây là thứ tự <strong>đúng</strong> để chấm điểm.
      </div>
    </div>
  );
}

export type { SortableItem };
