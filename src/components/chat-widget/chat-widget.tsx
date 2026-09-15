// ═══════════════════════════════════════════════════════════════
// Chat Widget — Draggable FAB + Drawer with full chat experience
// FAB shows bot avatar, draggable via native pointer events
// Header has fullscreen toggle
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageCircle, X, Plus, ArrowLeft, Send, Trash2,
  Loader2, Bot, Sparkles, Clock, Maximize2, Minimize2, AlertTriangle,
  BookOpenCheck, CheckCircle2, AtSign, FileText, Search, Network,
  ChevronDown, ChevronRight, BookOpen, Target, Clock3, ClipboardCheck, ListTree,
  Mic, MicOff, PhoneOff, Play, Volume2, VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { storageUrl } from '@/utils/storage-url';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import {
  fetchActiveBot, fetchConversations, createConversation,
  deleteConversation, fetchMessages, sendMessageStream,
  fetchActiveBotPersonas, fetchLessonAuthorChatSettings,
  fetchLessonAuthorSourceDocuments, applyLessonAuthorJob,
  type ActiveBot, type ChatConversation, type ChatMessage,
  type BotPersona,
  type LessonAuthorBlueprint, type LessonAuthorBlueprintEvent, type LessonAuthorProgressEvent,
  type LessonAuthorProposalEvent, type LessonAuthorSettings,
  type OutlineMention, type LessonAuthorSourceDocument,
} from '@/api/custom-chat';
import {
  getCourseOutlineIndex,
  type CourseIndexResponse,
  type CourseIndexSection,
} from '@/api/custom-course-authoring';
import { LessonAuthorMindmapModal } from './lesson-author-mindmap-modal';
import { LessonAuthorBlueprintDialog } from './lesson-author-blueprint-dialog';
import { AppTooltip } from '@/components/ui/tooltip';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import { getLocalizedApiError } from '@/utils/localized-error';

// ── Types ──
type WidgetState = 'loading' | 'no-bot' | 'persona-picker' | 'conversations' | 'chat' | 'config-warning';
type ChatSurface = 'admin' | 'lesson_author';
type ChatRuntimeAvailability = 'loading' | 'available' | 'unavailable';
type OutlineMentionOption = OutlineMention & { label: string; depth: number };
type OutlineAncestor = { id: string; block_type: string };
type VoiceCaptureState = 'idle' | 'requesting' | 'listening';
type VoiceModePhase = 'idle' | 'requesting' | 'listening' | 'thinking' | 'preparing' | 'speaking' | 'play_blocked';
type SendSource = 'text' | 'voice';
type BlueprintDraftSelection = {
  blueprint_id: string;
  chapter_index: number;
  chapter_title: string;
};

const CHAT_SCROLL_STORAGE_PREFIX = 'chat-widget-scroll-v1:';
const LESSON_AUTHOR_PROGRESS_STORAGE_PREFIX = 'lesson-author-progress-v1:';
const LESSON_AUTHOR_PROGRESS_STEP_COUNT = 4;
const LESSON_AUTHOR_PROGRESS_TTL_MS = 30 * 60 * 1000;
const MIN_STREAMING_UI_MS = 1_500;

type StoredLessonAuthorProgress = {
  event: LessonAuthorProgressEvent;
  simulatedStepIndex: number;
  updatedAt: number;
};

function getChatScrollStorageKey(conversationId: string): string {
  return `${CHAT_SCROLL_STORAGE_PREFIX}${conversationId}`;
}

function readStoredChatScrollTop(conversationId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = Number(window.sessionStorage.getItem(getChatScrollStorageKey(conversationId)));
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStoredChatScrollTop(conversationId: string, scrollTop: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(scrollTop)) return;
  try {
    window.sessionStorage.setItem(getChatScrollStorageKey(conversationId), String(Math.max(0, Math.round(scrollTop))));
  } catch {
    // Session storage can be unavailable in privacy-restricted browser contexts.
  }
}

function getLessonAuthorProgressStorageKey(conversationId: string): string {
  return `${LESSON_AUTHOR_PROGRESS_STORAGE_PREFIX}${conversationId}`;
}

function readStoredLessonAuthorProgress(conversationId: string): StoredLessonAuthorProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getLessonAuthorProgressStorageKey(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLessonAuthorProgress> & { event?: Partial<LessonAuthorProgressEvent> };
    const event = parsed.event;
    const simulatedStepIndex = typeof parsed.simulatedStepIndex === 'number'
      ? parsed.simulatedStepIndex
      : Number.NaN;
    const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Number.NaN;
    if (
      !event
      || event.type !== 'progress'
      || typeof event.stage !== 'string'
      || !event.stage.trim()
      || !Number.isInteger(simulatedStepIndex)
      || simulatedStepIndex < 0
      || simulatedStepIndex >= LESSON_AUTHOR_PROGRESS_STEP_COUNT
      || !Number.isFinite(updatedAt)
      || Date.now() - updatedAt > LESSON_AUTHOR_PROGRESS_TTL_MS
    ) {
      window.sessionStorage.removeItem(getLessonAuthorProgressStorageKey(conversationId));
      return null;
    }
    return {
      event: {
        type: 'progress',
        stage: event.stage,
        ...(typeof event.detail === 'string' ? { detail: event.detail } : {}),
      },
      simulatedStepIndex,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function writeStoredLessonAuthorProgress(
  conversationId: string,
  event: LessonAuthorProgressEvent,
  simulatedStepIndex: number,
): void {
  if (typeof window === 'undefined' || !event.stage.trim()) return;
  try {
    const existing = readStoredLessonAuthorProgress(conversationId);
    const safeStepIndex = Math.max(
      0,
      Math.min(LESSON_AUTHOR_PROGRESS_STEP_COUNT - 1, Math.round(simulatedStepIndex)),
    );
    window.sessionStorage.setItem(getLessonAuthorProgressStorageKey(conversationId), JSON.stringify({
      event,
      simulatedStepIndex: Math.max(existing?.simulatedStepIndex ?? 0, safeStepIndex),
      updatedAt: Date.now(),
    } satisfies StoredLessonAuthorProgress));
  } catch {
    // Session storage can be unavailable in privacy-restricted browser contexts.
  }
}

function clearStoredLessonAuthorProgress(conversationId: string | null | undefined): void {
  if (typeof window === 'undefined' || !conversationId) return;
  try {
    window.sessionStorage.removeItem(getLessonAuthorProgressStorageKey(conversationId));
  } catch {
    // Session storage can be unavailable in privacy-restricted browser contexts.
  }
}

function readNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
type BrowserSpeechRecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: { length: number; [index: number]: BrowserSpeechRecognitionResult };
};
type BrowserSpeechRecognitionErrorEvent = Event & { error?: string; message?: string };
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};
type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};
const VOICE_LANG = 'vi-VN';
const VOICE_MAX_LISTEN_MS = 15_000;
const SILENT_AUDIO_DATA_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==';

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as AudioContextWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function decodeChatAudioData(context: AudioContext, audioData: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const promise = context.decodeAudioData(audioData.slice(0), resolve, reject);
    if (promise && typeof promise.then === 'function') {
      promise.then(resolve).catch(reject);
    }
  });
}


function getVoiceErrorMessage(error?: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') return i18n.t('chatWidget.microphonePermission');
  if (error === 'no-speech') return i18n.t('chatWidget.speechUnclear');
  if (error === 'audio-capture') return i18n.t('chatWidget.microphoneUnavailable');
  if (error === 'network') return i18n.t('chatWidget.speechInterrupted');
  return i18n.t('chatWidget.speechUnsupported');
}
function formatCallDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildBlueprintChapterDraftPrompt(chapterIndex: number, chapterTitle: string, isVietnamese: boolean): string {
  return isVietnamese
    ? `Soạn chi tiết Chương ${chapterIndex + 1}: ${chapterTitle}`
    : `Draft Chapter ${chapterIndex + 1}: ${chapterTitle}`;
}

