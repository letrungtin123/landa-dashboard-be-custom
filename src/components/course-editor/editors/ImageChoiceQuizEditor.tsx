import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteCourseAssetByStoragePath, uploadCourseAsset } from '@/api/custom-course-authoring';
import { COURSE_ASSET_MAX_UPLOAD_BYTES, COURSE_ASSET_MAX_UPLOAD_LABEL } from '@/utils/course-asset-upload';
import { storageUrl } from '@/utils/storage-url';
import RichTextEditor from '../RichTextEditor';
import { Field } from './VideoEditor';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import { getLocalizedApiError } from '@/utils/localized-error';

export interface ImageChoiceQuizChoice {
  id: string;
  html: string;
  correct: boolean;
  image: {
    storage_path: string;
    alt?: string;
  };
}

export interface ImageChoiceQuizData {
  version: 1;
  prompt_html: string;
  explanation_html: string;
  hints: string[];
  choices: ImageChoiceQuizChoice[];
}

interface ImageChoiceQuizEditorProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  data: ImageChoiceQuizData;
  onDataChange: (value: ImageChoiceQuizData) => void;
  courseId?: string;
  onAssetUploaded?: (storagePath: string) => void;
  onAutoSave?: (nextData?: ImageChoiceQuizData) => void | Promise<void>;
}

const MIN_CHOICES = 2;
const MAX_CHOICES = 4;
type ImageChoiceQuizValidationMode = 'draft' | 'publish';

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultChoice(index: number, correct = false): ImageChoiceQuizChoice {
  return {
    id: makeId('choice'),
    html: `<p>${correct ? 'Đáp án đúng' : `Đáp án sai ${index}`}</p>`,
    correct,
    image: {
      storage_path: '',
      alt: '',
    },
  };
}

export function createDefaultImageChoiceQuizData(): ImageChoiceQuizData {
  return {
    version: 1,
    prompt_html: '<p>Câu hỏi của bạn</p>',
    explanation_html: '',
    hints: [],
    choices: [defaultChoice(1, true), defaultChoice(2, false)],
  };
}

function stripHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return value.replace(/<[^>]*>/g, '').trim();
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.body.textContent?.trim() || '';
}

function normalizeChoice(raw: any, index: number): ImageChoiceQuizChoice {
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `choice_${index + 1}`,
    html: typeof raw?.html === 'string' && raw.html.trim() ? raw.html : `<p>Đáp án ${index + 1}</p>`,
    correct: raw?.correct === true,
    image: {
      storage_path: typeof raw?.image?.storage_path === 'string' ? raw.image.storage_path.trim() : '',
      alt: typeof raw?.image?.alt === 'string' ? raw.image.alt : '',
    },
  };
}

function ensureChoiceBounds(choices: ImageChoiceQuizChoice[]): ImageChoiceQuizChoice[] {
  const next = choices.slice(0, MAX_CHOICES);
  while (next.length < MIN_CHOICES) {
    next.push(defaultChoice(next.length + 1, next.length === 0));
  }
  const firstCorrect = next.findIndex(choice => choice.correct);
  const safeCorrectIndex = firstCorrect >= 0 ? firstCorrect : 0;
  return next.map((choice, index) => ({ ...choice, correct: index === safeCorrectIndex }));
}

export function normalizeImageChoiceQuizData(raw: any): ImageChoiceQuizData {
  const choices = Array.isArray(raw?.choices)
    ? raw.choices.map((choice: any, index: number) => normalizeChoice(choice, index))
    : [];

  return {
    version: 1,
    prompt_html: typeof raw?.prompt_html === 'string' && raw.prompt_html.trim()
      ? raw.prompt_html
      : '<p>Câu hỏi của bạn</p>',
    explanation_html: typeof raw?.explanation_html === 'string' ? raw.explanation_html : '',
    hints: Array.isArray(raw?.hints)
      ? raw.hints
          .filter((hint: unknown): hint is string => typeof hint === 'string')
          .slice(0, 10)
      : [],
    choices: ensureChoiceBounds(choices.length > 0 ? choices : createDefaultImageChoiceQuizData().choices),
  };
}

