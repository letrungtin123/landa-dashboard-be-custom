/**
 * HelpPageEditor.tsx
 * Panel bên phải — hiển thị / chỉnh sửa nội dung Help Page
 *
 * Staff: view mode (read-only rendered HTML)
 * Superuser: edit mode (RichTextEditor + title + publish toggle)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteHelpImage, getHelpPage, updateHelpPage, uploadHelpImage } from '@/api/custom-help-docs';
import type { HelpPageDetail } from '@/api/custom-help-docs';
import RichTextEditor, { prepareContentForSave } from '@/components/course-editor/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { htmlImageDisplaySrc, htmlImageStoragePath } from '@/utils/storage-url';
import { toast } from 'sonner';
import {
  Save, Eye, Pencil, Globe, EyeOff, ImagePlus,
  Clock, User, Loader2,
} from 'lucide-react';

interface HelpPageEditorProps {
  pageId: string;
  isSuperuser: boolean;
}

function renderHelpPageContent(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      img.setAttribute('src', htmlImageDisplaySrc(src));
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

function extractHelpPageImagePaths(html: string): Set<string> {
  const paths = new Set<string>();
  if (!html || typeof DOMParser === 'undefined') return paths;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      const path = htmlImageStoragePath(img.getAttribute('src'));
      if (path) paths.add(path);
    });
  } catch {
    // Ignore parse failures; cleanup will be retried on a later valid save/unmount.
  }

  return paths;
}

export default function HelpPageEditor({ pageId, isSuperuser }: HelpPageEditorProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const editorRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef('');
  const titleRef = useRef('');
  const savedContentRef = useRef('');
  const savedTitleRef = useRef('');
  const loadedPageIdRef = useRef('');
  const sessionUploadedPathsRef = useRef<Set<string>>(new Set());

  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['help-page', pageId],
    queryFn: () => getHelpPage(pageId),
    staleTime: 10_000,
  });

  // Reset state khi đổi page; không đá editor khỏi edit mode khi autosave cập nhật cache.
  useEffect(() => {
    if (!page) return;
    if (isEditing && loadedPageIdRef.current === page.id) return;

    loadedPageIdRef.current = page.id;
    setTitle(page.title);
    setContent(page.content);
    contentRef.current = page.content;
    titleRef.current = page.title;
    savedContentRef.current = page.content;
    savedTitleRef.current = page.title;
    setHasChanges(false);
    setIsEditing(false);
  }, [page, isEditing]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const syncDirtyState = useCallback((nextTitle: string, nextContent: string) => {
    setHasChanges(nextTitle !== savedTitleRef.current || nextContent !== savedContentRef.current);
  }, []);

  const deleteUploadedPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (uniquePaths.length === 0) return;

    await Promise.allSettled(uniquePaths.map((path) => deleteHelpImage(path)));
    uniquePaths.forEach((path) => sessionUploadedPathsRef.current.delete(path));
  }, []);

  const markSessionUploadsSaved = useCallback((savedContent: string) => {
    const savedPaths = extractHelpPageImagePaths(savedContent);
    [...sessionUploadedPathsRef.current].forEach((path) => {
      if (savedPaths.has(path)) sessionUploadedPathsRef.current.delete(path);
    });
  }, []);

  const cleanupSessionUploads = useCallback(async (mode: 'all' | 'unused') => {
    const referencedPaths = mode === 'unused'
      ? extractHelpPageImagePaths(contentRef.current)
      : new Set<string>();
    const pathsToDelete = [...sessionUploadedPathsRef.current]
      .filter((path) => mode === 'all' || !referencedPaths.has(path));
    await deleteUploadedPaths(pathsToDelete);
  }, [deleteUploadedPaths]);

  useEffect(() => {
    return () => { void cleanupSessionUploads('all'); };
  }, [cleanupSessionUploads]);

  const saveMut = useMutation({
    mutationFn: (payload: { title?: string; content?: string; is_published?: boolean }) =>
      updateHelpPage(pageId, payload),
    onSuccess: (_data, variables) => {
      if (variables.title !== undefined) savedTitleRef.current = variables.title;
      if (variables.content !== undefined) {
        savedContentRef.current = variables.content;
        markSessionUploadsSaved(variables.content);
        void cleanupSessionUploads('unused');
      }
      toast.success('Đã lưu');
      syncDirtyState(titleRef.current, contentRef.current);
      queryClient.invalidateQueries({ queryKey: ['help-page', pageId] });
      queryClient.invalidateQueries({ queryKey: ['help-pages'] });
    },
    onError: () => toast.error('Lưu thất bại'),
  });

  const persistImageContent = useCallback(async (nextContent: string) => {
    await updateHelpPage(pageId, { content: nextContent });
    savedContentRef.current = nextContent;
    markSessionUploadsSaved(nextContent);
    syncDirtyState(titleRef.current, nextContent);
    void cleanupSessionUploads('unused');
    queryClient.setQueryData<HelpPageDetail>(['help-page', pageId], (current) => (
      current ? { ...current, content: nextContent } : current
    ));
    queryClient.invalidateQueries({ queryKey: ['help-pages'] });
  }, [cleanupSessionUploads, markSessionUploadsSaved, pageId, queryClient, syncDirtyState]);

  const handleSave = useCallback(() => {
    saveMut.mutate({ title, content });
  }, [title, content, saveMut]);

  const handlePublishToggle = useCallback(() => {
    if (!page) return;
    // Nếu đang edit và có thay đổi chưa lưu → gửi kèm title + content
    const payload: { title?: string; content?: string; is_published: boolean } = {
      is_published: !page.is_published,
    };
    if (hasChanges) {
      payload.title = title;
      payload.content = content;
    }
    saveMut.mutate(payload);
  }, [page, saveMut, hasChanges, title, content]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file ảnh');
      return;
    }

    setIsImageUploading(true);
    let storagePath: string | null = null;
    const previousContent = contentRef.current;
    try {
      const result = await uploadHelpImage(file);
      storagePath = htmlImageStoragePath(result.url);
      if (storagePath) sessionUploadedPathsRef.current.add(storagePath);
      if (!result.url || !editorRef.current) throw new Error('Không thể chèn ảnh vào trình soạn thảo');

      const editor = editorRef.current;
      editor.chain().focus().setImage({ src: htmlImageDisplaySrc(result.url) }).run();
      const nextContent = prepareContentForSave(editor.getHTML());
      setContent(nextContent);
      contentRef.current = nextContent;
      await persistImageContent(nextContent);
      toast.success('Đã tải lên và lưu ảnh');
    } catch (error: any) {
      if (storagePath) await deleteUploadedPaths([storagePath]);
      if (editorRef.current) editorRef.current.commands.setContent(renderHelpPageContent(previousContent));
      setContent(previousContent);
      contentRef.current = previousContent;
      syncDirtyState(titleRef.current, previousContent);
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Upload hoặc lưu ảnh thất bại');
    } finally {
      setIsImageUploading(false);
    }
  }, [deleteUploadedPaths, persistImageContent, syncDirtyState]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    contentRef.current = newContent;
    syncDirtyState(titleRef.current, newContent);
  }, [syncDirtyState]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    titleRef.current = newTitle;
    syncDirtyState(newTitle, contentRef.current);
  }, [syncDirtyState]);

  const handleCancelEdit = useCallback(() => {
    void cleanupSessionUploads('all');
    setIsEditing(false);
    if (page) {
      setTitle(page.title);
      setContent(page.content);
      contentRef.current = page.content;
      titleRef.current = page.title;
      setHasChanges(false);
    }
  }, [cleanupSessionUploads, page]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="bg-destructive/10 border-l-4 border-destructive text-destructive p-5 rounded-xl">
        <h3 className="font-semibold">Lỗi tải trang</h3>
        <p className="text-sm mt-1 opacity-80">Không thể tải nội dung trang này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              className="text-xl font-bold w-full bg-transparent border-b-2 border-primary/30 focus:border-primary outline-none pb-1 transition-colors"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Tiêu đề trang..."
            />
          ) : (
            <h1 className="text-xl font-bold text-foreground">{page.title}</h1>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {page.is_published
                ? <><Globe className="h-3 w-3 text-emerald-500" /> Đã xuất bản</>
                : <><EyeOff className="h-3 w-3 text-slate-400" /> Bản nháp</>
              }
            </span>
            {page.updated_by && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {page.updated_by}
              </span>
            )}
            {page.updated_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(page.updated_at).toLocaleDateString('vi-VN', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons (superuser only) */}
        {isSuperuser && (
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <Button
                  variant="outline" size="sm"
                  onClick={handleCancelEdit}
                >
                  <Eye className="h-4 w-4 mr-1.5" /> Xem
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMut.isPending || isImageUploading || !hasChanges}
                  className="min-w-[80px]"
                >
                  {saveMut.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Save className="h-4 w-4 mr-1.5" /> Lưu</>
                  }
                </Button>
                <Button
                  variant={page.is_published ? 'outline' : 'default'}
                  size="sm"
                  onClick={handlePublishToggle}
                  disabled={saveMut.isPending || isImageUploading}
                >
                  {page.is_published
                    ? <><EyeOff className="h-4 w-4 mr-1.5" /> Ẩn</>
                    : <><Globe className="h-4 w-4 mr-1.5" /> Publish</>
                  }
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-1.5" /> Chỉnh sửa
                </Button>
                <Button
                  variant={page.is_published ? 'outline' : 'default'}
                  size="sm"
                  onClick={handlePublishToggle}
                  disabled={saveMut.isPending || isImageUploading}
                >
                  {page.is_published
                    ? <><EyeOff className="h-4 w-4 mr-1.5" /> Ẩn</>
                    : <><Globe className="h-4 w-4 mr-1.5" /> Publish</>
                  }
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      {isEditing ? (
        <div className="space-y-3">
          {/* Image upload button */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImageUploading}
            >
              {isImageUploading
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <ImagePlus className="h-4 w-4 mr-1.5" />
              }
              Upload ảnh
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
                e.target.value = '';
              }}
            />
            <span className="text-xs text-muted-foreground">JPG, PNG, GIF, WebP — tối đa 5MB</span>
          </div>

          <RichTextEditor
            content={content}
            onChange={handleContentChange}
            onEditorReady={(editor: any) => { editorRef.current = editor; }}
            onImageFilePaste={handleImageUpload}
            minHeight="min-h-[500px]"
          />
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-background overflow-hidden">
          {page.content ? (
            <div
              className="prose prose-sm sm:prose-base dark:prose-invert max-w-none p-6 help-page-content"
              dangerouslySetInnerHTML={{ __html: renderHelpPageContent(page.content) }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <FileTextIcon className="h-12 w-12 opacity-20" />
              <p className="text-sm">Chưa có nội dung</p>
              {isSuperuser && (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-1.5" /> Bắt đầu viết
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Inline styles for rendered content */}
      <style>{`
        .help-page-content img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .help-page-content ul {
          list-style-type: disc;
          padding-left: 2rem;
        }
        .help-page-content ol {
          list-style-type: decimal;
          padding-left: 2rem;
        }
        .help-page-content blockquote {
          border-left: 3px solid hsl(var(--primary));
          padding-left: 1rem;
          font-style: italic;
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}

// Simple icon for empty state
function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}
