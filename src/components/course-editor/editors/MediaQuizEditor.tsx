import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImagePlus, Loader2, Plus, Trash2, Upload, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadCourseAsset, deleteCourseAssetByStoragePath } from '@/api/custom-course-authoring';
import { storageUrl } from '@/utils/storage-url';
import { toast } from 'sonner';
import RichTextEditor from '../RichTextEditor';
import { Field } from './VideoEditor';

export type MediaQuizMode = 'single_select' | 'multiple_select';
export type MediaQuizMediaType = 'image' | 'video';

export interface MediaQuizChoice {
  id: string;
  html: string;
  correct: boolean;
}

export interface MediaQuizQuestion {
  id: string;
  mode: MediaQuizMode;
  prompt_html: string;
  explanation_html: string;
  hints: string[];
  media: {
    type: MediaQuizMediaType;
    storage_path: string;
    alt?: string;
  } | null;
  choices: MediaQuizChoice[];
}

export interface MediaQuizData {
  version: 1;
  mode: MediaQuizMode;
  require_correct_to_advance: true;
  questions: MediaQuizQuestion[];
}

interface MediaQuizEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  data: MediaQuizData;
  onDataChange: (v: MediaQuizData) => void;
  courseId?: string;
  onAutoSave?: (nextData?: MediaQuizData) => void | Promise<void>;
}

const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultChoices(mode: MediaQuizMode): MediaQuizChoice[] {
  return [
    { id: makeId('choice'), html: '<p>Đáp án đúng</p>', correct: true },
    { id: makeId('choice'), html: '<p>Đáp án sai</p>', correct: false },
    ...(mode === 'multiple_select'
      ? [{ id: makeId('choice'), html: '<p>Một đáp án đúng khác</p>', correct: true }]
      : []),
  ];
}

function createQuestion(mode: MediaQuizMode, index: number): MediaQuizQuestion {
  return {
    id: makeId('q'),
    mode,
    prompt_html: `<p>Câu hỏi ${index + 1}</p>`,
    explanation_html: '',
    hints: [],
    media: null,
    choices: defaultChoices(mode),
  };
}

export function createDefaultMediaQuizData(mode: MediaQuizMode = 'single_select'): MediaQuizData {
  return {
    version: 1,
    mode,
    require_correct_to_advance: true,
    questions: [createQuestion(mode, 0)],
  };
}

function parseMediaQuizMode(raw: unknown, fallback: MediaQuizMode): MediaQuizMode {
  return raw === 'single_select' || raw === 'multiple_select' ? raw : fallback;
}

function normalizeChoice(raw: any, index: number, mode: MediaQuizMode): MediaQuizChoice {
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `choice-${index}`,
    html: typeof raw?.html === 'string' && raw.html.trim() ? raw.html : `<p>Lựa chọn ${index + 1}</p>`,
    correct: typeof raw?.correct === 'boolean'
      ? raw.correct
      : mode === 'single_select' && index === 0,
  };
}

export function normalizeMediaQuizData(raw: any, fallbackMode: MediaQuizMode = 'single_select'): MediaQuizData {
  const mode = parseMediaQuizMode(raw?.mode, fallbackMode);
  const questions = Array.isArray(raw?.questions)
    ? raw.questions.map((q: any, index: number): MediaQuizQuestion => {
      const questionMode = parseMediaQuizMode(q?.mode, mode);
      const choices = Array.isArray(q?.choices) && q.choices.length >= 2
        ? q.choices.map((choice: any, choiceIndex: number) => normalizeChoice(choice, choiceIndex, questionMode))
        : defaultChoices(questionMode);
      const mediaType = q?.media?.type === 'video' ? 'video' : 'image';
      const storagePath = typeof q?.media?.storage_path === 'string' ? q.media.storage_path.trim() : '';
      return {
        id: typeof q?.id === 'string' && q.id ? q.id : `q-${index}`,
        mode: questionMode,
        prompt_html: typeof q?.prompt_html === 'string' && q.prompt_html.trim()
          ? q.prompt_html
          : `<p>Câu hỏi ${index + 1}</p>`,
        explanation_html: typeof q?.explanation_html === 'string' ? q.explanation_html : '',
        hints: Array.isArray(q?.hints)
          ? q.hints.filter((hint: unknown): hint is string => typeof hint === 'string').slice(0, 10)
          : [],
        media: storagePath
          ? {
            type: mediaType,
            storage_path: storagePath,
            alt: typeof q?.media?.alt === 'string' ? q.media.alt : '',
          }
            : null,
        choices: ensureCorrectChoices(choices, questionMode),
      };
    })
    : [];

  return {
    version: 1,
    mode: questions[0]?.mode ?? mode,
    require_correct_to_advance: true,
    questions: questions.length > 0 ? questions : [createQuestion(mode, 0)],
  };
}

function stripHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return value.replace(/<[^>]*>/g, '').trim();
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.body.textContent?.trim() || '';
}

export function getMediaQuizValidationError(data: MediaQuizData): string | null {
  if (!data.questions.length) return 'Câu hỏi kèm media cần ít nhất một câu hỏi.';
  for (let index = 0; index < data.questions.length; index += 1) {
    const question = data.questions[index];
    if (!stripHtml(question.prompt_html)) return `Câu hỏi ${index + 1} cần nội dung câu hỏi.`;
    if (!question.media?.storage_path) return `Câu hỏi ${index + 1} cần upload media.`;
    if (question.choices.length < 2) return `Câu hỏi ${index + 1} cần ít nhất hai lựa chọn.`;
    if (!question.choices.some(choice => choice.correct)) return `Câu hỏi ${index + 1} cần ít nhất một đáp án đúng.`;
    if (question.mode === 'single_select' && question.choices.filter(choice => choice.correct).length !== 1) {
      return `Câu hỏi ${index + 1} phải có đúng một đáp án đúng.`;
    }
    if (question.choices.some(choice => !stripHtml(choice.html))) return `Câu hỏi ${index + 1} có lựa chọn đang để trống.`;
  }
  return null;
}

function ensureCorrectChoices(choices: MediaQuizChoice[], mode: MediaQuizMode): MediaQuizChoice[] {
  if (choices.length === 0) return defaultChoices(mode);
  if (mode === 'single_select') {
    const firstCorrect = choices.findIndex(choice => choice.correct);
    const safeIndex = firstCorrect >= 0 ? firstCorrect : 0;
    return choices.map((choice, index) => ({ ...choice, correct: index === safeIndex }));
  }
  if (choices.some(choice => choice.correct)) return choices;
  return choices.map((choice, index) => ({ ...choice, correct: index === 0 }));
}

function resolveMediaUrl(path: string) {
  return storageUrl(path) || path;
}

function isUnconfiguredQuiz(data: MediaQuizData): boolean {
  if (data.questions.length !== 1) return false;
  const question = data.questions[0];
  const prompt = stripHtml(question.prompt_html).toLowerCase();
  return !question.media?.storage_path && (prompt === 'câu hỏi 1' || prompt === 'question 1');
}

function SortableQuestionShell({
  id,
  children,
}: {
  id: string;
  children: (dragHandleProps: any) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 20, opacity: 0.65 } : {}),
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'relative' : undefined}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

function QuestionTypeChooser({
  title,
  onSelect,
  onCancel,
}: {
  title: string;
  onSelect: (mode: MediaQuizMode) => void;
  onCancel?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chọn một kiểu trả lời để bắt đầu tạo nội dung.
          </p>
        </div>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Hủy
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect('single_select')}
          className="rounded-xl border-2 border-border bg-background p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
        >
          <div className="font-bold text-sm">Chọn một đáp án</div>
          <p className="mt-1 text-xs text-muted-foreground">Học viên chọn đúng một lựa chọn.</p>
        </button>
        <button
          type="button"
          onClick={() => onSelect('multiple_select')}
          className="rounded-xl border-2 border-border bg-background p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
        >
          <div className="font-bold text-sm">Chọn nhiều đáp án</div>
          <p className="mt-1 text-xs text-muted-foreground">Học viên phải chọn đúng toàn bộ đáp án.</p>
        </button>
      </div>
    </div>
  );
}