function BlueprintStructurePanel({
  blueprint,
  canDraft,
  disabled,
  onDraftChapter,
}: {
  blueprint: LessonAuthorBlueprint;
  canDraft: boolean;
  disabled: boolean;
  onDraftChapter?: (chapterIndex: number) => void;
}) {
  const { i18n: translationInstance } = useTranslation();
  const isVietnamese = translationInstance.language !== 'en';
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(() => new Set([0]));
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(() => new Set());

  const formatDuration = (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return isVietnamese ? `${Math.round(minutes)} phút` : `${Math.round(minutes)} min`;
  };

  const toggleChapter = (chapterIndex: number) => {
    setExpandedChapters(current => {
      const next = new Set(current);
      if (next.has(chapterIndex)) next.delete(chapterIndex);
      else next.add(chapterIndex);
      return next;
    });
  };

  const toggleLesson = (lessonKey: string) => {
    setExpandedLessons(current => {
      const next = new Set(current);
      if (next.has(lessonKey)) next.delete(lessonKey);
      else next.add(lessonKey);
      return next;
    });
  };

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-primary/20 bg-background/70 shadow-sm">
      <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ListTree className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {isVietnamese ? 'Cấu trúc bài học đề xuất' : 'Proposed lesson structure'}
          </p>
          <p className="text-[10px] leading-4 text-muted-foreground">
            {isVietnamese
              ? 'Mở từng chương để xem bài học và các mục nội dung.'
              : 'Open each chapter to review its lessons and learning details.'}
          </p>
        </div>
      </div>

      <div className="max-h-[50dvh] space-y-2 overflow-y-auto p-2.5 pr-1.5">
        {blueprint.chapters.map((chapter, chapterIndex) => {
          const chapterOpen = expandedChapters.has(chapterIndex);
          const chapterDuration = formatDuration(chapter.duration_minutes);
          return (
            <section key={`${chapter.title}-${chapterIndex}`} className="overflow-hidden rounded-md border border-border/75 bg-card">
              <div className="flex items-stretch gap-2 p-2">
                <button
                  type="button"
                  className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-primary/35"
                  onClick={() => toggleChapter(chapterIndex)}
                  aria-expanded={chapterOpen}
                  aria-label={isVietnamese ? `Mở Chương ${chapterIndex + 1}` : `Open Chapter ${chapterIndex + 1}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground shadow-sm">
                    {chapterIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-primary">
                      {isVietnamese ? `Chương ${chapterIndex + 1}` : `Chapter ${chapterIndex + 1}`}
                    </span>
                    <span className="block truncate text-xs font-semibold leading-5 text-foreground">{chapter.title}</span>
                  </span>
                  {chapterDuration && (
                    <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground sm:flex">
                      <Clock3 className="h-3 w-3" />
                      {chapterDuration}
                    </span>
                  )}
                  {chapterOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto shrink-0 gap-1.5 rounded-md px-2 text-[10px]"
                  disabled={disabled || !canDraft || !onDraftChapter}
                  onClick={() => onDraftChapter?.(chapterIndex)}
                >
                  <BookOpenCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isVietnamese ? 'Soạn chương này' : 'Draft this chapter'}</span>
                  <span className="sm:hidden">{isVietnamese ? 'Soạn' : 'Draft'}</span>
                </Button>
              </div>

              <AnimatePresence initial={false}>
                {chapterOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="overflow-hidden border-t border-border/70"
                  >
                    <div className="space-y-3 px-3 py-3">
                      {chapter.objective?.trim() && (
                        <div className="flex gap-2 border-l-2 border-primary/35 pl-2.5">
                          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {isVietnamese ? 'Mục tiêu chương' : 'Chapter objective'}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-5 text-foreground/85">{chapter.objective}</p>
                          </div>
                        </div>
                      )}

                      <div className="border-l border-border/80 pl-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {isVietnamese ? 'Bài học' : 'Lessons'}
                        </p>
                        <div className="space-y-1.5">
                          {chapter.lessons.map((lesson, lessonIndex) => {
                            const lessonKey = `${chapterIndex}:${lessonIndex}`;
                            const lessonOpen = expandedLessons.has(lessonKey);
                            const lessonDuration = formatDuration(lesson.duration_minutes);
                            return (
                              <div key={`${lesson.title}-${lessonIndex}`} className="rounded-md border border-border/70 bg-muted/20">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/35"
                                  onClick={() => toggleLesson(lessonKey)}
                                  aria-expanded={lessonOpen}
                                >
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-background text-[9px] font-semibold text-primary">
                                    {lessonIndex + 1}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[10px] text-muted-foreground">
                                      {isVietnamese ? `Bài học ${chapterIndex + 1}.${lessonIndex + 1}` : `Lesson ${chapterIndex + 1}.${lessonIndex + 1}`}
                                    </span>
                                    <span className="block truncate text-[11px] font-semibold leading-4 text-foreground">{lesson.title}</span>
                                  </span>
                                  {lessonDuration && <span className="shrink-0 text-[10px] text-muted-foreground">{lessonDuration}</span>}
                                  {lessonOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                </button>

                                <AnimatePresence initial={false}>
                                  {lessonOpen && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.16, ease: 'easeOut' }}
                                      className="overflow-hidden"
                                    >
                                      <div className="space-y-2 border-t border-border/60 px-3 py-2.5 text-[11px] leading-5">
                                        {lesson.objective?.trim() && (
                                          <div className="flex gap-2">
                                            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                            <div><span className="font-semibold">{isVietnamese ? 'Mục tiêu: ' : 'Objective: '}</span>{lesson.objective}</div>
                                          </div>
                                        )}
                                        {lesson.learning_activities?.length > 0 && (
                                          <div className="flex gap-2">
                                            <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                            <div className="min-w-0 flex-1">
                                              <p className="font-semibold">{isVietnamese ? 'Mục nội dung' : 'Learning activities'}</p>
                                              <ol className="mt-1 space-y-1">
                                                {lesson.learning_activities.map((activity, activityIndex) => (
                                                  <li key={`${activity}-${activityIndex}`} className="flex gap-2 text-foreground/85">
                                                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">{activityIndex + 1}</span>
                                                    <span>{activity}</span>
                                                  </li>
                                                ))}
                                              </ol>
                                            </div>
                                          </div>
                                        )}
                                        {lesson.assessment?.trim() && (
                                          <div className="flex gap-2">
                                            <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                            <div><span className="font-semibold">{isVietnamese ? 'Đánh giá: ' : 'Assessment: '}</span>{lesson.assessment}</div>
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function normalizeBotMarkdownText(content: string): string {
  const normalized = content
    .replace(/\\\*\\\*/g, '**')
    .replace(/\\_/g, '_')
    .trim();

  // Older lesson-author messages were persisted as plain text with indentation
  // instead of Markdown lists. Keep those messages readable after the new
  // formatter is deployed, while leaving normal chat responses untouched.
  if (
    normalized.includes('Chi tiết nội dung đề xuất:')
    && normalized.includes('Mình đã chuẩn bị bản đề xuất chi tiết.')
    && !normalized.includes('**Chi tiết nội dung đề xuất**')
  ) {
    return normalized
      .replace(/^Tóm tắt:\s*/m, '**Tóm tắt**\n- ')
      .replace(/^Phạm vi:\s*/m, '- **Phạm vi:** ')
      .replace(/^Chi tiết nội dung đề xuất:\s*$/m, '**Chi tiết nội dung đề xuất**')
      .replace(/^\s*(\d+)\.\s+Chương:\s*(.+)$/gm, (_match, number, title) => {
        const cleanTitle = title.replace(/^Chương\s+\d+\s*:\s*/i, '');
        return `- **Chương ${number}: ${cleanTitle}**`;
      })
      .replace(/^(\s*)(\d+\.\d+)\.\s+Bài:\s*(.+)$/gm, (_match, indent, number, title) => `${indent.length >= 3 ? '  ' : ''}- **Bài ${number}: ${title}**`)
      .replace(/^(\s*)(\d+\.\d+\.\d+)\.\s+Mục:\s*(.+)$/gm, (_match, _indent, number, title) => `    - **Mục ${number}: ${title}**`)
      .replace(/^(\s*)-\s+(\d+)\.\s+(.+)$/gm, (_match, indent, number, detail) => `${' '.repeat(Math.min(indent.length, 6))}- **${number}. ${detail}**`)
      .replace(/^(\s*)\+\s+(.+)$/gm, (_match, indent, detail) => `${' '.repeat(Math.min(indent.length, 8))}- ${detail}`)
      .replace(/^(\s*)Học liệu dự kiến:\s*/gm, (_match, indent) => `${' '.repeat(Math.min(indent.length, 6))}- **Học liệu dự kiến:** `)
      .replace(/^(\s*)Gồm\s+/gm, (_match, indent) => `${' '.repeat(Math.min(indent.length, 4))}- Gồm `)
      .replace(/^(\s*)Kiểm tra bản đề xuất,/m, '> Kiểm tra bản đề xuất,');
  }

  return normalized;
}

function BotMarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-0 whitespace-pre-wrap leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-4">{children}</ol>,
        li: ({ children }) => <li className="pl-0.5 leading-relaxed">{children}</li>,
        a: ({ href, children }) => (
          <a className="font-medium text-primary underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ children }) => <code className="rounded bg-background/80 px-1 py-0.5 text-[0.92em]">{children}</code>,
        pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-background/80 p-2 text-xs leading-5">{children}</pre>,
        blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground">{children}</blockquote>,
        table: ({ children }) => (
          <div className="my-2 max-w-full overflow-x-auto rounded-lg border bg-background/50">
            <table className="min-w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b px-2 py-1.5 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-b px-2 py-1.5 align-top">{children}</td>,
      }}
    >
      {normalizeBotMarkdownText(content)}
    </ReactMarkdown>
  );
}


function normalizeMentionText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

type StructuralMentionType = 'course' | 'chapter' | 'sequential' | 'vertical';

const STRUCTURAL_MENTION_LABELS: Record<'vi' | 'en', Record<StructuralMentionType, string>> = {
  vi: {
    course: 'Khóa học',
    chapter: 'Chương',
    sequential: 'Mục',
    vertical: 'Bài học',
  },
  en: {
    course: 'Course',
    chapter: 'Chapter',
    sequential: 'Section',
    vertical: 'Lesson',
  },
};

function normalizeMentionBlockType(blockType: string): string {
  const normalized = blockType.trim().toLowerCase();
  const translationKeyMatch = normalized.match(/^common\.coursecomponenttypes\.(course|chapter|sequential|vertical)$/);
  return translationKeyMatch?.[1] || normalized;
}

function getMentionTypeLabel(blockType: string): string {
  const normalizedBlockType = normalizeMentionBlockType(blockType);
  const isStructuralType = ['course', 'chapter', 'sequential', 'vertical'].includes(normalizedBlockType);
  if (isStructuralType) {
    const key = `common.courseComponentTypes.${normalizedBlockType}`;
    const translated = i18n.t(key);
    if (translated !== key) return translated;

    const locale = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'vi';
    return STRUCTURAL_MENTION_LABELS[locale][normalizedBlockType as StructuralMentionType];
  }

  const otherKey = 'common.courseComponentTypes.other';
  const translatedOther = i18n.t(otherKey);
  return translatedOther === otherKey
    ? (i18n.language?.toLowerCase().startsWith('en') ? 'Course content' : 'Nội dung khóa học')
    : translatedOther;
}

function isStructuralBlock(blockType: string): boolean {
  return blockType === 'course' || blockType === 'chapter' || blockType === 'sequential' || blockType === 'vertical';
}

function getOutlineChildren(node: CourseIndexSection): CourseIndexSection[] {
  return node.children || node.child_info?.children || [];
}

function flattenOutlineMentions(
  node: CourseIndexSection,
  parents: string[] = [],
  depth = 0,
  ancestors: OutlineAncestor[] = [],
): OutlineMentionOption[] {
  const name = node.display_name || i18n.t('chatWidget.unnamed');
  const isCourseRoot = node.block_type === 'course';
  const pathParts = isCourseRoot ? parents : [...parents, name];
  const children = getOutlineChildren(node);
  const currentAncestors = isCourseRoot
    ? ancestors
    : [...ancestors, { id: node.id, block_type: node.block_type }];
  const verticalAncestor = [...currentAncestors].reverse().find(item => item.block_type === 'vertical');
  const current: OutlineMentionOption[] = isCourseRoot ? [] : [{
    block_id: node.id,
    block_type: node.block_type,
    display_name: name,
    path: pathParts.join(' / '),
    unit_id: node.block_type === 'vertical' ? node.id : verticalAncestor?.id ?? null,
    ancestor_ids: ancestors.map(item => item.id),
    ancestor_types: ancestors.map(item => item.block_type),
    label: getMentionTypeLabel(node.block_type),
    depth,
  }];

  return [
    ...current,
    ...children.flatMap(child => flattenOutlineMentions(child, pathParts, depth + 1, currentAncestors)),
  ];
}

function getMessageOutlineMentions(metadata: unknown): OutlineMention[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const mentions = (metadata as { outline_mentions?: unknown }).outline_mentions;
  if (!Array.isArray(mentions)) return [];
  return mentions
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      block_id: typeof item.block_id === 'string' ? item.block_id : '',
      block_type: typeof item.block_type === 'string' ? item.block_type : 'unknown',
      display_name: typeof item.display_name === 'string' ? item.display_name : i18n.t('chatWidget.unnamed'),
      path: typeof item.path === 'string' ? item.path : '',
      unit_id: typeof item.unit_id === 'string' ? item.unit_id : null,
      ancestor_ids: Array.isArray(item.ancestor_ids) ? item.ancestor_ids.filter((id): id is string => typeof id === 'string') : [],
      ancestor_types: Array.isArray(item.ancestor_types) ? item.ancestor_types.filter((type): type is string => typeof type === 'string') : [],
    }))
    .filter(item => item.block_id);
}

function getMessageSourceDocuments(metadata: unknown): LessonAuthorSourceDocument[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const docs = (metadata as { source_documents?: unknown }).source_documents;
  if (!Array.isArray(docs)) return [];
  return docs
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      document_id: typeof item.document_id === 'string'
        ? item.document_id
        : typeof item.id === 'string'
          ? item.id
          : '',
      kb_id: typeof item.kb_id === 'string' ? item.kb_id : '',
      name: typeof item.name === 'string' ? item.name : 'File KB',
      type: typeof item.type === 'string' ? item.type : 'file',
      status: typeof item.status === 'string' ? item.status : undefined,
      source_info: item.source_info && typeof item.source_info === 'object' && !Array.isArray(item.source_info)
        ? item.source_info as LessonAuthorSourceDocument['source_info']
        : null,
    }))
    .filter(item => item.document_id);
}

function getLatestPendingProposalEvent(messages: ChatMessage[]): LessonAuthorProposalEvent | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = messages[index].metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;

    const record = metadata as Record<string, unknown>;
    if (record.kind !== 'lesson_author_proposal') continue;
    if (record.lesson_author_job_status !== 'proposed') continue;

    const jobId = typeof record.lesson_author_job_id === 'string' ? record.lesson_author_job_id : '';
    const proposal = record.lesson_author_proposal;
    if (!jobId || !proposal || typeof proposal !== 'object' || Array.isArray(proposal)) continue;

    return {
      type: 'proposal',
      job_id: jobId,
      proposal: proposal as LessonAuthorProposalEvent['proposal'],
    };
  }
  return null;
}

function getAppliedBlueprintChapterIndexesFromMessages(
  messages: ChatMessage[],
  blueprintId: string,
): number[] {
  const proposalContextByJobId = new Map<string, { blueprintId: string; chapterIndex: number }>();

  for (const message of messages) {
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;
    const record = metadata as Record<string, unknown>;
    if (record.kind !== 'lesson_author_proposal' || typeof record.lesson_author_job_id !== 'string') continue;
    if (typeof record.lesson_author_blueprint_id !== 'string') continue;
    const chapterIndex = readNonNegativeInteger(record.lesson_author_blueprint_chapter_index);
    if (chapterIndex === null) continue;
    proposalContextByJobId.set(record.lesson_author_job_id, {
      blueprintId: record.lesson_author_blueprint_id,
      chapterIndex,
    });
  }

  const appliedIndexes = new Set<number>();
  for (const message of messages) {
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;
    const record = metadata as Record<string, unknown>;
    const kind = record.kind;

    if (kind === 'lesson_author_proposal' && record.lesson_author_job_status === 'succeeded') {
      if (record.lesson_author_blueprint_id === blueprintId) {
        const chapterIndex = readNonNegativeInteger(record.lesson_author_blueprint_chapter_index);
        if (chapterIndex !== null) appliedIndexes.add(chapterIndex);
      }
      continue;
    }

    if (kind !== 'lesson_author_plan_approved') continue;
    const directBlueprintId = typeof record.lesson_author_blueprint_id === 'string'
      ? record.lesson_author_blueprint_id
      : null;
    const directChapterIndex = readNonNegativeInteger(record.lesson_author_blueprint_chapter_index);
    if (directBlueprintId === blueprintId && directChapterIndex !== null) {
      appliedIndexes.add(directChapterIndex);
    }

    const jobId = typeof record.lesson_author_job_id === 'string' ? record.lesson_author_job_id : null;
    const proposalContext = jobId ? proposalContextByJobId.get(jobId) : undefined;
    if (proposalContext?.blueprintId === blueprintId) {
      appliedIndexes.add(proposalContext.chapterIndex);
    }
  }

  return Array.from(appliedIndexes).sort((left, right) => left - right);
}

function getLatestBlueprintEvent(messages: ChatMessage[]): LessonAuthorBlueprintEvent | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = messages[index].metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;

    const record = metadata as Record<string, unknown>;
    if (record.kind !== 'lesson_author_blueprint') continue;

    const blueprintId = typeof record.lesson_author_blueprint_id === 'string'
      ? record.lesson_author_blueprint_id
      : '';
    const blueprint = record.lesson_author_blueprint;
    const qualityReport = record.lesson_author_blueprint_quality_report;
    if (!blueprintId || !blueprint || typeof blueprint !== 'object' || Array.isArray(blueprint)) continue;
    if (!qualityReport || typeof qualityReport !== 'object' || Array.isArray(qualityReport)) continue;
    const status = record.lesson_author_blueprint_status;
    const errorReason = record.lesson_author_blueprint_error_reason;
    const metadataAppliedChapterIndexes = Array.isArray(record.lesson_author_blueprint_applied_chapter_indexes)
      ? record.lesson_author_blueprint_applied_chapter_indexes.filter((value): value is number => (
        Number.isInteger(value) && value >= 0
      ))
      : [];
    const appliedChapterIndexes = Array.from(new Set([
      ...metadataAppliedChapterIndexes,
      ...getAppliedBlueprintChapterIndexesFromMessages(messages, blueprintId),
    ])).sort((left, right) => left - right);

    return {
      type: 'blueprint',
      blueprint_id: blueprintId,
      blueprint: blueprint as LessonAuthorBlueprintEvent['blueprint'],
      quality_report: qualityReport as LessonAuthorBlueprintEvent['quality_report'],
      status: status === 'proposed' || status === 'superseded' || status === 'archived' || status === 'failed'
        ? status
        : 'proposed',
      applied_chapter_indexes: appliedChapterIndexes,
      error_reason: typeof errorReason === 'string' ? errorReason : null,
    };
  }
  return null;
}

// ── Main Component ──
export default function ChatWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [surface, setSurface] = useState<ChatSurface>('admin');
  const [state, setState] = useState<WidgetState>('loading');
  const [runtimeAvailability, setRuntimeAvailabilityState] = useState<ChatRuntimeAvailability>('loading');
  const [activeBot, setActiveBot] = useState<ActiveBot | null>(null);
  const [lessonSettings, setLessonSettings] = useState<LessonAuthorSettings | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [personas, setPersonas] = useState<BotPersona[]>([]);
  const [currentConv, setCurrentConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposalEvent, setProposalEvent] = useState<LessonAuthorProposalEvent | null>(null);
  const [blueprintEvent, setBlueprintEvent] = useState<LessonAuthorBlueprintEvent | null>(null);
  const [blueprintDraftSelection, setBlueprintDraftSelection] = useState<BlueprintDraftSelection | null>(null);
  const [lessonAuthorProgress, setLessonAuthorProgress] = useState<LessonAuthorProgressEvent | null>(null);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [mindmapOpen, setMindmapOpen] = useState(false);
  const [mindmapOutline, setMindmapOutline] = useState<CourseIndexResponse | null>(null);
  const [mindmapProposalEvent, setMindmapProposalEvent] = useState<LessonAuthorProposalEvent | null>(null);
  const [blueprintDialogOpen, setBlueprintDialogOpen] = useState(false);
  const [mindmapLoading, setMindmapLoading] = useState(false);
  const [mindmapError, setMindmapError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [outlineMentionOptions, setOutlineMentionOptions] = useState<OutlineMentionOption[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<OutlineMentionOption[]>([]);
  const [sourceDocumentOptions, setSourceDocumentOptions] = useState<LessonAuthorSourceDocument[]>([]);
  const [selectedSourceDocuments, setSelectedSourceDocuments] = useState<LessonAuthorSourceDocument[]>([]);
  const [loadingSourceDocuments, setLoadingSourceDocuments] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [voiceCaptureState, setVoiceCaptureState] = useState<VoiceCaptureState>('idle');
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [botSpeechLoading, setBotSpeechLoading] = useState(false);
  const [botSpeechNeedsTap, setBotSpeechNeedsTap] = useState(false);
  const [botSpeechText, setBotSpeechText] = useState('');
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const [voiceModeTranscript, setVoiceModeTranscript] = useState('');
  const [voiceCallStartedAt, setVoiceCallStartedAt] = useState<number | null>(null);
  const [voiceCallMuted, setVoiceCallMuted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceTranscriptRef = useRef('');
  const voicePreviewRef = useRef('');
  const voiceDiscardRef = useRef(false);
  const voiceErrorRef = useRef(false);
  const voiceListenTimerRef = useRef<number | null>(null);
  const voiceCallActiveRef = useRef(false);
  const voiceCallMutedRef = useRef(false);
  const voiceAutoListenTimerRef = useRef<number | null>(null);
  const voiceAutoListenCallbackRef = useRef<(() => void) | null>(null);
  const botAudioPrimedRef = useRef(false);
  const botAudioRef = useRef<HTMLAudioElement | null>(null);
  const botAudioUrlRef = useRef<string | null>(null);
  const botAudioContextRef = useRef<AudioContext | null>(null);
  const botAudioGainRef = useRef<GainNode | null>(null);
  const botAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const botSpeechRequestIdRef = useRef(0);
  const minimumStreamDelayRef = useRef<{ timer: number; resolve: () => void } | null>(null);
  const runtimeAvailabilityRequestRef = useRef(0);
  const messageLoadRequestRef = useRef(0);
  const loadMoreRequestRef = useRef(0);
  const openRef = useRef(false);
  const streamAccRef = useRef('');  // accumulate stream text without React state race
  const currentConvIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const clearMinimumStreamDelay = useCallback(() => {
    const pending = minimumStreamDelayRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    minimumStreamDelayRef.current = null;
    pending.resolve();
  }, []);

  const waitForMinimumStreamDuration = useCallback((startedAt: number) => {
    const remaining = Math.max(0, MIN_STREAMING_UI_MS - (performance.now() - startedAt));
    if (remaining === 0) return Promise.resolve();
    return new Promise<void>(resolve => {
      const timer = window.setTimeout(() => {
        minimumStreamDelayRef.current = null;
        resolve();
      }, remaining);
      minimumStreamDelayRef.current = { timer, resolve };
    });
  }, []);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      window.setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior }), 0);
    });
  }, []);

  useEffect(() => {
    currentConvIdRef.current = currentConv?.id ?? null;
  }, [currentConv?.id]);

  const clearVoiceListenTimer = useCallback(() => {
    if (voiceListenTimerRef.current) {
      window.clearTimeout(voiceListenTimerRef.current);
      voiceListenTimerRef.current = null;
    }
  }, []);

  const clearVoiceAutoListenTimer = useCallback(() => {
    if (voiceAutoListenTimerRef.current) {
      window.clearTimeout(voiceAutoListenTimerRef.current);
      voiceAutoListenTimerRef.current = null;
    }
  }, []);

  useEffect(() => { voiceCallActiveRef.current = voiceModeActive; }, [voiceModeActive]);
  useEffect(() => { voiceCallMutedRef.current = voiceCallMuted; }, [voiceCallMuted]);
  const ensureBotAudioElement = useCallback(() => {
    if (typeof Audio === 'undefined') return null;
    const audio = botAudioRef.current ?? new Audio();
    audio.preload = 'auto';
    audio.controls = false;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    if (typeof document !== 'undefined' && !audio.isConnected) {
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }
    botAudioRef.current = audio;
    return audio;
  }, []);

  const ensureBotAudioContext = useCallback(() => {
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return null;
    const context = botAudioContextRef.current ?? new AudioContextCtor();
    botAudioContextRef.current = context;

    if (!botAudioGainRef.current) {
      const gain = context.createGain();
      gain.gain.value = 1;
      gain.connect(context.destination);
      botAudioGainRef.current = gain;
    }

    return context;
  }, []);

  const stopBotAudioSource = useCallback(() => {
    const source = botAudioSourceRef.current;
    if (!source) return;
    source.onended = null;
    try { source.stop(); } catch { /* The source may already be stopped. */ }
    try { source.disconnect(); } catch { /* The source may already be disconnected. */ }
    botAudioSourceRef.current = null;
  }, []);

  const primeBotAudioPlayback = useCallback(() => {
    if (botAudioPrimedRef.current) return;

    const context = ensureBotAudioContext();
    if (context) {
      void (async () => {
        try {
          if (context.state === 'suspended') await context.resume();
          const source = context.createBufferSource();
          source.buffer = context.createBuffer(1, 1, 22050);
          source.connect(botAudioGainRef.current ?? context.destination);
          source.start(0);
          botAudioPrimedRef.current = true;
        } catch { /* Audio priming is best-effort. */ }
      })();
    }

    const audio = ensureBotAudioElement();
    if (!audio) return;

    try {
      audio.pause();
      audio.src = SILENT_AUDIO_DATA_URI;
      audio.muted = true;
      audio.volume = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        void playPromise
          .then(() => {
            audio.pause();
            try { audio.currentTime = 0; } catch { /* Resetting a detached audio element is best-effort. */ }
            audio.muted = false;
            audio.volume = 1;
            botAudioPrimedRef.current = true;
          })
          .catch(() => {
            audio.muted = false;
            audio.volume = 1;
          });
      } else {
        audio.pause();
        audio.muted = false;
        audio.volume = 1;
        botAudioPrimedRef.current = true;
      }
    } catch {
      audio.muted = false;
      audio.volume = 1;
    }
  }, [ensureBotAudioContext, ensureBotAudioElement]);

  const scheduleVoiceAutoListen = useCallback((delayMs = 450) => {
    clearVoiceAutoListenTimer();
    if (!voiceCallActiveRef.current || voiceCallMutedRef.current) return;

    voiceAutoListenTimerRef.current = window.setTimeout(() => {
      voiceAutoListenTimerRef.current = null;
      if (!voiceCallActiveRef.current || voiceCallMutedRef.current) return;
      voiceAutoListenCallbackRef.current?.();
    }, delayMs);
  }, [clearVoiceAutoListenTimer]);

  const cancelBotSpeech = useCallback(() => {
    botSpeechRequestIdRef.current += 1;
    stopBotAudioSource();
    const audio = botAudioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch { /* The audio element may already be detached. */ }
    }
    if (botAudioUrlRef.current) {
      URL.revokeObjectURL(botAudioUrlRef.current);
      botAudioUrlRef.current = null;
    }
    setBotSpeechLoading(false);
    setBotSpeechNeedsTap(false);
    setBotSpeaking(false);
    setBotSpeechText('');
  }, [stopBotAudioSource]);

  const playBotSpeech = useCallback(async () => {
    cancelBotSpeech();
  }, [cancelBotSpeech]);

  const handleResumeBotSpeech = useCallback(async () => {
    const context = ensureBotAudioContext();
    if (context?.state === 'suspended') {
      try { await context.resume(); } catch { /* Browser autoplay policy can reject this attempt. */ }
    }

    const audio = botAudioRef.current;
    if (!audio || !audio.src) {
      setBotSpeechNeedsTap(false);
      toast.error(i18n.t('chatWidget.audioNotFound'));
      return;
    }

    try {
      setBotSpeechNeedsTap(false);
      await audio.play();
      setBotSpeechLoading(false);
      setBotSpeaking(true);
    } catch {
      setBotSpeechNeedsTap(true);
      setBotSpeaking(false);
      toast.error(i18n.t('chatWidget.audioPlaybackBlocked'));
    }
  }, [ensureBotAudioContext]);
  const stopVoiceCapture = useCallback((discard = false) => {
    if (discard) voiceDiscardRef.current = true;
    clearVoiceListenTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        if (discard && recognition.abort) recognition.abort();
        else recognition.stop();
      } catch {
        // Browser may throw if recognition has already stopped.
      }
    }
    setVoiceCaptureState('idle');
  }, [clearVoiceListenTimer]);

  useEffect(() => () => {
    clearMinimumStreamDelay();
    clearVoiceAutoListenTimer();
    stopVoiceCapture(true);
    cancelBotSpeech();
    stopBotAudioSource();
    const audio = botAudioRef.current;
    if (audio?.isConnected) audio.remove();
    botAudioRef.current = null;
    botAudioGainRef.current = null;
    const context = botAudioContextRef.current;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    botAudioContextRef.current = null;
  }, [cancelBotSpeech, clearMinimumStreamDelay, clearVoiceAutoListenTimer, stopBotAudioSource, stopVoiceCapture]);

  useEffect(() => {
    if (!open) {
      clearMinimumStreamDelay();
      setFullscreen(false);
      clearVoiceAutoListenTimer();
      voiceCallActiveRef.current = false;
      voiceCallMutedRef.current = false;
      setVoiceModeActive(false);
      setVoiceModeTranscript('');
      setVoiceCallStartedAt(null);
      setVoiceCallMuted(false);
      stopVoiceCapture(true);
      cancelBotSpeech();
    }
  }, [cancelBotSpeech, clearMinimumStreamDelay, clearVoiceAutoListenTimer, open, stopVoiceCapture]);

  // ── FAB drag ref ──
  const fabRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ sx: 0, sy: 0, sl: 0, st: 0, active: false, moved: false });

  const user = useAuthStore(s => s.user);
  const activeTenantId = useTenantStore(s => s.activeTenantId);
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canManageAiChatbot = hasPermission('ai_chatbot', 'can_view');
  const runtimeTenantId = user?.role === 'superadmin' ? activeTenantId : user?.tenant_id ?? null;
  const canUseChatWidget = runtimeAvailability === 'available';
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const courseMatch = location.pathname.match(/^\/courses\/(.+)\/edit\/?$/);
  const courseId = courseMatch?.[1] ? decodeURIComponent(courseMatch[1]) : undefined;
  const isCourseOutline = Boolean(courseId);
  const isLessonAuthor = surface === 'lesson_author';

  const setRuntimeAvailability = useCallback((next: ChatRuntimeAvailability) => {
    setRuntimeAvailabilityState(next);
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Runtime chat is governed by a deployed bot, not by the ai_chatbot management module.
  // On course editing pages, a lesson-author deployment is also sufficient to expose the FAB.
  const refreshRuntimeAvailability = useCallback(async (forceBotPreview = false) => {
    const requestId = ++runtimeAvailabilityRequestRef.current;
    if (!runtimeTenantId) {
      setRuntimeAvailability('unavailable');
      setActiveBot(null);
      return;
    }

    setRuntimeAvailability('loading');
    try {
      const [adminBot, lessonSettings] = await Promise.all([
        fetchActiveBot('admin'),
        isCourseOutline ? fetchLessonAuthorChatSettings() : Promise.resolve(null),
      ]);
      if (requestId !== runtimeAvailabilityRequestRef.current) return;

      const lessonAuthorBot = lessonSettings?.active_bot ?? null;
      const fallbackBot = adminBot ?? lessonAuthorBot;
      if (forceBotPreview || !openRef.current) setActiveBot(fallbackBot);
      setRuntimeAvailability(fallbackBot ? 'available' : 'unavailable');

      if (!adminBot && lessonAuthorBot && isCourseOutline) {
        setSurface(current => current === 'admin' ? 'lesson_author' : current);
      }
      if (!fallbackBot) setOpen(false);
    } catch {
      if (requestId !== runtimeAvailabilityRequestRef.current) return;
      setActiveBot(null);
      setRuntimeAvailability('unavailable');
      setOpen(false);
    }
  }, [isCourseOutline, runtimeTenantId, setRuntimeAvailability]);

  useEffect(() => {
    setRuntimeAvailability('loading');
    void refreshRuntimeAvailability();
  }, [refreshRuntimeAvailability, setRuntimeAvailability]);

  useEffect(() => {
    const handleAssignmentChanged = (event: Event) => {
      const tenantId = (event as CustomEvent<{ tenantId?: unknown }>).detail?.tenantId;
      if (tenantId !== runtimeTenantId) return;
      setOpen(false);
      setFullscreen(false);
      setRuntimeAvailability('loading');
      void refreshRuntimeAvailability(true);
    };
    const handleWindowFocus = () => { void refreshRuntimeAvailability(); };

    window.addEventListener('landa:ai-bot-assignment-changed', handleAssignmentChanged);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('landa:ai-bot-assignment-changed', handleAssignmentChanged);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [refreshRuntimeAvailability, runtimeTenantId, setRuntimeAvailability]);

  // ── Load full data when widget opens ──
  const resetMindmapState = useCallback(() => {
    setMindmapOpen(false);
    setMindmapOutline(null);
    setMindmapProposalEvent(null);
    setMindmapLoading(false);
    setMindmapError(null);
    setBlueprintDialogOpen(false);
  }, []);

  const resetChatState = useCallback(() => {
    clearMinimumStreamDelay();
    messageLoadRequestRef.current += 1;
    loadMoreRequestRef.current += 1;
    clearStoredLessonAuthorProgress(currentConvIdRef.current);
    stopVoiceCapture(true);
    cancelBotSpeech();
    abortRef.current?.abort();
    abortRef.current = null;
    setCurrentConv(null);
    setMessages([]);
    setInputValue('');
    setSelectedMentions([]);
    setSelectedSourceDocuments([]);
    setStreamText('');
    setStreaming(false);
    setHasMore(false);
    setNextCursor(null);
    setProposalEvent(null);
    setBlueprintEvent(null);
    setBlueprintDraftSelection(null);
    setLessonAuthorProgress(null);
    resetMindmapState();
  }, [cancelBotSpeech, clearMinimumStreamDelay, resetMindmapState, stopVoiceCapture]);

  const loadOutlineMentions = useCallback(async (force = false) => {
    if (!courseId) {
      setOutlineMentionOptions([]);
      return;
    }

    try {
      const cacheKey = ['course-outline-index', courseId] as const;
      const cached = force ? undefined : queryClient.getQueryData<CourseIndexResponse>(cacheKey);
      const outline = cached ?? await queryClient.fetchQuery({
        queryKey: cacheKey,
        queryFn: () => getCourseOutlineIndex(courseId),
        staleTime: force ? 0 : 30_000,
      });
      if (!outline?.course_structure) {
        setOutlineMentionOptions([]);
        return;
      }
      setOutlineMentionOptions(flattenOutlineMentions(outline.course_structure));
    } catch {
      setOutlineMentionOptions([]);
    }
  }, [courseId, queryClient, i18n.language]);

  const loadActiveBot = useCallback(async (nextSurface: ChatSurface = surface) => {
    setState('loading');
    setLoadingConvs(false);
    try {
      if (nextSurface === 'lesson_author') {
        if (!courseId) {
          setSurface('admin');
          return;
        }

        const settings = await fetchLessonAuthorChatSettings();
        setLessonSettings(settings);
        setActiveBot(settings.active_bot);

        const personaMismatch = Boolean(
          settings.active_bot &&
          settings.active_persona &&
          settings.active_persona.bot_id !== settings.active_bot.bot_id,
        );

        if (!settings.active_bot || !settings.active_kb || !settings.active_persona || personaMismatch) {
          setConversations([]);
          setState('config-warning');
          return;
        }

        setLoadingConvs(true);
        const convs = await fetchConversations({ target: 'lesson_author', courseId });
        setConversations(convs);
        setLoadingConvs(false);
        setState('conversations');
        return;
      }

      setLessonSettings(null);
      const bot = await fetchActiveBot('admin');
      setActiveBot(bot);
      if (!bot) { setState('no-bot'); return; }
      if (bot.ai_active_engine === 'self_built_rag' && !bot.bot_kb_id) {
        setConversations([]);
        setPersonas([]);
        setState('config-warning');
        return;
      }

      setLoadingConvs(true);
      const convs = await fetchConversations({ target: 'admin' });
      setConversations(convs);
      setLoadingConvs(false);

      if (convs.length === 0) {
        const p = await fetchActiveBotPersonas('admin');
        setPersonas(p);
        setState('persona-picker');
      } else {
        setState('conversations');
      }
    } catch {
      setLoadingConvs(false);
      setState('no-bot');
    }
  }, [courseId, surface]);

  useEffect(() => {
    if (open) loadActiveBot();
  }, [open, loadActiveBot]);

  useEffect(() => {
    if (open && isLessonAuthor && courseId) {
      void loadOutlineMentions();
    } else if (!isLessonAuthor) {
      setOutlineMentionOptions([]);
      setSelectedMentions([]);
      setSelectedSourceDocuments([]);
    }
  }, [courseId, isLessonAuthor, loadOutlineMentions, open, i18n.language]);

  const loadSourceDocuments = useCallback(async (search?: string) => {
    if (!isLessonAuthor || !lessonSettings?.active_kb?.kb_id) {
      setSourceDocumentOptions([]);
      return;
    }
    setLoadingSourceDocuments(true);
    try {
      const documents = await fetchLessonAuthorSourceDocuments({
        limit: 20,
        search: search?.trim() || undefined,
      });
      setSourceDocumentOptions(documents);
    } catch {
      setSourceDocumentOptions([]);
      toast.error(i18n.t('chatWidget.loadKnowledgeFilesFailed'));
    } finally {
      setLoadingSourceDocuments(false);
    }
  }, [isLessonAuthor, lessonSettings?.active_kb?.kb_id]);

  useEffect(() => {
    if (!isCourseOutline && isLessonAuthor) {
      setSurface('admin');
      resetChatState();
      if (open) loadActiveBot('admin');
    }
  }, [isCourseOutline, isLessonAuthor, loadActiveBot, open, resetChatState]);

  // ── FAB pointer drag ──
  const onFabPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const fab = fabRef.current;
    if (!fab) return;
    fab.setPointerCapture(e.pointerId);
    const r = fab.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, sl: r.left, st: r.top, active: true, moved: false };
  }, []);

  const onFabPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const fab = fabRef.current;
    if (!fab) return;
    const nl = Math.max(8, Math.min(window.innerWidth - 64, d.sl + dx));
    const nt = Math.max(8, Math.min(window.innerHeight - 64, d.st + dy));
    fab.style.left = nl + 'px';
    fab.style.top = nt + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }, []);

  const onFabPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    d.active = false;
    const fab = fabRef.current;
    if (!fab) return;
    try { fab.releasePointerCapture(e.pointerId); } catch { /* The pointer may already be released. */ }

    if (!d.moved) {
      setOpen(true);
      return;
    }
    // Snap to nearest edge
    const r = fab.getBoundingClientRect();
    const mid = window.innerWidth / 2;
    if (r.left + 28 > mid) {
      fab.style.left = 'auto';
      fab.style.right = '24px';
    } else {
      fab.style.left = '24px';
      fab.style.right = 'auto';
    }
    const clampedTop = Math.max(24, Math.min(window.innerHeight - 80, r.top));
    fab.style.top = clampedTop + 'px';
    fab.style.bottom = 'auto';
  }, []);

  // ── Create conversation ──
  const handleCreateConversation = async (personaId?: string) => {
    messageLoadRequestRef.current += 1;
    loadMoreRequestRef.current += 1;
    try {
      const activePersonaId = isLessonAuthor ? lessonSettings?.active_persona?.persona_id : personaId;
      if (!activePersonaId) {
        toast.error(i18n.t('chatWidget.lessonExpertPersonaMissing'));
        return;
      }
      const conv = await createConversation(activePersonaId, {
        target: isLessonAuthor ? 'lesson_author' : 'admin',
        courseId: isLessonAuthor ? courseId : undefined,
      });
      setConversations(prev => [conv, ...prev]);
      setCurrentConv(conv);
      currentConvIdRef.current = conv.id;
      setMessages([]);
      setSelectedMentions([]);
      setSelectedSourceDocuments([]);
      setProposalEvent(null);
      setBlueprintEvent(null);
      setBlueprintDraftSelection(null);
      setLessonAuthorProgress(null);
      clearStoredLessonAuthorProgress(conv.id);
      resetMindmapState();
      setState('chat');
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, i18n.t('chatWidget.loadPersonasFailed')));
    }
  };

  // ── Open existing conversation ──
  const handleOpenConversation = async (conv: ChatConversation) => {
    const requestId = ++messageLoadRequestRef.current;
    loadMoreRequestRef.current += 1;
    const conversationId = conv.id;
    const target = isLessonAuthor ? 'lesson_author' : 'admin';
    const isCurrentRequest = () => (
      requestId === messageLoadRequestRef.current
      && currentConvIdRef.current === conversationId
    );
    resetMindmapState();
    setCurrentConv(conv);
    currentConvIdRef.current = conversationId;
    setSelectedMentions([]);
    setSelectedSourceDocuments([]);
    setLoadingMessages(true);
    setState('chat');
    try {
      const result = await fetchMessages(conversationId, undefined, target);
      if (!isCurrentRequest()) return;
      setMessages(result.messages);
      setProposalEvent(getLatestPendingProposalEvent(result.messages));
      setBlueprintEvent(getLatestBlueprintEvent(result.messages));
      setBlueprintDraftSelection(null);
      const latestMessage = result.messages[result.messages.length - 1];
      const canRestoreProgress = isLessonAuthor
        && streaming
        && currentConv?.id === conversationId
        && latestMessage?.role === 'user';
      const storedProgress = canRestoreProgress ? readStoredLessonAuthorProgress(conv.id) : null;
      setLessonAuthorProgress(storedProgress?.event ?? null);
      if (!storedProgress) clearStoredLessonAuthorProgress(conv.id);
      setHasMore(result.has_more);
      setNextCursor(result.next_cursor);
    } catch {
      if (isCurrentRequest()) toast.error(i18n.t('chatWidget.loadMessagesFailed'));
    } finally {
      if (isCurrentRequest()) setLoadingMessages(false);
    }
  };

  // ── Load more messages ──
  const handleLoadMore = async () => {
    if (!currentConv || !hasMore || !nextCursor || loadingMore) return;
    const conversationId = currentConv.id;
    const requestId = ++loadMoreRequestRef.current;
    const isCurrentRequest = () => (
      requestId === loadMoreRequestRef.current
      && currentConvIdRef.current === conversationId
    );
    setLoadingMore(true);
    try {
      const result = await fetchMessages(conversationId, nextCursor, isLessonAuthor ? 'lesson_author' : 'admin');
      if (!isCurrentRequest()) return;
      const pendingProposal = getLatestPendingProposalEvent(result.messages);
      if (!proposalEvent && pendingProposal) setProposalEvent(pendingProposal);
      const latestBlueprint = getLatestBlueprintEvent(result.messages);
      if (!blueprintEvent && latestBlueprint) setBlueprintEvent(latestBlueprint);
      setMessages(prev => [...result.messages, ...prev]);
      setHasMore(result.has_more);
      setNextCursor(result.next_cursor);
    } catch {
      if (isCurrentRequest()) toast.error(i18n.t('chatWidget.loadMoreMessagesFailed'));
    } finally {
      if (isCurrentRequest()) setLoadingMore(false);
    }
  };

  // ── Delete conversation ──
  const handleDeleteConversation = (convId: string) => {
    setConfirmDeleteId(convId);
  };

  const openPersonaPickerAfterLastDelete = async () => {
    if (!activeBot || isLessonAuthor) {
      setState('conversations');
      return;
    }
    try {
      const p = await fetchActiveBotPersonas('admin');
      setPersonas(p);
      setState('persona-picker');
    } catch {
      setState('conversations');
      toast.error(i18n.t('chatWidget.loadPersonasFailed'));
    }
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteConversation(confirmDeleteId, isLessonAuthor ? 'lesson_author' : 'admin');
      const nextConversations = conversations.filter(c => c.id !== confirmDeleteId);
      setConversations(nextConversations);
      if (currentConv?.id === confirmDeleteId) setCurrentConv(null);
      if (nextConversations.length === 0) {
        await openPersonaPickerAfterLastDelete();
      } else if (currentConv?.id === confirmDeleteId) {
        setState('conversations');
      }
      toast.success(i18n.t('chatWidget.deleted'));
    } catch { toast.error(i18n.t('chatWidget.deleteFailed')); }
    finally { setDeleting(false); setConfirmDeleteId(null); }
  };

  // ── New conversation ──
  const handleNewConvFromList = async () => {
    if (!activeBot) return;
    if (conversations.length >= 10) { toast.error(i18n.t('chatWidget.maxConversations')); return; }
    if (isLessonAuthor) {
      await handleCreateConversation();
      return;
    }
    try {
      const p = await fetchActiveBotPersonas('admin');
      setPersonas(p);
      setState('persona-picker');
    } catch { toast.error(i18n.t('chatWidget.loadPersonasFailed')); }
  };

  // ── Send message ──
  const handleLessonAuthorProgress = useCallback((conversationId: string, event: LessonAuthorProgressEvent) => {
    if (currentConvIdRef.current === conversationId) setLessonAuthorProgress(event);
    const storedProgress = readStoredLessonAuthorProgress(conversationId);
    writeStoredLessonAuthorProgress(conversationId, event, storedProgress?.simulatedStepIndex ?? 0);
  }, []);

  const sendUserMessage = useCallback((rawContent: string, source: SendSource = 'text', draftSelectionOverride?: BlueprintDraftSelection | null): boolean => {
    if (!currentConv || !rawContent.trim() || streaming) return false;
    const conversationId = currentConv.id;
    const target = isLessonAuthor ? 'lesson_author' : 'admin';
    const content = rawContent.trim();
    const streamStartedAt = performance.now();
    const isVoiceTurn = source === 'voice' || voiceModeActive;
    if (isVoiceTurn) {
      clearVoiceAutoListenTimer();
      voiceCallActiveRef.current = false;
      voiceCallMutedRef.current = false;
      setVoiceModeActive(false);
      setVoiceModeTranscript('');
      setVoiceCallStartedAt(null);
      setVoiceCallMuted(false);
    }
    const outgoingMentions: OutlineMention[] = isLessonAuthor
      ? selectedMentions.map(({ block_id, block_type, display_name, path, unit_id, ancestor_ids, ancestor_types }) => ({
        block_id,
        block_type,
        display_name,
        path,
        unit_id,
        ancestor_ids,
        ancestor_types,
      }))
      : [];
    const outgoingSourceDocuments: LessonAuthorSourceDocument[] = isLessonAuthor
      ? selectedSourceDocuments.map(({ document_id, kb_id, name, type, status, source_info }) => ({
        document_id,
        kb_id,
        name,
        type,
        status,
        source_info,
      }))
      : [];
    const outgoingBlueprintDraft = isLessonAuthor
      ? (draftSelectionOverride ?? blueprintDraftSelection)
      : null;

    stopVoiceCapture(true);
    cancelBotSpeech();
    setInputValue('');
    setSelectedMentions([]);
    setSelectedSourceDocuments([]);
    setBlueprintDraftSelection(null);
    clearStoredLessonAuthorProgress(conversationId);

    const userMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      conversation_id: conversationId,
      role: 'user',
      content,
      metadata: {
        ...(isVoiceTurn ? { input_mode: 'voice' } : {}),
        ...(outgoingMentions.length > 0 ? { outline_mentions: outgoingMentions } : {}),
        ...(outgoingSourceDocuments.length > 0 ? { source_documents: outgoingSourceDocuments } : {}),
        ...(outgoingBlueprintDraft ? {
          lesson_author_blueprint_id: outgoingBlueprintDraft.blueprint_id,
          lesson_author_blueprint_chapter_index: outgoingBlueprintDraft.chapter_index,
        } : {}),
      },
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamText('');
    setProposalEvent(null);
    // Keep the approved blueprint visible while drafting a chapter from it.
    // The proposal card still hides the full blueprint card, but its
    // "View lesson structure" action needs this context to remain available.
    if (!outgoingBlueprintDraft) setBlueprintEvent(null);
    setLessonAuthorProgress(null);
    resetMindmapState();
    streamAccRef.current = '';
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);

    const finishStream = async (fallbackText: string, toastMessage?: string) => {
      const isCurrentConversation = () => currentConvIdRef.current === conversationId;
      try {
        // Keep the busy state visible briefly when the backend returns an
        // immediate done event. This prevents a one-frame loading flash.
        if (!toastMessage) {
          await waitForMinimumStreamDuration(streamStartedAt);
          if (!isCurrentConversation()) return;
        }
        const result = await fetchMessages(conversationId, undefined, target);
        if (!isCurrentConversation()) return;

        const normalizedFallback = fallbackText.trim() || toastMessage?.trim() || '';
        const hasFallbackInServer = normalizedFallback
          ? result.messages.some(message => message.role === 'assistant' && message.content.trim() === normalizedFallback)
          : true;
        const nextMessages = normalizedFallback && !hasFallbackInServer
          ? [
              ...result.messages,
              {
                id: 'resp-' + Date.now(),
                conversation_id: conversationId,
                role: 'assistant' as const,
                content: normalizedFallback,
                metadata: {},
                created_at: new Date().toISOString(),
              },
            ]
          : result.messages;
        setMessages(nextMessages);
        setProposalEvent(getLatestPendingProposalEvent(nextMessages));
        const latestBlueprint = getLatestBlueprintEvent(nextMessages);
        setBlueprintEvent(current => (
          latestBlueprint || outgoingBlueprintDraft ? latestBlueprint ?? current : null
        ));
        setHasMore(result.has_more);
        setNextCursor(result.next_cursor);
        scrollChatToBottom('smooth');
      } catch {
        if (isCurrentConversation()) {
          const visibleFallback = fallbackText.trim() || toastMessage?.trim() || '';
          if (visibleFallback) {
          setMessages(msgs => {
              const alreadyRendered = msgs.some(message => message.role === 'assistant' && message.content.trim() === visibleFallback);
              if (alreadyRendered) return msgs;
              return [
                ...msgs,
                {
                  id: 'resp-' + Date.now(),
                  conversation_id: conversationId,
                  role: 'assistant' as const,
                  content: visibleFallback,
                  metadata: {},
                  created_at: new Date().toISOString(),
                },
              ];
            });
          } else if (!toastMessage) {
            toast.error(i18n.t('chatWidget.loadMessagesFailed'));
          }
        }
      } finally {
        if (isCurrentConversation()) {
          setStreamText('');
          setStreaming(false);
          setLessonAuthorProgress(null);
          streamAccRef.current = '';
        }
        clearStoredLessonAuthorProgress(conversationId);
        if (toastMessage && isCurrentConversation()) toast.error(toastMessage);
      }
    };

    abortRef.current = sendMessageStream(
      conversationId,
      content,
      (text) => {
        streamAccRef.current += text;
        setStreamText(streamAccRef.current);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 10);
      },
      () => { void finishStream(streamAccRef.current); },
      (message) => {
        const partial = streamAccRef.current.trim();
        cancelBotSpeech();
        void finishStream(partial ? `${partial}\n\n${message}` : message, message);
      },
      {
        target,
        courseId: isLessonAuthor ? courseId : undefined,
        mode: isLessonAuthor ? (outgoingBlueprintDraft ? 'draft_lesson' : 'auto') : 'chat',
        outline_mentions: outgoingMentions,
        source_documents: outgoingSourceDocuments,
        blueprint_id: outgoingBlueprintDraft?.blueprint_id,
        blueprint_chapter_index: outgoingBlueprintDraft?.chapter_index,
        input_mode: isVoiceTurn ? 'voice' : 'text',
        onProposal: isLessonAuthor ? setProposalEvent : undefined,
        onBlueprint: isLessonAuthor ? setBlueprintEvent : undefined,
        onProgress: isLessonAuthor
          ? (event) => handleLessonAuthorProgress(conversationId, event)
          : undefined,
      },
    );
    return true;
  }, [blueprintDraftSelection, cancelBotSpeech, clearVoiceAutoListenTimer, courseId, currentConv, handleLessonAuthorProgress, isLessonAuthor, resetMindmapState, scrollChatToBottom, selectedMentions, selectedSourceDocuments, stopVoiceCapture, streaming, voiceModeActive, waitForMinimumStreamDuration]);

  const handleSend = () => {
    sendUserMessage(inputValue, 'text');
  };

  const handleVoiceToggle = useCallback(async () => {
    clearVoiceAutoListenTimer();
    if (voiceCaptureState === 'listening') {
      stopVoiceCapture(false);
      return;
    }
    if (voiceCaptureState === 'requesting' || streaming) return;
    primeBotAudioPlayback();
    if (!currentConv) {
      toast.error(i18n.t('chatWidget.createConversationBeforeMicrophone'));
      return;
    }

    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      toast.error(i18n.t('chatWidget.speechUnsupported'));
      return;
    }

    voiceCallActiveRef.current = true;
    voiceCallMutedRef.current = false;
    setVoiceModeActive(true);
    setVoiceCallStartedAt(prev => prev ?? Date.now());
    setVoiceCallMuted(false);
    setVoiceCaptureState('requesting');
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch {
      setVoiceCaptureState('idle');
      voiceCallActiveRef.current = false;
      voiceCallMutedRef.current = false;
      setVoiceModeActive(false);
      setVoiceModeTranscript('');
      setVoiceCallStartedAt(null);
      setVoiceCallMuted(false);
      toast.error(i18n.t('chatWidget.microphonePermission'));
      return;
    }

    cancelBotSpeech();
    voiceTranscriptRef.current = '';
    voicePreviewRef.current = '';
    voiceDiscardRef.current = false;
    voiceErrorRef.current = false;

    const recognition = new SpeechRecognition();
    recognition.lang = VOICE_LANG;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        if (result.isFinal) finalText = `${finalText} ${transcript}`.trim();
        else interimText = `${interimText} ${transcript}`.trim();
      }
      if (finalText) voiceTranscriptRef.current = `${voiceTranscriptRef.current} ${finalText}`.trim();
      const preview = `${voiceTranscriptRef.current} ${interimText}`.trim();
      voicePreviewRef.current = preview;
      if (preview) {
        setInputValue(preview);
        setVoiceModeTranscript(preview);
      }
    };
    recognition.onerror = (event) => {
      clearVoiceListenTimer();
      setVoiceCaptureState('idle');
      if (voiceDiscardRef.current || !voiceCallActiveRef.current) {
        recognitionRef.current = null;
        return;
      }
      voiceErrorRef.current = true;
      const shouldEndCall = event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture';
      if (shouldEndCall) {
        voiceCallActiveRef.current = false;
        voiceCallMutedRef.current = false;
        setVoiceModeActive(false);
        setVoiceCallStartedAt(null);
        setVoiceCallMuted(false);
      } else {
        voiceCallMutedRef.current = true;
        setVoiceCallMuted(true);
      }
      setVoiceModeTranscript('');
      toast.error(getVoiceErrorMessage(event.error));
    };
    recognition.onend = () => {
      clearVoiceListenTimer();
      setVoiceCaptureState('idle');
      recognitionRef.current = null;
      if (voiceDiscardRef.current) {
        voiceDiscardRef.current = false;
        return;
      }
      const transcript = (voiceTranscriptRef.current || voicePreviewRef.current).trim();
      if (!transcript) {
        voiceCallMutedRef.current = true;
        setVoiceCallMuted(true);
        setVoiceModeTranscript('');
        if (!voiceErrorRef.current) toast.error(i18n.t('chatWidget.speechUnclear'));
        return;
      }
      setInputValue(transcript);
      setVoiceModeTranscript(transcript);
      window.setTimeout(() => sendUserMessage(transcript, 'voice'), 0);
    };

    try {
      recognitionRef.current = recognition;
      recognition.start();
      setVoiceCaptureState('listening');
      voiceListenTimerRef.current = window.setTimeout(() => {
        try { recognition.stop(); } catch { /* Recognition may already have stopped. */ }
      }, VOICE_MAX_LISTEN_MS);
    } catch {
      recognitionRef.current = null;
      setVoiceCaptureState('idle');
      voiceCallActiveRef.current = false;
      voiceCallMutedRef.current = false;
      setVoiceModeActive(false);
      setVoiceModeTranscript('');
      setVoiceCallStartedAt(null);
      setVoiceCallMuted(false);
      toast.error(i18n.t('chatWidget.microphoneStartFailed'));
    }
  }, [cancelBotSpeech, clearVoiceAutoListenTimer, clearVoiceListenTimer, currentConv, primeBotAudioPlayback, sendUserMessage, stopVoiceCapture, streaming, voiceCaptureState]);

  useEffect(() => {
    voiceAutoListenCallbackRef.current = () => { void handleVoiceToggle(); };
  }, [handleVoiceToggle]);

  const handleCloseVoiceMode = useCallback(() => {
    clearVoiceAutoListenTimer();
    voiceCallActiveRef.current = false;
    voiceCallMutedRef.current = false;
    setVoiceModeActive(false);
    setVoiceModeTranscript('');
    setVoiceCallStartedAt(null);
    setVoiceCallMuted(false);
    stopVoiceCapture(true);
    cancelBotSpeech();
  }, [cancelBotSpeech, clearVoiceAutoListenTimer, stopVoiceCapture]);

  const handleToggleVoiceMute = useCallback(() => {
    if (!voiceModeActive) return;

    if (voiceCallMutedRef.current) {
      voiceCallMutedRef.current = false;
      setVoiceCallMuted(false);
      window.setTimeout(() => {
        if (voiceCallActiveRef.current) void handleVoiceToggle();
      }, 120);
      return;
    }

    voiceCallMutedRef.current = true;
    setVoiceCallMuted(true);
    clearVoiceAutoListenTimer();
    stopVoiceCapture(true);
    setVoiceCaptureState('idle');
  }, [clearVoiceAutoListenTimer, handleVoiceToggle, stopVoiceCapture, voiceModeActive]);

  useEffect(() => {
    if (!voiceModeActive || voiceCallMuted || voiceCaptureState !== 'idle' || streaming || botSpeechLoading || botSpeaking || botSpeechNeedsTap || !currentConv) {
      clearVoiceAutoListenTimer();
      return;
    }

    scheduleVoiceAutoListen(450);

    return clearVoiceAutoListenTimer;
  }, [botSpeaking, botSpeechLoading, botSpeechNeedsTap, clearVoiceAutoListenTimer, currentConv, scheduleVoiceAutoListen, streaming, voiceCallMuted, voiceCaptureState, voiceModeActive]);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleBack = () => {
    clearMinimumStreamDelay();
    stopVoiceCapture(true);
    cancelBotSpeech();
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStreaming(false);
    setStreamText('');
    setCurrentConv(null);
    currentConvIdRef.current = null;
    setMessages([]);
    setSelectedMentions([]);
    setSelectedSourceDocuments([]);
    setHasMore(false);
    setNextCursor(null);
    setProposalEvent(null);
    setBlueprintEvent(null);
    setBlueprintDraftSelection(null);
    setLessonAuthorProgress(null);
    resetMindmapState();
    setState('conversations');
    fetchConversations({
      target: isLessonAuthor ? 'lesson_author' : 'admin',
      courseId: isLessonAuthor ? courseId : undefined,
    }).then(setConversations).catch(() => {});
  };

  const handleSwitchLessonAuthor = async () => {
    if (!isCourseOutline || !courseId) return;
    const nextSurface: ChatSurface = isLessonAuthor ? 'admin' : 'lesson_author';
    setSurface(nextSurface);
    resetChatState();
    if (open) await loadActiveBot(nextSurface);
  };

  const handleOpenMindmap = async () => {
    if (!proposalEvent) {
      toast.error(i18n.t('chatWidget.noLessonPlan'));
      return;
    }
    if (!courseId) {
      toast.error(i18n.t('chatWidget.currentCourseMissing'));
      return;
    }

    setMindmapProposalEvent(proposalEvent);
    setMindmapOpen(true);
    setMindmapLoading(true);
    setMindmapError(null);

    try {
      const queryKey = ['course-outline-index', courseId] as const;
      const outline = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => getCourseOutlineIndex(courseId),
        staleTime: 0,
      });
      setMindmapOutline(outline);
    } catch {
      setMindmapError(i18n.t('chatWidget.mindmapLoadFailed'));
    } finally {
      setMindmapLoading(false);
    }
  };

  const handleOpenBlueprint = useCallback(() => {
    if (!blueprintEvent) return;
    setBlueprintDialogOpen(true);
  }, [blueprintEvent]);

  const handleDraftBlueprintChapter = useCallback((chapterIndex: number) => {
    if (!blueprintEvent || streaming) return;
    if ((blueprintEvent.status ?? 'proposed') !== 'proposed') {
      toast.error(
        blueprintEvent.error_reason
        || (i18n.language !== 'en'
          ? 'Bản thiết kế này không còn hợp lệ vì tài liệu nguồn đã thay đổi. Vui lòng tạo lại.'
          : 'This course blueprint is no longer valid because source material changed. Create a new one to continue.'),
      );
      return;
    }
    if ((blueprintEvent.applied_chapter_indexes ?? []).includes(chapterIndex)) {
      toast.error(i18n.t('chatWidget.blueprintChapterAlreadyApplied'));
      return;
    }
    const chapter = blueprintEvent.blueprint.chapters[chapterIndex];
    if (!chapter) return;
    const isVietnamese = i18n.language !== 'en';
    const nextDraftPrompt = buildBlueprintChapterDraftPrompt(chapterIndex, chapter.title, isVietnamese);
    const currentSelectionPrompt = blueprintDraftSelection
      ? buildBlueprintChapterDraftPrompt(
        blueprintDraftSelection.chapter_index,
        blueprintDraftSelection.chapter_title,
        isVietnamese,
      )
      : '';
    if (inputValue.trim() && inputValue.trim() !== currentSelectionPrompt) {
      toast.error(
        isVietnamese
          ? 'Bạn đang có nội dung chưa gửi. Hãy gửi hoặc xoá nội dung đó trước khi chọn chương khác.'
          : 'You have an unsent message. Send or clear it before choosing another chapter.',
      );
      return;
    }
    const draftSelection: BlueprintDraftSelection = {
      blueprint_id: blueprintEvent.blueprint_id,
      chapter_index: chapterIndex,
      chapter_title: chapter.title,
    };
    if (sendUserMessage(nextDraftPrompt, 'text', draftSelection)) {
      setBlueprintDialogOpen(false);
    }
  }, [blueprintDraftSelection, blueprintEvent, inputValue, sendUserMessage, streaming]);

  const handleApplyProposal = async () => {
    if (!proposalEvent || !courseId || applyingProposal) return;
    const appliedOperation = proposalEvent.proposal.operation_plan?.operation;
    setApplyingProposal(true);
    try {
      const result = await applyLessonAuthorJob(proposalEvent.job_id);
      toast.success(appliedOperation === 'delete'
        ? (i18n.language === 'en' ? 'Deletion has been queued.' : 'Đã đưa node vào hàng đợi xóa.')
        : appliedOperation === 'rename'
          ? (i18n.language === 'en' ? 'Title updated.' : 'Đã cập nhật tiêu đề.')
          : i18n.t('chatWidget.proposalApplied', { created: result.created_count, updated: result.updated_count }));
      if (
        result.blueprint_id
        && result.blueprint_chapter_index !== null
        && result.blueprint_chapter_index !== undefined
      ) {
        setBlueprintEvent(current => {
          if (!current || current.blueprint_id !== result.blueprint_id) return current;
          return {
            ...current,
            applied_chapter_indexes: Array.from(new Set([
              ...(current.applied_chapter_indexes ?? []),
              result.blueprint_chapter_index as number,
            ])).sort((left, right) => left - right),
          };
        });
      }
      setProposalEvent(null);
      resetMindmapState();
      const queryKey = ['course-outline-index', courseId] as const;
      await queryClient.invalidateQueries({ queryKey, exact: true });
      await queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
      await loadOutlineMentions(true);
      window.dispatchEvent(new CustomEvent('landa:course-outline-updated', {
        detail: {
          courseId,
          jobId: proposalEvent.job_id,
          createdBlockIds: result.created_block_ids,
          updatedBlockIds: result.updated_block_ids,
        },
      }));
      if (currentConv) {
        try {
          const refreshed = await fetchMessages(currentConv.id, undefined, isLessonAuthor ? 'lesson_author' : 'admin');
          setMessages(refreshed.messages);
          setProposalEvent(getLatestPendingProposalEvent(refreshed.messages));
          const latestBlueprint = getLatestBlueprintEvent(refreshed.messages);
          setBlueprintEvent(current => latestBlueprint ?? current);
          setHasMore(refreshed.has_more);
          setNextCursor(refreshed.next_cursor);
        } catch {
          toast.error(i18n.t('chatWidget.loadMessagesFailed'));
        }
      }
    } catch (err: unknown) {
      toast.error(getLocalizedApiError(err, i18n.t('chatWidget.proposalApplyFailed')));
    } finally {
      setApplyingProposal(false);
    }
  };

  const handleMentionClick = useCallback((mention: OutlineMention) => {
    if (!courseId) return;
    window.dispatchEvent(new CustomEvent('landa:focus-course-block', {
      detail: { courseId, mention },
    }));
  }, [courseId]);

  const handleSourceDocumentClick = useCallback((doc: LessonAuthorSourceDocument) => {
    if (!canManageAiChatbot) return;
    if (!doc.kb_id) return;
    navigate(`/ai-chatbot?tab=kb&kbId=${encodeURIComponent(doc.kb_id)}`);
  }, [canManageAiChatbot, navigate]);

  if (!canUseChatWidget) return null;

  const widgetClass = fullscreen
    ? 'fixed inset-2 z-[9998] rounded-2xl sm:inset-4'
    : 'fixed inset-x-2 bottom-2 z-[9998] h-[calc(100dvh-16px)] max-h-[720px] w-auto rounded-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(720px,calc(100dvh-48px))] sm:w-[420px]';

  const activeAvatarUrl = isLessonAuthor
    ? (lessonSettings?.active_persona?.persona_avatar_url || activeBot?.bot_avatar_url)
    : activeBot?.bot_avatar_url;
  const botAvatarSrc = activeAvatarUrl ? storageUrl(activeAvatarUrl) : null;
  const headerTitle = isLessonAuthor ? t('chatWidget.lessonExpert') : (activeBot?.bot_name || 'AI Assistant');
  const headerSubtitle = isLessonAuthor
    ? (lessonSettings?.active_kb?.kb_name || t('chatWidget.lessonAuthor'))
    : (streaming ? t('chatWidget.responding') : t('chatWidget.online'));

  return (
    <>
      {/* ═══════ Draggable FAB ═══════ */}
      {!open && (
        <AppTooltip content={t('chatWidget.chatWithAi')}><div
          ref={fabRef}
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, touchAction: 'none' }}
          className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 flex items-center justify-center hover:shadow-xl hover:shadow-primary/30 cursor-grab active:cursor-grabbing select-none"

        >
          {botAvatarSrc ? (
            <img src={botAvatarSrc} alt="" className="h-9 w-9 rounded-full object-cover pointer-events-none" draggable={false} />
          ) : (
            <MessageCircle className="h-6 w-6 text-primary-foreground pointer-events-none" />
          )}
          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background animate-pulse pointer-events-none" />
        </div></AppTooltip>
      )}

      {/* ═══════ Widget Panel ═══════ */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className={`${widgetClass} border bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 flex flex-col overflow-hidden`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-2.5">
                {state === 'chat' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                  {botAvatarSrc ? (
                    <img src={botAvatarSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{headerTitle}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{headerSubtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isCourseOutline && (
                  <AppTooltip content={t('chatWidget.lessonExpert')}><Button
                    variant={isLessonAuthor ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={handleSwitchLessonAuthor}
                    aria-label={t('chatWidget.lessonExpert')}
                  >
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t('chatWidget.expert')}</span>
                  </Button></AppTooltip>
                )}
                <AppTooltip content={fullscreen ? t('chatWidget.minimize') : t('chatWidget.maximize')}><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFullscreen(f => !f)} aria-label={fullscreen ? t('chatWidget.minimize') : t('chatWidget.maximize')}>
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button></AppTooltip>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setOpen(false); setFullscreen(false); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 flex flex-col">
              {state === 'loading' && <LoadingState />}
              {state === 'no-bot' && <NoBotState />}
              {state === 'config-warning' && (
                isLessonAuthor ? (
                  <LessonAuthorWarning settings={lessonSettings} />
                ) : (
                  <BotKnowledgebaseWarning bot={activeBot} />
                )
              )}
              {state === 'persona-picker' && (
                <PersonaPicker
                  personas={personas}
                  onSelect={handleCreateConversation}
                  onBack={conversations.length > 0 ? () => setState('conversations') : undefined}
                />
              )}
              {state === 'conversations' && (
                <ConversationList
                  conversations={conversations}
                  loading={loadingConvs}
                  onOpen={handleOpenConversation}
                  onDelete={handleDeleteConversation}
                  onNew={handleNewConvFromList}
                />
              )}
              {state === 'chat' && (
                <ChatView
                  messages={messages}
                  streamText={streamText}
                  streaming={streaming}
                  loading={loadingMessages}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={handleLoadMore}
                  inputValue={inputValue}
                  onInputChange={setInputValue}
                  onSend={handleSend}
                  onKeyDown={handleKeyDown}
                  voiceCaptureState={voiceCaptureState}
                  botSpeaking={botSpeaking}
                  botSpeechLoading={botSpeechLoading}
                  botSpeechNeedsTap={botSpeechNeedsTap}
                  botSpeechText={botSpeechText}
                  voiceModeActive={voiceModeActive}
                  voiceModeTranscript={voiceModeTranscript}
                  voiceCallStartedAt={voiceCallStartedAt}
                  voiceCallMuted={voiceCallMuted}
                  botName={headerTitle}
                  botAvatarSrc={botAvatarSrc}
                  onVoiceToggle={handleVoiceToggle}
                  onToggleVoiceMute={handleToggleVoiceMute}
                  onResumeBotSpeech={handleResumeBotSpeech}
                  onStopBotSpeech={cancelBotSpeech}
                  onCloseVoiceMode={handleCloseVoiceMode}
                  isLessonAuthor={isLessonAuthor}
                  outlineMentionOptions={outlineMentionOptions}
                  selectedMentions={selectedMentions}
                  onSelectedMentionsChange={setSelectedMentions}
                  onMentionClick={handleMentionClick}
                  sourceDocumentOptions={sourceDocumentOptions}
                  selectedSourceDocuments={selectedSourceDocuments}
                  loadingSourceDocuments={loadingSourceDocuments}
                  onLoadSourceDocuments={loadSourceDocuments}
                  onSelectedSourceDocumentsChange={setSelectedSourceDocuments}
                  onSourceDocumentClick={canManageAiChatbot ? handleSourceDocumentClick : undefined}
                  scrollRef={scrollRef}
                  conversationId={currentConv?.id ?? null}
                  inputRef={inputRef}
                  proposalEvent={proposalEvent}
                  blueprintEvent={blueprintEvent}
                  blueprintDraftSelection={blueprintDraftSelection}
                  lessonAuthorProgress={lessonAuthorProgress}
                  applyingProposal={applyingProposal}
                  onApplyProposal={handleApplyProposal}
                  onOpenMindmap={handleOpenMindmap}
                  onOpenBlueprint={handleOpenBlueprint}
                  onDraftBlueprintChapter={handleDraftBlueprintChapter}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ Delete Confirmation Modal ═══════ */}
      <LessonAuthorMindmapModal
        open={mindmapOpen}
        onOpenChange={setMindmapOpen}
        outline={mindmapOutline}
        proposalEvent={mindmapProposalEvent}
        loading={mindmapLoading}
        error={mindmapError}
      />
      <LessonAuthorBlueprintDialog
        open={blueprintDialogOpen}
        onOpenChange={setBlueprintDialogOpen}
        blueprintEvent={blueprintEvent}
        disabled={streaming}
        onDraftChapter={handleDraftBlueprintChapter}
      />

      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!deleting) setConfirmDeleteId(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-background border rounded-xl shadow-2xl p-6 w-[340px] space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{t('chatWidget.deleteConversation')}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('chatWidget.deleteConversationDescription')}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>{t('common.cancel')}</Button>
                <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting} className="gap-1.5">
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {t('common.delete')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
      <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      <p className="text-sm text-muted-foreground">{t('chatWidget.connecting')}</p>
    </div>
  );
}

function NoBotState() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
        <Bot className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">{t('chatWidget.noActiveBot')}</p>
      <p className="text-xs text-muted-foreground/60">{t('chatWidget.noActiveBotHint')}</p>
    </div>
  );
}

function LessonAuthorWarning({ settings }: { settings: LessonAuthorSettings | null }) {
  const { t } = useTranslation();
  const missing: string[] = [];
  if (!settings?.active_bot) missing.push(t('chatWidget.missingExpertBot'));
  if (!settings?.active_kb) missing.push(t('chatWidget.missingExpertKb'));
  if (!settings?.active_persona) missing.push(t('chatWidget.missingExpertMascot'));
  if (
    settings?.active_bot &&
    settings?.active_persona &&
    settings.active_persona.bot_id !== settings.active_bot.bot_id
  ) {
    missing.push(t('chatWidget.mismatchedExpertMascot'));
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold">{t('chatWidget.incompleteExpertConfiguration')}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('chatWidget.incompleteExpertConfigurationHint')}
        </p>
      </div>
      <div className="app-liquid-card w-full max-w-xs rounded-lg border bg-muted/30 p-3 text-left">
        <p className="text-[11px] font-medium text-muted-foreground mb-2">{t('chatWidget.missing')}</p>
        <div className="space-y-1">
          {missing.map(item => (
            <div key={item} className="flex items-center gap-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground max-w-xs">
        {t('chatWidget.expertSetupHint')}
      </p>
    </div>
  );
}

function BotKnowledgebaseWarning({ bot }: { bot: ActiveBot | null }) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold">{t('aiChatbot.botKbMissing')}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('chatWidget.aiRagKbNotAssigned')}
        </p>
      </div>
      {bot?.bot_name && (
        <div className="app-liquid-card w-full max-w-xs rounded-lg border bg-muted/30 p-3 text-left">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">{t('chatWidget.chatWithAi')}</p>
          <p className="text-sm font-semibold truncate">{bot.bot_name}</p>
        </div>
      )}
    </div>
  );
}

function PersonaPicker({ personas, onSelect, onBack }: {
  personas: BotPersona[];
  onSelect: (id: string) => void;
  onBack?: () => void;
}) {
  const [selecting, setSelecting] = useState<string | null>(null);

  const handleSelect = async (id: string) => {
    setSelecting(id);
    await onSelect(id);
    setSelecting(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {onBack && (
        <div className="px-4 pt-4 pb-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3 pt-2">
          {personas.map((p, i) => {
            const name = p.custom_name || p.template_name;
            const desc = p.custom_description || p.template_description || '';
            const fullbody = p.template_fullbody_url;
            const avatar = p.template_avatar_url;

            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => handleSelect(p.id)}
                disabled={selecting !== null}
                className="app-liquid-card group relative rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 overflow-hidden text-left disabled:opacity-50"
              >
                <div className="h-28 bg-gradient-to-br from-muted/40 to-muted/10 flex items-end justify-center overflow-hidden">
                  {fullbody ? (
                    <img src={storageUrl(fullbody)} alt="" className="h-[90%] w-auto object-contain drop-shadow-md group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                      <Bot className="h-6 w-6 text-primary/40" />
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1">
        <div className="flex items-end gap-2">
                    {avatar ? (
                      <img src={storageUrl(avatar)} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-primary">{name.charAt(0)}</span>
                      </div>
                    )}
                    <p className="text-xs font-semibold truncate flex-1">{name}</p>
                  </div>
                  {desc && <p className="text-[10px] text-muted-foreground line-clamp-2">{desc}</p>}
                </div>
                {selecting === p.id && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function ConversationList({ conversations, loading, onOpen, onDelete, onNew }: {
  conversations: ChatConversation[];
  loading: boolean;
  onOpen: (conv: ChatConversation) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const { t, i18n: translationInstance } = useTranslation();
  const isVietnamese = translationInstance.language !== 'en';
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('chatWidget.conversations')}</h3>
          <p className="text-[11px] text-muted-foreground">{conversations.length}/10</p>
        </div>
        <Button size="sm" variant="outline" onClick={onNew} disabled={conversations.length >= 10} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" /> {t('chatWidget.newConversation')}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {loading ? (
          <div className="space-y-2 px-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border"><Skeleton className="h-4 w-2/3 mb-2" /><Skeleton className="h-3 w-full" /></div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6 text-muted-foreground">
            <MessageCircle className="h-8 w-8 opacity-30" />
            <p className="text-xs">{t('chatWidget.noConversations')}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {conversations.map((conv, i) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors overflow-hidden"
                onClick={() => onOpen(conv)}
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 overflow-hidden">
                  {conv.persona_avatar_url ? (
                    <img src={storageUrl(conv.persona_avatar_url)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="h-4 w-4 text-primary/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{conv.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{conv.last_message || t('chatWidget.noMessages')}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
                    <span className="text-[9px] text-muted-foreground/50">
                      {new Date(conv.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {conv.persona_name && <Badge variant="outline" className="text-[8px] h-4 px-1 ml-1">{conv.persona_name}</Badge>}
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



function VoiceModeView({ active, phase, transcript, botText, botName, botAvatarSrc, startedAt, muted, onMic, onToggleMute, onResumeBotSpeech, onStopBotSpeech, onClose }: {
  active: boolean;
  phase: VoiceModePhase;
  transcript: string;
  botText: string;
  botName: string;
  botAvatarSrc: string | null;
  startedAt: number | null;
  muted: boolean;
  onMic: () => void;
  onToggleMute: () => void;
  onResumeBotSpeech: () => void;
  onStopBotSpeech: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  void botText;

  useEffect(() => {
    if (!active || !startedAt) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => setElapsedSeconds((Date.now() - startedAt) / 1000);
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  const isUserTurn = phase === 'requesting' || phase === 'listening';
  const isBotTurn = phase === 'thinking' || phase === 'preparing' || phase === 'speaking' || phase === 'play_blocked';
  const userVoiceActive = phase === 'listening' && transcript.trim().length > 0;
  const botVoiceActive = phase === 'speaking';
  const waveActive = !muted && (userVoiceActive || botVoiceActive);
  const caption = (isBotTurn ? '' : transcript).trim();
  const title = muted && phase === 'idle'
    ? t('chatWidget.microphoneOff')
    : phase === 'requesting'
      ? t('chatWidget.connectingMicrophone')
      : phase === 'listening'
        ? t('chatWidget.listening')
        : phase === 'thinking'
          ? t('chatWidget.thinking')
          : phase === 'preparing'
            ? t('chatWidget.preparingVoice')
            : phase === 'speaking'
              ? t('chatWidget.botSpeaking')
              : phase === 'play_blocked'
                ? t('chatWidget.tapToPlayVoice')
                : t('chatWidget.inCall');
  const hint = muted && phase === 'idle'
    ? t('chatWidget.enableMicToContinue')
    : phase === 'idle'
      ? t('chatWidget.readyForNextTurn')
      : phase === 'play_blocked'
        ? t('chatWidget.safariTapToPlay')
        : caption || title;
  const statusDotClass = muted
    ? 'bg-amber-300'
    : isUserTurn
      ? 'bg-rose-500 dark:bg-rose-300'
      : isBotTurn
        ? 'bg-sky-500 dark:bg-sky-300'
        : 'bg-emerald-500 dark:bg-emerald-300';
  const avatarTone = isBotTurn
    ? 'border-sky-500/25 bg-sky-500/10 text-sky-700 shadow-sky-500/10 dark:border-sky-300/25 dark:bg-sky-400/15 dark:text-sky-100 dark:shadow-sky-950/40'
    : muted
      ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 shadow-amber-500/10 dark:border-amber-300/25 dark:bg-amber-400/15 dark:text-amber-100 dark:shadow-amber-950/35'
      : 'border-rose-500/25 bg-rose-500/10 text-rose-700 shadow-rose-500/10 dark:border-rose-300/25 dark:bg-rose-400/15 dark:text-rose-100 dark:shadow-rose-950/40';
  const ringTone = isBotTurn ? 'border-sky-500/20 bg-sky-500/10 dark:border-sky-300/20 dark:bg-sky-300/10' : muted ? 'border-amber-500/20 bg-amber-500/10 dark:border-amber-300/20 dark:bg-amber-300/10' : 'border-rose-500/20 bg-rose-500/10 dark:border-rose-300/20 dark:bg-rose-300/10';
  const barTone = isBotTurn ? 'bg-sky-500/70 dark:bg-sky-300/80' : muted ? 'bg-muted-foreground/25 dark:bg-white/25' : 'bg-rose-500/70 dark:bg-rose-300/80';
  const rightAction = phase === 'play_blocked'
    ? onResumeBotSpeech
    : phase === 'speaking' || phase === 'preparing'
      ? onStopBotSpeech
      : onMic;
  const rightDisabled = muted || phase === 'requesting' || phase === 'thinking';
  const rightTitle = phase === 'play_blocked'
    ? t('chatWidget.playBotVoice')
    : phase === 'speaking' || phase === 'preparing'
      ? t('chatWidget.muteBotVoice')
      : t('chatWidget.speakNow');
  const rightLabel = phase === 'play_blocked' ? t('chatWidget.play') : phase === 'speaking' || phase === 'preparing' ? t('chatWidget.stopBot') : t('chatWidget.speak');
  const bars = [12, 18, 14, 26, 20, 34, 24, 42, 28, 38, 22, 30, 18, 24, 14];

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="voice-call-mode"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground dark:bg-zinc-950 dark:text-white"
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted))_52%,hsl(var(--background))_100%)] dark:bg-[linear-gradient(180deg,#0b1220_0%,#111827_52%,#09090b_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(14,165,233,0.10)_0%,transparent_34%,rgba(244,63,94,0.08)_72%,rgba(16,185,129,0.08)_100%)] dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.16)_0%,transparent_34%,rgba(244,63,94,0.12)_72%,rgba(16,185,129,0.10)_100%)]" />

          <div className="relative z-10 flex items-center justify-between px-4 pt-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground dark:text-white">{botName}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground dark:text-white/55">
                <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                <span className="truncate">{title}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-semibold tabular-nums text-foreground shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10 dark:text-white/85">
              {formatCallDuration(elapsedSeconds)}
            </div>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-4 text-center">
            <motion.div layout className="mb-5 inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10 dark:text-white/75">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`} />
              <span className="truncate">{title}</span>
            </motion.div>

            <div className="relative flex h-56 w-56 items-center justify-center">
              <motion.span
                className={`absolute h-48 w-48 rounded-full border ${ringTone}`}
                animate={waveActive ? { scale: [0.86, 1.12, 0.86], opacity: [0.72, 0.22, 0.72] } : { scale: 0.95, opacity: 0.28 }}
                transition={{ duration: waveActive ? 1.18 : 0.2, repeat: waveActive ? Infinity : 0, ease: 'easeInOut' }}
              />
              <motion.span
                className={`absolute h-40 w-40 rounded-full ${ringTone}`}
                animate={waveActive ? { scale: [0.9, 1.24, 0.9], opacity: [0.52, 0.12, 0.52] } : { scale: 0.96, opacity: 0.16 }}
                transition={{ duration: waveActive ? 0.86 : 0.2, repeat: waveActive ? Infinity : 0, ease: 'easeInOut' }}
              />
              <AppTooltip content={phase === 'speaking' ? t('chatWidget.muteBotVoice') : phase === 'play_blocked' ? t('chatWidget.playBotVoice') : botName}><motion.button
                type="button"
                onClick={phase === 'play_blocked' ? onResumeBotSpeech : phase === 'speaking' ? onStopBotSpeech : undefined}
                disabled={phase !== 'play_blocked' && phase !== 'speaking'}
                className={`relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border backdrop-blur-xl shadow-2xl disabled:cursor-default ${avatarTone}`}
                animate={{ scale: waveActive ? [1, 1.035, 1] : 1 }}
                transition={{ duration: 0.78, repeat: waveActive ? Infinity : 0, ease: 'easeInOut' }}
                aria-label={phase === 'speaking' ? t('chatWidget.muteBotVoice') : phase === 'play_blocked' ? t('chatWidget.playBotVoice') : botName}
              >
                {botAvatarSrc ? (
                  <img src={botAvatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Bot className="h-12 w-12" />
                )}
                {phase === 'play_blocked' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/75 text-foreground backdrop-blur-sm dark:bg-black/45 dark:text-white">
                    <Play className="h-10 w-10" />
                  </span>
                )}
              </motion.button></AppTooltip>
            </div>

            <div className="mt-4 flex h-12 items-center justify-center gap-1.5">
              {bars.map((idleHeight, index) => {
                const offset = Math.abs(index - 7);
                return (
                  <motion.span
                    key={index}
                    className={`w-1.5 rounded-full ${barTone}`}
                    animate={{ height: waveActive ? [14 + offset, Math.max(18, 44 - offset * 2), 12 + offset] : idleHeight }}
                    transition={{ duration: 0.5 + (index % 4) * 0.06, repeat: waveActive ? Infinity : 0, ease: 'easeInOut', delay: waveActive ? index * 0.025 : 0 }}
                  />
                );
              })}
            </div>

            <div className="mt-5 min-h-[76px] w-full max-w-[19rem]">
              <p className="text-base font-semibold tracking-normal text-foreground dark:text-white">{hint}</p>
              {caption ? (
                <motion.p
                  key={caption}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 max-h-24 overflow-hidden rounded-lg border border-border/70 bg-card/80 px-4 py-3 text-sm leading-6 text-muted-foreground backdrop-blur-md line-clamp-3 dark:border-white/10 dark:bg-white/10 dark:text-white/70"
                >
                  {caption}
                </motion.p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground dark:text-white/45">{isBotTurn ? t('chatWidget.keepCallOpen') : t('chatWidget.speakNaturally')}</p>
              )}
            </div>
          </div>

          <div className="relative z-10 px-5 pb-5">
            <div className="mx-auto grid max-w-xs grid-cols-3 items-end gap-4 rounded-lg border border-border/70 bg-card/85 px-4 py-4 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:shadow-black/25">
              <div className="flex flex-col items-center">
                <AppTooltip content={muted ? t('chatWidget.enableMicrophone') : t('chatWidget.disableMicrophone')}><Button type="button" variant="ghost" size="icon" className={`h-12 w-12 rounded-full border border-border bg-background/70 text-foreground hover:bg-muted dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 ${muted ? 'border-amber-500/40 text-amber-700 dark:border-amber-300/35 dark:text-amber-100' : ''}`} onClick={onToggleMute} aria-label={muted ? t('chatWidget.enableMicrophone') : t('chatWidget.disableMicrophone')}>
                  {muted ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </Button></AppTooltip>
                <span className="mt-2 text-[11px] font-medium text-muted-foreground dark:text-white/55">{muted ? t('chatWidget.enableMic') : t('chatWidget.disableMic')}</span>
              </div>
              <div className="flex flex-col items-center">
                <AppTooltip content={t('chatWidget.endCall')}><Button type="button" size="icon" className="h-14 w-14 rounded-full bg-red-500 text-white shadow-lg shadow-red-950/35 hover:bg-red-600" onClick={onClose} aria-label={t('chatWidget.endCall')}>
                  <PhoneOff className="h-6 w-6" />
                </Button></AppTooltip>
                <span className="mt-2 text-[11px] font-medium text-muted-foreground dark:text-white/55">{t('chatWidget.end')}</span>
              </div>
              <div className="flex flex-col items-center">
                <AppTooltip content={rightTitle}><Button type="button" variant="ghost" size="icon" className="h-12 w-12 rounded-full border border-border bg-background/70 text-foreground hover:bg-muted disabled:opacity-35 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15" onClick={rightAction} disabled={rightDisabled} aria-label={rightTitle}>
                  {phase === 'play_blocked'
                    ? <Play className="h-5 w-5" />
                    : phase === 'speaking' || phase === 'preparing'
                      ? <VolumeX className="h-5 w-5" />
                      : <Mic className="h-5 w-5" />}
                </Button></AppTooltip>
                <span className="mt-2 text-[11px] font-medium text-muted-foreground dark:text-white/55">{rightLabel}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChatView({ messages, streamText, streaming, loading, hasMore, loadingMore, onLoadMore, inputValue, onInputChange, onSend, onKeyDown, voiceCaptureState, botSpeaking, botSpeechLoading, botSpeechNeedsTap, botSpeechText, voiceModeActive, voiceModeTranscript, voiceCallStartedAt, voiceCallMuted, botName, botAvatarSrc, onVoiceToggle, onToggleVoiceMute, onResumeBotSpeech, onStopBotSpeech, onCloseVoiceMode, isLessonAuthor, outlineMentionOptions, selectedMentions, onSelectedMentionsChange, onMentionClick, sourceDocumentOptions, selectedSourceDocuments, loadingSourceDocuments, onLoadSourceDocuments, onSelectedSourceDocumentsChange, onSourceDocumentClick, scrollRef, conversationId, inputRef, proposalEvent, blueprintEvent, blueprintDraftSelection, lessonAuthorProgress, applyingProposal, onApplyProposal, onOpenMindmap, onOpenBlueprint, onDraftBlueprintChapter }: {
  messages: ChatMessage[];
  streamText: string;
  streaming: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  voiceCaptureState: VoiceCaptureState;
  botSpeaking: boolean;
  botSpeechLoading: boolean;
  botSpeechNeedsTap: boolean;
  botSpeechText: string;
  voiceModeActive: boolean;
  voiceModeTranscript: string;
  voiceCallStartedAt: number | null;
  voiceCallMuted: boolean;
  botName: string;
  botAvatarSrc: string | null;
  onVoiceToggle: () => void;
  onToggleVoiceMute: () => void;
  onResumeBotSpeech: () => void;
  onStopBotSpeech: () => void;
  onCloseVoiceMode: () => void;
  isLessonAuthor?: boolean;
  outlineMentionOptions?: OutlineMentionOption[];
  selectedMentions?: OutlineMentionOption[];
  onSelectedMentionsChange?: (mentions: OutlineMentionOption[]) => void;
  onMentionClick?: (mention: OutlineMention) => void;
  sourceDocumentOptions?: LessonAuthorSourceDocument[];
  selectedSourceDocuments?: LessonAuthorSourceDocument[];
  loadingSourceDocuments?: boolean;
  onLoadSourceDocuments?: (search?: string) => void;
  onSelectedSourceDocumentsChange?: (documents: LessonAuthorSourceDocument[]) => void;
  onSourceDocumentClick?: (doc: LessonAuthorSourceDocument) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  conversationId?: string | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  proposalEvent?: LessonAuthorProposalEvent | null;
  blueprintEvent?: LessonAuthorBlueprintEvent | null;
  blueprintDraftSelection?: BlueprintDraftSelection | null;
  lessonAuthorProgress?: LessonAuthorProgressEvent | null;
  applyingProposal?: boolean;
  onApplyProposal?: () => void;
  onOpenMindmap?: () => void;
  onOpenBlueprint?: () => void;
  onDraftBlueprintChapter?: (chapterIndex: number) => void;
}) {
  const { t, i18n: translationInstance } = useTranslation();
  const isVietnamese = translationInstance.language !== 'en';
  const scrollSaveFrameRef = useRef<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [simulatedProgressStepIndex, setSimulatedProgressStepIndex] = useState(0);
  const selectedMentionList = useMemo(() => selectedMentions ?? [], [selectedMentions]);
  const selectedSourceDocumentList = useMemo(() => selectedSourceDocuments ?? [], [selectedSourceDocuments]);
  const lessonAuthorOperationPlan = proposalEvent?.proposal.operation_plan;
  const isStructuralActionProposal = lessonAuthorOperationPlan?.operation === 'rename'
    || lessonAuthorOperationPlan?.operation === 'delete'
    || lessonAuthorOperationPlan?.operation === 'move';
  const actionTargetLabel = lessonAuthorOperationPlan?.target_type === 'chapter'
    ? (isVietnamese ? 'Chương' : 'Chapter')
    : lessonAuthorOperationPlan?.target_type === 'lesson'
      ? (isVietnamese ? 'Mục' : 'Section')
      : lessonAuthorOperationPlan?.target_type === 'unit'
        ? (isVietnamese ? 'Bài học' : 'Lesson')
        : (isVietnamese ? 'Component' : 'Component');
  const blueprintCanDraft = Boolean(blueprintEvent && (blueprintEvent.status ?? 'proposed') === 'proposed');
  const appliedBlueprintChapterIndexes = useMemo(() => new Set(
    (blueprintEvent?.applied_chapter_indexes ?? []).filter(index => (
      Number.isInteger(index) && index >= 0 && index < (blueprintEvent?.blueprint.chapters.length ?? 0)
    )),
  ), [blueprintEvent]);
  const nextBlueprintChapterIndex = blueprintEvent
    ? blueprintEvent.blueprint.chapters.findIndex((_, index) => !appliedBlueprintChapterIndexes.has(index))
    : -1;
  const hasPendingBlueprintChapter = nextBlueprintChapterIndex >= 0;
  const progressLabel = lessonAuthorProgress
    ? ({
      retrieving: isVietnamese ? 'Đang đọc tài liệu liên quan' : 'Reading relevant source material',
      designing: isVietnamese ? 'Đang thiết kế cấu trúc khóa học' : 'Designing the course structure',
      skeleton: isVietnamese ? 'Đang tạo khung chương' : 'Creating the chapter skeleton',
      generating: isVietnamese ? 'Đang soạn nội dung học' : 'Drafting learning content',
      content: isVietnamese ? 'Đang hoàn thiện nội dung học' : 'Finishing learning content',
      validating: isVietnamese ? 'Đang kiểm tra chất lượng' : 'Checking design quality',
    }[lessonAuthorProgress.stage] ?? lessonAuthorProgress.detail ?? (isVietnamese ? 'Đang xử lý' : 'Processing'))
    : null;
  const progressSteps = [
    {
      key: 'retrieving',
      label: isVietnamese ? 'Tài liệu' : 'Sources',
      status: isVietnamese ? 'Đang đọc tài liệu liên quan' : 'Reading relevant source material',
      color: 'bg-sky-500',
      textColor: 'text-sky-600 dark:text-sky-300',
      icon: Search,
    },
    {
      key: 'designing',
      label: isVietnamese ? 'Thiết kế' : 'Design',
      status: isVietnamese ? 'Đang thiết kế cấu trúc khóa học' : 'Designing the course structure',
      color: 'bg-violet-500',
      textColor: 'text-violet-600 dark:text-violet-300',
      icon: FileText,
    },
    {
      key: 'generating',
      label: isVietnamese ? 'Soạn bài' : 'Draft',
      status: isVietnamese ? 'Đang soạn nội dung học' : 'Drafting learning content',
      color: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-300',
      icon: BookOpenCheck,
    },
    {
      key: 'validating',
      label: isVietnamese ? 'Kiểm tra' : 'Review',
      status: isVietnamese ? 'Đang kiểm tra chất lượng' : 'Checking design quality',
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-300',
      icon: CheckCircle2,
    },
  ];
  const actualProgressStepIndex = lessonAuthorProgress
    ? Math.max(0, progressSteps.findIndex(step => (
      lessonAuthorProgress.stage === step.key
      || (step.key === 'generating' && lessonAuthorProgress.stage === 'skeleton')
      || (step.key === 'generating' && lessonAuthorProgress.stage === 'content')
    )))
    : 0;
  const progressStage = lessonAuthorProgress?.stage ?? null;

  useEffect(() => {
    const storedProgress = conversationId ? readStoredLessonAuthorProgress(conversationId) : null;
    setSimulatedProgressStepIndex(storedProgress?.simulatedStepIndex ?? 0);
  }, [conversationId]);

  useEffect(() => {
    if (!streaming || !progressStage) {
      if (!streaming) {
        setSimulatedProgressStepIndex(0);
      } else {
        const storedProgress = conversationId ? readStoredLessonAuthorProgress(conversationId) : null;
        setSimulatedProgressStepIndex(storedProgress?.simulatedStepIndex ?? 0);
      }
      return;
    }

    setSimulatedProgressStepIndex(current => Math.max(current, actualProgressStepIndex));
    const timer = window.setInterval(() => {
      setSimulatedProgressStepIndex(current => Math.min(current + 1, progressSteps.length - 1));
    }, 2400);

    return () => window.clearInterval(timer);
  }, [actualProgressStepIndex, conversationId, progressStage, streaming]);

  useEffect(() => {
    if (!conversationId || !streaming || !lessonAuthorProgress) return;
    writeStoredLessonAuthorProgress(conversationId, lessonAuthorProgress, simulatedProgressStepIndex);
  }, [conversationId, lessonAuthorProgress, simulatedProgressStepIndex, streaming]);

  const progressStepIndex = Math.max(actualProgressStepIndex, simulatedProgressStepIndex);
  const progressIsSimulated = progressStepIndex > actualProgressStepIndex;
  const activeProgressStep = progressSteps[progressStepIndex] ?? progressSteps[0];
  const ActiveProgressIcon = activeProgressStep.icon;
  const displayProgressLabel = progressIsSimulated
    ? activeProgressStep.status
    : progressLabel;
  const blueprintUnavailableMessage = !blueprintCanDraft
    ? blueprintEvent?.error_reason
      || (isVietnamese
        ? 'Tài liệu nguồn đã thay đổi. Bản thiết kế này chỉ còn để tham khảo; hãy tạo lại trước khi soạn nội dung.'
        : 'Source material changed. This blueprint is now reference-only; create a new one before drafting content.')
      : null;
  const blueprintStatusLabel = !blueprintCanDraft
    ? (isVietnamese ? 'Cần tạo lại' : 'Create again')
    : proposalEvent
      ? t('chatWidget.awaitingApproval')
      : streaming
        ? (progressLabel ?? t('chatWidget.responding'))
        : hasPendingBlueprintChapter
          ? (isVietnamese ? 'Sẵn sàng soạn' : 'Ready to draft')
          : (isVietnamese ? 'Đã áp dụng toàn bộ' : 'All applied');
  const isVoiceListening = voiceCaptureState === 'listening';
  const isVoiceRequesting = voiceCaptureState === 'requesting';
  const isBotVoiceActive = voiceModeActive && (streaming || botSpeechLoading || botSpeaking || botSpeechNeedsTap);
  const voiceModePhase: VoiceModePhase = isVoiceRequesting
    ? 'requesting'
    : isVoiceListening
      ? 'listening'
      : streaming
        ? 'thinking'
        : botSpeechLoading
          ? 'preparing'
          : botSpeaking
            ? 'speaking'
            : botSpeechNeedsTap
              ? 'play_blocked'
              : 'idle';
  const voiceButtonTitle = isVoiceListening
    ? t('chatWidget.stopListening')
    : isVoiceRequesting
      ? t('chatWidget.requestingMicrophone')
      : isBotVoiceActive
        ? t('chatWidget.botSpeaking')
      : t('chatWidget.speakWithMicrophone');

  const mentionMatches = useMemo(() => {
    if (!isLessonAuthor || mentionQuery === null) return [];
    const query = normalizeMentionText(mentionQuery);
    const selectedIds = new Set(selectedMentionList.map(mention => mention.block_id));
    return (outlineMentionOptions ?? [])
      .filter(option => !selectedIds.has(option.block_id))
      .filter(option => {
        if (!query) return true;
        return normalizeMentionText(`${option.display_name} ${option.path} ${option.block_type} ${option.label}`).includes(query);
      })
      .slice(0, 8);
  }, [isLessonAuthor, mentionQuery, outlineMentionOptions, selectedMentionList]);

  const handleChatScroll = useCallback(() => {
    if (!conversationId) return;
    const el = scrollRef.current;
    if (!el || typeof window === 'undefined') return;
    if (scrollSaveFrameRef.current !== null) return;

    const scrollTop = el.scrollTop;
    scrollSaveFrameRef.current = window.requestAnimationFrame(() => {
      scrollSaveFrameRef.current = null;
      writeStoredChatScrollTop(conversationId, scrollTop);
    });
  }, [conversationId, scrollRef]);

  useEffect(() => () => {
    if (scrollSaveFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(scrollSaveFrameRef.current);
      scrollSaveFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (loading || !conversationId || typeof window === 'undefined') return;

    let followUpFrame: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;

      const storedTop = readStoredChatScrollTop(conversationId);
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = storedTop === null ? maxScrollTop : Math.min(storedTop, maxScrollTop);

      // A second frame accounts for markdown/layout measurement completing after the first paint.
      followUpFrame = window.requestAnimationFrame(() => {
        const current = scrollRef.current;
        if (!current) return;
        const currentMaxScrollTop = Math.max(0, current.scrollHeight - current.clientHeight);
        current.scrollTop = storedTop === null
          ? currentMaxScrollTop
          : Math.min(storedTop, currentMaxScrollTop);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (followUpFrame !== null) window.cancelAnimationFrame(followUpFrame);
    };
  }, [conversationId, loading, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, proposalEvent?.job_id, streamText, scrollRef]);

  useEffect(() => { if (!loading) inputRef.current?.focus(); }, [loading, inputRef]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const minHeight = 32;
    const maxHeight = 128;
    let lastWidth = input.getBoundingClientRect().width;

    const resizeInput = () => {
      // Reset before measuring so the textarea can both grow and shrink reliably.
      input.style.height = '0px';
      input.style.overflowY = 'hidden';
      const contentHeight = input.scrollHeight;
      const nextHeight = Math.min(maxHeight, Math.max(minHeight, contentHeight));
      input.style.height = `${nextHeight}px`;
      input.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
    };

    resizeInput();

    // Re-measure when the responsive widget width changes and text wraps differently.
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width ?? lastWidth;
        if (Math.abs(width - lastWidth) < 0.5) return;
        lastWidth = width;
        resizeInput();
      });
    resizeObserver?.observe(input);

    return () => resizeObserver?.disconnect();
  }, [inputRef, inputValue]);

  useEffect(() => { setActiveMentionIndex(0); }, [mentionQuery]);
  useEffect(() => {
    if (!sourcePickerOpen || !isLessonAuthor) return;
    const timer = window.setTimeout(() => onLoadSourceDocuments?.(sourceSearch), 250);
    return () => window.clearTimeout(timer);
  }, [isLessonAuthor, onLoadSourceDocuments, sourcePickerOpen, sourceSearch]);

  const updateMentionState = (value: string, caret: number) => {
    if (!isLessonAuthor) return;
    const prefix = value.slice(0, caret);
    const atIndex = prefix.lastIndexOf('@');
    if (atIndex < 0 || (atIndex > 0 && !/\s/.test(prefix[atIndex - 1]))) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }

    const query = prefix.slice(atIndex + 1);
    if (query.includes('\n') || query.length > 80) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }

    setMentionQuery(query);
    setMentionStart(atIndex);
  };

  const closeMentionPicker = () => {
    setMentionQuery(null);
    setMentionStart(null);
    setActiveMentionIndex(0);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    onInputChange(value);
    updateMentionState(value, event.target.selectionStart ?? value.length);
  };

  const handleSelectMention = (mention: OutlineMentionOption) => {
    const textarea = inputRef.current;
    const caret = textarea?.selectionStart ?? inputValue.length;
    const start = mentionStart ?? caret;
    const before = inputValue.slice(0, start);
    const after = inputValue.slice(caret);
    const needsSpace = before.length > 0 && after.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
    const nextValue = `${before}${needsSpace ? ' ' : ''}${after}`.replace(/[ \t]{2,}/g, ' ');

    onInputChange(nextValue);
    if (!selectedMentionList.some(item => item.block_id === mention.block_id)) {
      onSelectedMentionsChange?.([...selectedMentionList, mention]);
    }
    closeMentionPicker();

    requestAnimationFrame(() => {
      const nextCaret = Math.min(start + (needsSpace ? 1 : 0), nextValue.length);
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleRemoveMention = (blockId: string) => {
    onSelectedMentionsChange?.(selectedMentionList.filter(mention => mention.block_id !== blockId));
  };

  const handleSelectSourceDocument = (doc: LessonAuthorSourceDocument) => {
    if (selectedSourceDocumentList.some(item => item.document_id === doc.document_id)) {
      setSourcePickerOpen(false);
      return;
    }
    if (selectedSourceDocumentList.length >= 5) {
      toast.error(t('chatWidget.maxSourceFiles'));
      return;
    }
    onSelectedSourceDocumentsChange?.([...selectedSourceDocumentList, doc]);
    setSourcePickerOpen(false);
    setSourceSearch('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleRemoveSourceDocument = (documentId: string) => {
    onSelectedSourceDocumentsChange?.(selectedSourceDocumentList.filter(doc => doc.document_id !== documentId));
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveMentionIndex(index => (index + 1) % mentionMatches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex(index => (index - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        handleSelectMention(mentionMatches[activeMentionIndex] ?? mentionMatches[0]);
        return;
      }
    }

    if (mentionQuery !== null && event.key === 'Escape') {
      event.preventDefault();
      closeMentionPicker();
      return;
    }

    onKeyDown(event);
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      <VoiceModeView
        active={voiceModeActive}
        phase={voiceModePhase}
        transcript={voiceModeTranscript || inputValue}
        botText=''
        botName={botName}
        botAvatarSrc={botAvatarSrc}
        startedAt={voiceCallStartedAt}
        muted={voiceCallMuted}
        onMic={onVoiceToggle}
        onToggleMute={onToggleVoiceMute}
        onResumeBotSpeech={onResumeBotSpeech}
        onStopBotSpeech={onStopBotSpeech}
        onClose={onCloseVoiceMode}
      />
      <div ref={scrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-2/3' : 'w-3/4'}`} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-1">
                <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore} className="gap-1.5 text-xs h-7">
                  {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                  {loadingMore ? t('chatWidget.loading') : t('chatWidget.loadOlderMessages')}
                </Button>
              </div>
            )}
            {messages.length === 0 && !streaming && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <Sparkles className="h-8 w-8 text-primary/30" />
                <p className="text-xs text-muted-foreground">{t('chatWidget.startConversation')}</p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onMentionClick={onMentionClick}
                onSourceDocumentClick={onSourceDocumentClick}
              />
            ))}
            {streaming && streamText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-muted/50 text-sm break-words">
                  <BotMarkdownContent content={streamText} />
                  <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />
                  {isBotVoiceActive && <Volume2 className="ml-1 inline-block h-3.5 w-3.5 animate-pulse text-primary" />}
                </div>
              </div>
            )}
            {streaming && !streamText && (
              <div className="flex justify-start">
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="w-full max-w-[92%] min-w-0 rounded-xl border border-primary/20 bg-card/95 px-3.5 py-3 shadow-md shadow-primary/5"
                  aria-live="polite"
                >
                  {lessonAuthorProgress ? (
                    <div className="flex min-w-0 gap-3">
                      <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current/25 bg-current/10 ${activeProgressStep.textColor}`}>
                        <span className="absolute inset-1 rounded-md border border-current/20 animate-pulse" />
                        <ActiveProgressIcon className="relative h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[11px] font-semibold text-foreground">
                            {isVietnamese ? 'Đang chuẩn bị nội dung' : 'Preparing your content'}
                          </p>
                          <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${activeProgressStep.textColor}`}>
                            {progressStepIndex + 1}/{progressSteps.length}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{displayProgressLabel}</p>
                        <div className="mt-2 flex items-center gap-1.5" aria-label={isVietnamese ? 'Tiến trình xử lý' : 'Processing progress'}>
                          {progressSteps.map((step, index) => (
                            <div key={step.key} className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span
                                className={`h-1.5 w-full rounded-full transition-all duration-500 ${index <= progressStepIndex ? step.color : 'bg-muted'} ${index === progressStepIndex ? 'animate-pulse shadow-sm' : ''}`}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1" aria-hidden="true">
                          {progressSteps.map((step, index) => (
                            <span
                              key={step.key}
                              className={`min-w-0 truncate text-[9px] font-medium transition-colors ${index <= progressStepIndex ? step.textColor : 'text-muted-foreground/55'}`}
                            >
                              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${index <= progressStepIndex ? step.color : 'bg-muted-foreground/30'}`} />
                              {step.label}
                            </span>
                          ))}
                        </div>
                        {progressIsSimulated && (
                          <p className="mt-1 truncate text-[9px] text-muted-foreground/70">
                            {isVietnamese ? 'Đang xử lý các bước tiếp theo' : 'Processing the next steps'}
                          </p>
                        )}
                        {lessonAuthorProgress.detail && lessonAuthorProgress.detail !== progressLabel && (
                          <p className="mt-2 line-clamp-2 break-words text-[10px] leading-4 text-muted-foreground">
                            {lessonAuthorProgress.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                        <span className="absolute inset-1 rounded-md border border-primary/20 animate-pulse" />
                        <Loader2 className="relative h-4 w-4 animate-spin" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-foreground">{t('chatWidget.responding')}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full w-2/5 rounded-full bg-primary/70"
                            animate={{ x: ['-100%', '260%'] }}
                            transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
            {blueprintEvent && !proposalEvent && !streaming && (
              <section className="overflow-hidden rounded-lg border border-primary/30 bg-card shadow-lg shadow-primary/5">
                <div className="border-b border-primary/15 bg-primary/5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-background text-primary shadow-sm">
                        <BookOpenCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{isVietnamese ? 'Bản thiết kế khóa học' : 'Course blueprint'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {isVietnamese ? 'Duyệt cấu trúc trước khi soạn nội dung chi tiết' : 'Review the structure before drafting detailed content'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className={blueprintCanDraft
                          ? 'rounded-md border border-border/70 bg-background text-[10px]'
                          : 'rounded-md border border-destructive/35 bg-destructive/5 text-[10px] text-destructive'}
                      >
                        {blueprintStatusLabel}
                      </Badge>
                      <Badge variant="outline" className="rounded-md bg-background text-[10px]">
                        {blueprintEvent.quality_report.score}/100
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <p className="break-words text-sm font-semibold leading-5">{blueprintEvent.blueprint.title}</p>
                    <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">{blueprintEvent.blueprint.summary}</p>
                  </div>
                  {blueprintUnavailableMessage && (
                    <p className="border-l-2 border-destructive/60 bg-destructive/5 px-2.5 py-2 text-[11px] leading-5 text-destructive">
                      {blueprintUnavailableMessage}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {blueprintEvent.blueprint.learning_outcomes.slice(0, 3).map((outcome, index) => (
                      <span key={`${outcome}-${index}`} className="max-w-full whitespace-normal break-words rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[10px] leading-4 text-muted-foreground">
                        {outcome}
                      </span>
                    ))}
                  </div>
                  <div className="border-l-2 border-primary/40 pl-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVietnamese ? 'Các chương đề xuất' : 'Proposed chapters'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {blueprintEvent.blueprint.chapters.slice(0, 3).map((chapter, index) => (
                        <span
                          key={`${chapter.title}-${index}`}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/35 px-2 py-1 text-[10px] text-muted-foreground"
                        >
                          <span className="shrink-0 font-semibold text-primary">{index + 1}</span>
                          <span className="max-w-[150px] truncate">{chapter.title}</span>
                        </span>
                      ))}
                      {blueprintEvent.blueprint.chapters.length > 3 && (
                        <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/35 px-2 py-1 text-[10px] text-muted-foreground">
                          +{blueprintEvent.blueprint.chapters.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/65 pt-2.5">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {isVietnamese
                        ? `Đã áp dụng ${appliedBlueprintChapterIndexes.size} / ${blueprintEvent.blueprint.chapters.length} chương`
                        : `${appliedBlueprintChapterIndexes.size} of ${blueprintEvent.blueprint.chapters.length} chapters applied`}
                    </span>
                    {appliedBlueprintChapterIndexes.size > 0 && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-w-0 gap-2 whitespace-normal text-left leading-4"
                      onClick={onOpenBlueprint}
                      disabled={!onOpenBlueprint || blueprintEvent.blueprint.chapters.length === 0}
                    >
                      <ListTree className="h-4 w-4" />
                      {isVietnamese ? 'Xem cấu trúc bài học' : 'View lesson structure'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-w-0 gap-2 whitespace-normal text-left leading-4"
                      onClick={() => {
                        if (hasPendingBlueprintChapter) onDraftBlueprintChapter?.(nextBlueprintChapterIndex);
                      }}
                      disabled={streaming || !onDraftBlueprintChapter || !blueprintCanDraft || !hasPendingBlueprintChapter}
                    >
                      {hasPendingBlueprintChapter ? <BookOpenCheck className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      {!blueprintCanDraft
                        ? (isVietnamese ? 'Cần tạo lại' : 'Create again')
                        : !hasPendingBlueprintChapter
                          ? (isVietnamese ? 'Đã áp dụng toàn bộ' : 'All chapters applied')
                          : (isVietnamese
                            ? `Soạn Chương ${nextBlueprintChapterIndex + 1}`
                            : `Draft Chapter ${nextBlueprintChapterIndex + 1}`)}
                    </Button>
                  </div>
                </div>
              </section>
            )}
            {proposalEvent && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {isStructuralActionProposal
                        ? <Target className="h-4 w-4" />
                        : <CheckCircle2 className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {isStructuralActionProposal
                          ? (isVietnamese ? 'Đề xuất thay đổi outline sẵn sàng' : 'Outline change ready')
                          : t('chatWidget.lessonPlanReady')}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {isStructuralActionProposal
                          ? (isVietnamese ? 'Kiểm tra đúng node trước khi xác nhận' : 'Verify the target before confirming')
                          : t('chatWidget.openMindmapHint')}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 rounded-md text-[10px]">
                    {t('chatWidget.awaitingApproval')}
                  </Badge>
                </div>
                <p className="mt-3 max-h-48 overflow-y-auto rounded-lg border bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground whitespace-pre-wrap custom-scrollbar">
                  {proposalEvent.proposal.summary}
                </p>
                {isStructuralActionProposal && lessonAuthorOperationPlan && (
                  <div
                    className={lessonAuthorOperationPlan.operation === 'delete'
                      ? 'mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5'
                      : 'mt-3 rounded-lg border border-primary/20 bg-background/45 px-3 py-2.5'}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVietnamese ? 'Node được chọn' : 'Selected node'}
                    </p>
                    <p className="mt-1 break-words text-xs font-semibold text-foreground">
                      {actionTargetLabel}: {lessonAuthorOperationPlan.target_display_name}
                    </p>
                    <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">
                      {lessonAuthorOperationPlan.target_path}
                    </p>
                    {lessonAuthorOperationPlan.operation === 'rename' && (
                      <p className="mt-1 break-words text-[11px] leading-4 text-primary">
                        {isVietnamese ? 'Tên mới' : 'New title'}: {lessonAuthorOperationPlan.requested_title}
                      </p>
                    )}
                    {lessonAuthorOperationPlan.operation === 'delete' && (
                      <p className="mt-2 text-[11px] font-medium leading-4 text-destructive">
                        {isVietnamese
                          ? 'Thao tác này sẽ đưa node và toàn bộ nội dung bên trong vào hàng đợi xóa.'
                          : 'This will queue the node and all nested content for deletion.'}
                      </p>
                    )}
                  </div>
                )}
                <div className={isStructuralActionProposal ? 'mt-3 grid grid-cols-1 gap-2' : 'mt-3 grid grid-cols-3 gap-2'}>
                  {!isStructuralActionProposal && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-w-0 min-h-10 gap-1.5 whitespace-normal text-center text-[11px] leading-4"
                        onClick={onOpenMindmap}
                        disabled={!onOpenMindmap}
                      >
                        <Network className="h-4 w-4" />
                        {isVietnamese ? 'Xem sơ đồ kế hoạch' : 'View plan diagram'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-w-0 min-h-10 gap-1.5 whitespace-normal border-violet-500/35 text-center text-[11px] leading-4 text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
                        onClick={onOpenBlueprint}
                        disabled={!onOpenBlueprint || !blueprintEvent?.blueprint.chapters.length}
                      >
                        <ListTree className="h-4 w-4" />
                        {isVietnamese ? 'Xem cấu trúc bài học' : 'View lesson structure'}
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant={lessonAuthorOperationPlan?.operation === 'delete' ? 'destructive' : 'default'}
                    className="min-w-0 min-h-10 gap-1.5 whitespace-normal text-center text-[11px] leading-4"
                    onClick={onApplyProposal}
                    disabled={applyingProposal || !onApplyProposal}
                  >
                    {applyingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {lessonAuthorOperationPlan?.operation === 'delete'
                      ? (isVietnamese ? 'Xác nhận xóa' : 'Confirm deletion')
                      : lessonAuthorOperationPlan?.operation === 'rename'
                        ? (isVietnamese ? 'Xác nhận đổi tên' : 'Confirm rename')
                        : t('chatWidget.apply')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t bg-background/50 px-3 py-2.5">
        {blueprintDraftSelection && (
          <div className="mb-2 flex min-w-0 items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2 text-[11px] text-muted-foreground">
            <BookOpenCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              {isVietnamese
                ? `Đang soạn theo cấu trúc bài học: ${blueprintDraftSelection.chapter_title}`
                : `Drafting from lesson structure: ${blueprintDraftSelection.chapter_title}`}
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
          {isLessonAuthor && (
            <div className="relative shrink-0">
              {sourcePickerOpen && (
                <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-xl border bg-popover shadow-xl">
                  <div className="border-b p-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={sourceSearch}
                        onChange={event => setSourceSearch(event.target.value)}
                        placeholder={t('chatWidget.searchKnowledgeFiles')}
                        className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary/40"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {loadingSourceDocuments ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('chatWidget.loadingKnowledgeFiles')}
                      </div>
                    ) : (sourceDocumentOptions ?? []).length === 0 ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground">{t('chatWidget.noKnowledgeFiles')}</div>
                    ) : (
                      (sourceDocumentOptions ?? []).map(doc => {
                        const selected = selectedSourceDocumentList.some(item => item.document_id === doc.document_id);
                        return (
                          <button
                            key={doc.document_id}
                            type="button"
                            disabled={selected}
                            className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                              selected ? 'cursor-default opacity-50' : 'hover:bg-muted'
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              if (!selected) handleSelectSourceDocument(doc);
                            }}
                          >
                            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold">{doc.name}</span>
                              <span className="block truncate text-[10px] text-muted-foreground">{t('chatWidget.knowledgeFile')}</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              <AppTooltip content={t('chatWidget.selectKnowledgeFile')}><Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-xl"
                disabled={streaming}
                onClick={() => setSourcePickerOpen(open => !open)}
                aria-label={t('chatWidget.selectKnowledgeFile')}
              >
                <Plus className="h-4 w-4" />
              </Button></AppTooltip>
            </div>
          )}
          <div className="relative flex-1">
            {isLessonAuthor && mentionQuery !== null && (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
                {mentionMatches.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">{t('chatWidget.noOutlineMatches')}</div>
                ) : (
                  mentionMatches.map((mention, index) => (
                    <button
                      key={mention.block_id}
                      type="button"
                      className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        index === activeMentionIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectMention(mention);
                      }}
                    >
                      <AtSign className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{mention.display_name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {getMentionTypeLabel(mention.block_type)} · {mention.path}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            <div className="flex min-h-11 w-full min-w-0 flex-wrap items-end gap-1.5 rounded-xl border bg-muted/30 px-2.5 py-1 transition-all focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20">
              {isLessonAuthor && selectedMentionList.map(mention => (
                <MentionBadge
                  key={mention.block_id}
                  mention={mention}
                  onClick={() => onMentionClick?.(mention)}
                  onRemove={() => handleRemoveMention(mention.block_id)}
                  compact
                />
              ))}
              {isLessonAuthor && selectedSourceDocumentList.map(doc => (
                <SourceDocumentBadge
                  key={doc.document_id}
                  doc={doc}
                  onClick={() => onSourceDocumentClick?.(doc)}
                  onRemove={() => handleRemoveSourceDocument(doc.document_id)}
                  compact
                />
              ))}
              <div className="flex min-h-8 min-w-0 flex-1 basis-full items-end gap-1">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder={isLessonAuthor
                    ? undefined
                    : selectedMentionList.length > 0 || selectedSourceDocumentList.length > 0
                      ? t('chatWidget.requestPlaceholder')
                      : t('chatWidget.messagePlaceholder')}
                  disabled={streaming}
                  rows={1}
                  className="chat-widget-input-textarea block h-8 min-h-8 w-full min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 placeholder:text-muted-foreground/50 outline-none focus:outline-none focus-visible:outline-none disabled:opacity-50 max-h-32"
                  style={{ height: '32px', minHeight: '32px', maxHeight: '128px', boxSizing: 'border-box', overflowY: 'hidden' }}
                />
                <AppTooltip content={voiceButtonTitle}><Button
                  type="button"
                  variant={isVoiceListening ? 'default' : 'ghost'}
                  size="icon"
                  className={`h-8 w-8 shrink-0 self-end rounded-lg ${isVoiceListening ? 'bg-red-500 text-white hover:bg-red-600' : isBotVoiceActive ? 'text-primary' : 'text-muted-foreground'}`}
                  disabled={streaming || isVoiceRequesting}
                  onClick={onVoiceToggle}
                  aria-label={voiceButtonTitle}
                >
                  {isVoiceRequesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isVoiceListening ? <MicOff className="h-3.5 w-3.5" /> : isBotVoiceActive ? <Volume2 className="h-3.5 w-3.5 animate-pulse" /> : <Mic className="h-3.5 w-3.5" />}
                </Button></AppTooltip>
              </div>
            </div>
          </div>
          <Button
            size="icon"
            className="h-11 w-11 shrink-0 self-end rounded-xl"
            disabled={!inputValue.trim() || streaming}
            onClick={onSend}
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MentionBadge({ mention, onClick, onRemove, compact = false, inverted = false }: {
  mention: OutlineMention;
  onClick?: () => void;
  onRemove?: () => void;
  compact?: boolean;
  inverted?: boolean;
}) {
  const { t } = useTranslation();
  const label = getMentionTypeLabel(mention.block_type);
  return (
    <AppTooltip content={mention.path || mention.display_name} className="z-[10050] max-w-[min(320px,calc(100vw-24px))] break-words"><Badge
      variant="secondary"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`max-w-full gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
        compact ? 'h-7' : ''
      } ${
        onClick ? 'cursor-pointer' : ''
      } ${
        inverted
          ? 'border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/20'
          : 'border-primary/15 bg-primary/10 text-primary hover:bg-primary/15'
      }`}

      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <AtSign className="h-3 w-3 shrink-0" />
      <span className="shrink-0 opacity-75">{label}</span>
      <span className="truncate max-w-[180px]">{mention.display_name}</span>
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={t('chatWidget.removeSelection', { name: mention.display_name })}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge></AppTooltip>
  );
}

function SourceDocumentBadge({ doc, onClick, onRemove, compact = false, inverted = false }: {
  doc: LessonAuthorSourceDocument;
  onClick?: () => void;
  onRemove?: () => void;
  compact?: boolean;
  inverted?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <AppTooltip content={doc.name}><Badge
      variant="secondary"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`max-w-full gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
        compact ? 'h-7' : ''
      } ${
        onClick ? 'cursor-pointer' : ''
      } ${
        inverted
          ? 'border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/20'
          : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
      }`}

      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="shrink-0 opacity-75">{t('chatWidget.file')}</span>
      <span className="truncate max-w-[180px]">{doc.name}</span>
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={t('chatWidget.removeSelection', { name: doc.name })}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge></AppTooltip>
  );
}

function MessageBubble({ message, onMentionClick, onSourceDocumentClick }: {
  message: ChatMessage;
  onMentionClick?: (mention: OutlineMention) => void;
  onSourceDocumentClick?: (doc: LessonAuthorSourceDocument) => void;
}) {
  const isUser = message.role === 'user';
  const mentions = getMessageOutlineMentions(message.metadata);
  const sourceDocuments = getMessageSourceDocuments(message.metadata);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm break-words ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap'
            : 'bg-muted/50 rounded-bl-md'
        }`}
      >
        {(mentions.length > 0 || sourceDocuments.length > 0) && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {mentions.map(mention => (
              <MentionBadge
                key={mention.block_id}
                mention={mention}
                inverted={isUser}
                onClick={onMentionClick ? () => onMentionClick(mention) : undefined}
              />
            ))}
            {sourceDocuments.map(doc => (
              <SourceDocumentBadge
                key={doc.document_id}
                doc={doc}
                inverted={isUser}
                onClick={onSourceDocumentClick ? () => onSourceDocumentClick(doc) : undefined}
              />
            ))}
          </div>
        )}
        {message.content && (isUser ? <div>{message.content}</div> : <BotMarkdownContent content={message.content} />)}
      </div>
    </motion.div>
  );
}
