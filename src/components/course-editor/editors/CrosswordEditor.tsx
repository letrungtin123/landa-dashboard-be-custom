import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ImagePlus, Loader2, Video, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import { CrosswordPreviewInteractive } from '../CrosswordPreview';
import { uploadCourseAsset, deleteCourseAssetByStoragePath } from '@/api/custom-course-authoring';
import { toast } from 'sonner';
import { storageUrl } from '@/utils/storage-url';
import ImageCarousel from '../ImageCarousel';
import CarouselImageOrder from '../CarouselImageOrder';
import {
  extractYoutubeId,
  normalizeProblemMedia,
  resolveProblemMediaImageUrl,
  toYoutubeUrl,
  type ProblemMedia,
} from '../problemMedia';

interface CrosswordWord {
  id: number;
  answer: string;
  clue: string;
  hint?: string;
  row: number;
  col: number;
  direction: 'across' | 'down';
}

interface CrosswordEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  words: CrosswordWord[];
  onWordsChange: (words: CrosswordWord[]) => void;
  keywordCol?: number;
  onKeywordColChange?: (v: number) => void;
  problemMedia?: ProblemMedia;
  onProblemMediaChange?: (v: ProblemMedia) => void;
  courseId?: string;
  onAutoSave?: (nextMedia: ProblemMedia) => void | Promise<void>;
}