export default function MediaQuizEditor({
  displayName,
  onDisplayNameChange,
  data,
  onDataChange,
  courseId,
  onAutoSave,
}: MediaQuizEditorProps) {
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingQuestionId, setUploadingQuestionId] = useState<string | null>(null);
  const quiz = normalizeMediaQuizData(data);
  const quizRef = useRef<MediaQuizData>(quiz);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    quizRef.current = quiz;
  }, [quiz]);
  const [showQuestionTypeChooser, setShowQuestionTypeChooser] = useState(() => isUnconfiguredQuiz(quiz));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const validationError = getMediaQuizValidationError(quiz);
  const choosingFirstQuestion = showQuestionTypeChooser && isUnconfiguredQuiz(quiz);

  const updateQuiz = (updater: (prev: MediaQuizData) => MediaQuizData, autosave = false) => {
    const current = quizRef.current;
    const next = normalizeMediaQuizData(updater(current), current.mode);
    quizRef.current = next;
    onDataChange(next);
    if (autosave) void persistQuizDraft(next);
  };
  const persistQuizDraft = (nextQuiz: MediaQuizData) => {
    const run = saveQueueRef.current.then(async () => {
      await onAutoSave?.(nextQuiz);
    });
    saveQueueRef.current = run.catch(() => {});
    return run;
  };

  const updateQuestion = (questionId: string, updater: (q: MediaQuizQuestion) => MediaQuizQuestion) => {
    updateQuiz(prev => ({
      ...prev,
      questions: prev.questions.map(question => question.id === questionId ? updater(question) : question),
    }));
  };

  const handleChooseQuestionType = (mode: MediaQuizMode) => {
    updateQuiz(prev => {
      if (isUnconfiguredQuiz(prev)) {
        return { ...prev, mode, questions: [createQuestion(mode, 0)] };
      }
      return {
        ...prev,
        questions: [...prev.questions, createQuestion(mode, prev.questions.length)],
      };
    });
    setShowQuestionTypeChooser(false);
  };

  const handleUploadMedia = async (questionId: string, file: File, mediaType: MediaQuizMediaType) => {
    if (!courseId) {
      toast.error('Thiếu courseId, không thể tải media lên.');
      return;
    }
    if (mediaType === 'video') {
      if (file.size > MAX_VIDEO_SIZE) {
        toast.error(`Video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa 100MB.`);
        return;
      }
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        toast.error('Định dạng video chưa được hỗ trợ. Hãy dùng MP4, WebM hoặc MOV.');
        return;
      }
    }

    setUploadingQuestionId(questionId);
    try {
      const result = await uploadCourseAsset(courseId, file);
      const path = result?.storage_path || result?.url || '';
      if (!path) throw new Error('Phản hồi tải lên không có đường dẫn lưu trữ.');
      const currentQuiz = quizRef.current;

      const nextQuiz = normalizeMediaQuizData({
        ...currentQuiz,
        questions: currentQuiz.questions.map(question => question.id === questionId
          ? {
            ...question,
            media: {
              type: mediaType,
              storage_path: path,
              alt: file.name,
            },
          }
          : question),
      }, currentQuiz.mode);

      quizRef.current = nextQuiz;
      onDataChange(nextQuiz);
      try {
        await persistQuizDraft(nextQuiz);
      } catch (saveErr) {
        try { await deleteCourseAssetByStoragePath(courseId, path); } catch { }
        quizRef.current = currentQuiz;
        onDataChange(currentQuiz);
        throw saveErr;
      }
      toast.success('Đã tải media lên và lưu draft.');
    } catch (err: any) {
      toast.error('Tải lên thất bại: ' + (err?.response?.data?.error || err.message || 'Lỗi không rõ'));
    } finally {
      setUploadingQuestionId(null);
    }
  };

  const handleRemoveMedia = async (questionId: string) => {
    const currentQuiz = quizRef.current;
    const nextQuiz = normalizeMediaQuizData({
      ...currentQuiz,
      questions: currentQuiz.questions.map(item => item.id === questionId ? { ...item, media: null } : item),
    }, currentQuiz.mode);

    quizRef.current = nextQuiz;
    onDataChange(nextQuiz);
    try {
      await persistQuizDraft(nextQuiz);
      toast.success('Đã xóa media và lưu draft.');
    } catch (err: any) {
      quizRef.current = currentQuiz;
      onDataChange(currentQuiz);
      toast.error('Xóa media thất bại: ' + (err?.response?.data?.error || err.message || 'Lỗi không rõ'));
    }
  };

  const handleAddQuestion = () => {
    setShowQuestionTypeChooser(true);
  };

  const handleRemoveQuestion = async (questionId: string) => {
    const currentQuiz = quizRef.current;
    if (currentQuiz.questions.length <= 1) {
      toast.error('Câu hỏi kèm media cần ít nhất một câu hỏi.');
      return;
    }
    const nextQuiz = normalizeMediaQuizData({
      ...currentQuiz,
      questions: currentQuiz.questions.filter(question => question.id !== questionId),
    }, currentQuiz.mode);
    quizRef.current = nextQuiz;
    onDataChange(nextQuiz);
    try {
      await persistQuizDraft(nextQuiz);
      toast.success('Đã xóa câu hỏi và lưu draft.');
    } catch (err: any) {
      quizRef.current = currentQuiz;
      onDataChange(currentQuiz);
      toast.error('Xóa câu hỏi thất bại: ' + (err?.response?.data?.error || err.message || 'Lỗi không rõ'));
    }
  };

  const handleQuestionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateQuiz(prev => {
      const oldIndex = prev.questions.findIndex(question => question.id === active.id);
      const newIndex = prev.questions.findIndex(question => question.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return { ...prev, questions: arrayMove(prev.questions, oldIndex, newIndex) };
    });
  };

  const handleAddChoice = (questionId: string) => {
    updateQuestion(questionId, question => ({
      ...question,
      choices: [
        ...question.choices,
        { id: makeId('choice'), html: '<p>Lựa chọn mới</p>', correct: false },
      ],
    }));
  };

  const handleChoiceChange = (questionId: string, choiceId: string, updates: Partial<MediaQuizChoice>) => {
    updateQuestion(questionId, question => {
      const choices = question.choices.map(choice => choice.id === choiceId ? { ...choice, ...updates } : choice);
      return { ...question, choices: ensureCorrectChoices(choices, question.mode) };
    });
  };

  const handleDeleteChoice = (questionId: string, choiceId: string) => {
    updateQuestion(questionId, question => {
      if (question.choices.length <= 2) {
        toast.error('Mỗi câu hỏi cần ít nhất hai lựa chọn.');
        return question;
      }
      return {
        ...question,
        choices: ensureCorrectChoices(question.choices.filter(choice => choice.id !== choiceId), question.mode),
      };
    });
  };

  const handleAddHint = (questionId: string) => {
    updateQuestion(questionId, question => ({
      ...question,
      hints: [...(question.hints || []), '<p>Gợi ý mới</p>'],
    }));
  };

  const handleHintChange = (questionId: string, hintIndex: number, value: string) => {
    updateQuestion(questionId, question => ({
      ...question,
      hints: (question.hints || []).map((hint, index) => index === hintIndex ? value : hint),
    }));
  };

  const handleDeleteHint = (questionId: string, hintIndex: number) => {
    updateQuestion(questionId, question => ({
      ...question,
      hints: (question.hints || []).filter((_, index) => index !== hintIndex),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between border-b pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold">
            <Video className="h-5 w-5" />
            <span>Câu hỏi kèm media</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Học viên phải trả lời đúng từng câu trước khi xem media tiếp theo.
          </p>
        </div>
        <div className="w-1/2">
          <Field label="Tên hiển thị">
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              value={displayName}
              onChange={event => onDisplayNameChange(event.target.value)}
            />
          </Field>
        </div>
      </div>

      {choosingFirstQuestion && (
        <QuestionTypeChooser title="Chọn loại câu hỏi đầu tiên" onSelect={handleChooseQuestionType} />
      )}

      {!choosingFirstQuestion && validationError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {validationError}
        </div>
      )}

      {!choosingFirstQuestion && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleQuestionDragEnd}>
          <SortableContext items={quiz.questions.map(question => question.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-5">
        {quiz.questions.map((question, questionIndex) => {
          const mediaUrl = question.media?.storage_path ? resolveMediaUrl(question.media.storage_path) : '';
          const isUploading = uploadingQuestionId === question.id;

          return (
            <SortableQuestionShell key={question.id} id={question.id}>
              {(dragHandleProps) => (
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Câu hỏi {questionIndex + 1}</div>
                  <div className="text-xs text-muted-foreground">
                    Câu hỏi này bắt buộc có media.
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    {...dragHandleProps}
                    className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                    aria-label="Kéo để sắp xếp câu hỏi"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveQuestion(question.id)}
                    disabled={quiz.questions.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-3">
                {question.media ? (
                  <div className="space-y-2">
                    {question.media.type === 'video' ? (
                      <div className="aspect-video overflow-hidden rounded-lg bg-black">
                        <video src={mediaUrl} controls className="h-full w-full object-contain" preload="metadata" />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border bg-background p-2">
                        <img
                          src={mediaUrl}
                          alt={question.media.alt || 'Ảnh câu hỏi kèm media'}
                          className="max-h-[260px] w-full rounded-md object-contain"
                        />
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                        onClick={() => handleRemoveMedia(question.id)}
                      >
                        <X className="h-4 w-4" />
                        Xóa media
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background py-8 text-muted-foreground gap-2">
                    <ImagePlus className="h-8 w-8 opacity-60" />
                    <span className="text-sm font-medium">Tải media lên cho câu hỏi này</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-2"
                    disabled={isUploading}
                    onClick={() => imageInputRefs.current[question.id]?.click()}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Tải ảnh lên
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                    disabled={isUploading}
                    onClick={() => videoInputRefs.current[question.id]?.click()}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Tải video lên
                  </Button>
                  <span className="text-xs text-muted-foreground">Hỗ trợ ảnh hoặc MP4/WebM/MOV, tối đa 100MB.</span>
                  <input
                    ref={element => { imageInputRefs.current[question.id] = element; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) handleUploadMedia(question.id, file, 'image');
                      event.target.value = '';
                    }}
                  />
                  <input
                    ref={element => { videoInputRefs.current[question.id] = element; }}
                    type="file"
                    accept=".mp4,.webm,.mov"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) handleUploadMedia(question.id, file, 'video');
                      event.target.value = '';
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold">Nội dung câu hỏi</h3>
                <RichTextEditor
                  content={question.prompt_html}
                  onChange={value => updateQuestion(question.id, item => ({ ...item, prompt_html: value }))}
                  minHeight="min-h-[100px]"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold">Đáp án</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {question.mode === 'single_select'
                      ? 'Đánh dấu đúng một đáp án đúng.'
                      : 'Đánh dấu tất cả đáp án đúng. Học viên phải chọn đúng toàn bộ đáp án.'}
                  </p>
                </div>

                <div className="space-y-3">
                  {question.choices.map((choice, choiceIndex) => (
                    <div key={choice.id} className="flex items-start gap-3 group">
                      <div className="pt-[14px]">
                        <input
                          type={question.mode === 'single_select' ? 'radio' : 'checkbox'}
                          name={`correct-${question.id}`}
                          checked={choice.correct}
                          onChange={event => {
                            if (question.mode === 'single_select') {
                              updateQuestion(question.id, item => ({
                                ...item,
                                choices: item.choices.map(option => ({ ...option, correct: option.id === choice.id })),
                              }));
                            } else {
                              handleChoiceChange(question.id, choice.id, { correct: event.target.checked });
                            }
                          }}
                          className="h-5 w-5 cursor-pointer accent-primary"
                        />
                      </div>
                      <div className="pt-[15px] w-6 shrink-0 text-center text-sm font-bold text-muted-foreground">
                        {String.fromCharCode(65 + choiceIndex)}
                      </div>
                      <div className="flex-1">
                        <RichTextEditor
                          content={choice.html}
                          onChange={value => handleChoiceChange(question.id, choice.id, { html: value })}
                          minHeight="min-h-[44px]"
                          hideToolbar
                        />
                      </div>
                      <div className="pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteChoice(question.id, choice.id)}
                          disabled={question.choices.length <= 2}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  className="text-sm font-semibold pl-2 hover:bg-primary/5 hover:text-primary"
                  onClick={() => handleAddChoice(question.id)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm lựa chọn
                </Button>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <div>
                  <h3 className="text-sm font-bold">Giải thích</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hiển thị sau khi học viên trả lời đúng câu hỏi này.
                  </p>
                </div>
                <RichTextEditor
                  content={question.explanation_html || ''}
                  onChange={value => updateQuestion(question.id, item => ({ ...item, explanation_html: value }))}
                  minHeight="min-h-[80px]"
                />
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">Gợi ý</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Học viên có thể mở gợi ý trước khi xác nhận đáp án.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleAddHint(question.id)}
                    disabled={(question.hints || []).length >= 10}
                  >
                    <Plus className="h-4 w-4" />
                    Thêm gợi ý
                  </Button>
                </div>

                {(question.hints || []).length > 0 ? (
                  <div className="space-y-3">
                    {(question.hints || []).map((hint, hintIndex) => (
                      <div key={`${question.id}-hint-${hintIndex}`} className="flex items-start gap-3 group">
                        <div className="pt-[14px] w-14 shrink-0 text-xs font-bold text-muted-foreground">
                          Gợi ý {hintIndex + 1}
                        </div>
                        <div className="flex-1">
                          <RichTextEditor
                            content={hint}
                            onChange={value => handleHintChange(question.id, hintIndex, value)}
                            minHeight="min-h-[44px]"
                            hideToolbar
                          />
                        </div>
                        <div className="pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteHint(question.id, hintIndex)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    Chưa có gợi ý cho câu hỏi này.
                  </div>
                )}
              </div>
            </div>
              )}
            </SortableQuestionShell>
          );
        })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!choosingFirstQuestion && (
        showQuestionTypeChooser ? (
          <QuestionTypeChooser
            title="Chọn loại câu hỏi mới"
            onSelect={handleChooseQuestionType}
            onCancel={() => setShowQuestionTypeChooser(false)}
          />
        ) : (
          <Button type="button" variant="outline" className="w-full border-dashed gap-2" onClick={handleAddQuestion}>
            <Plus className="h-4 w-4" />
            Thêm câu hỏi
          </Button>
        )
      )}
    </div>
  );
}
