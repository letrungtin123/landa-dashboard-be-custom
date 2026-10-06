import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Save, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  createNewsPost,
  deletePendingNewsImage,
  getManagedNewsPost,
  importNewsImage,
  updateNewsPost,
  uploadNewsImage,
} from '@/api/custom-news';
import RichTextEditor from '@/components/course-editor/RichTextEditor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getLocalizedApiError } from '@/utils/localized-error';
import { htmlImageStoragePath, storageUrl } from '@/utils/storage-url';

interface NewsEditorDialogProps {
  open: boolean;
  postId: string | null;
  onOpenChange: (open: boolean) => void;
}

function createUploadSessionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function extractImagePaths(html: string): Set<string> {
  const paths = new Set<string>();
  if (!html || typeof DOMParser === 'undefined') return paths;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((image) => {
      const path = htmlImageStoragePath(image.getAttribute('src'));
      if (path) paths.add(path);
    });
  } catch {
    // Invalid drafts remain editable; the backend sanitizer is authoritative.
  }
  return paths;
}

function extractTransientImageSources(html: string): Set<string> {
  const sources = new Set<string>();
  if (!html || typeof DOMParser === 'undefined') return sources;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((image) => {
      const src = image.getAttribute('src')?.trim() || '';
      if (/^(?:blob:|data:image\/)/i.test(src)) sources.add(src);
    });
  } catch {
    // Invalid drafts remain editable; the backend sanitizer is authoritative.
  }
  return sources;
}

function externalImageSources(html: string): string[] {
  if (!html || typeof DOMParser === 'undefined') return [];
  const sources = new Set<string>();
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((image) => {
      const src = image.getAttribute('src')?.trim() || '';
      if (src && !htmlImageStoragePath(src) && !/^(?:blob:|data:image\/)/i.test(src)) sources.add(src);
    });
  } catch {
    return [];
  }
  return [...sources];
}