export default function CrosswordEditor({
  displayName, onDisplayNameChange, words, onWordsChange,
  keywordCol = 0, onKeywordColChange,
  problemMedia,
  onProblemMediaChange,
  courseId,
  onAutoSave,
}: CrosswordEditorProps) {

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
    if (file.size > 100 * 1024 * 1024) {
      toast.error(`Video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa 100MB.`);
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

  const addWord = () => {
    const nextId = words.length > 0 ? Math.max(...words.map(w => w.id)) + 1 : 1;
    onWordsChange([...words, {
      id: nextId,
      answer: '',
      clue: '',
      row: words.length,
      col: 0,
      direction: 'across',
    }]);
  };

  const updateWord = (idx: number, field: keyof CrosswordWord, value: any) => {
    const updated = words.map((w, i) => i === idx ? { ...w, [field]: value } : w);
    onWordsChange(updated);
  };

  const removeWord = (idx: number) => {
    // Sau khi xóa, re-assign id và row theo index (giống XBlock gốc)
    const filtered = words.filter((_, i) => i !== idx);
    const reindexed = filtered.map((w, i) => ({
      ...w,
      id: i + 1,
      row: i,
    }));
    onWordsChange(reindexed);
  };

  // Tạo keyword_coordinates cho preview
  const keywordCoordinates = words.map((_, idx) => ({ row: idx, col: keywordCol }));

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Cột trái: Form nhập liệu */}
      <div className="min-w-0 flex-1 space-y-5 lg:max-w-[450px] xl:max-w-[500px] lg:shrink-0">
        <Field label="Tên bài tập">
          <input
            className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
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
                  className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono focus:ring-2 focus:ring-ring focus:outline-none"
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
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
                <video key={media.video_storage_path} src={storageUrl(media.video_storage_path)} controls className="w-full h-full object-contain" preload="metadata" />
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5" onClick={handleDeleteVideo}>
                  <Trash2 className="h-3.5 w-3.5" /> Xóa video
                </Button>
              </div>
            </div>
          )}

          {/* Video upload button */}
          {!youtubeId && !media.video_storage_path && (
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center">
              <Button type="button" variant="default" size="sm" className="shrink-0 gap-2" onClick={() => videoFileInputRef.current?.click()} disabled={videoUploading}>
                {videoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload video
              </Button>
              <span className="min-w-0 text-xs leading-5 text-muted-foreground">Tối đa 100MB • MP4, WebM, MOV</span>
              <input ref={videoFileInputRef} type="file" accept=".mp4,.webm,.mov" className="hidden" onChange={e => { handleUploadVideo(e.target.files); e.target.value = ''; }} />
            </div>
          )}

          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="shrink-0 gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Upload ảnh
              </Button>
              <span className="min-w-0 text-xs leading-5 text-muted-foreground">Từ 2 ảnh trở lên sẽ hiển thị dạng carousel.</span>
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
                  alt={resolvedImages[0].alt || 'Crossword image'}
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

        <Field label="Cột chữ khóa dọc (Từ khóa chính)">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <input
              type="number"
              min={0}
              className="flex h-10 w-24 shrink-0 rounded-md border border-input bg-background px-3 text-sm"
              value={keywordCol}
              onChange={e => onKeywordColChange?.(parseInt(e.target.value) || 0)}
            />
            <span className="min-w-0 text-xs leading-5 text-muted-foreground">
              Chỉ số cột sẽ được highlight tạo thành từ khóa dọc
            </span>
          </div>
        </Field>

        <hr className="border-border" />

        <div className="space-y-3">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="min-w-0 text-sm font-bold leading-5">Danh sách Câu Hỏi - Hàng Ngang ({words.length})</h4>
            <Button size="sm" variant="outline" className="h-7 w-fit shrink-0 gap-1 text-xs" onClick={addWord}>
              <Plus className="h-3.5 w-3.5" /> Thêm hàng
            </Button>
          </div>

          {words.length === 0 && (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              Chưa có từ khóa nào. Bấm "Thêm hàng" để bắt đầu.
            </div>
          )}

          <div className="space-y-2">
            {words.map((word, idx) => (
              <div key={word.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3 space-y-3 transition-colors hover:border-primary/30 sm:p-4">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Hàng #{word.id}
                    {word.answer && (
                      <span className="ml-2 inline-flex shrink-0 text-primary normal-case font-normal">
                        {word.answer.length} ô
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                    onClick={() => removeWord(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Câu hỏi gợi ý</label>
                    <input
                      className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                      value={word.clue}
                      onChange={e => updateWord(idx, 'clue', e.target.value)}
                      placeholder="Gợi ý cho hàng ngang..."
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Đáp án (Viết liền không dấu)</label>
                    <input
                      className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-mono uppercase"
                      value={word.answer}
                      onChange={e => {
                        const val = e.target.value.toUpperCase().replace(/[^A-ZĐ0-9]/g, '');
                        updateWord(idx, 'answer', val);
                      }}
                      placeholder="DAPAN"
                    />
                  </div>
                </div>

                <div className="min-w-0 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Gợi ý — Hint (tuỳ chọn)</label>
                  <input
                    className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                    value={word.hint || ''}
                    onChange={e => updateWord(idx, 'hint', e.target.value)}
                    placeholder="Nhập gợi ý giúp học viên trả lời..."
                  />
                </div>

                <div className="min-w-0 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Căn lề cột (Thụt hàng)</label>
                  <input
                    type="number" min={0} max={20}
                    className="flex h-9 w-24 max-w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={word.col}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0;
                      updateWord(idx, 'col', Math.min(Math.max(v, 0), 20));
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
          <strong>Lưu ý:</strong> Đáp án phải IN HOA, viết liền không dấu tiếng Việt. "Căn lề cột" dùng để thụt đầu hàng sao cho cột chữ khóa dọc thẳng hàng.
        </div>
      </div>

      {/* Cột phải: Live Preview */}
      <div className="min-w-0 flex-1 overflow-hidden lg:sticky lg:top-0 lg:self-start">
        <div className="mb-4">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-[#0B57D0]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0B57D0]"></span>
            </span>
            <span className="min-w-0 break-words">Xem trước Ma trận lưới</span>
          </h3>
          <p className="mt-1 min-w-0 break-words text-xs leading-5 text-muted-foreground">
            Ô màu xanh đậm = cột chữ khóa dọc (cột {keywordCol}). Thay đổi đáp án/căn lề để canh chỉnh từ khóa chính.
          </p>
        </div>
        <CrosswordPreviewInteractive
          parsed={{ words, keyword_coordinates: keywordCoordinates }}
          showAnswers={true}
        />
      </div>
    </div>
  );
}

export type { CrosswordWord };