export function getImageChoiceQuizValidationError(
  data: ImageChoiceQuizData,
  mode: ImageChoiceQuizValidationMode = 'publish',
): string | null {
  if (!stripHtml(data.prompt_html)) return i18n.t('courseEditorForms.imageChoiceQuestionRequired');
  if (data.choices.length < MIN_CHOICES || data.choices.length > MAX_CHOICES) {
    return i18n.t('courseEditorForms.imageChoiceAnswerRange', { min: MIN_CHOICES, max: MAX_CHOICES });
  }
  if (data.choices.filter(choice => choice.correct).length !== 1) {
    return i18n.t('courseEditorForms.imageChoiceOneCorrect');
  }
  for (let index = 0; index < data.choices.length; index += 1) {
    const choice = data.choices[index];
    if (!stripHtml(choice.html)) return i18n.t('courseEditorForms.imageChoiceAnswerContentRequired', { count: index + 1 });
    if (mode === 'publish' && !choice.image.storage_path) return i18n.t('courseEditorForms.imageChoiceAnswerImageRequired', { count: index + 1 });
  }
  return null;
}

export function getImageChoiceQuizDraftValidationError(data: ImageChoiceQuizData): string | null {
  return getImageChoiceQuizValidationError(data, 'draft');
}

export function imageChoiceQuizStoragePaths(raw: any): string[] {
  const quiz = normalizeImageChoiceQuizData(raw);
  return Array.from(new Set(
    quiz.choices
      .map(choice => choice.image.storage_path.trim())
      .filter(Boolean),
  ));
}