function replaceImageSources(html: string, replacements: Map<string, string>): string {
  if (!html || replacements.size === 0 || typeof DOMParser === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((image) => {
      const src = image.getAttribute('src')?.trim() || '';
      const replacement = replacements.get(src);
      if (replacement) image.setAttribute('src', replacement);
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

interface StagedNewsImage {
  file: File;
  kind: 'preview' | 'inline';
  uploadedPath?: string;
}

const MAX_STAGED_IMAGES = 20;
const MAX_STAGED_IMAGE_BYTES = 50 * 1024 * 1024;

export function NewsEditorDialog({ open, postId, onOpenChange }: NewsEditorDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEditing = Boolean(postId);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewDraftUrl, setPreviewDraftUrl] = useState<string | null>(null);
  const [uploadSessionId, setUploadSessionId] = useState(createUploadSessionId);
  const [isUploading, setIsUploading] = useState(false);
  const editorRef = useRef<any>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const pendingPathsRef = useRef<Set<string>>(new Set());
  const stagedImagesRef = useRef<Map<string, StagedNewsImage>>(new Map());
  const previewDraftUrlRef = useRef<string | null>(null);
  const contentRef = useRef('');
  const previewPathRef = useRef<string | null>(null);
  const uploadSessionRef = useRef(uploadSessionId);
  const initializedPostRef = useRef<string | null | undefined>(undefined);

  const releaseStagedImage = useCallback((objectUrl: string) => {
    if (!stagedImagesRef.current.delete(objectUrl)) return;
    URL.revokeObjectURL(objectUrl);
  }, []);

  const releaseAllStagedImages = useCallback(() => {
    [...stagedImagesRef.current.keys()].forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    stagedImagesRef.current.clear();
    previewDraftUrlRef.current = null;
  }, []);

  const detailQuery = useQuery({
    queryKey: ['news-manage-detail', postId],
    queryFn: () => getManagedNewsPost(postId!),
    enabled: open && Boolean(postId),
    staleTime: 10_000,
  });

  const deletePendingPaths = useCallback(async (paths: string[]) => {
    const unique = [...new Set(paths.filter(Boolean))];
    const sessionId = uploadSessionRef.current;
    const results = await Promise.allSettled(
      unique.map((path) => deletePendingNewsImage(path, sessionId)),
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') pendingPathsRef.current.delete(unique[index]);
    });
  }, []);

  const cleanupPendingPaths = useCallback(async (keepReferenced: boolean) => {
    const referenced = keepReferenced
      ? new Set([...extractImagePaths(contentRef.current), ...(previewPathRef.current ? [previewPathRef.current] : [])])
      : new Set<string>();
    const stale = [...pendingPathsRef.current].filter((path) => !referenced.has(path));
    await deletePendingPaths(stale);
  }, [deletePendingPaths]);

  useEffect(() => {
    if (!open) {
      initializedPostRef.current = undefined;
      return;
    }
    if (!postId && initializedPostRef.current !== null) {
      initializedPostRef.current = null;
      const nextSession = createUploadSessionId();
      releaseAllStagedImages();
      setTitle('');
      setContent('');
      contentRef.current = '';
      setPreviewPath(null);
      previewPathRef.current = null;
      setPreviewDraftUrl(null);
      setUploadSessionId(nextSession);
      uploadSessionRef.current = nextSession;
      pendingPathsRef.current.clear();
    }
  }, [open, postId, releaseAllStagedImages]);

  useEffect(() => {
    const post = detailQuery.data;
    if (!open || !postId || !post || initializedPostRef.current === post.id) return;
    initializedPostRef.current = post.id;
    const nextSession = createUploadSessionId();
    releaseAllStagedImages();
    setTitle(post.title);
    setContent(post.content_html);
    contentRef.current = post.content_html;
    setPreviewPath(post.preview_image_path);
    previewPathRef.current = post.preview_image_path;
    setPreviewDraftUrl(null);
    setUploadSessionId(nextSession);
    uploadSessionRef.current = nextSession;
    pendingPathsRef.current.clear();
  }, [detailQuery.data, open, postId, releaseAllStagedImages]);

  useEffect(() => () => {
    releaseAllStagedImages();
    void cleanupPendingPaths(false);
  }, [cleanupPendingPaths, releaseAllStagedImages]);

  const closeDialog = useCallback(() => {
    releaseAllStagedImages();
    void cleanupPendingPaths(false);
    onOpenChange(false);
  }, [cleanupPendingPaths, onOpenChange, releaseAllStagedImages]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) closeDialog();
    else onOpenChange(true);
  }, [closeDialog, onOpenChange]);

  const stageImage = useCallback((file: File, kind: 'preview' | 'inline') => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('news.imageTypeError'));
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('news.imageTooLarge'));
      return null;
    }
    const staged = [...stagedImagesRef.current.values()];
    if (staged.length >= MAX_STAGED_IMAGES) {
      toast.error(t('news.tooManyDraftImages'));
      return null;
    }
    const stagedBytes = staged.reduce((sum, image) => sum + image.file.size, 0);
    if (stagedBytes + file.size > MAX_STAGED_IMAGE_BYTES) {
      toast.error(t('news.draftImagesTooLarge'));
      return null;
    }
    const objectUrl = URL.createObjectURL(file);
    stagedImagesRef.current.set(objectUrl, { file, kind });
    return { objectUrl, filename: file.name };
  }, [t]);

  const handleInlineImage = useCallback(async (file: File) => {
    const staged = stageImage(file, 'inline');
    if (!staged) return null;
    return { src: staged.objectUrl, alt: staged.filename };
  }, [stageImage]);

  const handleInlineUploadButton = useCallback((file: File) => {
    const staged = stageImage(file, 'inline');
    if (!staged) return;
    if (!editorRef.current) {
      releaseStagedImage(staged.objectUrl);
      return;
    }
    editorRef.current.chain().focus().setImage({
      src: staged.objectUrl,
      alt: staged.filename,
    }).run();
  }, [releaseStagedImage, stageImage]);

  const handleContentChange = useCallback((nextContent: string) => {
    setContent(nextContent);
    contentRef.current = nextContent;
    const referencedTransient = extractTransientImageSources(nextContent);
    [...stagedImagesRef.current.entries()].forEach(([objectUrl, staged]) => {
      if (staged.kind === 'inline' && !referencedTransient.has(objectUrl)) releaseStagedImage(objectUrl);
    });
    const referenced = extractImagePaths(nextContent);
    const removedPending = [...pendingPathsRef.current].filter(
      (path) => path !== previewPathRef.current && !referenced.has(path),
    );
    if (removedPending.length > 0) void deletePendingPaths(removedPending);
  }, [deletePendingPaths, releaseStagedImage]);

  const handlePreviewUpload = useCallback((file: File) => {
    const staged = stageImage(file, 'preview');
    if (!staged) return;
    if (previewDraftUrlRef.current) {
      const previous = stagedImagesRef.current.get(previewDraftUrlRef.current);
      releaseStagedImage(previewDraftUrlRef.current);
      if (previous?.uploadedPath) void deletePendingPaths([previous.uploadedPath]);
    }
    previewDraftUrlRef.current = staged.objectUrl;
    setPreviewDraftUrl(staged.objectUrl);
  }, [deletePendingPaths, releaseStagedImage, stageImage]);

  const removePreview = useCallback(() => {
    if (previewDraftUrlRef.current) {
      const staged = stagedImagesRef.current.get(previewDraftUrlRef.current);
      releaseStagedImage(previewDraftUrlRef.current);
      if (staged?.uploadedPath) void deletePendingPaths([staged.uploadedPath]);
    }
    previewDraftUrlRef.current = null;
    setPreviewDraftUrl(null);
    setPreviewPath(null);
    previewPathRef.current = null;
  }, [deletePendingPaths, releaseStagedImage]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setIsUploading(true);
      try {
        let normalizedContent = contentRef.current;
        let normalizedPreviewPath = previewPathRef.current;
        const replacements = new Map<string, string>();

        // Files selected or pasted into the editor stay in browser memory until
        // Save. An uploadedPath is retained across a failed post save so Retry
        // does not upload the same file twice.
        for (const [objectUrl, staged] of stagedImagesRef.current.entries()) {
          if (!staged.uploadedPath) {
            const uploaded = await uploadNewsImage(
              staged.file,
              uploadSessionRef.current,
              staged.kind,
            );
            staged.uploadedPath = uploaded.storage_path;
            pendingPathsRef.current.add(uploaded.storage_path);
          }
          if (staged.kind === 'inline') replacements.set(objectUrl, staged.uploadedPath);
          if (staged.kind === 'preview' && objectUrl === previewDraftUrlRef.current) {
            normalizedPreviewPath = staged.uploadedPath;
          }
        }

        normalizedContent = replaceImageSources(normalizedContent, replacements);

        const remoteSources = externalImageSources(normalizedContent);
        if (remoteSources.length > 20) throw new Error(t('news.tooManyExternalImages'));
        // Sequential imports cap memory/network pressure when a large article
        // with many remote images is pasted into the editor.
        for (const sourceUrl of remoteSources) {
          const imported = await importNewsImage(sourceUrl, uploadSessionRef.current);
          pendingPathsRef.current.add(imported.storage_path);
          replacements.set(sourceUrl, imported.storage_path);
        }
        normalizedContent = replaceImageSources(normalizedContent, replacements);

        const unresolvedDraftImages = extractTransientImageSources(normalizedContent);
        if (unresolvedDraftImages.size > 0) throw new Error(t('news.imageUploadFailed'));

        setContent(normalizedContent);
        contentRef.current = normalizedContent;
        editorRef.current?.commands.setContent(normalizedContent, { emitUpdate: false });
        setPreviewPath(normalizedPreviewPath);
        previewPathRef.current = normalizedPreviewPath;
        setPreviewDraftUrl(null);
        previewDraftUrlRef.current = null;
        releaseAllStagedImages();

        const payload = {
          title: title.trim(),
          content_html: normalizedContent,
          preview_image_path: normalizedPreviewPath,
          upload_session_id: uploadSessionId,
        };
        if (!postId) return await createNewsPost(payload);
        if (!detailQuery.data) throw new Error(t('news.loadDetailFailed'));
        return await updateNewsPost(postId, { ...payload, expected_version: detailQuery.data.version });
      } finally {
        setIsUploading(false);
      }
    },
    onSuccess: async () => {
      pendingPathsRef.current.clear();
      toast.success(t(isEditing ? 'news.updated' : 'news.created'));
      await queryClient.invalidateQueries({ queryKey: ['news-manage'] });
      if (postId) await queryClient.invalidateQueries({ queryKey: ['news-manage-detail', postId] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiError(error, t('news.saveFailed')));
      if ((error as { response?: { status?: number } })?.response?.status === 409 && postId) {
        void queryClient.invalidateQueries({ queryKey: ['news-manage-detail', postId] });
      }
    },
  });

  const canSave = title.trim().length > 0 && !isUploading && !saveMutation.isPending;
  // React Query can expose cached/fresh detail data before the effect above has
  // copied it into the controlled form state. Keep the skeleton mounted until
  // that exact post has been hydrated so Tiptap never boots with an empty body.
  const loading = isEditing
    && !detailQuery.isError
    && (detailQuery.isLoading
      || !detailQuery.data
      || initializedPostRef.current !== detailQuery.data.id);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[min(92dvh,900px)] w-[min(96vw,1120px)] max-w-none flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => {
          if (saveMutation.isPending || isUploading) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4 pr-14">
          <DialogTitle className="text-lg font-semibold">
            {t(isEditing ? 'news.editTitle' : 'news.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('news.editorDescription')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 space-y-5 overflow-hidden p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-[360px] w-full rounded-2xl" />
          </div>
        ) : detailQuery.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="font-medium text-destructive">{t('news.loadDetailFailed')}</p>
            <Button variant="outline" onClick={() => detailQuery.refetch()}>{t('common.retry')}</Button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="space-y-2">
                <label htmlFor="news-title" className="text-sm font-medium">{t('news.titleLabel')}</label>
                <Input
                  id="news-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={240}
                  placeholder={t('news.titlePlaceholder')}
                  className="h-11 text-base"
                />
                <p className="text-right text-[11px] text-muted-foreground">{title.length}/240</p>
              </div>

              <section className="rounded-2xl border border-border/70 bg-muted/15 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{t('news.previewImage')}</h3>
                    <p className="text-xs text-muted-foreground">{t('news.previewImageHint')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => previewInputRef.current?.click()} disabled={isUploading}>
                      <UploadCloud className="mr-1.5 h-4 w-4" /> {t(previewDraftUrl || previewPath ? 'news.replaceImage' : 'news.uploadImage')}
                    </Button>
                    {(previewDraftUrl || previewPath) && (
                      <Button variant="ghost" size="sm" onClick={removePreview} disabled={isUploading} className="text-destructive hover:text-destructive">
                        <Trash2 className="mr-1.5 h-4 w-4" /> {t('news.removeImage')}
                      </Button>
                    )}
                  </div>
                  <input
                    ref={previewInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handlePreviewUpload(file);
                      event.target.value = '';
                    }}
                  />
                </div>
                {previewDraftUrl || previewPath ? (
                  <img src={previewDraftUrl || storageUrl(previewPath)} alt="" className="aspect-[16/6] w-full rounded-xl object-cover shadow-sm" />
                ) : (
                  <button
                    type="button"
                    onClick={() => previewInputRef.current?.click()}
                    className="flex aspect-[16/4] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <ImagePlus className="h-7 w-7" />
                    <span className="text-xs font-medium">{t('news.choosePreviewImage')}</span>
                  </button>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{t('news.contentLabel')}</h3>
                    <p className="text-xs text-muted-foreground">{t('news.contentHint')}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => inlineInputRef.current?.click()} disabled={isUploading}>
                    {isUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
                    {t('news.insertImage')}
                  </Button>
                  <input
                    ref={inlineInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleInlineUploadButton(file);
                      event.target.value = '';
                    }}
                  />
                </div>
                <RichTextEditor
                  content={content}
                  onChange={handleContentChange}
                  onEditorReady={(editor) => { editorRef.current = editor; }}
                  onImageFilePaste={handleInlineImage}
                  enableImageKeyboardDelete
                  preserveTransientImages
                  minHeight="min-h-[360px]"
                />
              </section>
            </div>
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none px-5 py-4">
          <Button variant="outline" onClick={closeDialog} disabled={saveMutation.isPending}>{t('common.cancel')}</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSave || loading || detailQuery.isError} className="min-w-28">
            {saveMutation.isPending || isUploading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Save className="mr-1.5 h-4 w-4" />{t('news.saveAndPublish')}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
