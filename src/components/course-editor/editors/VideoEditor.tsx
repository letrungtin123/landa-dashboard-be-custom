import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Video, Upload, Youtube, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteCourseAssetByStoragePath, uploadCourseAsset } from '@/api/custom-course-authoring';
import { storageUrl } from '@/utils/storage-url';
import { COURSE_ASSET_MAX_UPLOAD_BYTES, COURSE_ASSET_MAX_UPLOAD_LABEL } from '@/utils/course-asset-upload';
import { toast } from 'sonner';

type VideoMode = 'youtube' | 'upload';

const ACCEPTED_VIDEO_TYPES = '.mp4,.webm,.mov';
const ACCEPTED_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

interface VideoEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  metadata: any;
  onMetadataChange: (m: any) => void;
  courseId: string;
  onAutoSave?: (nextMetadata: any) => void | Promise<void>;
}

function extractYoutubeId(input: string): string {
  if (!input) return '';
  const regexes = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const r of regexes) {
    const m = input.match(r);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  return input.trim();
}

export default function VideoEditor({ displayName, onDisplayNameChange, metadata, onMetadataChange, courseId, onAutoSave }: VideoEditorProps) {
  // Detect initial mode from existing metadata
  const existingStoragePath = metadata?.video_storage_path || '';

  const [mode, setMode] = useState<VideoMode>(() =>
    existingStoragePath ? 'upload' : 'youtube'
  );

  // YouTube state
  const [inputValue, setInputValue] = useState(() => {
    const id = metadata?.youtube_id_1_0;
    if (!id) return '';
    if (id.length === 11 && !id.includes('/')) {
      return `https://www.youtube.com/watch?v=${id}`;
    }
    return id;
  });

  // Upload state
  const [videoPath, setVideoPath] = useState<string>(existingStoragePath);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const metadataRef = useRef<any>(metadata);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);
  const persistMetadataDraft = (nextMetadata: any) => {
    const run = saveQueueRef.current.then(async () => {
      await onAutoSave?.(nextMetadata);
    });
    saveQueueRef.current = run.catch(() => {});
    return run;
  };

  const youtubeId = extractYoutubeId(inputValue);

  const handleYoutubeChange = (val: string) => {
    setInputValue(val);
    const id = extractYoutubeId(val);
    onMetadataChange({
      ...metadata,
      youtube_id_1_0: id,
      video_storage_path: undefined, // Clear upload when switching to YouTube
    });
  };

  const handleModeSwitch = (newMode: VideoMode) => {
    setMode(newMode);
    if (newMode === 'youtube') {
      // Switching to YouTube → clear upload data
      onMetadataChange({
        ...metadata,
        video_storage_path: undefined,
      });
    } else {
      // Switching to Upload → clear YouTube data
      onMetadataChange({
        ...metadata,
        youtube_id_1_0: '',
      });
      setInputValue('');
    }
  };

  const handleUploadVideo = async (file: File) => {
    if (!courseId) {
      toast.error('Thiếu courseId, không thể upload video');
      return;
    }

    if (file.size > COURSE_ASSET_MAX_UPLOAD_BYTES) {
      toast.error(`Video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn tối đa ${COURSE_ASSET_MAX_UPLOAD_LABEL}.`);
      return;
    }

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      toast.error('Định dạng không hỗ trợ. Chỉ chấp nhận MP4, WebM, MOV.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    // Simulate progress (real progress requires XMLHttpRequest)
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + Math.random() * 15, 90));
    }, 300);

    try {
      const result = await uploadCourseAsset(courseId, file);
      const path = result?.storage_path || result?.url || '';

      if (path) {
        const previousMetadata = metadataRef.current;
        const previousPath = videoPath;
        const nextMetadata = {
          ...previousMetadata,
          video_storage_path: path,
          youtube_id_1_0: '', // Clear YouTube when uploading
        };
        setVideoPath(path);
        metadataRef.current = nextMetadata;
        onMetadataChange(nextMetadata);
        try {
          await persistMetadataDraft(nextMetadata);
          toast.success('Upload video thành công và đã lưu draft');
        } catch (saveErr) {
          try { await deleteCourseAssetByStoragePath(courseId, path); } catch { /* ignore cleanup */ }
          setVideoPath(previousPath);
          onMetadataChange(previousMetadata);
          throw saveErr;
        }
      }
      setUploadProgress(100);
    } catch (err: any) {
      toast.error('Upload video thất bại: ' + (err?.response?.data?.error || err.message || 'Unknown'));
      setUploadProgress(0);
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!videoPath) return;
    const previousMetadata = metadataRef.current;
    const previousPath = videoPath;
    const nextMetadata = {
      ...previousMetadata,
      video_storage_path: undefined,
    };
    setVideoPath('');
    setUploadProgress(0);
    metadataRef.current = nextMetadata;
    onMetadataChange(nextMetadata);
    try {
      await persistMetadataDraft(nextMetadata);
    } catch (err: any) {
      setVideoPath(previousPath);
      metadataRef.current = previousMetadata;
      onMetadataChange(previousMetadata);
      toast.error('Lưu thay đổi video thất bại: ' + (err?.response?.data?.error || err.message || 'Unknown'));
      return;
    }
    let pendingDelete = false;
    if (courseId) {
      try {
        const result = await deleteCourseAssetByStoragePath(courseId, previousPath);
        pendingDelete = !!result?.pending_delete;
      } catch {
        // Ignore cleanup errors
      }
    }
    toast.success(pendingDelete ? 'Đã gỡ video khỏi bản nháp; file published được giữ để learner không lỗi.' : 'Đã xóa video');
  };

  const handleFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      handleUploadVideo(files[0]);
    }
  };

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [courseId]);

  const videoPreviewUrl = videoPath ? storageUrl(videoPath) : '';

  return (
    <div className="space-y-6">
      <Field label="Tên hiển thị">
        <input
          className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:bg-background focus:border-primary focus:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      {/* Mode Switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
        <button
          type="button"
          onClick={() => handleModeSwitch('youtube')}
          disabled={!!metadata.video_storage_path}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            metadata.video_storage_path ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            mode === 'youtube'
              ? 'bg-background text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Youtube className="h-4 w-4" />
          YouTube URL
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch('upload')}
          disabled={!!youtubeId}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            youtubeId ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            mode === 'upload'
              ? 'bg-background text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload Video
        </button>
      </div>

      {/* YouTube Mode */}
      {mode === 'youtube' && (
        <>
          <Field label="YouTube URL hoặc Video ID">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Video className="h-5 w-5 text-muted-foreground" />
              </div>
              <input
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 pl-10 pr-4 text-sm font-mono shadow-sm transition-all duration-200 hover:bg-background focus:border-primary focus:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10"
                value={inputValue}
                onChange={e => handleYoutubeChange(e.target.value)}
                placeholder="https://youtube.com/watch?v=... hoặc dQw4w9WgXcQ"
              />
            </div>
            {youtubeId && youtubeId.length === 11 && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
                ID hợp lệ: <span className="font-mono font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">{youtubeId}</span>
              </p>
            )}
          </Field>

          {youtubeId && youtubeId.length === 11 ? (
            <div className="p-1.5 rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/5 border border-primary/10 shadow-xl shadow-primary/5">
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-black shadow-inner">
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
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center aspect-video w-full rounded-2xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground gap-3 transition-colors hover:bg-muted/50 hover:border-primary/30">
              <div className="p-4 bg-background rounded-full shadow-sm">
                <Video className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <span className="text-sm font-medium">Nhập YouTube URL để xem trước video</span>
            </div>
          )}
        </>
      )}

      {/* Upload Mode */}
      {mode === 'upload' && (
        <>
          {/* Already uploaded → show preview */}
          {videoPath && !uploading ? (
            <div className="space-y-3">
              <div className="p-1.5 rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/5 border border-primary/10 shadow-xl shadow-primary/5">
                <div className="aspect-video w-full rounded-xl overflow-hidden bg-black shadow-inner">
                  <video
                    key={videoPath}
                    src={videoPreviewUrl}
                    controls
                    className="w-full h-full object-contain"
                    preload="metadata"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  Video đã upload
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  onClick={handleDeleteVideo}
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa video
                </Button>
              </div>
            </div>
          ) : (
            /* Upload area (drag-drop) */
            <div className="space-y-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center aspect-video w-full rounded-2xl border-2 border-dashed transition-all duration-200 gap-3 cursor-pointer ${
                  isDragging
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : uploading
                      ? 'border-border bg-muted/30 cursor-wait'
                      : 'border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/30'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <span className="text-sm font-medium text-foreground">Đang upload...</span>
                    <div className="w-48 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{Math.round(uploadProgress)}%</span>
                  </>
                ) : (
                  <>
                    <div className={`p-4 rounded-full shadow-sm transition-colors ${isDragging ? 'bg-primary/10' : 'bg-background'}`}>
                      <Upload className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-muted-foreground/60'}`} />
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-medium block">
                        {isDragging ? 'Thả file vào đây' : 'Kéo thả video hoặc click để chọn'}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                        <AlertCircle className="h-3 w-3" />
                        Tối đa {COURSE_ASSET_MAX_UPLOAD_LABEL} • MP4, WebM, MOV
                      </span>
                    </div>
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_VIDEO_TYPES}
                className="hidden"
                onChange={e => {
                  handleFileSelect(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground/90 tracking-tight">{label}</label>
      {children}
    </div>
  );
}