export default function ImageChoiceQuizEditor({
  displayName,
  onDisplayNameChange,
  data,
  onDataChange,
  courseId,
  onAssetUploaded,
  onAutoSave,
}: ImageChoiceQuizEditorProps) {
  const { t } = useTranslation();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingChoiceId, setUploadingChoiceId] = useState<string | null>(null);
  const quiz = normalizeImageChoiceQuizData(data);
  const quizRef = useRef<ImageChoiceQuizData>(quiz);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const validationError = getImageChoiceQuizValidationError(quiz);

  useEffect(() => {
    quizRef.current = quiz;
  }, [quiz]);

  const applyQuizData = (next: ImageChoiceQuizData) => {
    quizRef.current = next;
    onDataChange(next);
    return next;
  };

  const persistQuizDraft = (nextQuiz: ImageChoiceQuizData) => {
    const run = saveQueueRef.current.then(async () => {
      await onAutoSave?.(nextQuiz);
    });
    saveQueueRef.current = run.catch(() => {});
    return run;
  };

  const updateQuiz = (updater: (previous: ImageChoiceQuizData) => ImageChoiceQuizData) => {
    const next = normalizeImageChoiceQuizData(updater(quizRef.current));
    return applyQuizData(next);
  };

  const updateChoice = (choiceId: string, updater: (choice: ImageChoiceQuizChoice) => ImageChoiceQuizChoice) => {
    return updateQuiz(previous => ({
      ...previous,
      choices: ensureChoiceBounds(previous.choices.map(choice => choice.id === choiceId ? updater(choice) : choice)),
    }));
  };

  const setCorrectChoice = (choiceId: string) => {
    updateQuiz(previous => ({
      ...previous,
      choices: previous.choices.map(choice => ({ ...choice, correct: choice.id === choiceId })),
    }));
  };

  const handleAddChoice = () => {
    if (quiz.choices.length >= MAX_CHOICES) {
      toast.error(t('courseEditorForms.maximumAnswers', { count: MAX_CHOICES }));
      return;
    }
    updateQuiz(previous => ({
      ...previous,
      choices: ensureChoiceBounds([...previous.choices, defaultChoice(previous.choices.length + 1, false)]),
    }));
  };

  const handleDeleteChoice = (choiceId: string) => {
    if (quiz.choices.length <= MIN_CHOICES) {
      toast.error(t('courseEditorForms.minimumAnswers', { count: MIN_CHOICES }));
      return;
    }
    updateQuiz(previous => ({
      ...previous,
      choices: ensureChoiceBounds(previous.choices.filter(choice => choice.id !== choiceId)),
    }));
  };

  const handleUploadImage = async (choiceId: string, file: File) => {
    if (!courseId) {
      toast.error(t('courseEditorForms.missingCourseIdForImage'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('courseEditorForms.imagesOnly'));
      return;
    }
    if (file.size > COURSE_ASSET_MAX_UPLOAD_BYTES) {
      toast.error(t('courseEditorForms.imageTooLarge', { size: COURSE_ASSET_MAX_UPLOAD_LABEL }));
      return;
    }

    setUploadingChoiceId(choiceId);
    try {
      const result = await uploadCourseAsset(courseId, file);
      const storagePath = result?.storage_path || result?.url || '';
      if (!storagePath) throw new Error(t('courseEditorForms.missingImageStoragePath'));
      onAssetUploaded?.(storagePath);
      const currentQuiz = quizRef.current;
      const nextQuiz = updateChoice(choiceId, choice => ({
        ...choice,
        image: {
          storage_path: storagePath,
          alt: file.name,
        },
      }));
      try {
        await persistQuizDraft(nextQuiz);
      } catch (saveErr) {
        try { await deleteCourseAssetByStoragePath(courseId, storagePath); } catch { /* Best-effort cleanup. */ }
        applyQuizData(currentQuiz);
        throw saveErr;
      }
      toast.success(t('courseEditorForms.answerImageUploaded'));
    } catch (err: any) {
      toast.error(t('courseEditorForms.answerImageUploadFailed', {
        message: err?.message === t('courseEditorForms.missingImageStoragePath')
          ? err.message
          : getLocalizedApiError(err, t('courseUnit.unknownError')),
      }));
    } finally {
      setUploadingChoiceId(null);
    }
  };

  const handleRemoveImage = async (choiceId: string) => {
    const currentQuiz = quizRef.current;
    const nextQuiz = updateChoice(choiceId, current => ({ ...current, image: { storage_path: '', alt: '' } }));
    try {
      await persistQuizDraft(nextQuiz);
      toast.success(t('courseEditorForms.answerImageRemoved'));
    } catch (err: any) {
      applyQuizData(currentQuiz);
      toast.error(t('courseEditorForms.answerImageRemoveFailed', {
        message: getLocalizedApiError(err, t('courseUnit.unknownError')),
      }));
    }
  };

  const handleAddHint = () => {
    if ((quiz.hints || []).length >= 10) {
      toast.error(t('courseEditorForms.maximumHints', { count: 10 }));
      return;
    }
    updateQuiz(previous => ({
      ...previous,
      hints: [...(previous.hints || []), '<p>Gợi ý mới</p>'],
    }));
  };

  const handleHintChange = (hintIndex: number, value: string) => {
    updateQuiz(previous => ({
      ...previous,
      hints: (previous.hints || []).map((hint, index) => index === hintIndex ? value : hint),
    }));
  };

  const handleDeleteHint = (hintIndex: number) => {
    updateQuiz(previous => ({
      ...previous,
      hints: (previous.hints || []).filter((_, index) => index !== hintIndex),
    }));
  };

  return (
    <div className="space-y-6">
      <style>{`
        .image-choice-answer-editor > div {
          height: auto !important;
          min-height: 88px;
        }
        .image-choice-answer-editor > div > div {
          flex: 0 0 auto;
          min-height: 88px;
          overflow: visible;
        }
        .image-choice-answer-editor .tiptap-editor {
          min-height: 88px !important;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }
        .image-choice-answer-editor .tiptap-editor p {
          margin: 0 !important;
        }
      `}</style>
      <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold">
            <ImagePlus className="h-5 w-5" />
            <span>{t('courseEditorForms.imageChoiceQuizTitle')}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t('courseEditorForms.imageChoiceQuizDescription')}
          </p>
        </div>
        <div className="w-full lg:w-1/2">
          <Field label={t('courseUnit.displayName')}>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              value={displayName}
              onChange={event => onDisplayNameChange(event.target.value)}
            />
          </Field>
        </div>
      </div>

      {validationError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {validationError}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold">{t('courseEditorForms.questionContent')}</h3>
        <RichTextEditor
          content={quiz.prompt_html}
          onChange={value => updateQuiz(previous => ({ ...previous, prompt_html: value }))}
          minHeight="min-h-[120px]"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">{t('courseEditorForms.imageAnswers')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t('courseEditorForms.imageChoiceBounds')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleAddChoice}
            disabled={quiz.choices.length >= MAX_CHOICES}
          >
            <Plus className="h-4 w-4" />
            {t('courseEditorForms.addAnswer')}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          {quiz.choices.map((choice, choiceIndex) => {
            const imageUrl = choice.image.storage_path ? storageUrl(choice.image.storage_path) : '';
            const uploading = uploadingChoiceId === choice.id;
            return (
              <div key={choice.id} className="app-liquid-card min-w-0 rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex min-w-0 items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="image-choice-correct"
                      checked={choice.correct}
                      onChange={() => setCorrectChoice(choice.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{t('courseEditorForms.answerLetter', { letter: String.fromCharCode(65 + choiceIndex) })}</span>
                    {choice.correct && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDeleteChoice(choice.id)}
                    disabled={quiz.choices.length <= MIN_CHOICES}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-muted/10 p-2">
                  {imageUrl ? (
                    <div className="relative">
                      <img
                        src={imageUrl}
                        alt={choice.image.alt || t('courseEditorForms.answerImage', { count: choiceIndex + 1 })}
                        className="aspect-[16/10] w-full rounded-md bg-background object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRemoveImage(choice.id)}
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-destructive shadow hover:bg-background"
                        aria-label={t('courseEditorForms.removeAnswerImage')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputRefs.current[choice.id]?.click()}
                      disabled={uploading}
                      className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-background text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
                      <span>{t('courseEditorForms.uploadAnswerImage')}</span>
                    </button>
                  )}
                  <input
                    ref={element => { inputRefs.current[choice.id] = element; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) void handleUploadImage(choice.id, file);
                      event.target.value = '';
                    }}
                  />
                </div>

                {imageUrl && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                    disabled={uploading}
                    onClick={() => inputRefs.current[choice.id]?.click()}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {t('courseEditorForms.changeImage')}
                  </Button>
                )}

                <div className="image-choice-answer-editor">
                  <RichTextEditor
                    content={choice.html}
                    onChange={value => updateChoice(choice.id, current => ({ ...current, html: value }))}
                    minHeight="min-h-[88px]"
                    hideToolbar
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div>
          <h3 className="text-sm font-bold">{t('courseEditorForms.explanation')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('courseEditorForms.explanationAfterCorrect')}
          </p>
        </div>
        <RichTextEditor
          content={quiz.explanation_html || ''}
          onChange={value => updateQuiz(previous => ({ ...previous, explanation_html: value }))}
          minHeight="min-h-[90px]"
        />
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">{t('courseEditorForms.hints')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('courseEditorForms.hintsBeforeAnswer')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleAddHint}
            disabled={(quiz.hints || []).length >= 10}
          >
            <Plus className="h-4 w-4" />
            {t('courseEditorForms.addHint')}
          </Button>
        </div>

        {(quiz.hints || []).length > 0 ? (
          <div className="space-y-3">
            {(quiz.hints || []).map((hint, hintIndex) => (
              <div key={`image-choice-hint-${hintIndex}`} className="flex items-start gap-3 group">
                <div className="pt-[14px] w-14 shrink-0 text-xs font-bold text-muted-foreground">
                  {t('courseEditorForms.hintNumber', { count: hintIndex + 1 })}
                </div>
                <div className="flex-1">
                  <RichTextEditor
                    content={hint}
                    onChange={value => handleHintChange(hintIndex, value)}
                    minHeight="min-h-[44px]"
                    hideToolbar
                  />
                </div>
                <div className="pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDeleteHint(hintIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {t('courseEditorForms.noHintsForQuestion')}
          </div>
        )}
      </div>
    </div>
  );
}
